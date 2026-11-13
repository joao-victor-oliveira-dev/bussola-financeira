# Frontend

## O que faz
SPA React que consome a API Django por sessão (cookie) na mesma origem. Fase 1: login, cadastro, rota protegida, layout do app (sidebar/bottom nav), tema claro/escuro e painel inicial vazio.

## Onde está o código (`frontend/src`)
| Pasta/arquivo | Papel |
|---|---|
| `main.tsx` | Providers (tema, TanStack Query, router, toasts) |
| `router.tsx` | `routes`: públicas (`/login`, `/cadastro`) e protegidas dentro do `AppShell` |
| `queryClient.ts` | `createQueryClient()`: retry, `ME_KEY` e tratamento global de 401 |
| `auth/useAuth.ts` | `useAuth()` → `{ user, isLoading, setUser, logout }` (o "me" vive no cache do Query) |
| `auth/guards.tsx` | `RequireAuth` (sem sessão → `/login`) e `RedirectIfAuth` (logado → `/`) |
| `api/http.ts` | `customFetch` (sessão + `X-CSRFToken`, `ApiError`), `ensureCsrf()` |
| `api/generated/` | **gerado** pelo orval, não editar |
| `layout/` | `AppShell`, `Sidebar` (recolhível), `BottomNav` (mobile), `Topbar`, `nav.ts` |
| `pages/` | Páginas + `AuthLayout` + schemas zod |
| `components/` | `Logo`/`NeedleMark`, `CompassRose`, `FormField`, `FormError`, `SubmitButton`, `ui/` (shadcn) |
| `theme/` | `ThemeProvider`/`useTheme`, `ThemeToggle` |

## Cliente da API (gerado)
1. O backend exporta o schema: `cd backend && python manage.py export_openapi` (grava `frontend/openapi.json`).
2. O front gera hooks tipados: `cd frontend && npm run api:gen`.
3. Use `useAuthMe`, `useAuthLogin` etc. Os nomes vêm do `operation_id` de cada rota no Ninja; **sempre defina `operation_id` em camelCase** ao criar rotas novas.
4. O CI falha se `openapi.json`/`generated/` estiverem desatualizados.

## Sessão e erros
- Antes de POST de login/cadastro, chame `ensureCsrf()`.
- Qualquer **401** em query (exceto o próprio `me`) ou em mutation com usuário logado limpa o cache e zera o `me`; o `RequireAuth` então leva a `/login`.
- `ApiError.detail` sempre traz uma mensagem legível (inclusive para 422 do Ninja e respostas não-JSON).

## Direção visual
- Tokens em `src/index.css` (formato shadcn + `--brass`, `--income`, `--expense`, `--surface-raised`). Use as classes `bg-brass`, `text-income`, `text-expense` etc.
- Tema: dark-first; classe `dark` no `<html>`; preferência salva em `localStorage["bussola:theme"]` (com fallback se o storage estiver bloqueado).
- Fonte Schibsted Grotesk (self-hosted). Use `tabular-nums` em valores monetários.
- Elemento marcante: a agulha de latão (logo, item ativo da navegação via `layoutId`, rosa dos ventos do login). Não espalhe o latão por outros lugares.
- Movimento: um momento orquestrado por tela (a agulha no login) + respostas a ações (troca de página, toggle). Sempre use `useReducedMotion()`; o CSS global também zera animações com `prefers-reduced-motion`.

## Como testar
`cd frontend && npm test` (Vitest + Testing Library). `src/test/renderApp.tsx` renderiza o app inteiro numa rota com `fetch` mockado por `"MÉTODO /url"`.

## Histórico de mudanças
- 2026-11-13: criação (Fase 1).
