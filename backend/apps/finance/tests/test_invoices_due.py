import datetime
from decimal import Decimal

import pytest

from apps.finance.cards import get_or_create_invoice, invoice_reference
from apps.finance.dashboard import invoices_due
from apps.finance.tests.factories import AccountFactory, CreditCardFactory, TransactionFactory

pytestmark = pytest.mark.django_db
D = datetime.date
TODAY = D(2026, 11, 14)


def purchase(card, amount, date):
    inv = get_or_create_invoice(card, invoice_reference(card, date))
    return TransactionFactory(
        user=card.user,
        account=None,
        credit_card=card,
        amount=Decimal(amount),
        date=date,
        invoice=inv,
    )


def test_lists_unpaid_invoices_due_soon_and_overdue():
    c = CreditCardFactory(name="Roxinho", closing_day=5, due_day=12)
    purchase(c, "100", D(2026, 10, 3))  # fatura 2026-10, venceu 12/10 (atrasada)
    purchase(c, "250.50", D(2026, 11, 2))  # fatura 2026-11, vence 12/11 (atrasada há 2 dias)
    purchase(c, "80", D(2026, 12, 4))  # fatura 2026-12, vence 12/12 (dentro de 30 dias)
    purchase(c, "999", D(2027, 2, 1))  # vence em fev: fora da janela
    items = invoices_due(c.user, TODAY, days=30)
    assert [(i["reference"], i["total"], i["due_date"]) for i in items] == [
        ("2026-10", Decimal("100"), D(2026, 10, 12)),
        ("2026-11", Decimal("250.50"), D(2026, 11, 12)),
        ("2026-12", Decimal("80"), D(2026, 12, 12)),
    ]
    assert items[0]["card_name"] == "Roxinho"
    assert items[0]["overdue"] is True
    assert items[2]["overdue"] is False


def test_paid_and_empty_invoices_are_skipped():
    c = CreditCardFactory(closing_day=5, due_day=12)
    purchase(c, "100", D(2026, 11, 2))
    inv = get_or_create_invoice(c, "2026-11")
    inv.payment = TransactionFactory(
        user=c.user,
        account=AccountFactory(user=c.user),
        kind="transfer",
        to_credit_card=c,
        amount=Decimal("100"),
    )
    inv.save()
    get_or_create_invoice(c, "2026-12")  # existe, mas sem itens
    assert invoices_due(c.user, TODAY) == []


def test_only_own_cards(api, user):
    other = CreditCardFactory(closing_day=5, due_day=12)
    purchase(other, "100", D(2026, 11, 2))
    assert api.get("/api/dashboard/invoices-due").json() == []


def test_endpoint_shape(api, user):
    c = CreditCardFactory(user=user, closing_day=5, due_day=12)
    purchase(c, "100", datetime.date.today())
    body = api.get("/api/dashboard/invoices-due", {"days": 90}).json()
    assert set(body[0]) == {
        "card_id",
        "card_name",
        "card_color",
        "reference",
        "due_date",
        "total",
        "overdue",
    }
