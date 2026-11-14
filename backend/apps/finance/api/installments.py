import datetime
from decimal import Decimal
from typing import Annotated

from ninja import Router, Schema, Status
from ninja.errors import HttpError
from ninja.security import django_auth
from pydantic import Field

from apps.finance.api.common import get_owned
from apps.finance.installments import create_plan
from apps.finance.models import InstallmentPlan
from apps.finance.schemas import MoneyOut, Name, TransactionOut
from apps.finance.services import InvalidTransaction

router = Router(tags=["installments"], auth=django_auth)


class InstallmentPlanIn(Schema):
    credit_card_id: int
    description: Name(120)
    total: Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)]
    count: Annotated[int, Field(ge=2, le=48)]
    purchase_date: datetime.date
    category_id: int | None = None


class InstallmentPlanOut(Schema):
    id: int
    credit_card_id: int
    description: str
    total: MoneyOut
    count: int
    purchase_date: datetime.date
    category_id: int | None
    items: list[TransactionOut]

    @staticmethod
    def resolve_credit_card_id(obj) -> int:
        return obj.card_id

    @staticmethod
    def resolve_items(obj) -> list:
        return list(
            obj.installments.select_related("invoice", "installment_plan")
            .prefetch_related("tags")
            .order_by("installment_number")
        )


@router.post("", operation_id="installmentsCreate", response={201: InstallmentPlanOut})
def create_installments(request, payload: InstallmentPlanIn):
    try:
        plan = create_plan(request.auth, payload.dict())
    except InvalidTransaction as e:
        raise HttpError(422, str(e)) from None
    return Status(201, plan)


@router.delete("/{plan_id}", operation_id="installmentsDelete", response={204: None})
def delete_installments(request, plan_id: int):
    plan = get_owned(InstallmentPlan, request.auth, plan_id)
    if plan.installments.filter(invoice__payment__isnull=False).exists():
        raise HttpError(
            409, "Há parcelas em faturas pagas. Desfaça esses pagamentos antes de excluir."
        )
    plan.installments.all().delete()
    plan.delete()
    return Status(204, None)
