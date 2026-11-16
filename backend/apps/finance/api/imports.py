import datetime
import json
from typing import Annotated, Literal

from django.db import IntegrityError, transaction
from ninja import File, Form, Router, Schema, Status
from ninja.errors import HttpError
from ninja.files import UploadedFile
from ninja.security import django_auth
from pydantic import Field

from apps.finance.api.common import get_owned
from apps.finance.importers.common import normalize_text
from apps.finance.importers.service import (
    MAX_BYTES,
    ImportConflict,
    ImportError_,
    confirm_batch,
    create_batch,
    undo_batch,
)
from apps.finance.models import Account, CategorizationRule, Category, ImportBatch
from apps.finance.schemas import CategoryKindLit, MoneyOut, Name, TxKindLit

router = Router(tags=["imports"], auth=django_auth)
rules_router = Router(tags=["rules"], auth=django_auth)

StatusLit = Literal["processing", "preview", "done", "failed", "undone"]


class BatchOut(Schema):
    id: int
    account_id: int
    filename: str
    format: Literal["ofx", "csv"]
    status: StatusLit
    error: str
    parse_errors: list[tuple[int, str]]
    total_rows: int
    duplicate_rows: int
    created_count: int
    created_at: datetime.datetime


class RowOut(Schema):
    id: int
    line: int
    date: datetime.date
    description: str
    kind: TxKindLit
    amount: MoneyOut
    suggested_category_id: int | None
    is_duplicate: bool


class BatchDetailOut(BatchOut):
    rows: list[RowOut]

    @staticmethod
    def resolve_rows(obj) -> list:
        return list(obj.rows.all())


class RowEdit(Schema):
    id: int
    include: bool
    category_id: int | None = None


class ConfirmIn(Schema):
    rows: list[RowEdit] = []
    learn: bool = False


class ConfirmOut(Schema):
    created: int
    rules_learned: int


@router.post("", operation_id="importsCreate", response={201: BatchOut})
def create_import(
    request,
    file: File[UploadedFile],
    account_id: Form[int],
    preset: Form[str] = "auto",
    mapping: Form[str] = "",
):
    account = Account.objects.filter(user=request.auth, pk=account_id).first()
    if account is None:
        raise HttpError(422, "Conta inválida.")
    if account.archived:
        raise HttpError(422, "Esta conta está arquivada.")
    if file.size and file.size > MAX_BYTES:
        raise HttpError(422, "O arquivo passa de 2 MB.")
    try:
        parsed_mapping = json.loads(mapping) if mapping else None
    except json.JSONDecodeError:
        parsed_mapping = False
    if parsed_mapping is not None and not (
        isinstance(parsed_mapping, dict)
        and all(isinstance(v, str) for v in parsed_mapping.values())
    ):
        raise HttpError(422, "Mapeamento de colunas inválido.")
    try:
        batch = create_batch(
            request.auth, account, file.name or "extrato", file.read(), preset, parsed_mapping
        )
    except ImportError_ as e:
        raise HttpError(422, str(e)) from None
    return Status(201, batch)


@router.get("", operation_id="importsList", response=list[BatchOut])
def list_imports(request):
    return ImportBatch.objects.filter(user=request.auth).defer("raw")[:20]


@router.get("/{batch_id}", operation_id="importsGet", response=BatchDetailOut)
def get_import(request, batch_id: int):
    return get_owned(ImportBatch, request.auth, batch_id)


@router.post("/{batch_id}/confirm", operation_id="importsConfirm", response=ConfirmOut)
def confirm_import(request, batch_id: int, payload: ConfirmIn):
    batch = get_owned(ImportBatch, request.auth, batch_id)
    try:
        created, learned = confirm_batch(batch, [r.dict() for r in payload.rows], payload.learn)
    except ImportConflict as e:
        raise HttpError(409, str(e)) from None
    except ImportError_ as e:
        raise HttpError(422, str(e)) from None
    return {"created": created, "rules_learned": learned}


@router.delete("/{batch_id}", operation_id="importsDelete", response={204: None})
def delete_import(request, batch_id: int):
    try:
        undo_batch(get_owned(ImportBatch, request.auth, batch_id))
    except ImportConflict as e:
        raise HttpError(409, str(e)) from None
    return Status(204, None)


# ---- regras de categorização ----
Priority = Annotated[int, Field(ge=-100, le=100)]


class RuleIn(Schema):
    pattern: Name(140)
    category_id: int
    priority: Priority = 0
    active: bool = True


class RulePatch(Schema):
    pattern: Name(140) | None = None
    category_id: int | None = None
    priority: Priority | None = None
    active: bool | None = None


class RuleOut(Schema):
    id: int
    pattern: str
    category_id: int
    kind: CategoryKindLit
    priority: int
    active: bool


def _save_rule(rule: CategorizationRule, user, data: dict) -> None:
    if data.get("category_id") is not None:
        category = Category.objects.filter(user=user, pk=data["category_id"]).first()
        if category is None:
            raise HttpError(422, "Categoria inválida.")
        rule.category, rule.kind = category, category.kind
    if data.get("pattern") is not None:
        rule.pattern = normalize_text(data["pattern"])
        if not rule.pattern:
            raise HttpError(422, "Informe o texto da regra.")
    for field in ("priority", "active"):
        if data.get(field) is not None:
            setattr(rule, field, data[field])
    try:
        with transaction.atomic():
            rule.save()
    except IntegrityError:
        raise HttpError(409, "Já existe uma regra com esse texto.") from None


@rules_router.get("", operation_id="rulesList", response=list[RuleOut])
def list_rules(request):
    return CategorizationRule.objects.filter(user=request.auth)


@rules_router.post("", operation_id="rulesCreate", response={201: RuleOut})
def create_rule(request, payload: RuleIn):
    rule = CategorizationRule(user=request.auth)
    _save_rule(rule, request.auth, payload.dict())
    return Status(201, rule)


@rules_router.patch("/{rule_id}", operation_id="rulesUpdate", response=RuleOut)
def update_rule(request, rule_id: int, payload: RulePatch):
    rule = get_owned(CategorizationRule, request.auth, rule_id)
    _save_rule(rule, request.auth, payload.dict(exclude_unset=True))
    return rule


@rules_router.delete("/{rule_id}", operation_id="rulesDelete", response={204: None})
def delete_rule(request, rule_id: int):
    get_owned(CategorizationRule, request.auth, rule_id).delete()
    return Status(204, None)
