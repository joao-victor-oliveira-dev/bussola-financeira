import datetime
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.finance.models import CreditCard, Transaction
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
    return AccountFactory(user=user, name="Corrente", initial_balance=Decimal("1000.00"))


@pytest.fixture
def card(user, acc):
    return CreditCardFactory(
        user=user, name="Roxinho", closing_day=10, due_day=20, payment_account=acc
    )


def buy(api, card, amount="100.00", date="2026-11-05", **kw):
    r = api.post(
        "/api/transactions",
        {
            "kind": "expense",
            "amount": amount,
            "date": date,
            "description": kw.pop("description", "Compra"),
            "credit_card_id": card.id,
            **kw,
        },
    )
    assert r.status_code == 201, r.json()
    return r.json()


# ---- CRUD ----
def test_create_and_list_cards(api, user, acc):
    r = api.post(
        "/api/cards",
        {
            "name": "Roxinho",
            "limit": "8000.00",
            "closing_day": 3,
            "due_day": 10,
            "payment_account_id": acc.id,
            "color": "#b88cf2",
        },
    )
    assert r.status_code == 201, r.json()
    body = api.get("/api/cards").json()
    assert [c["name"] for c in body] == ["Roxinho"]
    assert body[0]["limit_used"] == "0.00"
    assert set(body[0]["current_invoice"]) >= {
        "reference",
        "closing_date",
        "due_date",
        "total",
        "status",
    }


@pytest.mark.parametrize(
    "payload",
    [
        {"closing_day": 29},
        {"due_day": 0},
        {"limit": "-1"},
    ],
)
def test_invalid_card_422(api, acc, payload):
    data = {"name": "X", "limit": "100", "closing_day": 5, "due_day": 12, **payload}
    assert api.post("/api/cards", data).status_code == 422


def test_foreign_payment_account_422(api):
    data = {"name": "X", "limit": "1", "closing_day": 5, "due_day": 12}
    data["payment_account_id"] = AccountFactory().id
    assert api.post("/api/cards", data).status_code == 422


def test_duplicate_card_name_409(api, card):
    data = {"name": "roxinho", "limit": "1", "closing_day": 5, "due_day": 12}
    assert api.post("/api/cards", data).status_code == 409


def test_patch_and_delete_card(api, user):
    c = CreditCardFactory(user=user)
    r = api.patch(f"/api/cards/{c.id}", {"name": "Novo", "archived": True})
    assert (r.json()["name"], r.json()["archived"]) == ("Novo", True)
    assert api.delete(f"/api/cards/{c.id}").status_code == 204
    assert not CreditCard.objects.filter(pk=c.id).exists()


def test_delete_card_with_purchases_409(api, card):
    buy(api, card)
    assert api.delete(f"/api/cards/{card.id}").status_code == 409


def test_other_users_card_404(api):
    other = CreditCardFactory()
    assert api.patch(f"/api/cards/{other.id}", {"name": "x"}).status_code == 404
    assert api.get(f"/api/cards/{other.id}/invoices/2026-11").status_code == 404


# ---- compras no cartão ----
def test_card_purchase_goes_to_right_invoice(api, card):
    a = buy(api, card, date="2026-11-10")
    b = buy(api, card, date="2026-11-11")
    assert (a["invoice"], b["invoice"]) == ("2026-11", "2026-12")
    assert a["credit_card_id"] == card.id
    assert a["account_id"] is None


def test_card_purchase_must_be_expense(api, card):
    r = api.post(
        "/api/transactions",
        {
            "kind": "income",
            "amount": "1",
            "date": "2026-11-01",
            "description": "x",
            "credit_card_id": card.id,
        },
    )
    assert r.status_code == 422


def test_foreign_card_422(api):
    r = api.post(
        "/api/transactions",
        {
            "kind": "expense",
            "amount": "1",
            "date": "2026-11-01",
            "description": "x",
            "credit_card_id": CreditCardFactory().id,
        },
    )
    assert r.status_code == 422


def test_needs_account_or_card(api):
    r = api.post(
        "/api/transactions",
        {"kind": "expense", "amount": "1", "date": "2026-11-01", "description": "x"},
    )
    assert r.status_code == 422


def test_patch_date_moves_invoice_and_switch_to_account(api, card, acc):
    t = buy(api, card, date="2026-11-05")
    r = api.patch(f"/api/transactions/{t['id']}", {"date": "2026-11-15"})
    assert r.json()["invoice"] == "2026-12"
    r = api.patch(f"/api/transactions/{t['id']}", {"credit_card_id": None, "account_id": acc.id})
    assert r.status_code == 200, r.json()
    assert (r.json()["invoice"], r.json()["credit_card_id"], r.json()["account_id"]) == (
        None,
        None,
        acc.id,
    )


def test_filter_transactions_by_card(api, card, acc, user):
    t = buy(api, card)
    TransactionFactory(user=user, account=acc)
    body = api.get("/api/transactions", {"card": card.id}).json()
    assert [i["id"] for i in body["items"]] == [t["id"]]


# ---- fatura ----
def test_invoice_detail_and_card_totals(api, card):
    cat = CategoryFactory(user=card.user)
    buy(api, card, amount="100.00", date="2026-11-02", category_id=cat.id)
    buy(api, card, amount="50.50", date="2026-11-09")
    buy(api, card, amount="10.00", date="2026-11-20")  # próxima fatura
    r = api.get(f"/api/cards/{card.id}/invoices/2026-11")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == "150.50"
    assert body["closing_date"] == "2026-11-10"
    assert body["due_date"] == "2026-11-20"
    assert len(body["items"]) == 2
    cards = api.get("/api/cards").json()
    assert cards[0]["limit_used"] == "160.50"


def test_empty_invoice_detail(api, card):
    body = api.get(f"/api/cards/{card.id}/invoices/2030-01").json()
    assert body["total"] == "0.00"
    assert body["items"] == []


def test_invalid_reference_422(api, card):
    assert api.get(f"/api/cards/{card.id}/invoices/2026-13").status_code == 422


def test_pay_invoice_creates_transfer_and_frees_limit(api, card, acc):
    buy(api, card, amount="150.50", date="2026-11-02")
    r = api.post(f"/api/cards/{card.id}/invoices/2026-11/pay", {"date": "2026-11-20"})
    assert r.status_code == 200, r.json()
    assert r.json()["status"] == "paid"
    pay = Transaction.objects.get(to_credit_card=card)
    assert (pay.kind, pay.account_id, pay.amount) == ("transfer", acc.id, Decimal("150.50"))
    accounts = {a["id"]: a for a in api.get("/api/accounts").json()}
    assert accounts[acc.id]["balance"] == "849.50"
    assert api.get("/api/cards").json()[0]["limit_used"] == "0.00"
    summary = api.get("/api/dashboard/summary", {"month": "2026-11"}).json()
    assert summary["expense"] == "150.50"  # a compra, uma vez só
    assert summary["balance"] == "849.50"
    # pagar de novo → 409; desfazer → volta
    assert api.post(f"/api/cards/{card.id}/invoices/2026-11/pay", {}).status_code == 409
    assert api.delete(f"/api/cards/{card.id}/invoices/2026-11/pay").status_code == 200
    assert not Transaction.objects.filter(to_credit_card=card).exists()


def test_pay_empty_invoice_422(api, card):
    assert api.post(f"/api/cards/{card.id}/invoices/2026-11/pay", {}).status_code == 422


def test_pay_with_other_users_account_422(api, card):
    buy(api, card)
    r = api.post(f"/api/cards/{card.id}/invoices/2026-11/pay", {"account_id": AccountFactory().id})
    assert r.status_code == 422


def test_payment_transaction_cannot_be_edited_directly(api, card):
    buy(api, card)
    api.post(f"/api/cards/{card.id}/invoices/2026-11/pay", {})
    pay = Transaction.objects.get(to_credit_card=card)
    assert api.patch(f"/api/transactions/{pay.id}", {"amount": "1"}).status_code == 409


def test_current_invoice_uses_today(api, card):
    today = timezone.localdate()
    body = api.get("/api/cards").json()[0]["current_invoice"]
    expected = f"{today:%Y-%m}" if today.day <= 10 else None
    if expected:
        assert body["reference"] == expected
    assert body["status"] in {"open", "closed", "paid"}
