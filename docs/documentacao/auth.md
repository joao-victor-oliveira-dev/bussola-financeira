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
| GET | `/me` | sessão | 200 `UserOut` · 401 |

Erros sempre seguem o formato `{"detail": "<mensagem em pt-BR>"}`.

## Fluxo CSRF (front)
1. Chame `GET /api/auth/csrf` uma vez, o que grava o cookie `csrftoken` (legível por JS).
2. Em todo método diferente de GET/HEAD, envie o header `X-CSRFToken: <valor do cookie>`.
3. O login rotaciona o token, então sempre leia o cookie na hora da requisição, nunca use cache.

## Regras e casos-limite
- O e-mail é normalizado com `strip().lower()` no cadastro e no login, por isso `Joao@X.com` e `joao@x.com` são a mesma conta.
- A senha passa pelos `AUTH_PASSWORD_VALIDATORS` do Django; as mensagens vêm unidas em `detail`.
- Rotas sem autenticação (`register`, `login`) checam CSRF via `require_csrf`. As autenticadas são checadas pelo `django_auth` do Ninja.

## Como testar
`cd backend && pytest apps/users`

## Histórico de mudanças
- 2026-11-13: criação (Fase 1).
