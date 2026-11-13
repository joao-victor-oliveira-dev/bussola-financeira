from django.db import transaction as db_transaction
from ninja import Query, Router, Status
from ninja.errors import HttpError
from ninja.security import django_auth

from apps.finance.api.common import get_owned
from apps.finance.filters import TransactionFilters, apply_filters, totals
from apps.finance.models import Transaction
from apps.finance.schemas import (
    TransactionIn,
    TransactionOut,
    TransactionPage,
    TransactionPatch,
)
from apps.finance.services import InvalidTransaction, resolve_transaction

router = Router(tags=["transactions"], auth=django_auth)

# Campos que aceitam null explícito no PATCH (limpar o valor).
NULLABLE = {"to_account_id", "category_id"}


def _resolve(user, data: dict) -> dict:
    try:
        return resolve_transaction(user, data)
    except InvalidTransaction as e:
        raise HttpError(422, str(e)) from None


def _save(tx: Transaction, fields: dict) -> Transaction:
    tags = fields.pop("tags")
    for field, value in fields.items():
        setattr(tx, field, value)
    with db_transaction.atomic():
        tx.save()
        tx.tags.set(tags)
    return tx


def _owned(user, pk: int) -> Transaction:
    get_owned(Transaction, user, pk)
    return Transaction.objects.prefetch_related("tags").get(pk=pk)


@router.get("", operation_id="transactionsList", response=TransactionPage)
def list_transactions(request, filters: Query[TransactionFilters]):
    qs = apply_filters(Transaction.objects.filter(user=request.auth), filters)
    start = (filters.page - 1) * filters.page_size
    items = qs.prefetch_related("tags")[start : start + filters.page_size]
    return {
        "items": list(items),
        "count": qs.count(),
        "page": filters.page,
        "page_size": filters.page_size,
        "totals": totals(qs),
    }


@router.post("", operation_id="transactionsCreate", response={201: TransactionOut})
def create_transaction(request, payload: TransactionIn):
    fields = _resolve(request.auth, payload.dict())
    tx = _save(Transaction(user=request.auth), fields)
    return Status(201, _owned(request.auth, tx.pk))


@router.get("/{transaction_id}", operation_id="transactionsGet", response=TransactionOut)
def get_transaction(request, transaction_id: int):
    return _owned(request.auth, transaction_id)


@router.patch("/{transaction_id}", operation_id="transactionsUpdate", response=TransactionOut)
def update_transaction(request, transaction_id: int, payload: TransactionPatch):
    tx = _owned(request.auth, transaction_id)
    current = {
        "kind": tx.kind,
        "amount": tx.amount,
        "date": tx.date,
        "description": tx.description,
        "account_id": tx.account_id,
        "to_account_id": tx.to_account_id,
        "category_id": tx.category_id,
        "status": tx.status,
        "notes": tx.notes,
        "tag_ids": [t.id for t in tx.tags.all()],
    }
    for field, value in payload.dict(exclude_unset=True).items():
        if value is not None or field in NULLABLE:
            current[field] = value
    _save(tx, _resolve(request.auth, current))
    return _owned(request.auth, tx.pk)


@router.delete("/{transaction_id}", operation_id="transactionsDelete", response={204: None})
def delete_transaction(request, transaction_id: int):
    get_owned(Transaction, request.auth, transaction_id).delete()
    return Status(204, None)
