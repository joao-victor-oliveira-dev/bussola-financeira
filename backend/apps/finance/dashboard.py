"""Consultas do painel. Tudo agregado no banco; nada de loop por lançamento."""

import calendar
import datetime
from decimal import Decimal

from django.db.models import Q, QuerySet, Sum
from django.db.models.functions import TruncMonth

from apps.finance.models import Account, Category, Transaction, TxKind, TxStatus

ZERO = Decimal("0")
UNCATEGORIZED = {"id": None, "name": "Sem categoria", "color": "#8a9ba3"}


def month_bounds(month: str) -> tuple[datetime.date, datetime.date]:
    year, mon = map(int, month.split("-"))
    return datetime.date(year, mon, 1), datetime.date(year, mon, calendar.monthrange(year, mon)[1])


def shift_month(month: str, delta: int) -> str:
    year, mon = map(int, month.split("-"))
    index = year * 12 + (mon - 1) + delta
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def _income_expense(qs: QuerySet) -> tuple[Decimal, Decimal]:
    agg = qs.aggregate(
        income=Sum("amount", filter=Q(kind=TxKind.INCOME)),
        expense=Sum("amount", filter=Q(kind=TxKind.EXPENSE)),
    )
    return agg["income"] or ZERO, agg["expense"] or ZERO


def _rate(income: Decimal, expense: Decimal) -> str | None:
    if income <= 0:
        return None
    return str(((income - expense) / income * 100).quantize(Decimal("0.1")))


def _net_worth(user, until: datetime.date | None = None) -> Decimal:
    """Saldos iniciais + receitas − despesas efetivadas (transferências se anulam no total)."""
    initial = Account.objects.filter(user=user).aggregate(t=Sum("initial_balance"))["t"] or ZERO
    paid = Transaction.objects.filter(user=user, status=TxStatus.PAID)
    if until:
        paid = paid.filter(date__lte=until)
    income, expense = _income_expense(paid)
    return initial + income - expense


def _month_flows(user, month: str) -> dict:
    first, last = month_bounds(month)
    qs = Transaction.objects.filter(user=user, date__range=(first, last))
    income, expense = _income_expense(qs)
    return {"income": income, "expense": expense, "savings_rate": _rate(income, expense)}


def summary(user, month: str) -> dict:
    current = _month_flows(user, month)
    return {
        "month": month,
        "balance": _net_worth(user),
        **current,
        "previous": _month_flows(user, shift_month(month, -1)),
    }


def cashflow(user, month: str, months: int = 12) -> list[dict]:
    keys = [shift_month(month, -i) for i in range(months - 1, -1, -1)]
    start, _ = month_bounds(keys[0])
    _, end = month_bounds(keys[-1])
    window = Transaction.objects.filter(user=user, date__range=(start, end))

    def by_month(qs: QuerySet) -> dict[str, tuple[Decimal, Decimal]]:
        rows = (
            qs.annotate(m=TruncMonth("date"))
            .values("m")
            .order_by()
            .annotate(
                income=Sum("amount", filter=Q(kind=TxKind.INCOME)),
                expense=Sum("amount", filter=Q(kind=TxKind.EXPENSE)),
            )
        )
        return {r["m"].strftime("%Y-%m"): (r["income"] or ZERO, r["expense"] or ZERO) for r in rows}

    flows = by_month(window)
    paid = by_month(window.filter(status=TxStatus.PAID))
    balance = _net_worth(user, until=start - datetime.timedelta(days=1))

    points = []
    for key in keys:
        income, expense = flows.get(key, (ZERO, ZERO))
        paid_in, paid_out = paid.get(key, (ZERO, ZERO))
        balance += paid_in - paid_out
        points.append(
            {
                "month": key,
                "income": income,
                "expense": expense,
                "net": income - expense,
                "balance": balance,
            }
        )
    return points


def categories_breakdown(user, month: str, kind: str = TxKind.EXPENSE) -> list[dict]:
    first, last = month_bounds(month)
    rows = (
        Transaction.objects.filter(user=user, kind=kind, date__range=(first, last))
        .values("category_id", "category__parent_id")
        .order_by()
        .annotate(total=Sum("amount"))
    )
    cats = Category.objects.filter(user=user).in_bulk()

    roots: dict[int | None, dict] = {}
    for row in rows:
        cat_id, parent_id = row["category_id"], row["category__parent_id"]
        root_id = parent_id or cat_id
        if root_id not in roots:
            root = cats.get(root_id) if root_id else None
            base = (
                {"id": root.id, "name": root.name, "color": root.color} if root else UNCATEGORIZED
            )
            roots[root_id] = {**base, "total": ZERO, "children": []}
        node = roots[root_id]
        node["total"] += row["total"]
        if parent_id:  # lançamento numa subcategoria
            child = cats[cat_id]
            node["children"].append(
                {"id": child.id, "name": child.name, "color": child.color, "total": row["total"]}
            )

    result = sorted(roots.values(), key=lambda n: n["total"], reverse=True)
    for node in result:
        node["children"].sort(key=lambda c: c["total"], reverse=True)
    return result


def top_expenses(user, month: str, limit: int = 5) -> QuerySet[Transaction]:
    first, last = month_bounds(month)
    return (
        Transaction.objects.filter(user=user, kind=TxKind.EXPENSE, date__range=(first, last))
        .order_by("-amount", "-date", "-id")
        .select_related("invoice", "installment_plan")
        .prefetch_related("tags")[:limit]
    )


def pending(user, limit: int = 6) -> QuerySet[Transaction]:
    return (
        Transaction.objects.filter(user=user, status=TxStatus.PENDING)
        .order_by("date", "id")
        .select_related("invoice", "installment_plan")
        .prefetch_related("tags")[:limit]
    )
