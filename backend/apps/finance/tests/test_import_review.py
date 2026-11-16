"""Regressões dos achados da revisão da Fase 6."""

import datetime
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.finance.cards import get_or_create_invoice, invoice_reference
from apps.finance.importers.common import guess_decimal
from apps.finance.importers.ofx import parse_ofx
from apps.finance.importers.service import (
    ImportConflict,
    confirm_batch,
    create_batch,
    undo_batch,
)
from apps.finance.models import CategorizationRule, ImportBatch, Transaction
from apps.finance.tests.factories import (
    AccountFactory,
    CategoryFactory,
    CreditCardFactory,
)

pytestmark = pytest.mark.django_db

CSV = """Data,Valor,Identificador,Descrição
03/11/2026,-10.00,a1,Padaria X
04/11/2026,-11.00,a2,Padaria X
05/11/2026,-12.00,a3,Padaria X
"""


@pytest.fixture
def acc(user):
    return AccountFactory(user=user)


CSV_BYTES = CSV.encode()


def upload(api, account_id, content=CSV_BYTES, name="x.csv", **fields):
    return api.client.post(
        "/api/imports",
        {"file": SimpleUploadedFile(name, content), "account_id": account_id, **fields},
        HTTP_X_CSRFTOKEN=api.token,
    )


# 1. mapeamento malformado não deixa lote "processando"
@pytest.mark.parametrize("mapping", ["[1]", '{"date": 1, "description": "d", "amount": "v"}'])
def test_malformed_mapping_is_422_and_leaves_no_batch(api, acc, mapping):
    r = upload(api, acc.id, b"d;v\n1;2\n", preset="personalizado", mapping=mapping)
    assert r.status_code == 422
    assert not ImportBatch.objects.filter(status="processing").exists()


def test_unexpected_parse_error_marks_failed(user, acc, monkeypatch):
    def boom(batch):
        raise RuntimeError("explodiu")

    monkeypatch.setattr("apps.finance.importers.service._parse", boom)
    batch = create_batch(user, acc, "x.csv", CSV.encode(), "auto", None)
    assert batch.status == "failed"
    assert batch.error


# 3. desfazer não mexe em fatura paga
def test_undo_blocked_when_item_is_in_paid_invoice(user, acc):
    batch = create_batch(user, acc, "x.csv", CSV.encode(), "auto", None)
    confirm_batch(batch, [], learn=False)
    card = CreditCardFactory(user=user, payment_account=acc)
    tx = Transaction.objects.filter(import_batch=batch).first()
    tx.account, tx.credit_card = None, card
    tx.invoice = get_or_create_invoice(card, invoice_reference(card, tx.date))
    tx.save()
    tx.invoice.payment = Transaction.objects.create(
        user=user, kind="transfer", account=acc, to_credit_card=card, amount=Decimal("10"),
        date=datetime.date(2026, 11, 20), description="pg",
    )  # fmt: skip
    tx.invoice.save()
    with pytest.raises(ImportConflict):
        undo_batch(batch)
    assert Transaction.objects.filter(import_batch=batch).count() == 3


# 4 e 5. aprender: não sobrescreve regra manual e conta regras distintas
def test_learning_keeps_manual_rule_and_counts_distinct_patterns(user, acc):
    fun = CategoryFactory(user=user, kind="expense", name="Lazer")
    food = CategoryFactory(user=user, kind="expense", name="Mercado")
    manual = CategorizationRule.objects.create(
        user=user, pattern="padaria x", category=food, kind="expense", priority=0, active=False
    )
    batch = create_batch(user, acc, "x.csv", CSV.encode(), "auto", None)
    edits = [{"id": r.id, "include": True, "category_id": fun.id} for r in batch.rows.all()]
    created, learned = confirm_batch(batch, edits, learn=True)
    assert (created, learned) == (3, 0)
    manual.refresh_from_db()
    assert (manual.category, manual.active, manual.priority) == (food, False, 0)


def test_learning_same_pattern_many_rows_counts_one(user, acc):
    fun = CategoryFactory(user=user, kind="expense")
    batch = create_batch(user, acc, "x.csv", CSV.encode(), "auto", None)
    edits = [{"id": r.id, "include": True, "category_id": fun.id} for r in batch.rows.all()]
    assert confirm_batch(batch, edits, learn=True) == (3, 1)
    assert CategorizationRule.objects.filter(user=user).count() == 1


# 7. conta arquivada
def test_archived_account_422(api, user):
    archived = AccountFactory(user=user, archived=True)
    assert upload(api, archived.id).status_code == 422


# 8. conteúdo bruto não fica guardado depois de concluir
def test_raw_cleared_after_done_and_failed(user, acc):
    batch = create_batch(user, acc, "x.csv", CSV.encode(), "auto", None)
    confirm_batch(batch, [], learn=False)
    batch.refresh_from_db()
    assert batch.raw == ""
    failed = create_batch(user, acc, "x.ofx", b"nada", "auto", None)
    assert failed.status == "failed"
    assert failed.raw == ""


# 9. separador decimal no OFX
@pytest.mark.parametrize(
    "raw, decimal",
    [("1,234.56", "."), ("1.234,56", ","), ("-42,90", ","), ("7800.00", "."), ("10", ".")],
)
def test_guess_decimal(raw, decimal):
    assert guess_decimal(raw) == decimal


def test_ofx_thousands_separator_not_truncated():
    ofx = "<OFX><STMTTRN><DTPOSTED>20261101<TRNAMT>-1,234.56<FITID>Z</STMTTRN></OFX>"
    assert parse_ofx(ofx).rows[0].amount == Decimal("-1234.56")


# 10. 409 por tipo, não por texto
def test_double_confirm_is_import_conflict(user, acc):
    batch = create_batch(user, acc, "x.csv", CSV.encode(), "auto", None)
    confirm_batch(batch, [], learn=False)
    with pytest.raises(ImportConflict):
        confirm_batch(batch, [], learn=False)


def test_undo_conflict_is_409_via_api(api, user, acc, monkeypatch):
    batch_id = upload(api, acc.id).json()["id"]
    api.post(f"/api/imports/{batch_id}/confirm", {"rows": []})

    def conflict(batch):
        raise ImportConflict("fatura paga")

    monkeypatch.setattr("apps.finance.api.imports.undo_batch", conflict)
    assert api.delete(f"/api/imports/{batch_id}").status_code == 409
