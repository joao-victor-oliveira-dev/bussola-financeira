import datetime
from decimal import Decimal
from typing import Annotated, Literal

from ninja import Schema
from pydantic import Field, PlainSerializer, StringConstraints

Money = Annotated[Decimal, Field(max_digits=14, decimal_places=2)]
PositiveMoney = Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)]
CENT = Decimal("0.01")
# Saída sempre como string com 2 casas (o SQLite devolve somas sem escala fixa).
MoneyOut = Annotated[Decimal, PlainSerializer(lambda v: str(v.quantize(CENT)), return_type=str)]
Color = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]


def Name(max_length: int):  # noqa: N802 - fábrica de tipo
    return Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=max_length)
    ]


AccountTypeLit = Literal["checking", "savings", "wallet", "investment"]
CategoryKindLit = Literal["income", "expense"]
TxKindLit = Literal["income", "expense", "transfer"]
TxStatusLit = Literal["paid", "pending"]


# ---- Contas ----
class AccountIn(Schema):
    name: Name(80)
    type: AccountTypeLit
    initial_balance: Money = Decimal("0")
    color: Color = "#2fb5a2"
    archived: bool = False


class AccountPatch(Schema):
    name: Name(80) | None = None
    type: AccountTypeLit | None = None
    initial_balance: Money | None = None
    color: Color | None = None
    archived: bool | None = None


class AccountOut(Schema):
    id: int
    name: str
    type: AccountTypeLit
    initial_balance: MoneyOut
    color: str
    archived: bool
    balance: MoneyOut


# ---- Categorias ----
class CategoryIn(Schema):
    name: Name(60)
    kind: CategoryKindLit
    parent_id: int | None = None
    color: Color = "#8a9ba3"


class CategoryPatch(Schema):
    name: Name(60) | None = None
    parent_id: int | None = None
    color: Color | None = None


class CategoryOut(Schema):
    id: int
    name: str
    kind: CategoryKindLit
    parent_id: int | None
    color: str


# ---- Tags ----
class TagIn(Schema):
    name: Name(40)
    color: Color = "#8a9ba3"


class TagPatch(Schema):
    name: Name(40) | None = None
    color: Color | None = None


class TagOut(Schema):
    id: int
    name: str
    color: str


# ---- Lançamentos ----
class TransactionIn(Schema):
    kind: TxKindLit
    amount: PositiveMoney
    date: datetime.date
    description: Name(140)
    account_id: int | None = None
    credit_card_id: int | None = None
    to_account_id: int | None = None
    category_id: int | None = None
    status: TxStatusLit = "paid"
    notes: str = ""
    tag_ids: list[int] = []


class TransactionPatch(Schema):
    kind: TxKindLit | None = None
    amount: PositiveMoney | None = None
    date: datetime.date | None = None
    description: Name(140) | None = None
    account_id: int | None = None
    credit_card_id: int | None = None
    to_account_id: int | None = None
    category_id: int | None = None
    status: TxStatusLit | None = None
    notes: str | None = None
    tag_ids: list[int] | None = None


class TransactionOut(Schema):
    id: int
    kind: TxKindLit
    amount: MoneyOut
    date: datetime.date
    description: str
    account_id: int | None
    credit_card_id: int | None
    to_account_id: int | None
    to_credit_card_id: int | None
    invoice: str | None
    installment: str | None
    recurring_rule_id: int | None
    category_id: int | None
    status: TxStatusLit
    notes: str
    tag_ids: list[int]

    @staticmethod
    def resolve_tag_ids(obj) -> list[int]:
        return [t.id for t in obj.tags.all()]

    @staticmethod
    def resolve_invoice(obj) -> str | None:
        return obj.invoice.reference if obj.invoice_id else None

    @staticmethod
    def resolve_installment(obj) -> str | None:
        if not obj.installment_plan_id:
            return None
        return f"{obj.installment_number}/{obj.installment_plan.count}"


class Totals(Schema):
    income: MoneyOut
    expense: MoneyOut
    net: MoneyOut


class TransactionPage(Schema):
    items: list[TransactionOut]
    count: int
    page: int
    page_size: int
    totals: Totals


class DetailOut(Schema):
    detail: str


# ---- Cartões ----
Day = Annotated[int, Field(ge=1, le=28)]
NonNegativeMoney = Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=2)]
InvoiceStatusLit = Literal["open", "closed", "paid"]


class CardIn(Schema):
    name: Name(80)
    limit: NonNegativeMoney
    closing_day: Day
    due_day: Day
    payment_account_id: int | None = None
    color: Color = "#6c9ef8"
    archived: bool = False


class CardPatch(Schema):
    name: Name(80) | None = None
    limit: NonNegativeMoney | None = None
    closing_day: Day | None = None
    due_day: Day | None = None
    payment_account_id: int | None = None
    color: Color | None = None
    archived: bool | None = None


class InvoiceSummaryOut(Schema):
    reference: str
    closing_date: datetime.date
    due_date: datetime.date
    total: MoneyOut
    status: InvoiceStatusLit
    payment_id: int | None


class InvoiceDetailOut(InvoiceSummaryOut):
    card_id: int
    items: list[TransactionOut]


class CardOut(Schema):
    id: int
    name: str
    limit: MoneyOut
    closing_day: int
    due_day: int
    payment_account_id: int | None
    color: str
    archived: bool
    limit_used: MoneyOut
    current_invoice: InvoiceSummaryOut


class PayInvoiceIn(Schema):
    account_id: int | None = None
    date: datetime.date | None = None
