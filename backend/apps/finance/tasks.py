from celery import shared_task
from django.conf import settings
from django.utils import timezone

from apps.finance.recurring import generate_all


@shared_task(name="finance.generate_all_recurring")
def generate_all_recurring() -> int:
    """Diário: ocorrências pendentes das regras ativas, até 60 dias à frente."""
    return generate_all(timezone.localdate())


@shared_task(name="finance.reset_demo")
def reset_demo() -> bool:
    """Diário: recria os dados do visitante (só com a demo ligada)."""
    if not settings.DEMO_ENABLED:
        return False
    from apps.finance.demo import get_demo_user, seed_demo

    seed_demo(get_demo_user(), reset=True)
    return True
