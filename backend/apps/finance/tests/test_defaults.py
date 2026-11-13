import json

import pytest
from django.test import Client

from apps.finance.models import Category
from apps.finance.services import create_default_categories
from apps.users.tests.factories import UserFactory

pytestmark = pytest.mark.django_db


def test_default_categories_tree():
    user = UserFactory()
    create_default_categories(user)
    cats = Category.objects.filter(user=user)
    food = cats.get(name="Alimentação", kind="expense", parent=None)
    assert set(food.children.values_list("name", flat=True)) == {"Mercado", "Restaurantes"}
    assert cats.filter(kind="income", name="Salário").exists()
    assert cats.filter(kind="expense", parent=None).count() == 9
    assert cats.filter(kind="income").count() == 4


def test_default_categories_idempotent():
    user = UserFactory()
    create_default_categories(user)
    n = Category.objects.filter(user=user).count()
    create_default_categories(user)
    assert Category.objects.filter(user=user).count() == n


def test_register_creates_default_categories():
    c = Client()
    r = c.post(
        "/api/auth/register",
        json.dumps({"name": "Ana", "email": "ana@x.com", "password": "uma-senha-boa-99"}),
        content_type="application/json",
    )
    assert r.status_code == 201
    assert Category.objects.filter(user__email="ana@x.com").exists()
