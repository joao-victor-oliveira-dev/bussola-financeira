"""Recorrências: datas de ocorrência e geração idempotente de lançamentos pendentes."""

import calendar
import datetime

from django.db import transaction

from apps.finance.cards import get_or_create_invoice, invoice_reference
from apps.finance.installments import add_months
from apps.finance.models import Frequency, RecurringRule, Transaction, TxStatus

HORIZON_DAYS = 60


def _nth(rule: RecurringRule, n: int) -> datetime.date:
    start = rule.start_date
    if rule.frequency == Frequency.WEEKLY:
        return start + datetime.timedelta(weeks=n)
    if rule.frequency == Frequency.MONTHLY:
        return add_months(start, n)  # 31 → último dia nos meses curtos
    year = start.year + n  # anual: 29/02 → 28/02 em anos não bissextos
    return datetime.date(
        year, start.month, min(start.day, calendar.monthrange(year, start.month)[1])
    )


def occurrences(
    rule: RecurringRule, start: datetime.date, end: datetime.date
) -> list[datetime.date]:
    """Datas da regra dentro de [start, end], respeitando início e fim da regra."""
    last = min(end, rule.end_date) if rule.end_date else end
    dates, n = [], 0
    while (d := _nth(rule, n)) <= last:
        if d >= start:
            dates.append(d)
        n += 1
    return dates


@transaction.atomic
def generate(rule: RecurringRule, today: datetime.date | None = None) -> int:
    """Cria as ocorrências pendentes de hoje até 60 dias. Idempotente: pula datas existentes.

    Não preenche o passado: uma regra com início antigo começa a gerar a partir de hoje.
    """
    if not rule.active:
        return 0
    today = today or datetime.date.today()
    start = today
    if rule.generated_until and rule.generated_until >= today:
        start = rule.generated_until + datetime.timedelta(days=1)
    end = today + datetime.timedelta(days=HORIZON_DAYS)
    dates = occurrences(rule, start, end) if start <= end else []
    existing = set(
        Transaction.objects.filter(recurring_rule=rule, date__in=dates).values_list(
            "date", flat=True
        )
    )
    new = [
        Transaction(
            user=rule.user,
            kind=rule.kind,
            amount=rule.amount,
            date=d,
            description=rule.description,
            account=rule.account,
            credit_card=rule.credit_card,
            to_account=rule.to_account,
            category=rule.category,
            status=TxStatus.PENDING,
            recurring_rule=rule,
            invoice=(
                get_or_create_invoice(rule.credit_card, invoice_reference(rule.credit_card, d))
                if rule.credit_card_id
                else None
            ),
        )
        for d in dates
        if d not in existing
    ]
    Transaction.objects.bulk_create(new)
    rule.generated_until = max(end, rule.generated_until or end)
    rule.save(update_fields=["generated_until"])
    return len(new)


def clear_future_pending(rule: RecurringRule, today: datetime.date) -> None:
    """Remove as ocorrências futuras ainda pendentes (efetivadas e passadas ficam)."""
    Transaction.objects.filter(
        recurring_rule=rule, status=TxStatus.PENDING, date__gte=today
    ).delete()


@transaction.atomic
def regenerate(rule: RecurringRule, today: datetime.date | None = None) -> int:
    """Regra editada: refaz o futuro pendente a partir de hoje."""
    today = today or datetime.date.today()
    rule.generated_until = None
    rule.save(update_fields=["generated_until"])
    clear_future_pending(rule, today)
    return generate(rule, today)


def next_dates(rule: RecurringRule, today: datetime.date, count: int = 3) -> list[datetime.date]:
    if not rule.active:
        return []
    return occurrences(rule, today, today + datetime.timedelta(days=366 * 2))[:count]


def generate_all(today: datetime.date | None = None) -> int:
    return sum(generate(r, today) for r in RecurringRule.objects.filter(active=True))
