import pytest
from django.db import IntegrityError

from apps.users.models import User
from apps.users.services import EmailTaken, register_user


@pytest.mark.django_db
def test_seeding_failure_is_not_reported_as_email_taken(monkeypatch):
    def boom(user):
        raise IntegrityError("categoria duplicada")

    monkeypatch.setattr("apps.users.services.create_default_categories", boom)
    with pytest.raises(IntegrityError):
        register_user("Ana", "ana@x.com", "uma-senha-boa-99")
    assert not User.objects.filter(email="ana@x.com").exists()


@pytest.mark.django_db
def test_duplicate_email_still_email_taken():
    register_user("Ana", "ana@x.com", "uma-senha-boa-99")
    with pytest.raises(EmailTaken):
        register_user("Ana 2", "ANA@x.com", "uma-senha-boa-99")
