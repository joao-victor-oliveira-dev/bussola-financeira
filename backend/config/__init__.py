# Carrega o Celery junto com o Django (para @shared_task usar este app).
from config.celery import app as celery_app

__all__ = ("celery_app",)
