import datetime
from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction

from apps.finance.cards import (
    get_or_create_invoice,
    invoice_dates,
    invoice_reference,
    invoice_status,
)
from apps.finance.dashboard import summary
from apps.finance.models import CreditCard, Transaction
from apps.finance.services import accounts_with_balance
from apps.finance.tests.factories import AccountFactory, CreditCardFactory, TransactionFactory

pytestmark = pytest.mark.django_db
D = datetime.date


def card(closing=10, due=20, **kw):
    return CreditCardFactory.build(closing_day=closing, due_day=due, **kw)


# ---- regra da fatura ----
@pytest.mark.parametrize(
    "purchase, expected",
    [
        (D(2026, 11, 9), "2026-11"),
        (D(2026, 11, 10), "2026-11"),  # no dia do fechamento ainda entra
        (D(2026, 11, 11), "2026-12"),
        (D(2026, 12, 31), "2027-01"),  # virada de ano
        (D(2026, 1, 1), "2026-01"),
    ],
)
def test_invoice_reference(purchase, expected):
    assert invoice_reference(card(closing=10), purchase) == expected


def test_invoice_dates_due_same_month_when_after_closing():
    assert invoice_dates(card(closing=10, due=20), "2026-11") == (D(2026, 11, 10), D(2026, 11, 20))


def test_invoice_dates_due_next_month_when_before_closing():
    c = card(closing=25, due=5)
    assert invoice_dates(c, "2026-12") == (D(2026, 12, 25), D(2027, 1, 5))


def test_invoice_status():
    c = CreditCardFactory(closing_day=10, due_day=20)
    inv = get_or_create_invoice(c, "2026-11")
    assert invoice_status(inv, D(2026, 11, 10)) == "open"
    assert invoice_status(inv, D(2026, 11, 11)) == "closed"
    payment = TransactionFactory(
        user=c.user,
        kind="transfer",
        account=AccountFactory(user=c.user),
        to_credit_card=c,
        amount=Decimal("1"),
    )
    inv.payment = payment
    inv.save()
    assert invoice_status(inv, D(2026, 11, 30)) == "paid"


def test_get_or_create_invoice_is_idempotent():
    c = CreditCardFactory()
    assert get_or_create_invoice(c, "2026-11").pk == get_or_create_invoice(c, "2026-11").pk


# ---- constraints ----
def _fails(**kw):
    with pytest.raises(IntegrityError), transaction.atomic():
        TransactionFactory(**kw)


def test_transaction_needs_exactly_one_source():
    c = CreditCardFactory()
    _fails(user=c.user, account=None, credit_card=None)
    _fails(user=c.user, account=AccountFactory(user=c.user), credit_card=c)


def test_card_transaction_must_be_expense():
    c = CreditCardFactory()
    _fails(user=c.user, account=None, credit_card=c, kind="income")


def test_transfer_has_exactly_one_destination():
    c = CreditCardFactory()
    acc = AccountFactory(user=c.user)
    _fails(user=c.user, account=acc, kind="transfer")  # nenhum destino
    _fails(
        user=c.user,
        account=acc,
        kind="transfer",
        to_account=AccountFactory(user=c.user),
        to_credit_card=c,
    )
    _fails(user=c.user, account=acc, kind="expense", to_credit_card=c)


def test_card_day_range():
    acc = AccountFactory()
    with pytest.raises(IntegrityError), transaction.atomic():
        CreditCard.objects.create(
            user=acc.user, name="X", limit=1, closing_day=29, due_day=5, payment_account=acc
        )


# ---- contabilidade: pagar a fatura não conta duas vezes ----
def test_card_purchase_and_payment_accounting():
    acc = AccountFactory(initial_balance=Decimal("1000.00"))
    user = acc.user
    c = CreditCardFactory(user=user, payment_account=acc)
    d = D(2026, 11, 5)
    TransactionFactory(user=user, account=None, credit_card=c, amount=Decimal("300"), date=d)
    TransactionFactory(
        user=user,
        account=acc,
        kind="transfer",
        to_credit_card=c,
        amount=Decimal("300"),
        date=D(2026, 11, 20),
    )
    balance = {a.id: a.balance for a in accounts_with_balance(user)}[acc.id]
    assert balance == Decimal("700.00")  # só o pagamento tira da conta
    s = summary(user, "2026-11")
    assert s["expense"] == Decimal("300")  # a compra, uma vez
    assert s["balance"] == Decimal("700.00")  # patrimônio: compra reduz, pagamento neutro
    assert Transaction.objects.filter(user=user).count() == 2
