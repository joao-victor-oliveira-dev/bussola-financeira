import pytest
from django.db import IntegrityError

from apps.users.models import User


def test_create_user_lowercases_whole_email(db):
    u = User.objects.create_user(email="  Joao@X.COM ", password="x", name="João")
    assert u.email == "joao@x.com"
    assert u.check_password("x")


def test_email_unique_regardless_of_case(db):
    User.objects.create_user(email="a@x.com", password="x", name="A")
    with pytest.raises(IntegrityError):
        User.objects.create_user(email="A@X.com", password="x", name="B")


def test_create_superuser_flags(db):
    u = User.objects.create_superuser(email="admin@x.com", password="x", name="Admin")
    assert u.is_staff and u.is_superuser


def test_user_factory_password(db):
    from apps.users.tests.factories import UserFactory

    u = UserFactory()
    assert u.check_password("senha-forte-123")
