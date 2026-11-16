import datetime
from decimal import Decimal

import pytest
from django.core.management import call_command

from apps.finance.models import RecurringRule, Transaction
from apps.finance.recurring import generate, occurrences, regenerate
from apps.finance.tests.factories import (
    AccountFactory,
    CategoryFactory,
    CreditCardFactory,
    TransactionFactory,
)

pytestmark = pytest.mark.django_db
D = datetime.date


def rule(user=None, **kw):
    acc = (
        kw.pop("account") if "account" in kw else AccountFactory(**({"user": user} if user else {}))
    )
    data = {
        "user": user or acc.user,
        "kind": "expense",
        "amount": Decimal("100.00"),
        "description": "Aluguel",
        "account": acc,
        "frequency": "monthly",
        "start_date": D(2026, 1, 31),
        **kw,
    }
    return RecurringRule.objects.create(**data)


# ---- datas ----
def test_monthly_clamps_to_month_end():
    r = rule(start_date=D(2026, 1, 31))
    assert occurrences(r, D(2026, 1, 1), D(2026, 4, 30)) == [
        D(2026, 1, 31),
        D(2026, 2, 28),
        D(2026, 3, 31),
        D(2026, 4, 30),
    ]


def test_weekly_and_window():
    r = rule(frequency="weekly", start_date=D(2026, 11, 2))  # segunda
    assert occurrences(r, D(2026, 11, 10), D(2026, 11, 30)) == [
        D(2026, 11, 16),
        D(2026, 11, 23),
        D(2026, 11, 30),
    ]


def test_yearly_leap_day():
    r = rule(frequency="yearly", start_date=D(2028, 2, 29))
    assert occurrences(r, D(2028, 1, 1), D(2030, 12, 31)) == [
        D(2028, 2, 29),
        D(2029, 2, 28),
        D(2030, 2, 28),
    ]


def test_end_date_limits():
    r = rule(start_date=D(2026, 1, 5), end_date=D(2026, 3, 4))
    assert occurrences(r, D(2026, 1, 1), D(2026, 12, 31)) == [D(2026, 1, 5), D(2026, 2, 5)]


# ---- geração ----
def test_generate_pending_up_to_60_days_and_idempotent():
    r = rule(start_date=D(2026, 11, 10))
    today = D(2026, 11, 14)
    created = generate(r, today=today)
    dates = list(Transaction.objects.filter(recurring_rule=r).values_list("date", flat=True))
    # não gera antes de hoje nem além de 60 dias
    assert sorted(dates) == [D(2026, 12, 10), D(2027, 1, 10)]
    assert created == 2
    assert set(Transaction.objects.values_list("status", flat=True)) == {"pending"}
    assert generate(r, today=today) == 0
    assert Transaction.objects.count() == 2


def test_generated_copies_template():
    cat = CategoryFactory(kind="expense")
    acc = AccountFactory(user=cat.user)
    r = rule(account=acc, category=cat, start_date=D(2026, 11, 20), description="Internet")
    generate(r, today=D(2026, 11, 14))
    tx = Transaction.objects.filter(recurring_rule=r).order_by("date").first()
    assert (tx.description, tx.category_id, tx.account_id, tx.amount) == (
        "Internet",
        cat.id,
        acc.id,
        Decimal("100.00"),
    )


def test_card_rule_assigns_invoice():
    c = CreditCardFactory(closing_day=10)
    r = rule(user=c.user, account=None, credit_card=c, start_date=D(2026, 11, 20))
    generate(r, today=D(2026, 11, 14))
    tx = Transaction.objects.filter(recurring_rule=r).order_by("date").first()
    assert tx.invoice.reference == "2026-12"


def test_inactive_rule_generates_nothing():
    r = rule(start_date=D(2026, 11, 20), active=False)
    assert generate(r, today=D(2026, 11, 14)) == 0


def test_regenerate_keeps_paid_and_past():
    r = rule(start_date=D(2026, 11, 1))
    paid = TransactionFactory(
        user=r.user, account=r.account, recurring_rule=r, date=D(2026, 11, 1), status="paid"
    )
    generate(r, today=D(2026, 11, 14))
    r.amount = Decimal("150.00")
    r.save()
    regenerate(r, today=D(2026, 11, 14))
    future = Transaction.objects.filter(recurring_rule=r, date__gt=D(2026, 11, 14))
    assert set(future.values_list("amount", flat=True)) == {Decimal("150.00")}
    paid.refresh_from_db()
    assert paid.amount == Decimal("10.00")


# ---- API ----
def test_api_create_generates_and_lists_next_dates(api, user):
    acc = AccountFactory(user=user)
    start = datetime.date.today()
    r = api.post(
        "/api/recurring",
        {
            "kind": "expense",
            "amount": "55.90",
            "description": "Streaming",
            "account_id": acc.id,
            "frequency": "monthly",
            "start_date": start.isoformat(),
        },
    )
    assert r.status_code == 201, r.json()
    assert len(r.json()["next_dates"]) == 3
    assert Transaction.objects.filter(recurring_rule_id=r.json()["id"]).exists()
    assert [x["description"] for x in api.get("/api/recurring").json()] == ["Streaming"]


@pytest.mark.parametrize("case", ["foreign_account", "no_source", "end_before_start"])
def test_api_invalid_422(api, user, case):
    data = {
        "kind": "expense",
        "amount": "10",
        "description": "x",
        "frequency": "monthly",
        "start_date": "2026-11-20",
        "account_id": AccountFactory(user=user).id,
    }
    if case == "foreign_account":
        data["account_id"] = AccountFactory().id
    elif case == "no_source":
        data.pop("account_id")
    else:
        data["end_date"] = "2026-11-01"
    assert api.post("/api/recurring", data).status_code == 422


def test_api_patch_pause_and_delete(api, user):
    acc = AccountFactory(user=user)
    r = rule(account=acc, start_date=datetime.date.today())
    generate(r, today=datetime.date.today())
    assert Transaction.objects.filter(recurring_rule=r, status="pending").exists()
    body = api.patch(f"/api/recurring/{r.id}", {"active": False}).json()
    assert body["active"] is False
    assert body["next_dates"] == []
    assert not Transaction.objects.filter(
        recurring_rule=r, status="pending", date__gte=datetime.date.today()
    ).exists()
    assert api.delete(f"/api/recurring/{r.id}").status_code == 204
    assert not RecurringRule.objects.filter(pk=r.id).exists()


def test_api_other_users_rule_404(api):
    other = rule()
    assert api.patch(f"/api/recurring/{other.id}", {"active": False}).status_code == 404


# ---- tarefas ----
def test_generate_command_runs_all_active(settings):
    r = rule(start_date=datetime.date.today())
    call_command("generate_recurring")
    assert Transaction.objects.filter(recurring_rule=r).exists()


def test_celery_task_runs_eager(settings):
    from apps.finance.tasks import generate_all_recurring

    r = rule(start_date=datetime.date.today())
    generate_all_recurring.delay()
    assert Transaction.objects.filter(recurring_rule=r).exists()
