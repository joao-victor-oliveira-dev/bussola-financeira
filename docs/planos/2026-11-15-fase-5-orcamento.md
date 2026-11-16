# Fase 5 (Orçamento): plano de implementação

**Goal:** orçamento mensal por categoria com acompanhamento de gasto, cópia do mês anterior e widget no painel.
**Spec:** [docs/specs/2026-11-15-fase-5-orcamento.md](../specs/2026-11-15-fase-5-orcamento.md)
**Branch:** `feat/fase-5-orcamento` (a partir de `develop`), um commit por tarefa, revisão de código ao final e PR para `develop`.

## Foco de revisão
1. A despesa de uma subcategoria conta no orçamento da principal, e nada é contado duas vezes.
2. Pagamento de fatura (transferência) e despesas de outro mês não entram no gasto.
3. Exatamente 80% → `warning`, exatamente 100% → `over`. O percentual com 1 casa não arredonda 99,96% para "100.0" e `ok`.
4. Copiar duas vezes não duplica nem sobrescreve um limite editado.
5. Categoria de outro usuário, subcategoria ou categoria de receita → 422.

---

### Task 1: modelo + serviço + API
- `Budget` (user, category FK PROTECT, month `YYYY-MM`, limit) com unique e limit > 0.
- `apps/finance/budgets.py`: `budget_overview(user, month) -> dict` e `copy_budgets(user, to_month, from_month=None) -> int`.
- `api/budgets.py`.
- Testes: as 5 linhas do foco de revisão, CRUD, 409, 422 e isolamento.

### Task 2: demo
- Orçamentos para os 3 últimos meses nas categorias principais de despesa. Pelo menos um em `warning` e um em `over` no mês atual.

### Task 3: tela Orçamento
- `pages/budget/{BudgetPage,BudgetFormDialog,BudgetMeter}.tsx`.
- Testes: lista com rótulos de situação, criar (só principais sem orçamento), copiar do mês anterior, gastos sem orçamento e editar o limite.

### Task 4: widget no painel
- `pages/dashboard/BudgetWidget.tsx`, usando `GET /budgets?month=`.
- Testes: top 5 por percentual e o convite quando está vazio.

### Task 5: docs + verificação visual + revisão + PR
