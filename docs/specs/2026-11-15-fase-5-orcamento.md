# Fase 5: Orçamento mensal

**Status:** decidido pelo Claude (autorizado: "caso haja perguntas, siga o seu recomendado"), 2026-11-15
**Design-mãe:** [2026-11-13-bussola-financeira-design.md](2026-11-13-bussola-financeira-design.md) (Budget, seção 6; tela de Orçamento, seção 7)

## Intenção

O usuário define quanto quer gastar por categoria no mês e acompanha, sem fazer conta, quanto já foi e quanto falta. O orçamento ganha cor quando se aproxima do limite (80%) e quando estoura (100%). O painel mostra as categorias mais apertadas.

## Escopo

**Dentro:**
- Modelo `Budget`.
- API de orçamentos com gasto calculado, "copiar do mês anterior" e lista de gastos sem orçamento.
- Tela `/orcamento`.
- Widget "Orçamento do mês" no painel.
- Orçamentos na demo.

**Fora:** alertas por e-mail ou push, orçamento por tag, rollover do saldo não usado para o mês seguinte.

## Regras

- **Categoria:** o orçamento é por **categoria principal de despesa**. Subcategorias contam dentro da principal. Uma subcategoria ou uma categoria de receita → 422. Assim nada é contado em dois orçamentos.
- **Unicidade:** um orçamento por (usuário, categoria, mês). Duplicado → 409. O limite tem de ser > 0.
- **Gasto do mês:** despesas com data no mês, **efetivadas e pendentes** (igual aos totais do painel e da tela Lançamentos). Entram as compras no cartão pela data da compra. Ficam de fora as transferências e os pagamentos de fatura.
- **Situação:**
  - `ok` abaixo de 80%.
  - `warning` de 80% a menos de 100%.
  - `over` em 100% ou mais.

  A tela sempre mostra o texto junto com a cor: "Dentro do limite", "Perto do limite", "Estourou".
- **Copiar do mês anterior:** copia os limites do mês anterior (ou de `from_month`) que ainda não existem no mês de destino. Não sobrescreve nada. Responde quantos orçamentos criou.
- **Gastos sem orçamento:** categorias principais com despesa no mês e sem orçamento, para o usuário definir um limite com um clique.

## API (`/api/budgets`, sessão obrigatória)

| Rota | Notas |
|---|---|
| `GET /budgets?month=YYYY-MM` | `{month, items[], totals{limit, spent, remaining}, unbudgeted[]}`. Cada item tem `{id, category_id, category_name, color, limit, spent, remaining, percent, status}`. A ordem é a do maior `percent`. |
| `POST /budgets` | `{category_id, month, limit}` → 201 |
| `PATCH /budgets/{id}` | `{limit}` |
| `DELETE /budgets/{id}` | 204 |
| `POST /budgets/copy` | `{to_month, from_month?}` → `{created}` |

`percent` vai como string com 1 casa (`"87.5"`). O dinheiro vai em string decimal.

## Telas

- **Orçamento** (`/orcamento`):
  - Seletor de mês e resumo (orçado, gasto, restante, com uma barra geral).
  - Lista em formato "meter list" do guia de visualização: nome com o ponto de cor da categoria, barra de progresso e valores "R$ 450 de R$ 600". A barra muda de cor com a situação e sempre vem com o rótulo em texto.
  - Clicar num item edita o limite (ou exclui).
  - Botão "Novo orçamento" (só categorias principais sem orçamento no mês).
  - "Copiar do mês anterior" quando o mês está vazio.
  - Seção "Gastos sem orçamento", com "Definir limite".
- **Painel:** o card "Orçamento do mês" mostra as 5 categorias com maior percentual, com link para a tela de Orçamento. Se não houver orçamento, mostra um convite para criar.

## Critério de pronto

Testes de backend para:
- Gasto incluindo subcategorias e compras no cartão, e excluindo transferências e outros meses.
- Os limiares de 80% e 100%.
- Copiar sem sobrescrever.
- Validação de categoria.
- Isolamento entre usuários.

Testes de front para a tela, o diálogo e o widget. Doc viva `orcamento.md`. Revisão de código ao final.
