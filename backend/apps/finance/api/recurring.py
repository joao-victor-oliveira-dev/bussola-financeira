import datetime
from decimal import Decimal
from typing import Annotated, Literal

from django.utils import timezone
from ninja import Router, Schema, Status
from ninja.errors import HttpError
from ninja.security import django_auth
from pydantic import Field

from apps.finance.api.common import get_owned
from apps.finance.models import RecurringRule
from apps.finance.recurring import clear_future_pending, next_dates, regenerate
from apps.finance.schemas import MoneyOut, Name, TxKindLit
from apps.finance.services import InvalidTransaction, resolve_transaction

router = Router(tags=["recurring"], auth=django_auth)

FrequencyLit = Literal["weekly", "monthly", "yearly"]
PositiveMoney = Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)]


class RecurringIn(Schema):
    kind: TxKindLit
    amount: PositiveMoney
    description: Name(140)
    account_id: int | None = None
    credit_card_id: int | None = None
    to_account_id: int | None = None
    category_id: int | None = None
    frequency: FrequencyLit
    start_date: datetime.date
    end_date: datetime.date | None = None
    active: bool = True


class RecurringPatch(Schema):
    kind: TxKindLit | None = None
    amount: PositiveMoney | None = None
    description: Name(140) | None = None
    account_id: int | None = None
    credit_card_id: int | None = None
    to_account_id: int | None = None
    category_id: int | None = None
    frequency: FrequencyLit | None = None
    start_date: datetime.date | None = None
    end_date: datetime.date | None = None
    active: bool | None = None


class RecurringOut(Schema):
    id: int
    kind: TxKindLit
    amount: MoneyOut
    description: str
    account_id: int | None
    credit_card_id: int | None
    to_account_id: int | None
    category_id: int | None
    frequency: FrequencyLit
    start_date: datetime.date
    end_date: datetime.date | None
    active: bool
    next_dates: list[datetime.date]

    @staticmethod
    def resolve_next_dates(obj) -> list[datetime.date]:
        return next_dates(obj, timezone.localdate())


# Campos que aceitam null explícito no PATCH.
NULLABLE = {"account_id", "credit_card_id", "to_account_id", "category_id", "end_date"}
FIELDS = [
    "kind",
    "amount",
    "description",
    "account_id",
    "credit_card_id",
    "to_account_id",
    "category_id",
    "frequency",
    "start_date",
    "end_date",
    "active",
]


def _apply(rule: RecurringRule, user, data: dict) -> None:
    """Valida com as mesmas regras de um lançamento e copia os campos para a regra."""
    if data.get("end_date") and data["end_date"] < data["start_date"]:
        raise HttpError(422, "O fim precisa ser depois do início.")
    try:
        fields = resolve_transaction(
            user, {**data, "date": data["start_date"], "status": "pending", "tag_ids": []}
        )
    except InvalidTransaction as e:
        raise HttpError(422, str(e)) from None
    for name in ("kind", "amount", "description", "frequency", "start_date", "end_date", "active"):
        setattr(rule, name, data[name])
    rule.account = fields["account"]
    rule.credit_card = fields["credit_card"]
    rule.to_account = fields["to_account"]
    rule.category = fields["category"]
    rule.save()


@router.get("", operation_id="recurringList", response=list[RecurringOut])
def list_rules(request):
    return RecurringRule.objects.filter(user=request.auth)


@router.post("", operation_id="recurringCreate", response={201: RecurringOut})
def create_rule(request, payload: RecurringIn):
    rule = RecurringRule(user=request.auth)
    _apply(rule, request.auth, payload.dict())
    regenerate(rule, timezone.localdate())
    return Status(201, rule)


@router.patch("/{rule_id}", operation_id="recurringUpdate", response=RecurringOut)
def update_rule(request, rule_id: int, payload: RecurringPatch):
    rule = get_owned(RecurringRule, request.auth, rule_id)
    current = {name: getattr(rule, name) for name in FIELDS}
    for field, value in payload.dict(exclude_unset=True).items():
        if value is not None or field in NULLABLE:
            current[field] = value
    _apply(rule, request.auth, current)
    regenerate(rule, timezone.localdate())  # inativa: só limpa as futuras pendentes
    return rule


@router.delete("/{rule_id}", operation_id="recurringDelete", response={204: None})
def delete_rule(request, rule_id: int):
    rule = get_owned(RecurringRule, request.auth, rule_id)
    clear_future_pending(rule, timezone.localdate())
    rule.delete()  # o histórico fica, desvinculado (SET_NULL)
    return Status(204, None)
