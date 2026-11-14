"""Dados de demonstração: 12 meses realistas e determinísticos (mesma semente → mesmos dados)."""

import calendar
import datetime
import random
from decimal import Decimal

from django.conf import settings
from django.db import transaction

from apps.finance.cards import get_or_create_invoice, invoice_dates, invoice_reference
from apps.finance.dashboard import shift_month
from apps.finance.installments import create_plan
from apps.finance.models import (
    Account,
    Category,
    CreditCard,
    InstallmentPlan,
    RecurringRule,
    Tag,
    Transaction,
    TxStatus,
)
from apps.finance.recurring import generate
from apps.finance.services import create_default_categories
from apps.users.models import User

CARD = "Roxinho"  # compras marcadas com este nome vão para o cartão de crédito

ACCOUNTS = [
    ("Nubank", "checking", "9500.00", "#b88cf2"),
    ("Reserva", "savings", "15000.00", "#2fb5a2"),
    ("Carteira", "wallet", "150.00", "#cda35e"),
    ("Investimentos", "investment", "25000.00", "#6c9ef8"),
]

# (descrição, categoria, dia, valor, conta) — contas fixas de todo mês
FIXED_EXPENSES = [
    ("Aluguel", "Moradia", 10, "2200.00", "Nubank"),
    ("Condomínio", "Moradia", 10, "480.00", "Nubank"),
    ("Curso de inglês", "Educação", 15, "349.00", "Nubank"),
    ("Streaming de vídeo", "Assinaturas", 18, "55.90", "Nubank"),
    ("Streaming de música", "Assinaturas", 20, "21.90", "Nubank"),
    ("Internet", "Moradia", 22, "119.90", "Nubank"),
    ("Plano de saúde", "Saúde", 25, "389.00", "Nubank"),
]

# (descrições, categoria, vezes por mês (mín, máx), faixa de valor, contas possíveis)
VARIABLE_EXPENSES = [
    (["Supermercado", "Feira", "Hortifrúti"], "Mercado", (4, 6), (60, 480), ["Nubank"]),
    (
        ["Restaurante", "Lanchonete", "Delivery"],
        "Restaurantes",
        (3, 7),
        (35, 180),
        ["Nubank", "Nubank", "Carteira"],
    ),
    (["Uber", "Combustível", "Metrô"], "Transporte", (5, 9), (12, 220), ["Nubank"]),
    (["Farmácia"], "Saúde", (0, 2), (25, 160), ["Nubank"]),
    (["Cinema", "Show", "Passeio"], "Lazer", (1, 3), (40, 260), [CARD]),
    (["Roupas", "Eletrônicos", "Casa"], "Compras", (0, 2), (80, 650), [CARD]),
]

# (descrição, valor total, parcelas, meses atrás, dia, categoria)
PLANS = [
    ("Notebook", "4800.00", 10, 7, 14, "Compras"),
    ("Geladeira", "3200.00", 6, 2, 20, "Moradia"),
]

TRIP = [  # mês de viagem (4 meses atrás), com a tag "viagem"
    ("Passagens aéreas", "Lazer", "1890.00"),
    ("Hotel", "Lazer", "2340.00"),
    ("Restaurante na praia", "Restaurantes", "286.40"),
    ("Passeio de barco", "Lazer", "420.00"),
]


def _months(today: datetime.date, count: int = 12) -> list[tuple[int, int]]:
    current = f"{today:%Y-%m}"
    keys = [shift_month(current, -i) for i in range(count - 1, -1, -1)]
    return [(int(k[:4]), int(k[5:])) for k in keys]


def _day(year: int, month: int, day: int) -> datetime.date:
    return datetime.date(year, month, min(day, calendar.monthrange(year, month)[1]))


@transaction.atomic
def seed_demo(user, today: datetime.date | None = None, reset: bool = False) -> None:
    """Gera os dados da demo para `user`. Sem `reset`, não faz nada se já houver contas.

    Sempre que gera, parte do zero: um visitante pode ter apagado as contas mas deixado
    tags e categorias renomeadas, e o seed não pode depender desse estado.
    """
    today = today or datetime.date.today()
    if not reset and Account.objects.filter(user=user).exists():
        return
    Transaction.objects.filter(user=user).delete()
    InstallmentPlan.objects.filter(user=user).delete()
    RecurringRule.objects.filter(user=user).delete()
    CreditCard.objects.filter(user=user).delete()  # faturas vão junto (CASCADE)
    Account.objects.filter(user=user).delete()
    Tag.objects.filter(user=user).delete()
    Category.objects.filter(user=user, parent__isnull=False).delete()
    Category.objects.filter(user=user).delete()

    create_default_categories(user)
    rng = random.Random(42)
    cats = {(c.kind, c.name): c for c in Category.objects.filter(user=user)}
    accounts = {
        name: Account.objects.create(
            user=user, name=name, type=type_, initial_balance=Decimal(initial), color=color
        )
        for name, type_, initial, color in ACCOUNTS
    }
    trip_tag = Tag.objects.create(user=user, name="viagem", color="#6c9ef8")
    card = CreditCard.objects.create(
        user=user,
        name=CARD,
        limit=Decimal("9000.00"),
        closing_day=5,
        due_day=12,
        payment_account=accounts["Nubank"],
        color="#7c5cd6",
    )
    months = _months(today)
    first_y, first_m = months[0]
    # contas fixas e salário são recorrências: o histórico fica ligado à regra
    rules = {
        desc: RecurringRule.objects.create(
            user=user,
            kind="expense",
            amount=Decimal(amount),
            description=desc,
            account=accounts[account],
            category=cats[("expense", cat)],
            frequency="monthly",
            start_date=_day(first_y, first_m, day),
        )
        for desc, cat, day, amount, account in FIXED_EXPENSES
    }
    rules["Salário"] = RecurringRule.objects.create(
        user=user,
        kind="income",
        amount=Decimal("8450.00"),
        description="Salário",
        account=accounts["Nubank"],
        category=cats[("income", "Salário")],
        frequency="monthly",
        start_date=_day(first_y, first_m, 5),
    )

    txs: list[Transaction] = []
    tagged: list[Transaction] = []

    def add(kind, date, description, amount, account, category=None, to_account=None, rule=None):
        paid = date <= today
        on_card = account == CARD
        tx = Transaction(
            user=user,
            kind=kind,
            date=date,
            description=description,
            amount=Decimal(amount).quantize(Decimal("0.01")),
            account=None if on_card else accounts[account],
            credit_card=card if on_card else None,
            invoice=get_or_create_invoice(card, invoice_reference(card, date)) if on_card else None,
            to_account=accounts[to_account] if to_account else None,
            category=cats[(kind, category)] if category else None,
            status=TxStatus.PAID if paid else TxStatus.PENDING,
            recurring_rule=rule,
        )
        txs.append(tx)
        return tx

    for i, (y, m) in enumerate(months):
        current = (y, m) == (today.year, today.month)
        last_day = today.day if current else calendar.monthrange(y, m)[1]

        salary = Decimal("7800.00") if i < 8 else Decimal("8450.00")  # aumento no ano
        add("income", _day(y, m, 5), "Salário", salary, "Nubank", "Salário",
            rule=rules["Salário"])  # fmt: skip
        if rng.random() < 0.45:
            add("income", _day(y, m, rng.randint(8, 26)), "Projeto freelance",
                rng.choice(["850", "1200", "1650", "2300"]), "Nubank", "Freelance")  # fmt: skip
        if m in (6, 12):
            add("income", _day(y, m, 28), "Rendimentos", "312.45", "Investimentos",
                "Investimentos")  # fmt: skip

        for desc, cat, day, amount, account in FIXED_EXPENSES:
            add("expense", _day(y, m, day), desc, amount, account, cat, rule=rules[desc])

        for descs, cat, (lo, hi), (vmin, vmax), accs in VARIABLE_EXPENSES:
            for _ in range(rng.randint(lo, hi)):
                day = rng.randint(1, max(1, last_day))
                value = Decimal(rng.uniform(vmin, vmax)).quantize(Decimal("0.01"))
                add("expense", _day(y, m, day), rng.choice(descs), value, rng.choice(accs), cat)

        add("transfer", _day(y, m, 6), "Guardar na reserva", "800.00", "Nubank",
            to_account="Reserva")  # fmt: skip
        add("transfer", _day(y, m, 7), "Aporte mensal", "500.00", "Nubank",
            to_account="Investimentos")  # fmt: skip
        add("transfer", _day(y, m, 12), "Saque", "250.00", "Nubank", to_account="Carteira")

        if i == len(months) - 5:
            for desc, cat, amount in TRIP:
                tagged.append(add("expense", _day(y, m, rng.randint(14, 24)), desc, amount,
                                  CARD, cat))  # fmt: skip

    Transaction.objects.bulk_create(txs)
    trip_tag.transactions.add(*tagged)

    for desc, total, count, months_ago, day, cat in PLANS:
        y, m = months[-1 - months_ago]
        create_plan(
            user,
            {
                "credit_card_id": card.id,
                "description": desc,
                "total": Decimal(total),
                "count": count,
                "purchase_date": _day(y, m, day),
                "category_id": cats[("expense", cat)].id,
            },
        )

    # faturas já vencidas foram pagas pela conta do cartão (transferência no vencimento)
    for invoice in card.invoices.order_by("reference"):
        _, due = invoice_dates(card, invoice.reference)
        total = sum((t.amount for t in invoice.items.all()), Decimal("0"))
        if due <= today and total > 0:
            invoice.payment = Transaction.objects.create(
                user=user,
                kind="transfer",
                amount=total,
                date=due,
                description=f"Pagamento da fatura {card.name} ({invoice.reference})",
                account=accounts["Nubank"],
                to_credit_card=card,
                status=TxStatus.PAID,
            )
            invoice.save(update_fields=["payment"])

    for rule in rules.values():
        generate(rule, today)  # próximas ocorrências pendentes (até 60 dias)


class DemoUnavailable(Exception):
    """O e-mail da demo pertence a uma conta real (com senha): nunca entrar nela."""


def get_demo_user() -> User:
    """Usuário da demo: sem senha utilizável, só entra por POST /auth/demo."""
    user, created = User.objects.get_or_create(
        email=settings.DEMO_EMAIL, defaults={"name": "Visitante"}
    )
    if created:
        user.set_unusable_password()
        user.save(update_fields=["password"])
    elif user.has_usable_password():
        raise DemoUnavailable
    return user
