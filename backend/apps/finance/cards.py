"""Regras do cartão de crédito: em qual fatura cai uma compra e quando ela fecha e vence."""

import datetime

from apps.finance.dashboard import shift_month
from apps.finance.models import CreditCard, Invoice


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
