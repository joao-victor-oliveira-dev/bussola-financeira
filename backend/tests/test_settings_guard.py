import os
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent


def _load_settings(**env):
    return subprocess.run(
        [sys.executable, "-c", "import django; django.setup()"],
        cwd=BACKEND,
        env={**os.environ, "DJANGO_SETTINGS_MODULE": "config.settings", **env},
        capture_output=True,
        text=True,
    )


def test_production_without_secret_key_refuses_to_start():
    r = _load_settings(DEBUG="False", SECRET_KEY="")
    assert r.returncode != 0
    assert "SECRET_KEY" in r.stderr


def test_production_with_secret_key_starts():
    assert _load_settings(DEBUG="False", SECRET_KEY="uma-chave-real").returncode == 0
