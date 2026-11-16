import hmac

from django.conf import settings
from ninja import Header, Router
from ninja.errors import HttpError

from apps.finance import tasks

router = Router(tags=["internal"])


@router.post("/daily", operation_id="internalDaily", auth=None, include_in_schema=False)
def daily(request, x_cron_secret: Header[str | None] = None):
    """Tarefas diárias em produção sem worker pago (chamado pelo GitHub Actions agendado).

    Mesmas tarefas do Celery beat (uma lógica só). Fora do OpenAPI público.
    Sem CRON_SECRET configurado o endpoint nem existe (404); segredo errado → 403.
    Repetir a chamada é seguro: a geração é idempotente e o reset da demo trava o usuário.
    """
    expected = settings.CRON_SECRET
    if not expected:
        raise HttpError(404, "Não encontrado.")
    if not x_cron_secret or not hmac.compare_digest(x_cron_secret, expected):
        raise HttpError(403, "Proibido.")
    return {"recurring_created": tasks.generate_all_recurring(), "demo_reset": tasks.reset_demo()}
