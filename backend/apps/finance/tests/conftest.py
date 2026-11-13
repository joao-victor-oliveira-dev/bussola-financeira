import json

import pytest
from django.test import Client

from apps.users.tests.factories import UserFactory


class Api:
    """Cliente JSON autenticado, com checagem de CSRF ligada (como no navegador)."""

    def __init__(self, user):
        self.user = user
        self.client = Client(enforce_csrf_checks=True)
        self.client.force_login(user)
        self.client.get("/api/auth/csrf")
        self.token = self.client.cookies["csrftoken"].value

    def get(self, url, params=None):
        return self.client.get(url, params or {})

    def _send(self, method, url, data=None):
        return getattr(self.client, method)(
            url,
            json.dumps(data) if data is not None else "",
            content_type="application/json",
            HTTP_X_CSRFTOKEN=self.token,
        )

    def post(self, url, data=None):
        return self._send("post", url, data or {})

    def patch(self, url, data=None):
        return self._send("patch", url, data or {})

    def delete(self, url):
        return self._send("delete", url)


@pytest.fixture
def user(db):
    return UserFactory()


@pytest.fixture
def api(user):
    return Api(user)
