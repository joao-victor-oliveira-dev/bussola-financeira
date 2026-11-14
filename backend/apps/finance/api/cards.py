from typing import Annotated

from django.db import IntegrityError, transaction
from django.utils import timezone
from ninja import Path, Router, Status
from ninja.errors import HttpError
from ninja.security import django_auth
from pydantic import StringConstraints

from apps.finance.api.common import get_owned
from apps.finance.cards import (
    get_or_create_invoice,
    invoice_reference,
    invoice_summary,
    limit_used,
)
from apps.finance.models import (
    Account,
    CreditCard,
    RecurringRule,
    Transaction,
    TxKind,
    TxStatus,
)
from apps.finance.schemas import (
    CardIn,
    CardOut,
    CardPatch,
    InvoiceDetailOut,
    InvoiceSummaryOut,
    PayInvoiceIn,
)

router = Router(tags=["cards"], auth=django_auth)

Reference = Annotated[str, StringConstraints(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]
DUPLICATE = "Já existe um cartão com esse nome."


def _out(card: CreditCard) -> dict:
    today = timezone.localdate()
    return {
        **{f: getattr(card, f) for f in ("id", "name", "limit", "closing_day", "due_day")},
        "payment_account_id": card.payment_account_id,
        "color": card.color,
        "archived": card.archived,
        "limit_used": limit_used(card),
        "current_invoice": invoice_summary(card, invoice_reference(card, today), today),
    }


def _payment_account(user, account_id: int | None) -> Account | None:
    if account_id is None:
        return None
    acc = Account.objects.filter(user=user, pk=account_id).first()
    if acc is None:
        raise HttpError(422, "Conta de pagamento inválida.")
    return acc


def _save(card: CreditCard) -> None:
    dup = CreditCard.objects.filter(user=card.user, name__iexact=card.name).exclude(pk=card.pk)
    if dup.exists():
        raise HttpError(409, DUPLICATE)
    try:
        with transaction.atomic():
            card.save()
    except IntegrityError:
        raise HttpError(409, DUPLICATE) from None


@router.get("", operation_id="cardsList", response=list[CardOut])
def list_cards(request):
    return [_out(c) for c in CreditCard.objects.filter(user=request.auth)]


@router.post("", operation_id="cardsCreate", response={201: CardOut})
def create_card(request, payload: CardIn):
    data = payload.dict()
    data["payment_account"] = _payment_account(request.auth, data.pop("payment_account_id"))
    card = CreditCard(user=request.auth, **data)
    _save(card)
    return Status(201, _out(card))


@router.patch("/{card_id}", operation_id="cardsUpdate", response=CardOut)
def update_card(request, card_id: int, payload: CardPatch):
    card = get_owned(CreditCard, request.auth, card_id)
    data = payload.dict(exclude_unset=True)
    if "payment_account_id" in data:
        card.payment_account = _payment_account(request.auth, data.pop("payment_account_id"))
    for field, value in data.items():
        if value is not None:
            setattr(card, field, value)
    _save(card)
    return _out(card)


@router.delete("/{card_id}", operation_id="cardsDelete", response={204: None})
def delete_card(request, card_id: int):
    card = get_owned(CreditCard, request.auth, card_id)
    if card.purchases.exists() or card.payments.exists():
        raise HttpError(409, "Este cartão tem lançamentos. Arquive em vez de excluir.")
    if RecurringRule.objects.filter(credit_card=card).exists():
        raise HttpError(
            409, "Este cartão é usado por recorrências. Altere ou exclua as regras antes."
        )
    card.delete()
    return Status(204, None)


def _detail(card: CreditCard, reference: str) -> dict:
    today = timezone.localdate()
    items = (
        Transaction.objects.filter(invoice__card=card, invoice__reference=reference)
        .select_related("invoice", "installment_plan")
        .prefetch_related("tags")
        .order_by("date", "id")
    )
    return {**invoice_summary(card, reference, today), "card_id": card.id, "items": list(items)}


@router.get(
    "/{card_id}/invoices/{reference}", operation_id="cardsInvoice", response=InvoiceDetailOut
)
def get_invoice(request, card_id: int, reference: Path[Reference]):
    return _detail(get_owned(CreditCard, request.auth, card_id), reference)


@router.post(
    "/{card_id}/invoices/{reference}/pay",
    operation_id="cardsInvoicePay",
    response=InvoiceSummaryOut,
)
def pay_invoice(request, card_id: int, reference: Path[Reference], payload: PayInvoiceIn):
    """Paga a fatura: transferência da conta de pagamento para o cartão (não é despesa)."""
    card = get_owned(CreditCard, request.auth, card_id)
    account = _payment_account(request.auth, payload.account_id) or card.payment_account
    if account is None:
        raise HttpError(422, "Escolha a conta de pagamento.")
    with transaction.atomic():
        invoice = get_or_create_invoice(card, reference)
        invoice = type(invoice).objects.select_for_update().get(pk=invoice.pk)
        if invoice.payment_id:
            raise HttpError(409, "Esta fatura já foi paga.")
        summary = invoice_summary(card, reference, timezone.localdate())
        if summary["total"] <= 0:
            raise HttpError(422, "Esta fatura não tem lançamentos.")
        invoice.payment = Transaction.objects.create(
            user=request.auth,
            kind=TxKind.TRANSFER,
            amount=summary["total"],
            date=payload.date or timezone.localdate(),
            description=f"Pagamento da fatura {card.name} ({reference})",
            account=account,
            to_credit_card=card,
            status=TxStatus.PAID,
        )
        invoice.save(update_fields=["payment"])
    return invoice_summary(card, reference, timezone.localdate())


@router.delete(
    "/{card_id}/invoices/{reference}/pay",
    operation_id="cardsInvoiceUnpay",
    response=InvoiceSummaryOut,
)
def unpay_invoice(request, card_id: int, reference: Path[Reference]):
    card = get_owned(CreditCard, request.auth, card_id)
    invoice = card.invoices.filter(reference=reference).first()
    if invoice and invoice.payment_id:
        invoice.payment.delete()  # SET_NULL limpa invoice.payment
    return invoice_summary(card, reference, timezone.localdate())
