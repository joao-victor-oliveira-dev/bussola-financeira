# Orçamento

## O que faz
O usuário define um limite mensal de gasto por categoria principal de despesa e acompanha quanto já foi. A barra muda de cor e de rótulo perto do limite (80%) e quando estoura (100%). O painel mostra as 5 categorias mais apertadas. A spec está em [`docs/specs/2026-11-15-fase-5-orcamento.md`](../specs/2026-11-15-fase-5-orcamento.md).

## Onde está o código
| Camada | Arquivo | Papel |
|---|---|---|
| Modelo | `backend/apps/finance/models.py` | `Budget` (user, category, month `YYYY-MM`, limit) |
| Regras | `backend/apps/finance/budgets.py` | `budget_overview`, `copy_budgets`, `status_of`, `percent_of` |
| API | `backend/apps/finance/api/budgets.py` | Resumo, CRUD e cópia |
| Tela | `frontend/src/pages/budget/` | `BudgetPage`, `BudgetFormDialog`, `BudgetMeter` (`BudgetBar`, `BudgetStatusLabel`) |
| Painel | `frontend/src/pages/dashboard/BudgetWidget.tsx` | "Orçamento do mês" |

## Regras
- **Só categoria principal de despesa:** subcategorias contam dentro da principal, então nada é contado em dois orçamentos. Uma subcategoria, uma categoria de receita ou uma categoria de outro usuário → 422.
- **Um orçamento por (usuário, categoria, mês):** duplicado → 409. O limite tem de ser > 0 (constraint no banco).
- **Gasto:**
  - Entram as despesas do mês, **efetivadas e pendentes**, e as compras no cartão pela data da compra.
  - Ficam de fora as transferências, os pagamentos de fatura e os lançamentos sem categoria. Estes últimos não têm orçamento possível.
  - É agregado no banco pela categoria principal (`Coalesce(parent_id, id)`).
- **Situação:** `ok` abaixo de 80%, `warning` de 80% a menos de 100%, `over` a partir de 100%.
  - O `percent` é arredondado **para baixo** com 1 casa, então 99,96% aparece "99.9" e não "100.0".
  - A situação usa o valor exato, não o arredondado.
- **Ordem:** pelo maior percentual primeiro.
- **Copiar do mês anterior** (ou de `from_month`): cria só os orçamentos que ainda não existem no mês de destino. Nunca sobrescreve um limite editado. Rodar duas vezes cria 0 na segunda.
- **Gastos sem orçamento:** categorias principais com despesa no mês e sem orçamento. A tela oferece "Definir limite".
- **Categoria com orçamento:** excluir → 409, e ela não pode virar subcategoria (422). Remova o orçamento antes.
- **Copiar** ignora orçamentos que deixaram de ser válidos (a categoria virou subcategoria).
- **`totals`** traz `percent` e `status` calculados no servidor, com a mesma regra dos itens. O front não recalcula.

## Endpoints
| Rota | Notas |
|---|---|
| `GET /api/budgets?month=YYYY-MM` | `{month, items[], totals{limit, spent, remaining, percent, status}, unbudgeted[]}` |
| `POST /api/budgets` | `{category_id, month, limit}` → 201 com o item calculado |
| `PATCH /api/budgets/{id}` | `{limit}` |
| `DELETE /api/budgets/{id}` | 204 |
| `POST /api/budgets/copy` | `{to_month, from_month?}` → `{created}`. A rota é declarada antes de `/{id}` para o POST não cair nela (405). |

## Telas
- **Orçamento** (`/orcamento?mes=`):
  - Total do mês com uma barra geral e o texto "Faltam R$ X", "Limite atingido" ou "R$ X acima".
  - Cartões em formato "meter list": ponto de cor da categoria, %, barra, "R$ gasto de R$ limite", rótulo de situação com ícone e o restante.
  - Clicar edita ou remove.
  - "Novo orçamento" lista só as principais de despesa sem orçamento no mês.
  - Mês vazio: "Copiar do mês anterior".
- **Cores das barras:** primária (ok), latão (perto) e coral (estourou). A situação sempre vem também em texto e ícone, nunca só na cor (guia de visualização).
- **Painel:** o widget mostra as 5 categorias de maior % com "Ver orçamento". Sem orçamento, mostra o convite "Definir orçamento".
- Lançamentos novos ou editados invalidam `/api/budgets*` (`invalidateMoney`).

## Demo
Orçamentos dos 3 últimos meses para 8 categorias. No mês atual há uma estourada (Assinaturas), uma perto do limite (Moradia) e o resto dentro.

## Como testar
- Backend: `pytest apps/finance/tests/test_budgets.py`, que cobre gasto, limiares nas bordas, cópia, 409, 422 e isolamento.
- Front: `src/pages/budget/BudgetPage.test.tsx` e os testes do widget em `DashboardPage.test.tsx`.

## Histórico de mudanças
- 2026-11-15: criação (Fase 5).
- 2026-11-16: revisão da Fase 5. Categoria com orçamento protegida (409/422), cópia só de válidos, `totals` com `percent`/`status`, "Limite atingido", `invalidateBudgets` (o catálogo também invalida) e POST/PATCH calculando só o item.
