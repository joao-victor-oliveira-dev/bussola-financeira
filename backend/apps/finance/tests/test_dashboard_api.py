import datetime
from decimal import Decimal

import pytest

from apps.finance.tests.factories import (
    AccountFactory,
    CategoryFactory,
    TransactionFactory,
)

pytestmark = pytest.mark.django_db

D = datetime.date


@pytest.fixture
def acc(user):
    return AccountFactory(user=user, initial_balance=Decimal("1000.00"))


def tx(user, acc, **kw):
    kw.setdefault("account", acc)
    return TransactionFactory(user=user, **kw)


# ---- summary ----
def test_summary_month_and_previous(api, user, acc):
    tx(user, acc, kind="income", amount=Decimal("5000"), date=D(2026, 11, 5))
    tx(user, acc, kind="expense", amount=Decimal("1000"), date=D(2026, 11, 6))
    tx(user, acc, kind="expense", amount=Decimal("250"), date=D(2026, 11, 7), status="pending")
    tx(user, acc, kind="income", amount=Decimal("4000"), date=D(2026, 10, 5))
    tx(user, acc, kind="expense", amount=Decimal("3000"), date=D(2026, 10, 6))
    tx(user, acc, kind="transfer", to_account=AccountFactory(user=user), date=D(2026, 11, 8))
    r = api.get("/api/dashboard/summary", {"month": "2026-11"})
    assert r.status_code == 200, r.json()
    assert r.json() == {
        "month": "2026-11",
        # saldo: 1000 + 5000 - 1000 + 4000 - 3000 (pendente fora; transferência neutra no total)
        "balance": "6000.00",
        "income": "5000.00",
        "expense": "1250.00",
        "savings_rate": "75.0",
        "previous": {"income": "4000.00", "expense": "3000.00", "savings_rate": "25.0"},
    }


def test_summary_without_income_has_null_rate(api, user, acc):
    tx(user, acc, kind="expense", amount=Decimal("10"), date=D(2026, 11, 5))
    body = api.get("/api/dashboard/summary", {"month": "2026-11"}).json()
    assert body["savings_rate"] is None
    assert body["previous"] == {"income": "0.00", "expense": "0.00", "savings_rate": None}


def test_summary_empty_user(api):
    body = api.get("/api/dashboard/summary", {"month": "2026-11"}).json()
    assert body["balance"] == "0.00"
    assert body["income"] == "0.00"


@pytest.mark.parametrize("month", ["2026-13", "2026-1", "abc", ""])
def test_invalid_month_422(api, month):
    assert api.get("/api/dashboard/summary", {"month": month}).status_code == 422


def test_dashboard_requires_login(client):
    assert client.get("/api/dashboard/summary", {"month": "2026-11"}).status_code == 401


# ---- cashflow ----
def test_cashflow_twelve_months_across_year_with_net_worth(api, user, acc):
    tx(user, acc, kind="income", amount=Decimal("100"), date=D(2025, 12, 31))
    tx(user, acc, kind="expense", amount=Decimal("30"), date=D(2026, 2, 28))
    tx(user, acc, kind="expense", amount=Decimal("5"), date=D(2026, 2, 1), status="pending")
    tx(user, acc, kind="income", amount=Decimal("999"), date=D(2026, 12, 1))  # depois do mês
    tx(user, acc, kind="transfer", to_account=AccountFactory(user=user), date=D(2026, 1, 10))
    tx(user, acc, kind="income", amount=Decimal("7"), date=D(2025, 3, 1))  # antes da janela
    body = api.get("/api/dashboard/cashflow", {"month": "2026-11"}).json()
    assert [m["month"] for m in body] == [
        "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05",
        "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11",
    ]  # fmt: skip
    dec, jan, feb = body[0], body[1], body[2]
    assert (dec["income"], dec["expense"], dec["net"]) == ("100.00", "0.00", "100.00")
    assert (feb["income"], feb["expense"], feb["net"]) == ("0.00", "35.00", "-35.00")
    # patrimônio: inicial 1000 + 7 (mar/2025) + 100 (dez) = 1107; fev perde 30 (pendente fora)
    assert dec["balance"] == "1107.00"
    assert jan["balance"] == "1107.00"
    assert feb["balance"] == "1077.00"
    assert body[-1]["balance"] == "1077.00"


# ---- categorias ----
def test_categories_grouped_by_root_with_uncategorized(api, user, acc):
    food = CategoryFactory(user=user, name="Alimentação", color="#cda35e")
    market = CategoryFactory(user=user, name="Mercado", parent=food)
    rest = CategoryFactory(user=user, name="Restaurantes", parent=food)
    home = CategoryFactory(user=user, name="Moradia")
    d = D(2026, 11, 3)
    tx(user, acc, category=market, amount=Decimal("300"), date=d)
    tx(user, acc, category=rest, amount=Decimal("100"), date=d)
    tx(user, acc, category=food, amount=Decimal("50"), date=d)
    tx(user, acc, category=home, amount=Decimal("2000"), date=d)
    tx(user, acc, category=None, amount=Decimal("20"), date=d)
    tx(user, acc, category=home, amount=Decimal("1"), date=D(2026, 10, 3))  # outro mês
    body = api.get("/api/dashboard/categories", {"month": "2026-11"}).json()
    assert [(c["name"], c["total"]) for c in body] == [
        ("Moradia", "2000.00"),
        ("Alimentação", "450.00"),
        ("Sem categoria", "20.00"),
    ]
    food_out = body[1]
    assert food_out["id"] == food.id
    assert food_out["color"] == "#cda35e"
    assert [(c["name"], c["total"]) for c in food_out["children"]] == [
        ("Mercado", "300.00"),
        ("Restaurantes", "100.00"),
    ]
    assert body[2]["id"] is None


def test_categories_income_kind(api, user, acc):
    salary = CategoryFactory(user=user, name="Salário", kind="income")
    tx(user, acc, kind="income", category=salary, amount=Decimal("10"), date=D(2026, 11, 1))
    tx(user, acc, kind="expense", amount=Decimal("5"), date=D(2026, 11, 1))
    body = api.get("/api/dashboard/categories", {"month": "2026-11", "kind": "income"}).json()
    assert [(c["name"], c["total"]) for c in body] == [("Salário", "10.00")]


# ---- listas ----
def test_top_expenses(api, user, acc):
    d = D(2026, 11, 3)
    for v in ["10", "500", "30", "700", "1", "90"]:
        tx(user, acc, amount=Decimal(v), date=d, description=f"g{v}")
    tx(user, acc, kind="income", amount=Decimal("9999"), date=d)
    tx(user, acc, amount=Decimal("8000"), date=D(2026, 10, 3))
    body = api.get("/api/dashboard/top-expenses", {"month": "2026-11"}).json()
    assert [t["description"] for t in body] == ["g700", "g500", "g90", "g30", "g10"]
    assert len(api.get("/api/dashboard/top-expenses", {"month": "2026-11", "limit": 2}).json()) == 2


def test_pending_ordered_by_date(api, user, acc):
    late = tx(user, acc, status="pending", date=D(2026, 10, 1))
    soon = tx(user, acc, status="pending", date=D(2026, 12, 1))
    tx(user, acc, status="paid", date=D(2026, 11, 1))
    TransactionFactory(status="pending")  # de outro usuário
    body = api.get("/api/dashboard/pending").json()
    assert [t["id"] for t in body] == [late.id, soon.id]


def test_all_widgets_isolated_between_users(api, user):
    other = TransactionFactory(kind="expense", amount=Decimal("50"), date=D(2026, 11, 2))
    AccountFactory(user=other.user, initial_balance=Decimal("10"))
    assert api.get("/api/dashboard/summary", {"month": "2026-11"}).json()["expense"] == "0.00"
    assert api.get("/api/dashboard/categories", {"month": "2026-11"}).json() == []
    assert api.get("/api/dashboard/top-expenses", {"month": "2026-11"}).json() == []
    flows = api.get("/api/dashboard/cashflow", {"month": "2026-11"}).json()
    assert all(m["expense"] == "0.00" and m["balance"] == "0.00" for m in flows)
