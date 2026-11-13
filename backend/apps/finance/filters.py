import datetime
from decimal import Decimal

from django.db.models import Q, QuerySet, Sum
from ninja import Schema
from pydantic import Field

from apps.finance.schemas import TxKindLit, TxStatusLit

ZERO = Decimal("0")


class TransactionFilters(Schema):
    date_from: datetime.date | None = None
    date_to: datetime.date | None = None
    account: int | None = None
    category: int | None = None
    kind: TxKindLit | None = None
    status: TxStatusLit | None = None
    tag: int | None = None
    q: str | None = None
    page: int = Field(1, ge=1)
    page_size: int = Field(50, ge=1, le=100)


def apply_filters(qs: QuerySet, f: TransactionFilters) -> QuerySet:
    if f.date_from:
        qs = qs.filter(date__gte=f.date_from)
    if f.date_to:
        qs = qs.filter(date__lte=f.date_to)
    if f.account:
        qs = qs.filter(Q(account_id=f.account) | Q(to_account_id=f.account))
    if f.category:
        qs = qs.filter(Q(category_id=f.category) | Q(category__parent_id=f.category))
    if f.kind:
        qs = qs.filter(kind=f.kind)
    if f.status:
        qs = qs.filter(status=f.status)
    if f.tag:
        qs = qs.filter(tags__id=f.tag)
    if f.q and f.q.strip():
        term = f.q.strip()
        qs = qs.filter(Q(description__icontains=term) | Q(notes__icontains=term))
    return qs


def totals(qs: QuerySet) -> dict[str, Decimal]:
    """Receitas e despesas do conjunto filtrado inteiro (transferências não entram)."""
    agg = qs.order_by().aggregate(
        income=Sum("amount", filter=Q(kind="income")),
        expense=Sum("amount", filter=Q(kind="expense")),
    )
    income = agg["income"] or ZERO
    expense = agg["expense"] or ZERO
    return {"income": income, "expense": expense, "net": income - expense}
