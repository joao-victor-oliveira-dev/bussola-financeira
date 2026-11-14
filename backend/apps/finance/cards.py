"""Regras do cartão de crédito: em qual fatura cai uma compra e quando ela fecha e vence."""

import datetime
from decimal import Decimal

from django.db.models import Sum

from apps.finance.dashboard import shift_month
from apps.finance.models import CreditCard, Invoice, Transaction


def invoice_reference(card: CreditCard, date: datetime.date) -> str:
    """Mês em que a fatura da compra fecha: até o dia de fechamento, o próprio mês."""
    month = f"{date:%Y-%m}"
    return month if date.day <= card.closing_day else shift_month(month, 1)


def invoice_dates(card: CreditCard, reference: str) -> tuple[datetime.date, datetime.date]:
    year, month = map(int, reference.split("-"))
    closing = datetime.date(year, month, card.closing_day)
    due_ref = reference if card.due_day > card.closing_day else shift_month(reference, 1)
    due_year, due_month = map(int, due_ref.split("-"))
    return closing, datetime.date(due_year, due_month, card.due_day)


def get_or_create_invoice(card: CreditCard, reference: str) -> Invoice:
    invoice, _ = Invoice.objects.get_or_create(
        card=card, reference=reference, defaults={"user": card.user}
    )
    return invoice


def invoice_status(invoice: Invoice, today: datetime.date) -> str:
    if invoice.payment_id:
        return "paid"
    closing, _ = invoice_dates(invoice.card, invoice.reference)
    return "closed" if today > closing else "open"


ZERO = Decimal("0")


def invoice_total(card: CreditCard, reference: str) -> Decimal:
    return (
        Transaction.objects.filter(invoice__card=card, invoice__reference=reference).aggregate(
            t=Sum("amount")
        )["t"]
        or ZERO
    )


def limit_used(card: CreditCard) -> Decimal:
    """Compras de faturas ainda não pagas."""
    return (
        Transaction.objects.filter(credit_card=card, invoice__payment__isnull=True).aggregate(
            t=Sum("amount")
        )["t"]
        or ZERO
    )


def invoice_summary(card: CreditCard, reference: str, today: datetime.date) -> dict:
    closing, due = invoice_dates(card, reference)
    invoice = Invoice.objects.filter(card=card, reference=reference).first()
    if invoice:
        status = invoice_status(invoice, today)
    else:
        status = "closed" if today > closing else "open"
    return {
        "reference": reference,
        "closing_date": closing,
        "due_date": due,
        "total": invoice_total(card, reference),
        "status": status,
        "payment_id": invoice.payment_id if invoice else None,
    }
