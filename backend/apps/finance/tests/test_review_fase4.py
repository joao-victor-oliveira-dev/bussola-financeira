"""Regressões dos achados da revisão da Fase 4."""

import datetime
from decimal import Decimal

import pytest

from apps.finance.cards import get_or_create_invoice
from apps.finance.dashboard import summary
from apps.finance.models import Invoice, RecurringRule, Transaction
from apps.finance.recurring import generate
from apps.finance.tests.factories import AccountFactory, CreditCardFactory, TransactionFactory

pytestmark = pytest.mark.django_db
D = datetime.date


@pytest.fixture
def card(user):
    return CreditCardFactory(
        user=user, closing_day=10, due_day=20, payment_account=AccountFactory(user=user)
    )


def buy(api, card, **kw):
    data = {
        "kind": "expense",
        "amount": "100.00",
        "date": "2026-11-05",
        "description": "Compra",
        "credit_card_id": card.id,
        **kw,
    }
    return api.post("/api/transactions", data)


def pay(api, card, ref="2026-11"):
    return api.post(f"/api/cards/{card.id}/invoices/{ref}/pay", {})


# 1. ocorrência apagada/movida não volta
def test_deleted_occurrence_is_not_recreated(user):
    acc = AccountFactory(user=user)
    rule = RecurringRule.objects.create(
        user=user,
        kind="expense",
        amount=Decimal("10"),
        description="Aluguel",
        account=acc,
        frequency="monthly",
        start_date=D(2026, 11, 20),
    )
    generate(rule, today=D(2026, 11, 14))
    Transaction.objects.get(recurring_rule=rule, date=D(2026, 11, 20)).delete()
    moved = Transaction.objects.get(recurring_rule=rule, date=D(2026, 12, 20))
    moved.date = D(2026, 12, 22)
    moved.save()
    generate(rule, today=D(2026, 11, 15))
    dates = sorted(Transaction.objects.filter(recurring_rule=rule).values_list("date", flat=True))
    assert dates == [D(2026, 12, 22)]


# 2. mover ocorrência para data ocupada → 409
def test_move_occurrence_onto_existing_date_409(api, user):
    acc = AccountFactory(user=user)
    rule = RecurringRule.objects.create(
        user=user,
        kind="expense",
        amount=Decimal("10"),
        description="Academia",
        account=acc,
        frequency="weekly",
        start_date=D(2026, 12, 7),
    )
    a = TransactionFactory(user=user, account=acc, recurring_rule=rule, date=D(2026, 12, 7))
    TransactionFactory(user=user, account=acc, recurring_rule=rule, date=D(2026, 12, 14))
    assert api.patch(f"/api/transactions/{a.id}", {"date": "2026-12-14"}).status_code == 409


# 3. compra em fatura paga → 422
def test_purchase_into_paid_invoice_422(api, card):
    assert buy(api, card).status_code == 201
    assert pay(api, card).status_code == 200
    r = buy(api, card, amount="200.00")
    assert r.status_code == 422
    assert "paga" in r.json()["detail"]


def test_installments_into_paid_invoice_422(api, card):
    buy(api, card)
    pay(api, card)
    r = api.post(
        "/api/installments",
        {
            "credit_card_id": card.id,
            "description": "TV",
            "total": "300.00",
            "count": 3,
            "purchase_date": "2026-11-02",
        },
    )
    assert r.status_code == 422


# 4. mexer em compra de fatura paga → 409
def test_edit_or_delete_item_of_paid_invoice_409(api, card):
    tx = buy(api, card).json()
    pay(api, card)
    assert api.patch(f"/api/transactions/{tx['id']}", {"amount": "1.00"}).status_code == 409
    assert api.delete(f"/api/transactions/{tx['id']}").status_code == 409
    # descrição/categoria/notas continuam editáveis
    assert api.patch(f"/api/transactions/{tx['id']}", {"notes": "ok"}).status_code == 200


def test_delete_plan_with_paid_installment_409(api, card):
    plan = api.post(
        "/api/installments",
        {
            "credit_card_id": card.id,
            "description": "TV",
            "total": "300.00",
            "count": 3,
            "purchase_date": "2026-11-02",
        },
    ).json()
    pay(api, card)
    assert api.delete(f"/api/installments/{plan['id']}").status_code == 409


# 5. saldo total não desconta o futuro
def test_balance_ignores_future_dated_purchases(user):
    acc = AccountFactory(user=user, initial_balance=Decimal("1000"))
    future = datetime.date.today() + datetime.timedelta(days=40)
    TransactionFactory(user=user, account=acc, amount=Decimal("300"), date=future)
    assert summary(user, f"{future:%Y-%m}")["balance"] == Decimal("1000")


# 7. validação recusada não cria fatura
def test_rejected_card_purchase_leaves_no_invoice(api, card, user):
    from apps.finance.tests.factories import CategoryFactory

    income_cat = CategoryFactory(user=user, kind="income")
    assert buy(api, card, category_id=income_cat.id).status_code == 422
    assert not Invoice.objects.filter(card=card).exists()


def test_card_rule_validation_leaves_no_invoice(api, card):
    r = api.post(
        "/api/recurring",
        {
            "kind": "expense",
            "amount": "10",
            "description": "Streaming",
            "credit_card_id": card.id,
            "frequency": "monthly",
            "start_date": "2030-01-15",
        },
    )
    assert r.status_code == 201
    assert not Invoice.objects.filter(card=card).exists()  # nada gerado ainda (fora da janela)


# 8. excluir conta/cartão usado por recorrência → 409
def test_delete_account_or_card_used_by_rule_409(api, user, card):
    acc = AccountFactory(user=user)
    RecurringRule.objects.create(
        user=user,
        kind="expense",
        amount=Decimal("10"),
        description="x",
        account=acc,
        frequency="monthly",
        start_date=D(2030, 1, 1),
    )
    RecurringRule.objects.create(
        user=user,
        kind="expense",
        amount=Decimal("10"),
        description="y",
        credit_card=card,
        frequency="monthly",
        start_date=D(2030, 1, 1),
    )
    assert api.delete(f"/api/accounts/{acc.id}").status_code == 409
    assert api.delete(f"/api/cards/{card.id}").status_code == 409


# 10. agendamento em horário fixo
def test_beat_uses_fixed_hours():
    from celery.schedules import crontab
    from django.conf import settings

    schedule = settings.CELERY_BEAT_SCHEDULE
    assert all(isinstance(e["schedule"], crontab) for e in schedule.values())


def test_get_or_create_invoice_helper_still_works(card):
    assert get_or_create_invoice(card, "2026-11").reference == "2026-11"
