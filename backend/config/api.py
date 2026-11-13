from ninja import NinjaAPI

from apps.users.api import router as auth_router

api = NinjaAPI(title="Bússola Financeira API", version="1.0.0", urls_namespace="api")


@api.get("/health", tags=["infra"], operation_id="health")
def health(request):
    return {"status": "ok"}


api.add_router("/auth", auth_router)
