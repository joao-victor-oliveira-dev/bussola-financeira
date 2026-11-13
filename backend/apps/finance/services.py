from decimal import Decimal

from django.db.models import DecimalField, F, OuterRef, QuerySet, Subquery, Sum, Value
from django.db.models.functions import Coalesce

from apps.finance.models import Account, Category, Transaction, TxStatus

DEFAULT_CATEGORIES: dict[str, list[tuple[str, list[str]]]] = {
    "expense": [
        ("Moradia", []),
        ("Alimentação", ["Mercado", "Restaurantes"]),
        ("Transporte", []),
        ("Saúde", []),
        ("Educação", []),
        ("Lazer", []),
        ("Compras", []),
        ("Assinaturas", []),
        ("Outros", []),
    ],
    "income": [("Salário", []), ("Freelance", []), ("Investimentos", []), ("Outros", [])],
}

PALETTE = ["#2fb5a2", "#cda35e", "#f27a6e", "#41d095", "#6c9ef8", "#b88cf2", "#f2b85e", "#8a9ba3"]

MONEY_FIELD = DecimalField(max_digits=14, decimal_places=2)


def create_default_categories(user) -> None:
    """Cria o conjunto padrão de categorias. Idempotente."""
    for kind, items in DEFAULT_CATEGORIES.items():
        for i, (name, children) in enumerate(items):
            parent, _ = Category.objects.get_or_create(
                user=user,
                kind=kind,
                parent=None,
                name=name,
                defaults={"color": PALETTE[i % len(PALETTE)]},
            )
            for child in children:
                Category.objects.get_or_create(
                    user=user,
                    kind=kind,
                    parent=parent,
                    name=child,
                    defaults={"color": parent.color},
                )


def _paid_sum(**filters) -> Coalesce:
    qs = (
        Transaction.objects.filter(status=TxStatus.PAID, **filters)
        .order_by()
        .values("status")
        .annotate(t=Sum("amount"))
        .values("t")
    )
    return Coalesce(
        Subquery(qs, output_field=MONEY_FIELD), Value(Decimal("0")), output_field=MONEY_FIELD
    )


def accounts_with_balance(user) -> QuerySet[Account]:
    """Contas do usuário anotadas com `balance` (só lançamentos efetivados)."""
    ref = OuterRef("pk")
    return Account.objects.filter(user=user).annotate(
        balance=F("initial_balance")
        + _paid_sum(account=ref, kind="income")
        - _paid_sum(account=ref, kind="expense")
        - _paid_sum(account=ref, kind="transfer")
        + _paid_sum(to_account=ref, kind="transfer")
    )
