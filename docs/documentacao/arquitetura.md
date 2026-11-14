# Arquitetura e infraestrutura

## O que faz
Monorepo com API Django (`backend/`) e SPA React (`frontend/`). Em dev e em produção, o navegador vê **uma única origem**: o front faz proxy de `/api/*` para o backend. É isso que permite sessão por cookie + CSRF sem `SameSite=None`.

## Onde está o código
| Caminho | Papel |
|---|---|
| `backend/config/settings.py` | Settings únicos guiados por env (`django-environ`) |
| `backend/config/api.py` | `NinjaAPI` raiz. Cada app registra seu router com `api.add_router` |
| `backend/apps/<app>/` | `models`, `schemas`, `api` (router), `services` (regra de negócio), `tests/` |
| `frontend/vite.config.ts` | Proxy `/api` → `VITE_API_PROXY` (padrão `http://localhost:8000`) |
| `docker-compose.yml` | `db` (Postgres 17), `backend` (runserver), `frontend` (Vite) |
| `.github/workflows/ci.yml` | Jobs `backend`, `frontend`, `openapi-sync`, `docker` |

## Variáveis de ambiente (backend)
| Variável | Padrão | Uso |
|---|---|---|
| `SECRET_KEY` | inseguro de dev | Obrigatória em produção |
| `DEBUG` | `False` | Com `False`, cookies ficam `Secure` |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Lista separada por vírgula |
| `DATABASE_URL` | `sqlite:///backend/db.sqlite3` | Postgres no Docker/CI/prod |
| `CSRF_TRUSTED_ORIGINS` | vazio | Ex.: `http://localhost:5173` |

Copie `backend/.env.example` para `backend/.env` em dev (o `.env` não é versionado).

## Convenções
- Camadas: `api.py` só valida/serializa; regra em `services.py`; consultas sempre filtradas por `request.user`.
- Dinheiro: `DecimalField`, string no JSON, nunca float.
- Toda rota Ninja tem `operation_id` em camelCase (vira nome de hook no front).
- Ferramentas: `pip` + `requirements.txt`/`requirements-dev.txt` (Python), `ruff` (lint/format), `pytest`; `npm`, `oxlint`, `prettier`, `vitest`.
- Line endings: `.gitattributes` força LF.

## CI (GitHub Actions)
- **backend**: ruff, format, `makemigrations --check`, pytest contra Postgres 17.
- **frontend**: oxlint, prettier, typecheck, vitest, build.
- **openapi-sync**: reexporta o OpenAPI, regenera o cliente e falha se houver diff (garante front e API em sincronia).
- **docker**: `docker compose build`.

## Deploy (planejado, Fase 7)
API + worker no Render (Postgres/Redis gerenciados); front estático na Vercel com rewrite `/api/*` → API.

## Como testar
Veja "Como rodar" no `README.md`.

## Histórico de mudanças
- 2026-11-13: criação (Fase 1). Desvio da spec: settings único por env em vez de base/dev/prod.
- 2026-11-13: fluxo de branches — trabalho em `feat/*`/`fix/*` a partir de `develop`, PRs para `develop`, `main` recebe `develop` sob demanda; CI roda em push para `main` e `develop` e em todo PR.
- 2026-11-13: uv substituído por pip + `requirements.txt` (produção) e `requirements-dev.txt` (desenvolvimento).
- 2026-11-14: Celery + Redis (Fase 4). O docker-compose ganha `redis`, `worker` e `beat`; sem `CELERY_BROKER_URL` as tarefas rodam na hora (eager). Detalhes em `recorrencias.md`.
