from decimal import Decimal

import pytest
from django.test import Client

from apps.finance.models import Account
from apps.finance.tests.factories import AccountFactory, TransactionFactory

pytestmark = pytest.mark.django_db


def test_anonymous_gets_401_in_portuguese():
    r = Client().get("/api/accounts")
    assert r.status_code == 401
    assert r.json() == {"detail": "Não autenticado."}


def test_create_and_list_accounts_with_balance(api, user):
    r = api.post(
        "/api/accounts",
        {"name": "Nubank", "type": "checking", "initial_balance": "1500.50", "color": "#6c9ef8"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["name"] == "Nubank"
    assert body["initial_balance"] == "1500.50"
    assert body["balance"] == "1500.50"
    acc = Account.objects.get(pk=body["id"])
    assert acc.user == user
    TransactionFactory(user=user, account=acc, kind="expense", amount=Decimal("0.50"))

    r = api.get("/api/accounts")
    assert r.status_code == 200
    assert [(a["name"], a["balance"]) for a in r.json()] == [("Nubank", "1500.00")]


def test_list_only_own_accounts(api, user):
    AccountFactory(user=user, name="Minha")
    AccountFactory(name="Alheia")
    assert [a["name"] for a in api.get("/api/accounts").json()] == ["Minha"]


def test_duplicate_name_409(api, user):
    AccountFactory(user=user, name="Carteira")
    r = api.post("/api/accounts", {"name": "Carteira", "type": "wallet"})
    assert r.status_code == 409
    assert "nome" in r.json()["detail"]


def test_invalid_payload_422(api):
    assert api.post("/api/accounts", {"name": "", "type": "checking"}).status_code == 422
    assert api.post("/api/accounts", {"name": "X", "type": "credit"}).status_code == 422
    r = api.post("/api/accounts", {"name": "X", "type": "wallet", "color": "red"})
    assert r.status_code == 422
    r = api.post("/api/accounts", {"name": "X", "type": "wallet", "initial_balance": "1.234"})
    assert r.status_code == 422


def test_patch_account(api, user):
    acc = AccountFactory(user=user, name="Velha")
    r = api.patch(f"/api/accounts/{acc.id}", {"name": "Nova", "archived": True})
    assert r.status_code == 200
    assert r.json()["name"] == "Nova"
    assert r.json()["archived"] is True
    acc.refresh_from_db()
    assert acc.type == "checking"


def test_other_users_account_is_404(api):
    other = AccountFactory()
    assert api.patch(f"/api/accounts/{other.id}", {"name": "x"}).status_code == 404
    assert api.delete(f"/api/accounts/{other.id}").status_code == 404
    assert Account.objects.filter(pk=other.id).exists()


def test_delete_account(api, user):
    acc = AccountFactory(user=user)
    assert api.delete(f"/api/accounts/{acc.id}").status_code == 204
    assert not Account.objects.filter(pk=acc.id).exists()


def test_delete_account_in_use_409(api, user):
    acc = AccountFactory(user=user)
    TransactionFactory(user=user, account=acc)
    r = api.delete(f"/api/accounts/{acc.id}")
    assert r.status_code == 409
    assert "arquive" in r.json()["detail"].lower()


def test_delete_account_used_as_destination_409(api, user):
    a = AccountFactory(user=user)
    b = AccountFactory(user=user)
    TransactionFactory(user=user, account=a, to_account=b, kind="transfer")
    assert api.delete(f"/api/accounts/{b.id}").status_code == 409


def test_unsafe_request_without_csrf_403(user):
    c = Client(enforce_csrf_checks=True)
    c.force_login(user)
    r = c.post("/api/accounts", "{}", content_type="application/json")
    assert r.status_code == 403
