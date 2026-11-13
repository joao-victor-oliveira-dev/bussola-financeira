from typing import Annotated

from ninja import Query, Router, Schema
from ninja.security import django_auth
from pydantic import Field, StringConstraints

from apps.finance import dashboard as q
from apps.finance.schemas import CategoryKindLit, MoneyOut, TransactionOut

router = Router(tags=["dashboard"], auth=django_auth)

Month = Annotated[str, StringConstraints(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]


class MonthFlows(Schema):
    income: MoneyOut
    expense: MoneyOut
    savings_rate: str | None


class SummaryOut(MonthFlows):
    month: str
    balance: MoneyOut
    previous: MonthFlows


class CashflowPoint(Schema):
    month: str
    income: MoneyOut
    expense: MoneyOut
    net: MoneyOut
    balance: MoneyOut


class CategoryChild(Schema):
    id: int
    name: str
    color: str
    total: MoneyOut


class CategorySlice(Schema):
    id: int | None
    name: str
    color: str
    total: MoneyOut
    children: list[CategoryChild]


class MonthParams(Schema):
    month: Month


class CategoryParams(MonthParams):
    kind: CategoryKindLit = "expense"


class TopParams(MonthParams):
    limit: int = Field(5, ge=1, le=20)


class LimitParams(Schema):
    limit: int = Field(6, ge=1, le=20)


@router.get("/summary", operation_id="dashboardSummary", response=SummaryOut)
def summary(request, params: Query[MonthParams]):
    return q.summary(request.auth, params.month)


@router.get("/cashflow", operation_id="dashboardCashflow", response=list[CashflowPoint])
def cashflow(request, params: Query[MonthParams]):
    return q.cashflow(request.auth, params.month)


@router.get("/categories", operation_id="dashboardCategories", response=list[CategorySlice])
def categories(request, params: Query[CategoryParams]):
    return q.categories_breakdown(request.auth, params.month, params.kind)


@router.get("/top-expenses", operation_id="dashboardTopExpenses", response=list[TransactionOut])
def top_expenses(request, params: Query[TopParams]):
    return q.top_expenses(request.auth, params.month, params.limit)


@router.get("/pending", operation_id="dashboardPending", response=list[TransactionOut])
def pending(request, params: Query[LimitParams]):
    return q.pending(request.auth, params.limit)
