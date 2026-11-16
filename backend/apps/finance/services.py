from decimal import Decimal

from django.db.models import DecimalField, F, OuterRef, QuerySet, Subquery, Sum, Value
from django.db.models.functions import Coalesce

from apps.finance.models import Account, Category, Tag, Transaction, TxKind, TxStatus

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
    if not Category.objects.filter(user=user).exists():
        _bulk_default_categories(user)
        return
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


def _bulk_default_categories(user) -> None:
    """Usuário novo: duas inserções em lote (principais, depois subcategorias)."""
    roots = [
        Category(user=user, kind=kind, name=name, color=PALETTE[i % len(PALETTE)])
        for kind, items in DEFAULT_CATEGORIES.items()
        for i, (name, _) in enumerate(items)
    ]
    Category.objects.bulk_create(roots)
    by_key = {(c.kind, c.name): c for c in roots}
    Category.objects.bulk_create(
        Category(
            user=user,
            kind=kind,
            parent=by_key[(kind, name)],
            name=child,
            color=by_key[(kind, name)].color,
        )
        for kind, items in DEFAULT_CATEGORIES.items()
        for name, children in items
        for child in children
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


class InvalidTransaction(Exception):
    pass


def resolve_transaction(user, data: dict) -> dict:
    """Valida um lançamento (estado completo, ids) e devolve os campos do model.

    Regras: refs precisam ser do usuário; origem é conta OU cartão (cartão só despesa, e a
    fatura sai da data); transferência exige conta destino diferente e não tem categoria; os
    outros tipos não têm destino; categoria precisa ser do mesmo tipo.
    """
    from apps.finance.cards import invoice_reference
    from apps.finance.models import CreditCard

    kind = data["kind"]
    account = card = invoice_ref = None
    if data.get("credit_card_id"):
        if kind != TxKind.EXPENSE:
            raise InvalidTransaction("Compras no cartão são sempre despesas.")
        card = CreditCard.objects.filter(user=user, pk=data["credit_card_id"]).first()
        if card is None:
            raise InvalidTransaction("Cartão inválido.")
        # só a referência: a fatura é criada na hora de salvar (validação não grava nada)
        invoice_ref = invoice_reference(card, data["date"])
    else:
        account = Account.objects.filter(user=user, pk=data.get("account_id")).first()
        if account is None:
            raise InvalidTransaction("Escolha a conta ou o cartão.")

    to_account = None
    category = None
    if kind == TxKind.TRANSFER:
        if not data.get("to_account_id"):
            raise InvalidTransaction("Informe a conta de destino da transferência.")
        to_account = Account.objects.filter(user=user, pk=data["to_account_id"]).first()
        if to_account is None:
            raise InvalidTransaction("Conta de destino inválida.")
        if to_account.pk == account.pk:
            raise InvalidTransaction("A conta de destino precisa ser diferente da de origem.")
    elif data.get("category_id"):
        category = Category.objects.filter(user=user, pk=data["category_id"]).first()
        if category is None:
            raise InvalidTransaction("Categoria inválida.")
        if category.kind != kind:
            raise InvalidTransaction("A categoria não corresponde ao tipo do lançamento.")

    tag_ids = set(data.get("tag_ids") or [])
    tags = list(Tag.objects.filter(user=user, pk__in=tag_ids))
    if len(tags) != len(tag_ids):
        raise InvalidTransaction("Tag inválida.")

    return {
        "kind": kind,
        "amount": data["amount"],
        "date": data["date"],
        "description": data["description"],
        "account": account,
        "credit_card": card,
        "invoice_ref": invoice_ref,
        "to_account": to_account,
        "category": category,
        "status": data["status"],
        "notes": data.get("notes") or "",
        "tags": tags,
    }
