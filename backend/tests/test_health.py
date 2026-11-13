def test_health_returns_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_openapi_docs_available(client):
    assert client.get("/api/openapi.json").status_code == 200
