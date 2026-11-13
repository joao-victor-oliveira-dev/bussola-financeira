from ninja import NinjaAPI

api = NinjaAPI(title="Bússola Financeira API", version="1.0.0", urls_namespace="api")


@api.get("/health", tags=["infra"])
def health(request):
    return {"status": "ok"}
