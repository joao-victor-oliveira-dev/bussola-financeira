import json

from django.core.management import call_command


def test_export_openapi_writes_schema(tmp_path):
    out = tmp_path / "openapi.json"
    call_command("export_openapi", output=str(out))
    schema = json.loads(out.read_text(encoding="utf-8"))
    assert "/api/auth/login" in schema["paths"]
    assert schema["info"]["title"] == "Bússola Financeira API"
