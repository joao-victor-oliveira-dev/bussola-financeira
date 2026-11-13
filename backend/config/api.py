from ninja import NinjaAPI
from ninja.errors import AuthenticationError

from apps.finance.api.accounts import router as accounts_router
from apps.users.api import router as auth_router

api = NinjaAPI(title="Bússola Financeira API", version="1.0.0", urls_namespace="api")


@api.exception_handler(AuthenticationError)
def on_unauthenticated(request, exc):
    return api.create_response(request, {"detail": "Não autenticado."}, status=401)


@api.get("/health", tags=["infra"], operation_id="health")
def health(request):
    return {"status": "ok"}


api.add_router("/auth", auth_router)
api.add_router("/accounts", accounts_router)
