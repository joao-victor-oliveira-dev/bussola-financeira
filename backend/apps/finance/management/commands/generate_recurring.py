from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.finance.recurring import generate_all


class Command(BaseCommand):
    help = "Gera as ocorrências pendentes de todas as recorrências ativas (até 60 dias)."

    def handle(self, *args, **options):
        created = generate_all(timezone.localdate())
        self.stdout.write(self.style.SUCCESS(f"{created} ocorrência(s) criada(s)."))
