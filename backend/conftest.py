import pytest


@pytest.fixture(autouse=True)
def _fast_password_hasher(settings):
    """O PBKDF2 de produção é lento de propósito; nos testes ele dominava o tempo da suíte."""
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
