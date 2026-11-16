import json

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.finance.models import CategorizationRule, ImportBatch, Transaction
from apps.finance.tests.factories import AccountFactory, CategoryFactory

pytestmark = pytest.mark.django_db

CSV = b"""Data,Valor,Identificador,Descri\xc3\xa7\xc3\xa3o
03/11/2026,-42.90,id-1,Supermercado Dia
05/11/2026,7800.00,id-2,Empresa X
"""


def upload(api, account_id, content=CSV, name="extrato.csv", **fields):
    return api.client.post(
        "/api/imports",
        {"file": SimpleUploadedFile(name, content), "account_id": account_id, **fields},
        HTTP_X_CSRFTOKEN=api.token,
    )


@pytest.fixture
def acc(user):
    return AccountFactory(user=user)


def test_upload_returns_preview_with_rows(api, acc):
    r = upload(api, acc.id)
    assert r.status_code == 201, r.content
    body = r.json()
    assert (body["status"], body["total_rows"], body["format"]) == ("preview", 2, "csv")
    detail = api.get(f"/api/imports/{body['id']}").json()
    assert [(row["kind"], row["amount"]) for row in detail["rows"]] == [
        ("expense", "42.90"),
        ("income", "7800.00"),
    ]
    assert detail["rows"][0]["is_duplicate"] is False


def test_upload_custom_mapping(api, acc):
    content = b"dia;texto;quanto\n03/11/2026;Padaria;-12,50\n"
    mapping = {"date": "dia", "description": "texto", "amount": "quanto", "decimal": ","}
    r = upload(api, acc.id, content, preset="personalizado", mapping=json.dumps(mapping))
    assert r.status_code == 201, r.content
    assert r.json()["total_rows"] == 1


@pytest.mark.parametrize(
    "case",
    ["foreign_account", "bad_ext", "too_big", "bad_mapping_json", "unknown_columns"],
)
def test_upload_rejections_422(api, acc, case):
    kw = {}
    account_id, content, name = acc.id, CSV, "extrato.csv"
    if case == "foreign_account":
        account_id = AccountFactory().id
    elif case == "bad_ext":
        name = "extrato.pdf"
    elif case == "too_big":
        content = b"a" * (2 * 1024 * 1024 + 1)
    elif case == "bad_mapping_json":
        kw = {"preset": "personalizado", "mapping": "{nao e json"}
    else:
        content = b"x;y\n1;2\n"
    r = upload(api, account_id, content, name, **kw)
    assert r.status_code == 422, r.content
    assert ImportBatch.objects.count() == 0


def test_failed_parse_is_returned_with_error(api, acc):
    r = upload(api, acc.id, b"nada de ofx aqui", "x.ofx")
    assert r.status_code == 201
    assert r.json()["status"] == "failed"
    assert r.json()["error"]


def test_confirm_with_edits_and_learn(api, user, acc):
    cat = CategoryFactory(user=user, kind="expense", name="Mercado")
    batch_id = upload(api, acc.id).json()["id"]
    rows = api.get(f"/api/imports/{batch_id}").json()["rows"]
    r = api.post(
        f"/api/imports/{batch_id}/confirm",
        {"rows": [{"id": rows[0]["id"], "include": True, "category_id": cat.id}], "learn": True},
    )
    assert r.status_code == 200, r.json()
    assert r.json() == {"created": 2, "rules_learned": 1}
    assert Transaction.objects.filter(import_batch_id=batch_id).count() == 2
    assert api.post(f"/api/imports/{batch_id}/confirm", {"rows": []}).status_code == 409


def test_confirm_foreign_category_422(api, acc):
    batch_id = upload(api, acc.id).json()["id"]
    row = api.get(f"/api/imports/{batch_id}").json()["rows"][0]
    edit = {"id": row["id"], "include": True, "category_id": CategoryFactory(kind="expense").id}
    assert api.post(f"/api/imports/{batch_id}/confirm", {"rows": [edit]}).status_code == 422


def test_list_and_undo(api, acc):
    batch_id = upload(api, acc.id).json()["id"]
    api.post(f"/api/imports/{batch_id}/confirm", {"rows": []})
    listed = api.get("/api/imports").json()
    assert [(b["id"], b["status"], b["created_count"]) for b in listed] == [(batch_id, "done", 2)]
    assert api.delete(f"/api/imports/{batch_id}").status_code == 204
    assert not Transaction.objects.filter(import_batch_id=batch_id).exists()


def test_other_users_batch_404(api, acc):
    other = AccountFactory()
    batch = ImportBatch.objects.create(
        user=other.user, account=other, filename="x.csv", format="csv", raw=""
    )
    assert api.get(f"/api/imports/{batch.id}").status_code == 404
    assert api.post(f"/api/imports/{batch.id}/confirm", {"rows": []}).status_code == 404
    assert api.delete(f"/api/imports/{batch.id}").status_code == 404


def test_upload_requires_csrf(user, acc):
    from django.test import Client

    c = Client(enforce_csrf_checks=True)
    c.force_login(user)
    r = c.post("/api/imports", {"file": SimpleUploadedFile("x.csv", CSV), "account_id": acc.id})
    assert r.status_code == 403


# ---- regras ----
def test_rules_crud_normalizes_pattern(api, user):
    cat = CategoryFactory(user=user, kind="expense")
    r = api.post("/api/rules", {"pattern": "  UBER  Trip ", "category_id": cat.id})
    assert r.status_code == 201, r.json()
    body = r.json()
    assert (body["pattern"], body["kind"], body["priority"], body["active"]) == (
        "uber trip",
        "expense",
        0,
        True,
    )
    assert (
        api.post("/api/rules", {"pattern": "uber trip", "category_id": cat.id}).status_code == 409
    )
    rid = body["id"]
    assert api.patch(f"/api/rules/{rid}", {"active": False}).json()["active"] is False
    assert [x["id"] for x in api.get("/api/rules").json()] == [rid]
    assert api.delete(f"/api/rules/{rid}").status_code == 204
    assert not CategorizationRule.objects.exists()


def test_rule_with_foreign_category_422(api):
    r = api.post("/api/rules", {"pattern": "x", "category_id": CategoryFactory().id})
    assert r.status_code == 422
