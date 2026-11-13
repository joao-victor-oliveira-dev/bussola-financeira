from django.db import IntegrityError, transaction
from ninja import Router, Status
from ninja.errors import HttpError
from ninja.security import django_auth

from apps.finance.api.common import get_owned
from apps.finance.models import Account
from apps.finance.schemas import AccountIn, AccountOut, AccountPatch
from apps.finance.services import accounts_with_balance

router = Router(tags=["accounts"], auth=django_auth)

DUPLICATE = "Já existe uma conta com esse nome."


def _with_balance(user, pk: int) -> Account:
    return accounts_with_balance(user).get(pk=pk)


def _save(acc: Account) -> None:
    dup = Account.objects.filter(user=acc.user, name__iexact=acc.name).exclude(pk=acc.pk)
    if dup.exists():
        raise HttpError(409, DUPLICATE)
    try:
        with transaction.atomic():
            acc.save()
    except IntegrityError:
        raise HttpError(409, DUPLICATE) from None


@router.get("", operation_id="accountsList", response=list[AccountOut])
def list_accounts(request):
    return accounts_with_balance(request.auth)


@router.post("", operation_id="accountsCreate", response={201: AccountOut})
def create_account(request, payload: AccountIn):
    acc = Account(user=request.auth, **payload.dict())
    _save(acc)
    return Status(201, _with_balance(request.auth, acc.pk))


@router.patch("/{account_id}", operation_id="accountsUpdate", response=AccountOut)
def update_account(request, account_id: int, payload: AccountPatch):
    acc = get_owned(Account, request.auth, account_id)
    for field, value in payload.dict(exclude_unset=True).items():
        if value is not None:
            setattr(acc, field, value)
    _save(acc)
    return _with_balance(request.auth, acc.pk)


@router.delete("/{account_id}", operation_id="accountsDelete", response={204: None})
def delete_account(request, account_id: int):
    acc = get_owned(Account, request.auth, account_id)
    if acc.transactions.exists() or acc.incoming.exists():
        raise HttpError(409, "Esta conta tem lançamentos. Arquive em vez de excluir.")
    acc.delete()
    return Status(204, None)
