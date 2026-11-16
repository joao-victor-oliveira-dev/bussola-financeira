import hmac

from django.conf import settings
from django.utils import timezone
from ninja import Header, Router
from ninja.errors import HttpError

from apps.finance.recurring import generate_all

router = Router(tags=["internal"])


@router.post("/daily", operation_id="internalDaily", auth=None)
def daily(request, x_cron_secret: Header[str | None] = None):
    """Tarefas diárias em produção sem worker pago (chamado pelo GitHub Actions agendado).

    Sem CRON_SECRET configurado o endpoint nem existe (404); segredo errado → 403.
    """
    expected = settings.CRON_SECRET
    if not expected:
        raise HttpError(404, "Não encontrado.")
    if not x_cron_secret or not hmac.compare_digest(x_cron_secret, expected):
        raise HttpError(403, "Proibido.")
    created = generate_all(timezone.localdate())
    demo_reset = False
    if settings.DEMO_ENABLED:
        from apps.finance.demo import get_demo_user, seed_demo

        seed_demo(get_demo_user(), reset=True)
        demo_reset = True
    return {"recurring_created": created, "demo_reset": demo_reset}
