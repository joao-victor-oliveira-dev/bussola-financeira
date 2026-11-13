from django.core.management.base import BaseCommand

from apps.finance.demo import get_demo_user, seed_demo


class Command(BaseCommand):
    help = "Cria (ou recria com --reset) o usuário de demonstração com 12 meses de dados."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Apaga e gera os dados de novo.")

    def handle(self, *args, reset=False, **options):
        user = get_demo_user()
        seed_demo(user, reset=reset)
        self.stdout.write(self.style.SUCCESS(f"Demo pronta: {user.email}"))
