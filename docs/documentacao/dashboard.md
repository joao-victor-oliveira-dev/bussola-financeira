# Painel e agregações

## O que faz
A rota `/` mostra o mês escolhido em um olhar: KPIs com variação, fluxo de caixa de 12 meses, despesas por categoria, evolução do patrimônio, pendentes e maiores gastos. A spec está em [`docs/specs/2026-11-13-fase-3-dashboard.md`](../specs/2026-11-13-fase-3-dashboard.md).

## Onde está o código
| Camada | Arquivo | Papel |
|---|---|---|
| Consultas | `backend/apps/finance/dashboard.py` | `summary`, `cashflow`, `categories_breakdown`, `top_expenses`, `pending`, `month_bounds`, `shift_month` |
| API | `backend/apps/finance/api/dashboard.py` | Router `/dashboard` (schemas `SummaryOut`, `CashflowPoint`, `CategorySlice`) |
| Tela | `frontend/src/pages/dashboard/` | `DashboardPage`, `KpiCards`, `CashflowChart`, `NetWorthChart`, `CategoryBreakdown`, `TransactionLists` |
| Base de gráficos | `frontend/src/components/charts/` | `ChartCard` (moldura, skeleton e vazio), `ChartTooltip` |
| Utilitários | `frontend/src/lib/useCountUp.ts`, `pages/dashboard/chartFormat.ts` | Contagem dos KPIs, rótulos de mês e eixo compacto |

## Endpoints (`/api/dashboard`, sessão obrigatória)
| Rota | Parâmetros | Resposta |
|---|---|---|
| `GET /summary` | `month=YYYY-MM` | saldo, receitas, despesas, `savings_rate` (string com 1 casa ou `null`) e `previous` |
| `GET /cashflow` | `month` | 12 pontos `{month, income, expense, net, balance}`, do mais antigo ao mais recente |
| `GET /categories` | `month`, `kind` (`expense` por padrão) | árvore por categoria principal com `children`; `id: null` = "Sem categoria" |
| `GET /top-expenses` | `month`, `limit` (1..20, padrão 5) | `TransactionOut[]` por valor decrescente |
| `GET /pending` | `limit` (padrão 6) | `TransactionOut[]` pendentes por data (vencidos primeiro) |

Um `month` fora do formato `YYYY-MM` (ou com mês 13) responde **422**.

## Regras de negócio
- **Saldo total e patrimônio** contam só lançamentos efetivados. Transferências entre contas próprias não mudam o total.
- **Receitas, despesas e taxa de poupança do mês** contam tudo, efetivado e pendente, igual aos totais da tela Lançamentos.
- **Taxa de poupança** = (receitas − despesas) ÷ receitas × 100. Sem receita, fica `null`.
- **Patrimônio no fim do mês** = saldos iniciais + receitas efetivadas − despesas efetivadas até o último dia. Em `cashflow`, a base é calculada uma vez antes da janela e depois acumulada mês a mês (3 queries no total).
- **Categorias:** o valor lançado direto na categoria principal entra no total dela, mas não vira "filha".
- **Escolha de forma:**
  - Despesas por categoria usa barras horizontais ordenadas, de uma cor só. Comparam valores próximos melhor que um donut, que era a sugestão da spec-mãe.
  - Fluxo de caixa e patrimônio ficam em gráficos separados, porque estão em escalas diferentes e o guia proíbe eixo duplo.

## Front
- O mês fica na URL (`/?mes=2026-10`). Um valor inválido cai no mês atual (`parseMonth` em `lib/dates`).
- Cada widget é uma query própria, carregada em paralelo, com `placeholderData` para não piscar ao trocar o mês.
- `invalidateMoney` também invalida as queries `/api/dashboard/*`. Criar, editar ou efetivar um lançamento atualiza o painel.
- Na lista Pendentes, o botão ✓ marca o lançamento como efetivado. Uma trava síncrona por `ref` evita clique duplo.
- Widget com erro mostra "Não foi possível carregar" com **Tentar de novo** (`LoadError` em `ChartCard`) e nunca se passa por "sem dados".
- `invalidateCatalog` (categorias e tags) também invalida o painel, que mostra nomes, cores e agrupamento das categorias.
- KPIs: a contagem anima com `Number`, mas o valor final exibido vem da string decimal da API.
- **Cores dos gráficos:** tokens `--chart-income` e `--chart-expense`, validados com o script do dataviz contra o `--card` de cada tema.
  - Escuro: `#26a3a8` / `#e0644f`.
  - Claro: `#0e8c7b` / `#d2503f`.
  - Todos os checks passam, com ΔE de daltonismo ≥ 10. O verde/coral de texto (`--income`/`--expense`) falhava para deuteranopia nos gráficos, por isso não é usado neles.
- **Acessibilidade:**
  - Cada gráfico tem uma tabela equivalente em `<div class="sr-only">`. O wrapper é necessário porque `<table>` ignora a largura do `sr-only` e estourava a tela no celular.
  - A legenda fica visível quando há 2 ou mais séries.
  - O tooltip mostra os valores em cor de texto.
- **Movimento:** contagem nos KPIs (`useCountUp`) e barras de categoria que crescem na entrada. Os dois respeitam reduced motion. Os dados dos gráficos são memoizados para o Recharts não reanimar à toa.

## Como testar
- Backend: `cd backend && pytest apps/finance/tests/test_dashboard_api.py`.
- Front: `npm test`. O painel fica em `src/pages/dashboard/DashboardPage.test.tsx`. O `ResizeObserver` é polyfillado em `src/test/setup.ts`.
- Visual: entre como visitante em `/login`.

## Histórico de mudanças
- 2026-11-13: criação (Fase 3).
- 2026-11-13: revisão da Fase 3. Estados de erro com retry, invalidação pelo catálogo, clique duplo, valores exatos e mês formatado por uma fonte só.
- 2026-11-14: "Pendentes" virou **"Próximos vencimentos"**, que soma `GET /dashboard/invoices-due` (faturas a pagar, com link "Pagar") aos lançamentos pendentes.
