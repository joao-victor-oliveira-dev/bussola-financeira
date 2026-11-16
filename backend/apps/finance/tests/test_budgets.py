import datetime
from decimal import Decimal

import pytest

from apps.finance.models import Budget
from apps.finance.tests.factories import (
    AccountFactory,
    CategoryFactory,
    CreditCardFactory,
    TransactionFactory,
)

pytestmark = pytest.mark.django_db
D = datetime.date


@pytest.fixture
def acc(user):
    return AccountFactory(user=user)


@pytest.fixture
def food(user):
    return CategoryFactory(user=user, name="Alimentação", kind="expense", color="#cda35e")


NOV_5 = D(2026, 11, 5)


def spend(user, acc, cat, amount, date=NOV_5, **kw):
    return TransactionFactory(
        user=user, account=acc, category=cat, amount=Decimal(amount), date=date, **kw
    )


def overview(api, month="2026-11"):
    r = api.get("/api/budgets", {"month": month})
    assert r.status_code == 200, r.json()
    return r.json()


# ---- gasto ----
def test_spent_includes_subcategories_and_card_excludes_other_months(api, user, acc, food):
    market = CategoryFactory(user=user, name="Mercado", kind="expense", parent=food)
    Budget.objects.create(user=user, category=food, month="2026-11", limit=Decimal("1000"))
    spend(user, acc, food, "100")
    spend(user, acc, market, "200", status="pending")  # pendente conta
    card = CreditCardFactory(user=user)
    TransactionFactory(
        user=user, account=None, credit_card=card, category=market, amount=Decimal("50"),
        date=D(2026, 11, 20),
    )  # fmt: skip
    spend(user, acc, food, "999", date=D(2026, 10, 31))  # outro mês
    TransactionFactory(
        user=user,
        account=acc,
        kind="transfer",
        to_credit_card=card,
        amount=Decimal("700"),
        date=D(2026, 11, 10),
    )  # fmt: skip — pagamento de fatura não é gasto
    item = overview(api)["items"][0]
    assert (item["category_name"], item["limit"], item["spent"], item["remaining"]) == (
        "Alimentação",
        "1000.00",
        "350.00",
        "650.00",
    )
    assert item["color"] == "#cda35e"


@pytest.mark.parametrize(
    "spent, percent, status",
    [
        ("799.99", "79.9", "ok"),
        ("800.00", "80.0", "warning"),
        ("999.60", "99.9", "warning"),  # não arredonda 99,96 para 100.0
        ("1000.00", "100.0", "over"),
        ("1500.00", "150.0", "over"),
    ],
)
def test_status_thresholds(api, user, acc, food, spent, percent, status):
    Budget.objects.create(user=user, category=food, month="2026-11", limit=Decimal("1000"))
    spend(user, acc, food, spent)
    item = overview(api)["items"][0]
    assert (item["percent"], item["status"]) == (percent, status)


def test_overview_totals_order_and_unbudgeted(api, user, acc, food):
    home = CategoryFactory(user=user, name="Moradia", kind="expense")
    fun = CategoryFactory(user=user, name="Lazer", kind="expense")
    Budget.objects.create(user=user, category=food, month="2026-11", limit=Decimal("1000"))
    Budget.objects.create(user=user, category=home, month="2026-11", limit=Decimal("2000"))
    spend(user, acc, food, "900")  # 90%
    spend(user, acc, home, "1000")  # 50%
    spend(user, acc, fun, "120")  # sem orçamento
    body = overview(api)
    assert [i["category_name"] for i in body["items"]] == ["Alimentação", "Moradia"]
    assert body["totals"] == {"limit": "3000.00", "spent": "1900.00", "remaining": "1100.00"}
    assert body["unbudgeted"] == [
        {"category_id": fun.id, "category_name": "Lazer", "color": fun.color, "spent": "120.00"}
    ]


def test_empty_month(api):
    body = overview(api)
    assert body["items"] == []
    assert body["totals"] == {"limit": "0.00", "spent": "0.00", "remaining": "0.00"}


# ---- CRUD ----
def test_create_patch_delete(api, user, food):
    r = api.post("/api/budgets", {"category_id": food.id, "month": "2026-11", "limit": "600.00"})
    assert r.status_code == 201, r.json()
    bid = r.json()["id"]
    assert api.patch(f"/api/budgets/{bid}", {"limit": "750.00"}).json()["limit"] == "750.00"
    assert api.delete(f"/api/budgets/{bid}").status_code == 204
    assert not Budget.objects.filter(pk=bid).exists()


def test_duplicate_409(api, user, food):
    Budget.objects.create(user=user, category=food, month="2026-11", limit=Decimal("1"))
    r = api.post("/api/budgets", {"category_id": food.id, "month": "2026-11", "limit": "2"})
    assert r.status_code == 409


@pytest.mark.parametrize("case", ["foreign", "child", "income", "zero", "bad_month"])
def test_invalid_422(api, user, food, case):
    data = {"category_id": food.id, "month": "2026-11", "limit": "100"}
    if case == "foreign":
        data["category_id"] = CategoryFactory(kind="expense").id
    elif case == "child":
        data["category_id"] = CategoryFactory(user=user, kind="expense", parent=food).id
    elif case == "income":
        data["category_id"] = CategoryFactory(user=user, kind="income").id
    elif case == "zero":
        data["limit"] = "0"
    else:
        data["month"] = "2026-13"
    assert api.post("/api/budgets", data).status_code == 422


def test_other_users_budget_404(api, food):
    other = Budget.objects.create(
        user=CategoryFactory().user,
        category=CategoryFactory(kind="expense"),
        month="2026-11",
        limit=Decimal("1"),
    )
    assert api.patch(f"/api/budgets/{other.id}", {"limit": "2"}).status_code == 404
    assert api.delete(f"/api/budgets/{other.id}").status_code == 404


def test_overview_only_own(api, user):
    Budget.objects.create(
        user=CategoryFactory().user,
        category=CategoryFactory(kind="expense"),
        month="2026-11",
        limit=Decimal("1"),
    )
    assert overview(api)["items"] == []


# ---- copiar ----
def test_copy_previous_month_without_overwriting(api, user, food):
    home = CategoryFactory(user=user, name="Moradia", kind="expense")
    Budget.objects.create(user=user, category=food, month="2026-10", limit=Decimal("800"))
    Budget.objects.create(user=user, category=home, month="2026-10", limit=Decimal("2000"))
    Budget.objects.create(user=user, category=food, month="2026-11", limit=Decimal("999"))
    r = api.post("/api/budgets/copy", {"to_month": "2026-11"})
    assert r.json() == {"created": 1}
    limits = dict(
        Budget.objects.filter(user=user, month="2026-11").values_list("category__name", "limit")
    )
    assert limits == {"Alimentação": Decimal("999.00"), "Moradia": Decimal("2000.00")}
    assert api.post("/api/budgets/copy", {"to_month": "2026-11"}).json() == {"created": 0}


def test_copy_from_explicit_month(api, user, food):
    Budget.objects.create(user=user, category=food, month="2026-01", limit=Decimal("5"))
    r = api.post("/api/budgets/copy", {"to_month": "2026-11", "from_month": "2026-01"})
    assert r.json() == {"created": 1}
