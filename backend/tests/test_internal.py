import datetime
from decimal import Decimal

import pytest
from django.test import Client

from apps.finance.models import RecurringRule, Transaction
from apps.finance.tests.factories import AccountFactory

pytestmark = pytest.mark.django_db
URL = "/api/internal/daily"


def call(secret=None):
    headers = {"HTTP_X_CRON_SECRET": secret} if secret is not None else {}
    return Client(enforce_csrf_checks=True).post(URL, **headers)


def test_disabled_without_configured_secret_404(settings):
    settings.CRON_SECRET = ""
    assert call("qualquer").status_code == 404


def test_wrong_or_missing_secret_403(settings):
    settings.CRON_SECRET = "s3gredo-longo"
    assert call().status_code == 403
    assert call("errado").status_code == 403


def test_runs_daily_tasks_with_secret(settings):
    settings.CRON_SECRET = "s3gredo-longo"
    settings.DEMO_ENABLED = False
    acc = AccountFactory()
    rule = RecurringRule.objects.create(
        user=acc.user,
        kind="expense",
        amount=Decimal("10"),
        description="Streaming",
        account=acc,
        frequency="monthly",
        start_date=datetime.date.today(),
    )
    r = call("s3gredo-longo")
    assert r.status_code == 200, r.content
    assert r.json()["recurring_created"] >= 1
    assert r.json()["demo_reset"] is False
    assert Transaction.objects.filter(recurring_rule=rule).exists()


def test_get_not_allowed(settings):
    settings.CRON_SECRET = "x"
    assert Client().get(URL).status_code == 405
