import datetime
import json

import pytest
from django.core.management import call_command
from django.db.models import Sum
from django.test import Client

from apps.finance.demo import seed_demo
from apps.finance.models import (
    Account,
    Category,
    CreditCard,
    InstallmentPlan,
    RecurringRule,
    Tag,
    Transaction,
)
from apps.users.models import User
from apps.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db

TODAY = datetime.date(2026, 11, 13)


def snapshot(user):
    qs = Transaction.objects.filter(user=user)
    return qs.count(), qs.aggregate(t=Sum("amount"))["t"]


def test_seed_covers_twelve_months_until_this_month():
    user = UserFactory()
    seed_demo(user, today=TODAY)
    qs = Transaction.objects.filter(user=user)
    dates = sorted(qs.values_list("date", flat=True))
    assert dates[0] >= datetime.date(2025, 12, 1)
    # só parcelas futuras e recorrências pendentes passam do mês atual
    future = qs.filter(date__gt=datetime.date(2026, 11, 30))
    assert not future.filter(installment_plan__isnull=True, recurring_rule__isnull=True).exists()
    assert not future.exclude(status="pending").filter(installment_plan__isnull=True).exists()
    months = {d.strftime("%Y-%m") for d in dates if d <= datetime.date(2026, 11, 30)}
    assert len(months) == 12  # 12 meses de histórico; o resto é futuro (parcelas/pendentes)
    assert Account.objects.filter(user=user).count() == 4
    card = CreditCard.objects.get(user=user)
    assert InstallmentPlan.objects.filter(user=user).count() == 2
    assert RecurringRule.objects.filter(user=user).count() == 8
    assert qs.filter(credit_card=card).exists()
    # faturas vencidas pagas; nenhuma paga antes de vencer
    assert card.invoices.filter(payment__isnull=False).exists()
    assert not qs.filter(to_credit_card=card, date__gt=TODAY).exists()
    salaries = qs.filter(kind="income", description="Salário")
    assert salaries.filter(date__lte=datetime.date(2026, 11, 30)).count() == 12
    assert salaries.filter(date__gt=TODAY, status="pending").exists()  # vindos da recorrência
    assert qs.filter(kind="transfer").exists()
    assert Tag.objects.filter(user=user, name="viagem").exists()
    assert qs.filter(tags__name="viagem").exists()
    # contas futuras do mês atual ficam pendentes; nada pago depois de hoje
    assert qs.filter(status="pending", date__gt=TODAY).exists()
    # parcelas futuras são compras já feitas (efetivadas); o resto do futuro é pendente
    assert not qs.filter(status="paid", date__gt=TODAY, installment_plan__isnull=True).exists()
    # tudo categorizado com categorias do próprio usuário e do tipo certo
    assert not qs.exclude(kind="transfer").filter(category__isnull=True).exists()
    assert not qs.exclude(category__user=user).exclude(category__isnull=True).exists()
    assert not qs.filter(kind="income", category__kind="expense").exists()


def test_seed_is_deterministic_and_idempotent():
    a, b = UserFactory(), UserFactory()
    seed_demo(a, today=TODAY)
    seed_demo(b, today=TODAY)
    assert snapshot(a) == snapshot(b)
    seed_demo(a, today=TODAY)
    assert snapshot(a) == snapshot(b)


def test_seed_reset_recreates():
    user = UserFactory()
    seed_demo(user, today=TODAY)
    before = snapshot(user)
    Transaction.objects.filter(user=user).first().delete()
    Category.objects.create(user=user, name="Lixo", kind="expense")
    seed_demo(user, today=TODAY, reset=True)
    assert snapshot(user) == before
    assert not Category.objects.filter(user=user, name="Lixo").exists()


def test_command_creates_demo_user(settings):
    settings.DEMO_EMAIL = "demo@bussola.app"
    call_command("seed_demo")
    demo = User.objects.get(email="demo@bussola.app")
    assert not demo.has_usable_password()
    assert Transaction.objects.filter(user=demo).exists()
    count = Transaction.objects.filter(user=demo).count()
    call_command("seed_demo")
    assert Transaction.objects.filter(user=demo).count() == count
    call_command("seed_demo", "--reset")
    assert Transaction.objects.filter(user=demo).count() == count


def _csrf_client():
    c = Client(enforce_csrf_checks=True)
    c.get("/api/auth/csrf")
    return c, c.cookies["csrftoken"].value


def test_demo_login_creates_and_logs_in(settings):
    settings.DEMO_ENABLED = True
    settings.DEMO_EMAIL = "demo@bussola.app"
    c, token = _csrf_client()
    r = c.post("/api/auth/demo", "{}", content_type="application/json", HTTP_X_CSRFTOKEN=token)
    assert r.status_code == 200, r.content
    assert r.json()["email"] == "demo@bussola.app"
    assert c.get("/api/auth/me").json()["email"] == "demo@bussola.app"
    count = Transaction.objects.filter(user__email="demo@bussola.app").count()
    assert count > 0
    c2, token2 = _csrf_client()
    c2.post("/api/auth/demo", "{}", content_type="application/json", HTTP_X_CSRFTOKEN=token2)
    assert Transaction.objects.filter(user__email="demo@bussola.app").count() == count


def test_demo_requires_csrf(settings):
    settings.DEMO_ENABLED = True
    c, _ = _csrf_client()
    r = c.post("/api/auth/demo", json.dumps({}), content_type="application/json")
    assert r.status_code == 403


def test_demo_disabled_404(settings):
    settings.DEMO_ENABLED = False
    c, token = _csrf_client()
    r = c.post("/api/auth/demo", "{}", content_type="application/json", HTTP_X_CSRFTOKEN=token)
    assert r.status_code == 404


def test_demo_email_cannot_be_registered(settings):
    from apps.users.services import EmailTaken, register_user

    settings.DEMO_EMAIL = "demo@bussola.app"
    with pytest.raises(EmailTaken):
        register_user("Intruso", "Demo@Bussola.app", "uma-senha-boa-99")


def test_demo_refuses_real_account_with_demo_email(settings):
    settings.DEMO_ENABLED = True
    settings.DEMO_EMAIL = "demo@bussola.app"
    UserFactory(email="demo@bussola.app")  # conta real, com senha
    c, token = _csrf_client()
    r = c.post("/api/auth/demo", "{}", content_type="application/json", HTTP_X_CSRFTOKEN=token)
    assert r.status_code == 404
    assert c.get("/api/auth/me").status_code == 401


def test_demo_recovers_after_visitor_wipes_accounts(settings):
    settings.DEMO_ENABLED = True
    settings.DEMO_EMAIL = "demo@bussola.app"
    c, token = _csrf_client()
    c.post("/api/auth/demo", "{}", content_type="application/json", HTTP_X_CSRFTOKEN=token)
    demo = User.objects.get(email="demo@bussola.app")
    expected = snapshot(demo)[0]
    # visitante apaga tudo, mas a tag fica e uma categoria padrão some/renomeia
    Transaction.objects.filter(user=demo).delete()
    Account.objects.filter(user=demo).delete()
    Category.objects.filter(user=demo, name="Mercado").update(name="Supermercado")
    c2, token2 = _csrf_client()
    r = c2.post("/api/auth/demo", "{}", content_type="application/json", HTTP_X_CSRFTOKEN=token2)
    assert r.status_code == 200
    assert snapshot(demo)[0] == expected


def test_demo_login_survives_concurrent_seed(settings, monkeypatch):
    from django.db import IntegrityError

    settings.DEMO_ENABLED = True

    def concurrent(user, **kw):
        raise IntegrityError("outra requisição criou os dados primeiro")

    monkeypatch.setattr("apps.users.api.seed_demo", concurrent)
    c, token = _csrf_client()
    r = c.post("/api/auth/demo", "{}", content_type="application/json", HTTP_X_CSRFTOKEN=token)
    assert r.status_code == 200


def test_demo_disabled_by_default():
    """Sem a variável no ambiente, o login de visitante fica desligado (padrão seguro)."""
    from config import settings as project_settings

    assert project_settings.env.scheme["DEMO_ENABLED"] == (bool, False)


def test_demo_accounts_end_non_negative():
    from apps.finance.services import accounts_with_balance

    user = UserFactory()
    seed_demo(user, today=TODAY)
    negatives = [(a.name, a.balance) for a in accounts_with_balance(user) if a.balance < 0]
    assert negatives == []
