from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction

from apps.finance.services import accounts_with_balance
from apps.finance.tests.factories import AccountFactory, TransactionFactory
from apps.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


def _fails(**kwargs):
    with pytest.raises(IntegrityError), transaction.atomic():
        TransactionFactory(**kwargs)


def test_amount_must_be_positive():
    _fails(amount=Decimal("0"))
    _fails(amount=Decimal("-1"))


def test_transfer_requires_destination():
    _fails(kind="transfer", to_account=None)


def test_transfer_destination_differs_from_origin():
    acc = AccountFactory()
    _fails(user=acc.user, kind="transfer", account=acc, to_account=acc)


def test_non_transfer_cannot_have_destination():
    acc = AccountFactory()
    _fails(user=acc.user, kind="expense", to_account=AccountFactory(user=acc.user), account=acc)


def test_balance_counts_only_paid_and_transfers_both_ways():
    user = UserFactory()
    a = AccountFactory(user=user, initial_balance=Decimal("100.00"))
    b = AccountFactory(user=user, initial_balance=Decimal("0.00"))
    TransactionFactory(user=user, account=a, kind="income", amount=Decimal("50.00"))
    TransactionFactory(user=user, account=a, kind="expense", amount=Decimal("30.25"))
    TransactionFactory(
        user=user, account=a, kind="expense", amount=Decimal("999"), status="pending"
    )
    TransactionFactory(user=user, account=a, to_account=b, kind="transfer", amount=Decimal("20"))
    balances = {x.id: x.balance for x in accounts_with_balance(user)}
    assert balances[a.id] == Decimal("99.75")
    assert balances[b.id] == Decimal("20.00")


def test_accounts_with_balance_only_returns_own_accounts():
    mine = AccountFactory()
    AccountFactory()
    assert [a.id for a in accounts_with_balance(mine.user)] == [mine.id]
