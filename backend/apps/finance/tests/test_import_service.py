import datetime
from decimal import Decimal

import pytest

from apps.finance.importers.service import (
    ImportError_,
    confirm_batch,
    create_batch,
    suggest_category,
    undo_batch,
)
from apps.finance.models import CategorizationRule, ImportBatch, Transaction
from apps.finance.tests.factories import AccountFactory, CategoryFactory, TransactionFactory

pytestmark = pytest.mark.django_db
D = datetime.date

CSV = """Data,Valor,Identificador,Descrição
03/11/2026,-42.90,id-1,Compra no débito - Supermercado Dia
04/11/2026,-12.00,id-2,Uber *Trip
05/11/2026,7800.00,id-3,Transferência recebida - Empresa X
05/11/2026,7800.00,id-3,Transferência recebida - Empresa X
"""


@pytest.fixture
def acc(user):
    return AccountFactory(user=user, name="Nubank")


def make(user, acc, data=CSV, name="extrato.csv", preset="auto", mapping=None):
    return create_batch(user, acc, name, data.encode(), preset, mapping)


# ---- criação e processamento ----
def test_create_batch_parses_into_preview(user, acc):
    batch = make(user, acc)
    assert batch.status == "preview"
    rows = list(batch.rows.order_by("line"))
    assert [(r.date, r.kind, r.amount) for r in rows[:3]] == [
        (D(2026, 11, 3), "expense", Decimal("42.90")),
        (D(2026, 11, 4), "expense", Decimal("12.00")),
        (D(2026, 11, 5), "income", Decimal("7800.00")),
    ]
    assert rows[3].is_duplicate  # repetido dentro do arquivo
    assert (batch.total_rows, batch.duplicate_rows) == (4, 1)


def test_duplicates_by_external_id_and_by_manual_entry(user, acc):
    TransactionFactory(user=user, account=acc, external_id="id-1", amount=Decimal("42.90"))
    TransactionFactory(  # digitado à mão: mesma data, valor e tipo
        user=user, account=acc, date=D(2026, 11, 4), amount=Decimal("12.00"), kind="expense"
    )
    batch = make(user, acc)
    dup = {r.external_id: r.is_duplicate for r in batch.rows.all() if r.line <= 4}
    assert dup["id-1"] and dup["id-2"]
    assert not batch.rows.get(line=4).is_duplicate  # a 1ª ocorrência de id-3 não é duplicada


def test_reimport_marks_everything_duplicate(user, acc):
    first = make(user, acc)
    confirm_batch(first, [], learn=False)
    second = make(user, acc)
    assert all(r.is_duplicate for r in second.rows.all())


def test_auto_preset_needs_mapping_for_unknown_csv(user, acc):
    with pytest.raises(ImportError_, match="mapeie"):
        make(user, acc, data="dia;texto;quanto\n03/11/2026;x;-1,00\n")


def test_unknown_format_and_size(user, acc):
    with pytest.raises(ImportError_, match="OFX ou CSV"):
        make(user, acc, name="extrato.pdf")
    with pytest.raises(ImportError_, match="2 MB"):
        create_batch(user, acc, "x.csv", b"a" * (2 * 1024 * 1024 + 1), "auto", None)


def test_parse_failure_marks_batch_failed(user, acc):
    batch = make(user, acc, data="isso nao e ofx", name="x.ofx")
    assert batch.status == "failed"
    assert batch.error


# ---- sugestão ----
def test_suggest_rule_beats_history_and_respects_kind(user, acc):
    food = CategoryFactory(user=user, name="Mercado", kind="expense")
    other = CategoryFactory(user=user, name="Outros", kind="expense")
    salary = CategoryFactory(user=user, name="Salário", kind="income")
    TransactionFactory(user=user, account=acc, description="Supermercado Dia", category=other)
    assert suggest_category(user, "Supermercado Dia", "expense") == other  # histórico
    CategorizationRule.objects.create(
        user=user, pattern="supermercado", category=food, kind="expense"
    )
    assert suggest_category(user, "COMPRA SUPERMERCADO DIA", "expense") == food  # regra
    CategorizationRule.objects.create(
        user=user, pattern="empresa x", category=salary, kind="income"
    )
    assert suggest_category(user, "Empresa X", "expense") is None  # tipo diferente


def test_rows_get_suggestion_on_processing(user, acc):
    transport = CategoryFactory(user=user, name="Transporte", kind="expense")
    CategorizationRule.objects.create(user=user, pattern="uber", category=transport, kind="expense")
    batch = make(user, acc)
    assert batch.rows.get(external_id="id-2").suggested_category == transport


# ---- confirmar ----
def test_confirm_creates_transactions_with_edits_and_learns(user, acc):
    market = CategoryFactory(user=user, name="Mercado", kind="expense")
    batch = make(user, acc)
    rows = {r.line: r for r in batch.rows.all()}
    created, learned = confirm_batch(
        batch,
        [
            {"id": rows[2].id, "include": True, "category_id": market.id},  # corrigida → regra
            {"id": rows[3].id, "include": False, "category_id": None},  # excluída
        ],
        learn=True,
    )
    assert created == 2  # linha 2 + linha 4 (5 é duplicada e fica fora por padrão)
    assert learned == 1
    tx = Transaction.objects.get(external_id="id-1")
    assert (tx.account, tx.category, tx.status, tx.import_batch) == (acc, market, "paid", batch)
    rule = CategorizationRule.objects.get(user=user)
    assert (rule.pattern, rule.category, rule.priority) == (
        "compra no debito - supermercado dia",
        market,
        10,
    )
    batch.refresh_from_db()
    assert (batch.status, batch.created_count) == ("done", 2)


def test_confirm_twice_is_rejected(user, acc):
    batch = make(user, acc)
    confirm_batch(batch, [], learn=False)
    with pytest.raises(ImportError_, match="já foi"):
        confirm_batch(batch, [], learn=False)
    assert Transaction.objects.filter(import_batch=batch).count() == 3


def test_confirm_rejects_foreign_category(user, acc):
    batch = make(user, acc)
    row = batch.rows.first()
    foreign = CategoryFactory(kind="expense")
    with pytest.raises(ImportError_, match="Categoria"):
        confirm_batch(batch, [{"id": row.id, "include": True, "category_id": foreign.id}], False)
    assert not Transaction.objects.exists()


# ---- desfazer ----
def test_undo_removes_imported_transactions(user, acc):
    batch = make(user, acc)
    confirm_batch(batch, [], learn=False)
    TransactionFactory(user=user, account=acc)  # manual, fica
    undo_batch(batch)
    assert not Transaction.objects.filter(import_batch=batch).exists()
    assert Transaction.objects.count() == 1
    batch.refresh_from_db()
    assert batch.status == "undone"


def test_undo_preview_discards_batch(user, acc):
    batch = make(user, acc)
    undo_batch(batch)
    assert not ImportBatch.objects.filter(pk=batch.pk).exists()
