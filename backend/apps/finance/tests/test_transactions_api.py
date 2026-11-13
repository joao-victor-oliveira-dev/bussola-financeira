import datetime
from decimal import Decimal

import pytest

from apps.finance.models import Transaction
from apps.finance.tests.factories import (
    AccountFactory,
    CategoryFactory,
    TagFactory,
    TransactionFactory,
)

pytestmark = pytest.mark.django_db

D = datetime.date


@pytest.fixture
def acc(user):
    return AccountFactory(user=user, name="Corrente")


@pytest.fixture
def food(user):
    return CategoryFactory(user=user, name="Alimentação", kind="expense")


def payload(**kw):
    base = {
        "kind": "expense",
        "amount": "42.90",
        "date": "2026-11-10",
        "description": "Mercado",
        "status": "paid",
    }
    base.update(kw)
    return base


# ---- Criação e validação ----
def test_create_expense_with_tags(api, user, acc, food):
    t1, t2 = TagFactory(user=user), TagFactory(user=user)
    r = api.post(
        "/api/transactions",
        payload(account_id=acc.id, category_id=food.id, tag_ids=[t1.id, t2.id], notes="obs"),
    )
    assert r.status_code == 201, r.json()
    body = r.json()
    assert body["amount"] == "42.90"
    assert body["date"] == "2026-11-10"
    assert sorted(body["tag_ids"]) == sorted([t1.id, t2.id])
    assert body["to_account_id"] is None
    tx = Transaction.objects.get(pk=body["id"])
    assert tx.user == user
    assert tx.amount == Decimal("42.90")


def test_create_transfer_ignores_category(api, user, acc, food):
    dest = AccountFactory(user=user)
    r = api.post(
        "/api/transactions",
        payload(kind="transfer", account_id=acc.id, to_account_id=dest.id, category_id=food.id),
    )
    assert r.status_code == 201, r.json()
    assert r.json()["to_account_id"] == dest.id
    assert r.json()["category_id"] is None


@pytest.mark.parametrize(
    "case",
    [
        "foreign_account",
        "foreign_category",
        "foreign_tag",
        "foreign_destination",
        "transfer_without_destination",
        "transfer_same_account",
        "category_kind_mismatch",
    ],
)
def test_invalid_references_422(api, user, acc, food, case):
    data = payload(account_id=acc.id)
    if case == "foreign_account":
        data["account_id"] = AccountFactory().id
    elif case == "foreign_category":
        data["category_id"] = CategoryFactory().id
    elif case == "foreign_tag":
        data["tag_ids"] = [TagFactory().id]
    elif case == "foreign_destination":
        data.update(kind="transfer", to_account_id=AccountFactory().id)
    elif case == "transfer_without_destination":
        data.update(kind="transfer")
    elif case == "transfer_same_account":
        data.update(kind="transfer", to_account_id=acc.id)
    elif case == "category_kind_mismatch":
        data.update(kind="income", category_id=food.id)
    r = api.post("/api/transactions", data)
    assert r.status_code == 422, r.json()
    assert isinstance(r.json()["detail"], str)
    assert Transaction.objects.count() == 0


@pytest.mark.parametrize("amount", ["0", "-5.00", "1.999"])
def test_invalid_amount_422(api, acc, amount):
    assert (
        api.post("/api/transactions", payload(account_id=acc.id, amount=amount)).status_code == 422
    )


# ---- Leitura, edição e exclusão ----
def test_get_patch_delete(api, user, acc, food):
    tx = TransactionFactory(user=user, account=acc, category=food, amount=Decimal("10"))
    assert api.get(f"/api/transactions/{tx.id}").json()["amount"] == "10.00"
    r = api.patch(f"/api/transactions/{tx.id}", {"amount": "12.34", "status": "pending"})
    assert r.status_code == 200, r.json()
    assert (r.json()["amount"], r.json()["status"], r.json()["category_id"]) == (
        "12.34",
        "pending",
        food.id,
    )
    assert api.delete(f"/api/transactions/{tx.id}").status_code == 204
    assert not Transaction.objects.filter(pk=tx.id).exists()


def test_patch_expense_to_transfer_without_destination_422(api, user, acc):
    tx = TransactionFactory(user=user, account=acc)
    assert api.patch(f"/api/transactions/{tx.id}", {"kind": "transfer"}).status_code == 422


def test_patch_transfer_to_expense_clears_destination(api, user, acc):
    tx = TransactionFactory(
        user=user, account=acc, kind="transfer", to_account=AccountFactory(user=user)
    )
    r = api.patch(f"/api/transactions/{tx.id}", {"kind": "expense"})
    assert r.status_code == 200, r.json()
    assert r.json()["to_account_id"] is None


def test_patch_kind_keeping_incompatible_category_422(api, user, acc, food):
    tx = TransactionFactory(user=user, account=acc, category=food)
    assert api.patch(f"/api/transactions/{tx.id}", {"kind": "income"}).status_code == 422


def test_patch_tags_replaces_and_null_category_clears(api, user, acc, food):
    old, new = TagFactory(user=user), TagFactory(user=user)
    tx = TransactionFactory(user=user, account=acc, category=food)
    tx.tags.add(old)
    r = api.patch(f"/api/transactions/{tx.id}", {"tag_ids": [new.id], "category_id": None})
    assert r.json()["tag_ids"] == [new.id]
    assert r.json()["category_id"] is None


def test_other_users_transaction_404(api):
    other = TransactionFactory()
    assert api.get(f"/api/transactions/{other.id}").status_code == 404
    assert api.patch(f"/api/transactions/{other.id}", {"amount": "1"}).status_code == 404
    assert api.delete(f"/api/transactions/{other.id}").status_code == 404


# ---- Lista, filtros, paginação e totais ----
def ids(r):
    return [t["id"] for t in r.json()["items"]]


def test_list_only_own_ordered_by_date_desc(api, user, acc):
    a = TransactionFactory(user=user, account=acc, date=D(2026, 11, 1))
    b = TransactionFactory(user=user, account=acc, date=D(2026, 11, 5))
    TransactionFactory()
    r = api.get("/api/transactions")
    assert r.status_code == 200
    assert ids(r) == [b.id, a.id]
    assert r.json()["count"] == 2


def test_filter_by_period_kind_status(api, user, acc):
    oct_ = TransactionFactory(user=user, account=acc, date=D(2026, 10, 31))
    nov_exp = TransactionFactory(user=user, account=acc, date=D(2026, 11, 1))
    nov_inc = TransactionFactory(user=user, account=acc, date=D(2026, 11, 30), kind="income")
    nov_pend = TransactionFactory(user=user, account=acc, date=D(2026, 11, 2), status="pending")
    period = {"date_from": "2026-11-01", "date_to": "2026-11-30"}
    assert set(ids(api.get("/api/transactions", period))) == {nov_exp.id, nov_inc.id, nov_pend.id}
    assert ids(api.get("/api/transactions", {**period, "kind": "income"})) == [nov_inc.id]
    assert ids(api.get("/api/transactions", {**period, "status": "pending"})) == [nov_pend.id]
    assert oct_.id in ids(api.get("/api/transactions", {"date_to": "2026-10-31"}))


def test_filter_by_account_matches_origin_or_destination(api, user, acc):
    other = AccountFactory(user=user)
    out = TransactionFactory(user=user, account=acc)
    incoming = TransactionFactory(user=user, account=other, to_account=acc, kind="transfer")
    TransactionFactory(user=user, account=other)
    assert set(ids(api.get("/api/transactions", {"account": acc.id}))) == {out.id, incoming.id}


def test_filter_by_category_includes_subcategories(api, user, acc, food):
    market = CategoryFactory(user=user, parent=food, name="Mercado")
    a = TransactionFactory(user=user, account=acc, category=food)
    b = TransactionFactory(user=user, account=acc, category=market)
    TransactionFactory(user=user, account=acc)
    assert set(ids(api.get("/api/transactions", {"category": food.id}))) == {a.id, b.id}
    assert ids(api.get("/api/transactions", {"category": market.id})) == [b.id]


def test_filter_by_tag_and_search(api, user, acc):
    tag = TagFactory(user=user)
    tagged = TransactionFactory(user=user, account=acc, description="Cinema")
    tagged.tags.add(tag)
    noted = TransactionFactory(user=user, account=acc, description="X", notes="ingresso cinema")
    TransactionFactory(user=user, account=acc, description="Padaria")
    assert ids(api.get("/api/transactions", {"tag": tag.id})) == [tagged.id]
    assert set(ids(api.get("/api/transactions", {"q": "CINEMA"}))) == {tagged.id, noted.id}


def test_pagination_and_totals_cover_whole_filter(api, user, acc):
    for _ in range(3):
        TransactionFactory(user=user, account=acc, kind="income", amount=Decimal("100.00"))
    for _ in range(2):
        TransactionFactory(user=user, account=acc, kind="expense", amount=Decimal("30.50"))
    TransactionFactory(
        user=user, account=acc, kind="transfer", to_account=AccountFactory(user=user)
    )
    r = api.get("/api/transactions", {"page": 2, "page_size": 4})
    body = r.json()
    assert body["count"] == 6
    assert (body["page"], body["page_size"]) == (2, 4)
    assert len(body["items"]) == 2
    assert body["totals"] == {"income": "300.00", "expense": "61.00", "net": "239.00"}


def test_empty_list_totals_zero(api):
    body = api.get("/api/transactions").json()
    assert body["items"] == []
    assert body["totals"] == {"income": "0.00", "expense": "0.00", "net": "0.00"}


def test_page_size_capped(api):
    assert api.get("/api/transactions", {"page_size": 101}).status_code == 422
