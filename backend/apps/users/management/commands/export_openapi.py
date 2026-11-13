import json
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from config.api import api

DEFAULT_OUTPUT = Path(settings.BASE_DIR).parent / "frontend" / "openapi.json"


class Command(BaseCommand):
    help = "Exporta o schema OpenAPI da API (usado pelo orval para gerar o cliente do front)."

    def add_arguments(self, parser):
        parser.add_argument("--output", default=str(DEFAULT_OUTPUT))

    def handle(self, *args, output: str, **options):
        schema = api.get_openapi_schema()
        path = Path(output)
        path.write_text(
            json.dumps(schema, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        self.stdout.write(self.style.SUCCESS(f"OpenAPI exportado em {path}"))
