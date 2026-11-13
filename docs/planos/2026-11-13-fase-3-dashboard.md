# Fase 3 (Painel e demo): plano de implementação

**Goal:** painel com KPIs, gráficos e listas + login de demonstração com 12 meses de dados.
**Spec:** [docs/specs/2026-11-13-fase-3-dashboard.md](../specs/2026-11-13-fase-3-dashboard.md)
**Branch:** `feat/fase-3-dashboard` (a partir de `develop`), um commit por tarefa, PR para `develop` e revisão de código ao final.

## Restrições globais
- Dinheiro como `Decimal` (string no JSON via `MoneyOut`). Toda query com `user=request.user`.
- Agregações no ORM (`TruncMonth`, `Sum`, `filter=Q(...)`), sem loop por lançamento em Python.
- Gráficos com Recharts, um eixo só, cores dos tokens `--chart-income` e `--chart-expense` (validadas pelo dataviz) e tabela sr-only equivalente.
- Testes do front pelo PowerShell (`c:\` minúsculo).

## Foco de revisão
1. Mês sem nenhum lançamento: todos os endpoints respondem com zeros ou listas vazias, nunca 500.
2. Transferências não entram em receitas, despesas nem patrimônio.
3. `month` inválido → 422. O front sempre manda um mês válido.
4. Demo: chamar `POST /auth/demo` duas vezes não duplica dados. Com `DEMO_ENABLED=False` → 404.
5. Mês de 31 dias, fevereiro e virada de ano no cálculo dos 12 meses.

---

### Task 1: endpoints `/dashboard`
- Create: `apps/finance/dashboard.py` (consultas puras), `apps/finance/api/dashboard.py` e `tests/test_dashboard_api.py`.
- Funções:
  - `month_bounds(month: str) -> (date, date)`
  - `summary(user, month) -> dict`
  - `cashflow(user, month) -> list[dict]`
  - `categories_breakdown(user, month, kind) -> list[dict]`
  - `top_expenses(user, month, limit)`
  - `pending(user, limit)`
- Testes:
  - KPIs com variação.
  - `savings_rate` null sem receita.
  - Cashflow com 12 meses atravessando o ano e o patrimônio acumulado.
  - Árvore de categorias com "Sem categoria".
  - Top 5 e pendentes ordenados.
  - Isolamento entre usuários.
  - Mês inválido → 422.
- Depois: export do OpenAPI + `api:gen`.

### Task 2: demo (`seed_demo` + `POST /auth/demo`)
- Create: `apps/finance/demo.py` (`seed_demo(user, today) -> None`), `apps/finance/management/commands/seed_demo.py` e testes.
- Modify: `apps/users/api.py` (rota `authDemo`), `config/settings.py` (`DEMO_ENABLED`, `DEMO_EMAIL`).
- Testes:
  - Seed cria 12 meses, é determinístico e não duplica.
  - `--reset` recria.
  - Endpoint loga o usuário (`/me` responde 200) e responde 404 quando desligado.

### Task 3: base dos gráficos no front
- `npm i recharts`.
- Tokens `--chart-income` e `--chart-expense` em `index.css`.
- Create:
  - `src/components/charts/ChartCard.tsx` (título, ações, skeleton, vazio).
  - `src/components/charts/ChartTooltip.tsx`.
  - `src/lib/useCountUp.ts` (respeita reduced motion).
- Teste do `useCountUp` (com reduced motion vai direto ao valor final).

### Task 4: painel
- Create: `src/pages/dashboard/{DashboardPage,KpiCards,CashflowChart,CategoryBreakdown,NetWorthChart,TopExpenses,PendingList}.tsx`.
- Comportamento: o mês fica na URL (`?mes=`), reaproveitando o `MonthSwitcher`.
- Testes:
  - KPIs formatados com variação.
  - Lista de categorias ordenada e drill-down mostra as subcategorias.
  - Maiores gastos e pendentes.
  - Estado vazio sem contas leva a Contas.

### Task 5: botão "Entrar como visitante"
- Modify: `LoginPage` (botão secundário).
- Teste: o clique chama `POST /api/auth/demo` e leva ao painel.

### Task 6: docs + verificação visual + revisão
- Create: `docs/documentacao/dashboard.md`.
- Modify: `auth.md` (demo), índice, README (Fase 3 ✓ e trecho "Experimente: entrar como visitante").
- Verificar: screenshots desktop e mobile, claro e escuro.
- Revisão de código da fase e correções antes do PR.
