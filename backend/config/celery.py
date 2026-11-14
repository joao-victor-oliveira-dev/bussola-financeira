"""Celery do Bússola. Sem broker configurado (dev local, testes), as tarefas rodam na hora."""

import os

from celery import Celery

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("bussola")
app.config_from_object("django.conf:settings", namespace="CELERY")
app.autodiscover_tasks()
