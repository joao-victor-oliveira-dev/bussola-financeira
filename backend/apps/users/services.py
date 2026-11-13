from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction

from apps.finance.services import create_default_categories
from apps.users.managers import normalize_email
from apps.users.models import User


class EmailTaken(Exception):
    pass


class WeakPassword(Exception):
    pass


def register_user(name: str, email: str, password: str) -> User:
    email = normalize_email(email)
    # O e-mail da demo é reservado: quem o cadastrasse receberia todos os visitantes.
    if email == normalize_email(settings.DEMO_EMAIL) or User.objects.filter(email=email).exists():
        raise EmailTaken
    try:
        validate_password(password, User(email=email, name=name))
    except ValidationError as e:
        raise WeakPassword(" ".join(e.messages)) from e
    with transaction.atomic():
        try:
            with transaction.atomic():
                user = User.objects.create_user(email=email, password=password, name=name.strip())
        except IntegrityError as e:  # corrida entre o exists() e o insert
            raise EmailTaken from e
        create_default_categories(user)
        return user
