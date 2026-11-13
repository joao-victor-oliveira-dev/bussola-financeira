# Fase 1 — Fundação: Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Monorepo funcionando com API Django Ninja (auth por sessão) e SPA React (tema, layout, login/cadastro, rota protegida), com testes, CI e Docker Compose.

**Architecture:** `backend/` (Django 5 + Ninja, settings via env, SQLite em dev local e Postgres no CI/Docker/prod) e `frontend/` (Vite + React + TS). Em dev, o proxy do Vite manda `/api` para `localhost:8000`, mantendo a mesma origem para cookie de sessão e CSRF. O cliente TS é gerado do OpenAPI exportado pelo backend.

**Tech Stack:** Python 3.13, uv, Django 5.2, django-ninja, django-environ, pytest-django, ruff | Node 24, Vite, React 19, TypeScript, Tailwind v4, shadcn/ui, Motion, TanStack Query v5, React Router 7, react-hook-form + zod, orval, Vitest + Testing Library.

**Spec:** `docs/specs/2026-11-13-bussola-financeira-design.md` (Fase 1 da seção 9; seções 3, 5 e 8).

## Global Constraints

- UI em pt-BR. Mensagens de erro da API em pt-BR no formato `{"detail": "<mensagem>"}`.
- Auth = sessão Django + cookie httpOnly + CSRF. Nada de JWT nem token em localStorage.
- Toda API sob `/api/` com OpenAPI em `/api/docs`.
- Dark-first com toggle claro/escuro. Toda animação respeita `prefers-reduced-motion`.
- Celery/Redis **não** entram nesta fase (entram na Fase 4).
- Ambiente local sem Docker. Dev roda com `DATABASE_URL` padrão `sqlite:///db.sqlite3`. O Postgres é exercitado no CI.
- Ao fim de cada área: doc viva em `docs/documentacao/<area>.md` + status no índice.
- Commits: só se o autor autorizar no início da execução. Sem autorização, pule os passos "Commit".
- Decisão do Claude (desvio leve da spec §5): **um único `config/settings.py` guiado por env** no lugar de base/dev/prod, porque é menos arquivo e o mesmo efeito.

## Review Focus

1. **Caixa do e-mail:** cadastro com `Joao@X.com` e login com `joao@x.com` funcionam; cadastrar `JOAO@x.com` depois retorna 409. → Task 2 e Task 3.
2. **CSRF:** POST autenticado sem `X-CSRFToken` retorna 403. O cliente do front sempre envia o header. → Task 3 e Task 6.
3. **Sessão expira com o app aberto:** qualquer 401 da API limpa o cache e leva para `/login`. → Task 7.
4. **localStorage indisponível** (aba anônima/bloqueado): o app renderiza em tema escuro sem quebrar. → Task 5.
5. **Usuário logado acessando `/login` ou `/cadastro`:** é redirecionado para `/`. → Task 7.

---

### Task 1: Esqueleto do backend + health check

**Files:**
- Create: `backend/pyproject.toml`, `backend/manage.py`, `backend/config/{__init__,settings,urls,api,wsgi,asgi}.py`, `backend/.env.example`, `backend/conftest.py`
- Create: `backend/tests/test_health.py`
- Modify: `.gitignore` (raiz: `.env`, `*.sqlite3`, `.venv/`, `node_modules/`, `dist/`, `__pycache__/`, `.pytest_cache/`, `.ruff_cache/`)

**Interfaces:**
- Produces: `config.api.api: NinjaAPI` (title "Bússola Financeira API", version "1.0.0", `urls_namespace="api"`) montado em `path("api/", api.urls)`; outras apps registram routers com `api.add_router("/<prefixo>", router)`.
- Produces: env vars `SECRET_KEY`, `DEBUG` (bool, padrão False), `ALLOWED_HOSTS` (lista), `DATABASE_URL`, `CSRF_TRUSTED_ORIGINS` (lista).

- [ ] **Step 1:** `pip install uv`, depois `uv init --app backend` e `uv add django~=5.2 django-ninja django-environ` + `uv add --dev pytest pytest-django ruff factory-boy`. Configure pytest (`DJANGO_SETTINGS_MODULE=config.settings`, `pythonpath=["."]`) e ruff (line-length 100, regras `E,F,I,B,UP,DJ`) no `pyproject.toml`.
- [ ] **Step 2: Teste que falha**

```python
def test_health_returns_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}

def test_openapi_docs_available(client):
    assert client.get("/api/openapi.json").status_code == 200
```

- [ ] **Step 3:** `uv run pytest` → FAIL (404/import).
- [ ] **Step 4:** Implemente o settings com `environ.Env` (`LANGUAGE_CODE="pt-br"`, `TIME_ZONE="America/Sao_Paulo"`, `SESSION_COOKIE_HTTPONLY=True`, `CSRF_COOKIE_HTTPONLY=False` para o JS ler o token, `SESSION_COOKIE_SAMESITE="Lax"`, `secure` dos cookies = `not DEBUG`) e `config/api.py` com `@api.get("/health")`.
- [ ] **Step 5:** `uv run pytest && uv run ruff check . && uv run ruff format --check .` → tudo verde.
- [ ] **Step 6: Commit** `chore(backend): esqueleto Django + Ninja com health check`

### Task 2: Usuário customizado com login por e-mail

**Files:**
- Create: `backend/apps/__init__.py`, `backend/apps/users/{__init__,apps,models,managers,admin}.py`, `backend/apps/users/migrations/0001_initial.py` (gerada)
- Create: `backend/apps/users/tests/{__init__,factories,test_models}.py`
- Modify: `backend/config/settings.py` (`INSTALLED_APPS += "apps.users"`, `AUTH_USER_MODEL = "users.User"`)

**Interfaces:**
- Produces: `apps.users.models.User(AbstractBaseUser, PermissionsMixin)` com `email: EmailField(unique)`, `name: CharField(150)`, `is_active`, `is_staff`, `date_joined`; `USERNAME_FIELD="email"`, `REQUIRED_FIELDS=["name"]`.
- Produces: `UserManager.create_user(email: str, password: str | None = None, **extra) -> User` e `create_superuser(...)`. O e-mail é normalizado com `.strip().lower()` (inteiro, não só o domínio).
- Produces: `apps.users.tests.factories.UserFactory` (senha padrão `"senha-forte-123"`).

- [ ] **Step 1: Testes que falham**

```python
def test_create_user_lowercases_whole_email(db):
    u = User.objects.create_user(email="  Joao@X.COM ", password="x", name="João")
    assert u.email == "joao@x.com"
    assert u.check_password("x")

def test_email_unique_regardless_of_case(db):
    User.objects.create_user(email="a@x.com", password="x", name="A")
    with pytest.raises(IntegrityError):
        User.objects.create_user(email="A@X.com", password="x", name="B")

def test_create_superuser_flags(db):
    u = User.objects.create_superuser(email="admin@x.com", password="x", name="Admin")
    assert u.is_staff and u.is_superuser
```

- [ ] **Step 2:** `uv run pytest apps/users` → FAIL.
- [ ] **Step 3:** Implemente o model, o manager e o admin (`UserAdmin` adaptado: list `email, name, is_staff, date_joined`, sem username). Rode `uv run python manage.py makemigrations users`.
- [ ] **Step 4:** `uv run pytest` → PASS.
- [ ] **Step 5: Commit** `feat(users): usuário customizado com login por e-mail`

### Task 3: API de autenticação por sessão

**Files:**
- Create: `backend/apps/users/{schemas,api,services}.py`, `backend/apps/users/tests/test_auth_api.py`
- Modify: `backend/config/api.py` (`api.add_router("/auth", auth_router)`)
- Create: `docs/documentacao/auth.md`; Modify: `docs/documentacao/README.md` (status de `auth.md` → "ativo (Fase 1)")

**Interfaces:**
- Consumes: `User`, `UserManager.create_user`, `UserFactory` (Task 2).
- Produces endpoints (prefixo `/api/auth`):
  - `GET /csrf` → 200 `{"detail": "ok"}` + define o cookie `csrftoken` (`ensure_csrf_cookie`).
  - `POST /register` body `RegisterIn{name: str (1..150), email: EmailStr, password: str}` → 201 `UserOut` e já faz login. E-mail existente → 409 `{"detail": "E-mail já cadastrado."}`. Senha reprovada pelos `AUTH_PASSWORD_VALIDATORS` → 422 `{"detail": "<mensagens do Django unidas por ' '>"}`.
  - `POST /login` body `LoginIn{email: EmailStr, password: str}` → 200 `UserOut`. Inválido → 401 `{"detail": "E-mail ou senha inválidos."}`.
  - `POST /logout` (auth) → 204.
  - `GET /me` (auth) → 200 `UserOut`. Sem sessão → 401.
  - `UserOut{id: int, email: str, name: str}`.
- Auth das rotas protegidas: `ninja.security.django_auth` (sessão + checagem de CSRF). `register`/`login` não têm auth mas também exigem CSRF. Na versão instalada do Ninja, use o mecanismo suportado (o `csrf=True` do `NinjaAPI` está obsoleto nas versões recentes), por exemplo uma checagem com `django.middleware.csrf.CsrfViewMiddleware` num decorator `require_csrf`. O teste `test_post_without_csrf_token_403` valida o resultado.
- Produces: `apps.users.services.register_user(name, email, password) -> User` (valida senha, levanta `EmailTaken`).

- [ ] **Step 1: Testes que falham** (use `Client(enforce_csrf_checks=True)` e um helper `csrf_client()` que chama `/api/auth/csrf` e devolve client + token)

```python
def test_register_logs_in_and_returns_user(db): ...  # 201, depois GET /me == 200 com o mesmo email
def test_register_duplicate_email_case_insensitive_409(db): ...  # cria "a@x.com", registra "A@X.com" → 409, detail "E-mail já cadastrado."
def test_register_weak_password_422(db): ...  # password "123" → 422
def test_login_with_different_case_email(db): ...  # factory "joao@x.com", login "Joao@X.com" → 200
def test_login_wrong_password_401(db): ...  # detail "E-mail ou senha inválidos."
def test_me_without_session_401(db): ...
def test_logout_then_me_401(db): ...
def test_post_without_csrf_token_403(db): ...  # POST /login sem header X-CSRFToken → 403
```

- [ ] **Step 2:** `uv run pytest apps/users/tests/test_auth_api.py` → FAIL.
- [ ] **Step 3:** Implemente schemas, service e router (`django.contrib.auth.authenticate/login/logout`; normalize o e-mail antes de `authenticate`).
- [ ] **Step 4:** `uv run pytest && uv run ruff check .` → PASS.
- [ ] **Step 5:** Escreva `docs/documentacao/auth.md` no modelo do índice (endpoints, fluxo CSRF, regras de e-mail, como testar).
- [ ] **Step 6: Commit** `feat(auth): API de cadastro, login, logout e me por sessão`

### Task 4: Esqueleto do frontend

**Files:**
- Create: `frontend/` via `npm create vite@latest frontend -- --template react-ts`
- Create/Modify: `frontend/vite.config.ts` (plugin Tailwind v4, alias `@` → `src`, `server.proxy["/api"] = "http://localhost:8000"`, config `test` do Vitest com `jsdom` + `src/test/setup.ts`)
- Create: `frontend/src/test/setup.ts`, `frontend/src/App.test.tsx`, `frontend/.prettierrc`, `frontend/components.json` (shadcn init)

**Interfaces:**
- Produces: scripts npm `dev`, `build`, `lint`, `typecheck` (`tsc -b --noEmit`), `test` (`vitest run`), `format`.
- Produces: alias de import `@/…`; utilitário shadcn `cn()` em `src/lib/utils.ts`.

- [ ] **Step 1:** Scaffold + `npm i tailwindcss @tailwindcss/vite motion @tanstack/react-query react-router react-hook-form zod @hookform/resolvers lucide-react sonner` + `npm i -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom prettier`. Rode `npx shadcn@latest init` (base neutral, CSS variables).
- [ ] **Step 2: Teste que falha** `it("renderiza o nome do app", ...)`: render `<App/>` e `expect(screen.getByText("Bússola")).toBeInTheDocument()`.
- [ ] **Step 3:** `npm test` → FAIL. Ajuste `App.tsx` mínimo → PASS.
- [ ] **Step 4:** `npm run lint && npm run typecheck && npm run build` → verde.
- [ ] **Step 5: Commit** `chore(frontend): esqueleto Vite + React + Tailwind + shadcn`

### Task 5: Identidade visual, tokens e tema

**Files:**
- Modify: `frontend/src/index.css` (tokens CSS dark/light no formato do shadcn + tokens próprios `--income`, `--expense`, `--accent-glow`)
- Create: `frontend/src/theme/ThemeProvider.tsx`, `frontend/src/theme/ThemeToggle.tsx`, `frontend/src/theme/ThemeProvider.test.tsx`
- Modify: `frontend/index.html` (fontes via Google Fonts, `<meta name="theme-color">`)

**Interfaces:**
- Produces: `ThemeProvider({children})`, `useTheme(): { theme: "dark" | "light"; toggle(): void }`. Aplica a classe `dark` em `<html>`, persiste na chave `localStorage` `"bussola:theme"` e envolve leitura/escrita em try/catch. O padrão é `"dark"`.

- [ ] **Step 0:** Invoque a skill `frontend-design:frontend-design` para fixar fontes (títulos com personalidade + números tabulares), paleta (grafite + esmeralda/teal, receita verde, despesa coral) e estilo de card (spec §8). Registre as escolhas no topo de `index.css` em um comentário curto.
- [ ] **Step 1: Testes que falham**

```tsx
it("começa escuro por padrão", ...)            // html.classList contains "dark"
it("toggle alterna e persiste", ...)           // após toggle: sem "dark", localStorage["bussola:theme"] === "light"
it("funciona com localStorage quebrado", ...)  // vi.spyOn(Storage.prototype,"getItem").mockImplementation(()=>{throw new Error()}) → renderiza e fica "dark"
```

- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** Implemente → PASS.
- [ ] **Step 4: Commit** `feat(frontend): tokens visuais e tema claro/escuro`

### Task 6: Cliente da API gerado do OpenAPI

**Files:**
- Create: `backend/apps/users/management/commands/export_openapi.py` (escreve `frontend/openapi.json`)
- Create: `frontend/orval.config.ts`, `frontend/src/api/http.ts`, `frontend/src/api/http.test.ts`, `frontend/src/api/generated/` (saída do orval, versionada)
- Modify: `frontend/package.json` (script `"api:gen": "orval"`)

**Interfaces:**
- Consumes: endpoints da Task 3.
- Produces: `customFetch<T>(url: string, init: RequestInit): Promise<T>` (mutator do orval). Ele sempre usa `credentials: "include"`, envia `X-CSRFToken` lido do cookie `csrftoken` em métodos ≠ GET/HEAD e, em resposta não-ok, lança `ApiError{status: number, detail: string}`. 204 retorna `undefined`.
- Produces: hooks TanStack Query gerados (client `react-query`, modo `tags-split`), por exemplo `useUsersApiMe`, `useUsersApiLogin`; os nomes exatos saem do `operationId` do Ninja.
- Produces: `ensureCsrf(): Promise<void>` (chama `GET /api/auth/csrf` se o cookie não existir).

- [ ] **Step 1: Testes que falham** (mock de `fetch` e `document.cookie = "csrftoken=abc"`)

```ts
it("envia X-CSRFToken em POST", ...)      // headers["X-CSRFToken"] === "abc", credentials === "include"
it("não envia CSRF em GET", ...)
it("lança ApiError com detail", ...)      // resposta 401 {"detail":"x"} → rejects { status: 401, detail: "x" }
it("204 resolve undefined", ...)
```

- [ ] **Step 2:** FAIL → implemente `http.ts` → PASS.
- [ ] **Step 3:** `uv run python manage.py export_openapi` e depois `npm run api:gen`. Confirme que `npm run typecheck` passa com o código gerado.
- [ ] **Step 4: Commit** `feat(frontend): cliente tipado gerado do OpenAPI`

### Task 7: Autenticação no front + shell do app

**Files:**
- Create: `frontend/src/auth/{AuthProvider,RequireAuth,RedirectIfAuth}.tsx`, `frontend/src/pages/{LoginPage,RegisterPage,DashboardPage}.tsx`, `frontend/src/layout/{AppShell,Sidebar,BottomNav,PageTransition}.tsx`, `frontend/src/router.tsx`, `frontend/src/queryClient.ts`
- Test: `frontend/src/auth/auth.test.tsx`, `frontend/src/pages/LoginPage.test.tsx`
- Create: `docs/documentacao/frontend.md`; Modify: índice

**Interfaces:**
- Consumes: hooks gerados + `ApiError` + `ensureCsrf` (Task 6), `ThemeProvider` (Task 5).
- Produces: rotas `/login`, `/cadastro` (públicas, com `RedirectIfAuth`) e `/` (`RequireAuth` → `AppShell` → `DashboardPage` placeholder com saudação "Olá, {name}").
- Produces: `useAuth(): { user: UserOut | null; isLoading: boolean; logout(): Promise<void> }`.
- `queryClient`: `QueryCache.onError` com `ApiError.status === 401` em query fora de `/auth/me` → `queryClient.clear()` + navegação para `/login`. Retry desligado para 401/403.
- Layout: sidebar recolhível ≥ `md`, bottom nav < `md`. `PageTransition` usa `motion` com fade+slide de 8px e 200ms, desligado via `useReducedMotion()`.
- Copy: títulos "Entrar" / "Criar conta"; zod com mensagens "Informe um e-mail válido." e "A senha deve ter ao menos 8 caracteres." O erro da API aparece abaixo do form com o `detail`.

- [ ] **Step 1: Testes que falham** (mock do `fetch` por URL)

```tsx
it("sem sessão, / redireciona para /login", ...)            // /api/auth/me → 401
it("logado, /login redireciona para /", ...)                // me → 200
it("valida e-mail e senha antes de enviar", ...)            // submit vazio mostra as duas mensagens, fetch de login não chamado
it("login ok navega para / e mostra 'Olá, João'", ...)
it("login 401 mostra 'E-mail ou senha inválidos.'", ...)
it("401 em query qualquer leva para /login", ...)           // me 200 e depois 401 numa query → /login
```

- [ ] **Step 2:** FAIL → implemente (aplique a direção visual da Task 5: cards com profundidade, entrada em cascata no form, botão com estado de loading) → PASS.
- [ ] **Step 3: Verificação manual:** `uv run python manage.py migrate && uv run python manage.py runserver` + `npm run dev`. Cadastre, saia, entre, alterne o tema e confira o mobile em 375px. Abra `/api/docs`.
- [ ] **Step 4:** Escreva `docs/documentacao/frontend.md` (estrutura, tema, cliente gerado, como regenerar, padrões de animação).
- [ ] **Step 5: Commit** `feat(frontend): login, cadastro, rota protegida e layout do app`

### Task 8: Docker Compose + CI + docs de arquitetura

**Files:**
- Create: `backend/Dockerfile` (python:3.13-slim + uv; `gunicorn config.wsgi`), `frontend/Dockerfile` (dev: `npm run dev -- --host`), `docker-compose.yml` (`db` postgres:17, `backend` com `DATABASE_URL=postgres://bussola:bussola@db:5432/bussola` e migrate no start, `frontend` com proxy apontando para `http://backend:8000` via env `VITE_API_PROXY`)
- Create: `.github/workflows/ci.yml`
- Modify: `frontend/vite.config.ts` (target do proxy = `process.env.VITE_API_PROXY ?? "http://localhost:8000"`); `backend/pyproject.toml` (`uv add gunicorn "psycopg[binary]"`)
- Create: `docs/documentacao/arquitetura.md`; Modify: índice, `README.md` (seção "Como rodar": sem Docker e com Docker; roadmap: Fase 1 marcada)

**Interfaces:**
- CI jobs: `backend` (service postgres:17; `uv sync`, `ruff check`, `ruff format --check`, `pytest` com `DATABASE_URL` do Postgres), `frontend` (`npm ci`, `lint`, `typecheck`, `test`, `build`), `openapi-sync` (exporta o OpenAPI, roda `api:gen` e falha se `git diff --exit-code frontend/src/api/generated frontend/openapi.json` não for vazio), `docker` (`docker compose build`).

- [ ] **Step 1:** Escreva os arquivos. Valide o YAML localmente com `npx --yes yaml-lint .github/workflows/ci.yml docker-compose.yml`. Docker não existe na máquina local, então o build do compose é verificado só no CI.
- [ ] **Step 2:** Rode localmente tudo o que o CI roda, exceto Docker → verde.
- [ ] **Step 3:** Escreva `docs/documentacao/arquitetura.md` e atualize o README e o índice.
- [ ] **Step 4: Commit** `ci: pipeline de lint/testes/build e docker compose`. Peça autorização ao autor antes de qualquer `push` para ver o CI rodar.
