# Autenticação

## O que faz
Cadastro, login, logout e "quem sou eu" por **sessão do Django** (cookie `sessionid` httpOnly) com proteção **CSRF**. Não usa JWT nem token no localStorage.

## Onde está o código
- `backend/apps/users/models.py`: `User` (login por e-mail, sem username) e `managers.py` (`normalize_email`)
- `backend/apps/users/api.py`: router `/api/auth` e decorator `require_csrf`
- `backend/apps/users/services.py`: `register_user` (valida senha, levanta `EmailTaken`/`WeakPassword`)
- `backend/apps/users/schemas.py`: `RegisterIn`, `LoginIn`, `UserOut`, `DetailOut`

## Endpoints (`/api/auth`)
| Método | Rota | Auth | Resposta |
|---|---|---|---|
| GET | `/csrf` | — | 200 `{"detail":"ok"}` + cookie `csrftoken` |
| POST | `/register` | CSRF | 201 `UserOut` e já loga · 409 e-mail já cadastrado · 422 senha fraca |
| POST | `/login` | CSRF | 200 `UserOut` · 401 `E-mail ou senha inválidos.` |
| POST | `/logout` | sessão + CSRF | 204 |
| GET | `/me` | sessão | 200 `UserOut` · 401 `Não autenticado.` |
| POST | `/demo` | CSRF | 200 `UserOut` e loga como visitante · 404 se `DEMO_ENABLED=False` |

Erros sempre seguem o formato `{"detail": "<mensagem em pt-BR>"}`.

## Fluxo CSRF (front)
1. Chame `GET /api/auth/csrf` uma vez, o que grava o cookie `csrftoken` (legível por JS).
2. Em todo método diferente de GET/HEAD, envie o header `X-CSRFToken: <valor do cookie>`.
3. O login rotaciona o token, então sempre leia o cookie na hora da requisição, nunca use cache.

## Regras e casos-limite
- O e-mail é normalizado com `strip().lower()` no cadastro e no login, por isso `Joao@X.com` e `joao@x.com` são a mesma conta.
- A senha passa pelos `AUTH_PASSWORD_VALIDATORS` do Django; as mensagens vêm unidas em `detail`.
- Rotas sem autenticação (`register`, `login`) checam CSRF via `require_csrf`. As autenticadas são checadas pelo `django_auth` do Ninja.

## Usuário de demonstração
- O botão **Entrar como visitante**, no login, chama `POST /api/auth/demo`. Ele entra como `DEMO_EMAIL` (padrão `demo@bussola.app`, nome "Visitante").
- Esse usuário não tem senha utilizável (`set_unusable_password`), então só entra por esse endpoint.
- Na primeira vez, `seed_demo` gera 12 meses de dados determinísticos (`random.Random(42)`). Chamadas seguintes não duplicam nada.
- Reset manual: `python manage.py seed_demo --reset`. O reset diário automático é a tarefa Celery `finance.reset_demo` (beat). A demo inclui cartão com faturas pagas, 2 parcelamentos e recorrências.
- **Desligado por padrão** (`DEMO_ENABLED=False`): ligue no `.env` (o `.env.example` e o docker-compose já vêm com `True`). Desligado, o endpoint responde 404.
- O e-mail da demo é **reservado**: o cadastro com ele responde 409. Se existir uma conta real (com senha) com esse e-mail, a demo responde 404 e nunca entra nela.
- Quando a demo fica sem contas (um visitante apagou tudo), o próximo login gera os dados de novo do zero, ignorando tags ou categorias que tenham sobrado. Dois primeiros acessos simultâneos não geram 500.
- Código: `apps/finance/demo.py` (`seed_demo`, `get_demo_user`) e `apps/finance/management/commands/seed_demo.py`.

## Como testar
`cd backend && pytest apps/users`

## Histórico de mudanças
- 2026-11-13: criação (Fase 1).
- 2026-11-13: o cadastro também cria as categorias padrão (veja `financas.md`), e o 401 de rotas com sessão passou a vir em português (`Não autenticado.`, handler em `config/api.py`).
- 2026-11-13: login de demonstração (`POST /auth/demo`, comando `seed_demo`), na Fase 3.
- 2026-11-13: revisão da Fase 3. Demo desligada por padrão, e-mail reservado, recuperação após dados apagados e tolerância a corrida.
