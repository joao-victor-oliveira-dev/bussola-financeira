from django.db import IntegrityError
from django.db import transaction as db_transaction
from ninja import Query, Router, Status
from ninja.errors import HttpError
from ninja.security import django_auth

from apps.finance.api.common import NOT_FOUND
from apps.finance.cards import get_or_create_invoice
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
NULLABLE = {"to_account_id", "category_id", "account_id", "credit_card_id"}


def _resolve(user, data: dict) -> dict:
    try:
        return resolve_transaction(user, data)
    except InvalidTransaction as e:
        raise HttpError(422, str(e)) from None


PAID_INVOICE = "A fatura de {ref} já foi paga. Desfaça o pagamento para incluir compras nela."
LOCKED = "Esta compra está numa fatura paga. Desfaça o pagamento antes de alterar ou excluir."
# O que muda o valor ou a fatura de uma compra (descrição, categoria e notas podem mudar).
MONEY_FIELDS = ("kind", "amount", "date", "account_id", "credit_card_id")


def _in_paid_invoice(tx: Transaction) -> bool:
    return bool(tx.invoice_id and tx.invoice.payment_id)


def _save(tx: Transaction, fields: dict) -> Transaction:
    tags = fields.pop("tags")
    ref = fields.pop("invoice_ref")
    try:
        with db_transaction.atomic():
            invoice = None
            if ref:
                invoice = get_or_create_invoice(fields["credit_card"], ref)
                if invoice.payment_id and invoice.pk != tx.invoice_id:
                    raise HttpError(422, PAID_INVOICE.format(ref=ref))
            fields["invoice"] = invoice
            for field, value in fields.items():
                setattr(tx, field, value)
            tx.save()
            tx.tags.set(tags)
    except IntegrityError:
        # única constraint alcançável aqui: (recorrência, data) já ocupada
        raise HttpError(409, "Já existe uma ocorrência desta recorrência nesta data.") from None
    return tx


def _owned(user, pk: int) -> Transaction:
    tx = (
        Transaction.objects.filter(user=user, pk=pk)
        .select_related("invoice", "installment_plan")
        .prefetch_related("tags")
        .first()
    )
    if tx is None:
        raise HttpError(404, NOT_FOUND)
    return tx


@router.get("", operation_id="transactionsList", response=TransactionPage)
def list_transactions(request, filters: Query[TransactionFilters]):
    qs = apply_filters(Transaction.objects.filter(user=request.auth), filters)
    start = (filters.page - 1) * filters.page_size
    items = qs.select_related("invoice", "installment_plan").prefetch_related("tags")[
        start : start + filters.page_size
    ]
    count, sums = totals(qs)
    return {
        "items": list(items),
        "count": count,
        "page": filters.page,
        "page_size": filters.page_size,
        "totals": sums,
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
    if tx.to_credit_card_id:
        raise HttpError(409, "Este é o pagamento de uma fatura: desfaça pela tela do cartão.")
    changes = payload.dict(exclude_unset=True)
    if _in_paid_invoice(tx) and any(
        f in changes and changes[f] != getattr(tx, f) for f in MONEY_FIELDS
    ):
        raise HttpError(409, LOCKED)
    current = {
        "kind": tx.kind,
        "amount": tx.amount,
        "date": tx.date,
        "description": tx.description,
        "account_id": tx.account_id,
        "credit_card_id": tx.credit_card_id,
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
    tx = _owned(request.auth, transaction_id)
    if _in_paid_invoice(tx):
        raise HttpError(409, LOCKED)
    tx.delete()
    return Status(204, None)
