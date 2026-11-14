import datetime
from decimal import Decimal

import pytest

from apps.finance.models import InstallmentPlan, Transaction
from apps.finance.tests.factories import CategoryFactory, CreditCardFactory

pytestmark = pytest.mark.django_db


@pytest.fixture
def card(user):
    return CreditCardFactory(user=user, closing_day=10, due_day=20)


def plan(api, card, **kw):
    data = {
        "credit_card_id": card.id,
        "description": "Notebook",
        "total": "100.00",
        "count": 3,
        "purchase_date": "2026-11-15",
        **kw,
    }
    return api.post("/api/installments", data)


def test_split_cents_go_to_first_installment(api, card):
    r = plan(api, card)
    assert r.status_code == 201, r.json()
    items = r.json()["items"]
    assert [i["amount"] for i in items] == ["33.34", "33.33", "33.33"]
    assert sum(Decimal(i["amount"]) for i in items) == Decimal("100.00")
    assert [i["description"] for i in items] == [
        "Notebook (1/3)",
        "Notebook (2/3)",
        "Notebook (3/3)",
    ]
    assert [i["installment"] for i in items] == ["1/3", "2/3", "3/3"]


def test_installments_fall_on_consecutive_invoices(api, card):
    items = plan(api, card, purchase_date="2026-11-15").json()["items"]  # depois do fechamento
    assert [i["date"] for i in items] == ["2026-11-15", "2026-12-15", "2027-01-15"]
    assert [i["invoice"] for i in items] == ["2026-12", "2027-01", "2027-02"]
    assert all(i["credit_card_id"] == card.id and i["account_id"] is None for i in items)


def test_month_end_purchase_clamps_day(api, card):
    items = plan(api, card, purchase_date="2027-01-31", count=2).json()["items"]
    assert [i["date"] for i in items] == ["2027-01-31", "2027-02-28"]


def test_category_applies_to_all(api, card, user):
    cat = CategoryFactory(user=user, kind="expense")
    items = plan(api, card, category_id=cat.id).json()["items"]
    assert {i["category_id"] for i in items} == {cat.id}


@pytest.mark.parametrize("case", ["foreign_card", "foreign_category", "income_category"])
def test_invalid_refs_422(api, card, user, case):
    kw = {}
    if case == "foreign_card":
        kw["credit_card_id"] = CreditCardFactory().id
    elif case == "foreign_category":
        kw["category_id"] = CategoryFactory().id
    else:
        kw["category_id"] = CategoryFactory(user=user, kind="income").id
    assert plan(api, card, **kw).status_code == 422
    assert Transaction.objects.count() == 0


@pytest.mark.parametrize("count", [1, 49])
def test_count_range_422(api, card, count):
    assert plan(api, card, count=count).status_code == 422


def test_delete_plan_removes_installments(api, card):
    plan_id = plan(api, card).json()["id"]
    assert api.delete(f"/api/installments/{plan_id}").status_code == 204
    assert not InstallmentPlan.objects.filter(pk=plan_id).exists()
    assert Transaction.objects.count() == 0


def test_other_users_plan_404(api, card):
    other = CreditCardFactory()
    p = InstallmentPlan.objects.create(
        user=other.user,
        card=other,
        description="x",
        total=Decimal("10"),
        count=2,
        purchase_date=datetime.date(2026, 11, 1),
    )
    assert api.delete(f"/api/installments/{p.id}").status_code == 404


def test_invoice_total_includes_installment(api, card):
    plan(api, card, total="300.00", count=3, purchase_date="2026-11-05")
    body = api.get(f"/api/cards/{card.id}/invoices/2026-11").json()
    assert body["total"] == "100.00"
