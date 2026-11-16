from decimal import Decimal
from typing import Annotated, Literal

from django.db import IntegrityError, transaction
from ninja import Query, Router, Schema, Status
from ninja.errors import HttpError
from ninja.security import django_auth
from pydantic import Field, StringConstraints

from apps.finance.api.common import get_owned
from apps.finance.budgets import budget_overview, copy_budgets
from apps.finance.models import Budget, Category, CategoryKind
from apps.finance.schemas import MoneyOut

router = Router(tags=["budgets"], auth=django_auth)

Month = Annotated[str, StringConstraints(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]
Limit = Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)]
BudgetStatus = Literal["ok", "warning", "over"]


class BudgetIn(Schema):
    category_id: int
    month: Month
    limit: Limit


class BudgetPatch(Schema):
    limit: Limit


class BudgetItemOut(Schema):
    id: int
    category_id: int
    category_name: str
    color: str
    limit: MoneyOut
    spent: MoneyOut
    remaining: MoneyOut
    percent: str
    status: BudgetStatus


class UnbudgetedOut(Schema):
    category_id: int
    category_name: str
    color: str
    spent: MoneyOut


class BudgetTotals(Schema):
    limit: MoneyOut
    spent: MoneyOut
    remaining: MoneyOut


class BudgetOverviewOut(Schema):
    month: str
    items: list[BudgetItemOut]
    totals: BudgetTotals
    unbudgeted: list[UnbudgetedOut]


class MonthParams(Schema):
    month: Month


class CopyIn(Schema):
    to_month: Month
    from_month: Month | None = None


class CopyOut(Schema):
    created: int


def _item(budget: Budget) -> dict:
    """Item recalculado a partir do resumo do mês (mesma regra de gasto)."""
    overview = budget_overview(budget.user, budget.month)
    return next(i for i in overview["items"] if i["id"] == budget.id)


@router.get("", operation_id="budgetsOverview", response=BudgetOverviewOut)
def overview(request, params: Query[MonthParams]):
    return budget_overview(request.auth, params.month)


@router.post("", operation_id="budgetsCreate", response={201: BudgetItemOut})
def create_budget(request, payload: BudgetIn):
    category = Category.objects.filter(user=request.auth, pk=payload.category_id).first()
    if category is None or category.kind != CategoryKind.EXPENSE or category.parent_id:
        raise HttpError(422, "Escolha uma categoria principal de despesa.")
    try:
        with transaction.atomic():
            budget = Budget.objects.create(
                user=request.auth, category=category, month=payload.month, limit=payload.limit
            )
    except IntegrityError:
        raise HttpError(409, "Esta categoria já tem orçamento neste mês.") from None
    return Status(201, _item(budget))


# /copy antes de /{budget_id}: senão o POST cai na rota com parâmetro (405).
@router.post("/copy", operation_id="budgetsCopy", response=CopyOut)
def copy(request, payload: CopyIn):
    return {"created": copy_budgets(request.auth, payload.to_month, payload.from_month)}


@router.patch("/{budget_id}", operation_id="budgetsUpdate", response=BudgetItemOut)
def update_budget(request, budget_id: int, payload: BudgetPatch):
    budget = get_owned(Budget, request.auth, budget_id)
    budget.limit = payload.limit
    budget.save(update_fields=["limit", "updated_at"])
    return _item(budget)


@router.delete("/{budget_id}", operation_id="budgetsDelete", response={204: None})
def delete_budget(request, budget_id: int):
    get_owned(Budget, request.auth, budget_id).delete()
    return Status(204, None)
