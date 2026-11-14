from ninja import NinjaAPI
from ninja.errors import AuthenticationError

from apps.finance.api.accounts import router as accounts_router
from apps.finance.api.cards import router as cards_router
from apps.finance.api.categories import router as categories_router
from apps.finance.api.dashboard import router as dashboard_router
from apps.finance.api.tags import router as tags_router
from apps.finance.api.transactions import router as transactions_router
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
api.add_router("/cards", cards_router)
api.add_router("/categories", categories_router)
api.add_router("/tags", tags_router)
api.add_router("/transactions", transactions_router)
api.add_router("/dashboard", dashboard_router)
