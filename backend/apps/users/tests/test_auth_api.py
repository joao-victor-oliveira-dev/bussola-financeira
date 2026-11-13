import json

import pytest
from django.test import Client

from apps.users.tests.factories import DEFAULT_PASSWORD, UserFactory

pytestmark = pytest.mark.django_db


def csrf_client() -> tuple[Client, str]:
    c = Client(enforce_csrf_checks=True)
    r = c.get("/api/auth/csrf")
    assert r.status_code == 200
    return c, c.cookies["csrftoken"].value


def post(c: Client, token: str | None, url: str, data: dict | None = None):
    headers = {"HTTP_X_CSRFTOKEN": token} if token else {}
    return c.post(url, json.dumps(data or {}), content_type="application/json", **headers)


def test_register_logs_in_and_returns_user():
    c, t = csrf_client()
    r = post(
        c,
        t,
        "/api/auth/register",
        {"name": "João", "email": "Joao@X.com", "password": "uma-senha-boa-99"},
    )
    assert r.status_code == 201
    assert r.json()["email"] == "joao@x.com"
    me = c.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json() == {"id": r.json()["id"], "email": "joao@x.com", "name": "João"}


def test_register_duplicate_email_case_insensitive_409():
    UserFactory(email="a@x.com")
    c, t = csrf_client()
    r = post(
        c,
        t,
        "/api/auth/register",
        {"name": "A", "email": "A@X.com", "password": "uma-senha-boa-99"},
    )
    assert r.status_code == 409
    assert r.json() == {"detail": "E-mail já cadastrado."}


def test_register_weak_password_422():
    c, t = csrf_client()
    r = post(c, t, "/api/auth/register", {"name": "A", "email": "a@x.com", "password": "123"})
    assert r.status_code == 422
    assert isinstance(r.json()["detail"], str) and r.json()["detail"]


def test_login_with_different_case_email():
    UserFactory(email="joao@x.com", name="João")
    c, t = csrf_client()
    r = post(c, t, "/api/auth/login", {"email": "Joao@X.com", "password": DEFAULT_PASSWORD})
    assert r.status_code == 200
    assert r.json()["name"] == "João"


def test_login_wrong_password_401():
    UserFactory(email="joao@x.com")
    c, t = csrf_client()
    r = post(c, t, "/api/auth/login", {"email": "joao@x.com", "password": "errada"})
    assert r.status_code == 401
    assert r.json() == {"detail": "E-mail ou senha inválidos."}


def test_me_without_session_401():
    assert Client().get("/api/auth/me").status_code == 401


def test_logout_then_me_401():
    UserFactory(email="joao@x.com")
    c, t = csrf_client()
    post(c, t, "/api/auth/login", {"email": "joao@x.com", "password": DEFAULT_PASSWORD})
    t = c.cookies["csrftoken"].value  # login rotaciona o token
    assert post(c, t, "/api/auth/logout").status_code == 204
    assert c.get("/api/auth/me").status_code == 401


def test_post_without_csrf_token_403():
    UserFactory(email="joao@x.com")
    c, _ = csrf_client()
    r = post(c, None, "/api/auth/login", {"email": "joao@x.com", "password": DEFAULT_PASSWORD})
    assert r.status_code == 403
