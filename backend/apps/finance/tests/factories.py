import datetime
from decimal import Decimal

import factory

from apps.finance.models import Account, Category, Tag, Transaction
from apps.users.tests.factories import UserFactory


class AccountFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Account

    user = factory.SubFactory(UserFactory)
    name = factory.Sequence(lambda n: f"Conta {n}")
    type = "checking"
    initial_balance = Decimal("0.00")


class CategoryFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Category

    user = factory.SubFactory(UserFactory)
    name = factory.Sequence(lambda n: f"Categoria {n}")
    kind = "expense"


class TagFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Tag

    user = factory.SubFactory(UserFactory)
    name = factory.Sequence(lambda n: f"tag{n}")


class TransactionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Transaction

    user = factory.SubFactory(UserFactory)
    kind = "expense"
    amount = Decimal("10.00")
    date = factory.LazyFunction(datetime.date.today)
    description = factory.Sequence(lambda n: f"Lançamento {n}")
    account = factory.SubFactory(AccountFactory, user=factory.SelfAttribute("..user"))
    status = "paid"


class CreditCardFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = "finance.CreditCard"

    user = factory.SubFactory(UserFactory)
    name = factory.Sequence(lambda n: f"Cartão {n}")
    limit = Decimal("5000.00")
    closing_day = 10
    due_day = 20
    payment_account = factory.SubFactory(AccountFactory, user=factory.SelfAttribute("..user"))
