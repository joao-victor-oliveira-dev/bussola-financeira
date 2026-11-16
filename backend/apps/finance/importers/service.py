"""Importação de extrato: criar o lote, processar (prévia), confirmar e desfazer."""

from decimal import Decimal
from pathlib import PurePath

from django.db import transaction

from apps.finance.importers.common import ParseResult, decode_bytes, normalize_text
from apps.finance.importers.csv_reader import PRESETS, parse_csv
from apps.finance.importers.ofx import parse_ofx
from apps.finance.models import (
    Account,
    CategorizationRule,
    Category,
    ImportBatch,
    ImportFormat,
    ImportRow,
    ImportStatus,
    Transaction,
    TxKind,
    TxStatus,
)

MAX_BYTES = 2 * 1024 * 1024
LEARNED_PRIORITY = 10
HISTORY_LIMIT = 2000


class ImportError_(Exception):  # noqa: N801 - não confundir com o ImportError do Python
    """Erro de importação com mensagem para o usuário (422)."""


class ImportConflict(ImportError_):
    """Estado não permite a ação: já confirmada, fatura paga etc. (409)."""


def _detect_format(filename: str) -> str:
    ext = PurePath(filename).suffix.lower()
    if ext in (".ofx", ".qfx"):
        return ImportFormat.OFX
    if ext in (".csv", ".txt"):
        return ImportFormat.CSV
    raise ImportError_("Envie um extrato em OFX ou CSV.")


def _detect_preset(text: str) -> str:
    header = text.lstrip("﻿").splitlines()[0] if text.strip() else ""
    for name, cfg in PRESETS.items():
        cols = [cfg["date"], cfg["description"], cfg["amount"]]
        if all(c in header for c in cols):
            return name
    raise ImportError_("Não reconheci as colunas do CSV: mapeie data, descrição e valor.")


def create_batch(
    user, account: Account, filename: str, data: bytes, preset: str, mapping: dict | None
) -> ImportBatch:
    if len(data) > MAX_BYTES:
        raise ImportError_("O arquivo passa de 2 MB.")
    fmt = _detect_format(filename)
    text = decode_bytes(data)
    options: dict = {}
    if fmt == ImportFormat.CSV:
        if preset in ("", "auto"):
            preset = _detect_preset(text)
        options = {"preset": preset, "mapping": mapping}
    batch = ImportBatch.objects.create(
        user=user, account=account, filename=filename[:200], format=fmt, options=options, raw=text
    )
    from apps.finance.tasks import process_import  # evita import circular

    process_import.delay(batch.id)  # sem broker roda na hora (eager)
    batch.refresh_from_db()
    return batch


def _parse(batch: ImportBatch) -> ParseResult:
    if batch.format == ImportFormat.OFX:
        return parse_ofx(batch.raw)
    return parse_csv(batch.raw, batch.options.get("preset", ""), batch.options.get("mapping"))


class _Suggester:
    """Sugestão de categoria: regra ativa (maior prioridade) > histórico da mesma descrição."""

    def __init__(self, user):
        self.rules = list(
            CategorizationRule.objects.filter(user=user, active=True).select_related("category")
        )
        self.rules.sort(key=lambda r: (-r.priority, -len(r.pattern)))
        self.history: dict[tuple[str, str], Category] = {}
        recent = (
            Transaction.objects.filter(user=user, category__isnull=False)
            .exclude(kind=TxKind.TRANSFER)
            .select_related("category")
            .order_by("-date", "-id")[:HISTORY_LIMIT]
        )
        for tx in recent:
            self.history.setdefault((tx.kind, normalize_text(tx.description)), tx.category)

    def __call__(self, description: str, kind: str) -> Category | None:
        text = normalize_text(description)
        for rule in self.rules:
            if rule.kind == kind and rule.pattern and rule.pattern in text:
                return rule.category
        return self.history.get((kind, text))


def suggest_category(user, description: str, kind: str) -> Category | None:
    return _Suggester(user)(description, kind)


def _fail(batch: ImportBatch, message: str) -> None:
    batch.status, batch.error, batch.raw = ImportStatus.FAILED, message, ""
    batch.save(update_fields=["status", "error", "raw", "parse_errors", "updated_at"])


@transaction.atomic
def process_batch(batch: ImportBatch) -> None:
    try:
        result = _parse(batch)
    except ValueError as e:
        _fail(batch, str(e))
        return
    except Exception:  # noqa: BLE001 - nunca deixar o lote preso em "processando"
        _fail(batch, "Não foi possível ler o arquivo. Confira o formato e o mapeamento.")
        return
    if not result.rows:
        batch.parse_errors = result.errors
        _fail(batch, "Nenhum lançamento encontrado no arquivo.")
        return

    account = batch.account
    ids = [r.external_id for r in result.rows]
    known_ids = set(
        Transaction.objects.filter(account=account, external_id__in=ids).values_list(
            "external_id", flat=True
        )
    )
    dates = {r.date for r in result.rows}
    manual = set(
        Transaction.objects.filter(account=account, date__in=dates).values_list(
            "date", "amount", "kind"
        )
    )
    suggest = _Suggester(batch.user)
    seen: set[str] = set()
    rows = []
    for r in result.rows:
        kind = TxKind.EXPENSE if r.amount < 0 else TxKind.INCOME
        amount = abs(r.amount)
        duplicate = (
            r.external_id in known_ids
            or r.external_id in seen
            or (r.date, Decimal(amount), kind) in manual
        )
        seen.add(r.external_id)
        rows.append(
            ImportRow(
                batch=batch,
                line=r.line,
                date=r.date,
                description=r.description,
                kind=kind,
                amount=amount,
                external_id=r.external_id,
                suggested_category=suggest(r.description, kind),
                is_duplicate=duplicate,
            )
        )
    ImportRow.objects.bulk_create(rows)
    batch.status = ImportStatus.PREVIEW
    batch.parse_errors = result.errors
    batch.total_rows = len(rows)
    batch.duplicate_rows = sum(r.is_duplicate for r in rows)
    batch.save()


@transaction.atomic
def confirm_batch(batch: ImportBatch, edits: list[dict], learn: bool) -> tuple[int, int]:
    """Cria os lançamentos. Linha sem edição: entra se não for duplicada, com a sugestão."""
    batch = ImportBatch.objects.select_for_update().get(pk=batch.pk)
    if batch.status != ImportStatus.PREVIEW:
        raise ImportConflict("Esta importação já foi confirmada ou não está pronta.")
    by_id = {e["id"]: e for e in edits}
    category_ids = {e["category_id"] for e in edits if e.get("category_id")}
    categories = Category.objects.filter(user=batch.user, pk__in=category_ids).in_bulk()
    if len(categories) != len(category_ids):
        raise ImportError_("Categoria inválida.")

    created: list[Transaction] = []
    to_learn: dict[tuple[str, str], Category] = {}  # (tipo, padrão) → categoria (última vence)
    for row in batch.rows.select_related("suggested_category"):
        edit = by_id.get(row.id)
        include = edit["include"] if edit else not row.is_duplicate
        if not include:
            continue
        category = row.suggested_category
        if edit and "category_id" in edit:
            category = categories.get(edit["category_id"]) if edit["category_id"] else None
        if category is not None and category.kind != row.kind:
            raise ImportError_(f"Categoria inválida para a linha {row.line}.")
        created.append(
            Transaction(
                user=batch.user,
                kind=row.kind,
                amount=row.amount,
                date=row.date,
                description=row.description,
                account=batch.account,
                category=category,
                status=TxStatus.PAID,
                import_batch=batch,
                external_id=row.external_id,
            )
        )
        if learn and category and category != row.suggested_category:
            to_learn[(row.kind, normalize_text(row.description))] = category
    Transaction.objects.bulk_create(created)
    learned = _learn(batch.user, to_learn)
    batch.status = ImportStatus.DONE
    batch.created_count = len(created)
    batch.raw = ""  # o conteúdo só servia para montar a prévia
    batch.save(update_fields=["status", "created_count", "raw", "updated_at"])
    return len(created), learned


def _learn(user, to_learn: dict[tuple[str, str], Category]) -> int:
    """Cria/atualiza regras aprendidas. Regra feita à mão (prioridade menor) não é tocada."""
    learned = 0
    for (kind, pattern), category in to_learn.items():
        rule = CategorizationRule.objects.filter(user=user, kind=kind, pattern=pattern).first()
        if rule and rule.priority < LEARNED_PRIORITY:
            continue  # manual: a escolha do usuário vale mais que o aprendizado
        if rule:
            rule.category, rule.active = category, True
            rule.save(update_fields=["category", "active", "updated_at"])
        else:
            CategorizationRule.objects.create(
                user=user, kind=kind, pattern=pattern, category=category, priority=LEARNED_PRIORITY
            )
        learned += 1
    return learned


@transaction.atomic
def undo_batch(batch: ImportBatch) -> None:
    """Prévia (ou falha): descarta o lote. Confirmada: remove os lançamentos importados."""
    # relê do banco: o objeto em mãos pode estar desatualizado (ex.: confirmado em outro request)
    batch = ImportBatch.objects.select_for_update().get(pk=batch.pk)
    if batch.status == ImportStatus.DONE:
        if batch.transactions.filter(invoice__payment__isnull=False).exists():
            raise ImportConflict(
                "Há lançamentos desta importação em faturas pagas. Desfaça esses pagamentos antes."
            )
        batch.transactions.all().delete()
        batch.status = ImportStatus.UNDONE
        batch.save(update_fields=["status", "updated_at"])
    elif batch.status != ImportStatus.UNDONE:
        batch.delete()
