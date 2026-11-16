"""Orçamento: gasto do mês por categoria principal, situação (80%/100%) e cópia de limites."""

from decimal import ROUND_DOWN, Decimal

from django.db import transaction
from django.db.models import F, Q, Sum
from django.db.models.functions import Coalesce

from apps.finance.dashboard import month_bounds, shift_month
from apps.finance.models import Budget, Category, Transaction, TxKind

ZERO = Decimal("0")
WARNING_AT = Decimal("0.8")


def _spent_by_root(user, month: str) -> dict[int, Decimal]:
    """Despesas do mês (efetivadas e pendentes) somadas pela categoria principal."""
    first, last = month_bounds(month)
    rows = (
        Transaction.objects.filter(
            user=user, kind=TxKind.EXPENSE, date__range=(first, last), category__isnull=False
        )
        .annotate(root=Coalesce(F("category__parent_id"), F("category_id")))
        .values("root")
        .order_by()
        .annotate(total=Sum("amount"))
    )
    return {r["root"]: r["total"] for r in rows}


def status_of(spent: Decimal, limit: Decimal) -> str:
    if spent >= limit:
        return "over"
    return "warning" if spent >= limit * WARNING_AT else "ok"


def percent_of(spent: Decimal, limit: Decimal) -> str:
    # Para baixo: 99,96% fica "99.9" e não aparece como "100.0" num item ainda "warning".
    return str((spent / limit * 100).quantize(Decimal("0.1"), rounding=ROUND_DOWN))


def budget_overview(user, month: str) -> dict:
    spent_by_root = _spent_by_root(user, month)
    budgets = Budget.objects.filter(user=user, month=month).select_related("category")
    items = []
    for b in budgets:
        spent = spent_by_root.get(b.category_id, ZERO)
        items.append(
            {
                "id": b.id,
                "category_id": b.category_id,
                "category_name": b.category.name,
                "color": b.category.color,
                "limit": b.limit,
                "spent": spent,
                "remaining": b.limit - spent,
                "percent": percent_of(spent, b.limit),
                "status": status_of(spent, b.limit),
                "_ratio": spent / b.limit,
            }
        )
    items.sort(key=lambda i: (-i.pop("_ratio"), i["category_name"]))

    budgeted = {i["category_id"] for i in items}
    roots = Category.objects.filter(user=user, pk__in=spent_by_root.keys()).exclude(pk__in=budgeted)
    unbudgeted = sorted(
        (
            {
                "category_id": c.id,
                "category_name": c.name,
                "color": c.color,
                "spent": spent_by_root[c.id],
            }
            for c in roots
        ),
        key=lambda u: -u["spent"],
    )
    total_limit = sum((i["limit"] for i in items), ZERO)
    total_spent = sum((i["spent"] for i in items), ZERO)
    return {
        "month": month,
        "items": items,
        "totals": {
            "limit": total_limit,
            "spent": total_spent,
            "remaining": total_limit - total_spent,
            # mesma regra dos itens (o front não recalcula a situação)
            "percent": percent_of(total_spent, total_limit) if total_limit else "0.0",
            "status": status_of(total_spent, total_limit) if total_limit else "ok",
        },
        "unbudgeted": unbudgeted,
    }


@transaction.atomic
def copy_budgets(user, to_month: str, from_month: str | None = None) -> int:
    """Copia limites de outro mês (padrão: o anterior) sem sobrescrever os que já existem."""
    source = from_month or shift_month(to_month, -1)
    existing = set(
        Budget.objects.filter(user=user, month=to_month).values_list("category_id", flat=True)
    )
    new = [
        Budget(user=user, category_id=b.category_id, month=to_month, limit=b.limit)
        for b in Budget.objects.filter(
            user=user,
            month=source,
            # só o que ainda é válido: categoria principal de despesa
            category__parent__isnull=True,
            category__kind=TxKind.EXPENSE,
        )
        if b.category_id not in existing
    ]
    Budget.objects.bulk_create(new)
    return len(new)


def budget_item(budget: Budget) -> dict:
    """Um item só (resposta de POST/PATCH), com uma consulta de gasto para a categoria."""
    first, last = month_bounds(budget.month)
    spent = (
        Transaction.objects.filter(user=budget.user, kind=TxKind.EXPENSE, date__range=(first, last))
        .filter(Q(category_id=budget.category_id) | Q(category__parent_id=budget.category_id))
        .aggregate(t=Sum("amount"))["t"]
        or ZERO
    )
    return {
        "id": budget.id,
        "category_id": budget.category_id,
        "category_name": budget.category.name,
        "color": budget.category.color,
        "limit": budget.limit,
        "spent": spent,
        "remaining": budget.limit - spent,
        "percent": percent_of(spent, budget.limit),
        "status": status_of(spent, budget.limit),
    }
