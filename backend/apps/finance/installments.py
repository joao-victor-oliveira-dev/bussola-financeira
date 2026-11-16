"""Compra parcelada no cartão: um plano gera N despesas, uma por mês, cada uma na sua fatura."""

import calendar
import datetime
from decimal import ROUND_DOWN, Decimal

from django.db import transaction

from apps.finance.cards import get_or_create_invoice, invoice_reference
from apps.finance.dashboard import shift_month
from apps.finance.models import Category, CreditCard, InstallmentPlan, Transaction, TxKind
from apps.finance.services import InvalidTransaction

CENT = Decimal("0.01")


def split_amount(total: Decimal, count: int) -> list[Decimal]:
    """Parcelas iguais arredondadas para baixo; o centavo que sobra vai na primeira."""
    base = (total / count).quantize(CENT, rounding=ROUND_DOWN)
    first = total - base * (count - 1)
    return [first] + [base] * (count - 1)


def add_months(date: datetime.date, months: int) -> datetime.date:
    year, month = map(int, shift_month(f"{date:%Y-%m}", months).split("-"))
    return datetime.date(year, month, min(date.day, calendar.monthrange(year, month)[1]))


@transaction.atomic
def create_plan(user, data: dict) -> InstallmentPlan:
    card = CreditCard.objects.filter(user=user, pk=data["credit_card_id"]).first()
    if card is None:
        raise InvalidTransaction("Cartão inválido.")
    category = None
    if data.get("category_id"):
        category = Category.objects.filter(user=user, pk=data["category_id"]).first()
        if category is None or category.kind != TxKind.EXPENSE:
            raise InvalidTransaction("Categoria inválida para uma compra.")

    plan = InstallmentPlan.objects.create(
        user=user,
        card=card,
        description=data["description"],
        total=data["total"],
        count=data["count"],
        purchase_date=data["purchase_date"],
        category=category,
    )
    for i, amount in enumerate(split_amount(plan.total, plan.count)):
        date = add_months(plan.purchase_date, i)
        invoice = get_or_create_invoice(card, invoice_reference(card, date))
        if invoice.payment_id:
            raise InvalidTransaction(
                f"A fatura de {invoice.reference} já foi paga. Desfaça o pagamento para incluir"
                " a compra nela."
            )
        Transaction.objects.create(
            user=user,
            kind=TxKind.EXPENSE,
            amount=amount,
            date=date,
            description=f"{plan.description} ({i + 1}/{plan.count})",
            credit_card=card,
            invoice=invoice,
            category=category,
            installment_plan=plan,
            installment_number=i + 1,
        )
    return plan
