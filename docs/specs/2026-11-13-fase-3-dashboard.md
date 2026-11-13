# Fase 3: Painel v1 e login de demonstração

**Status:** decidido pelo Claude (autorizado: "siga sua recomendação e só me notifique"), 2026-11-13
**Design-mãe:** [2026-11-13-bussola-financeira-design.md](2026-11-13-bussola-financeira-design.md) (seção 7: Dashboard e Demo)

## Intenção

O painel (rota `/`) responde em segundos a "como está meu mês e para onde vai meu dinheiro". Ele é a vitrine do portfólio. O login de demonstração deixa qualquer recrutador ver o app cheio de dados sem precisar se cadastrar.

## Escopo

**Dentro:**
- Endpoints `GET /api/dashboard/*`, um por widget, carregados em paralelo.
- Painel com seletor de mês, KPIs com variação, fluxo de caixa de 12 meses, despesas por categoria com detalhe por subcategoria, evolução do patrimônio, maiores gastos e pendentes.
- Comando `seed_demo` e `POST /api/auth/demo` com o botão "Entrar como visitante".

**Fora (fases seguintes):**
- Orçamento vs real (Fase 5).
- Faturas e recorrências em "próximos vencimentos" (Fase 4). Por ora, essa seção mostra os lançamentos **pendentes**.
- Reset diário automático da demo (Celery entra na Fase 4). Até lá, o reset é manual com `seed_demo --reset`.

## Regras dos números

- **Saldo total:** soma dos saldos de todas as contas, contando só lançamentos efetivados (igual à tela Contas).
- **Receitas e despesas do mês:** todos os lançamentos do mês, efetivados e pendentes, como os totais da tela Lançamentos. Transferências não entram.
- **Taxa de poupança:** (receitas − despesas) ÷ receitas, como string decimal com 1 casa (ex.: `"23.4"`). Fica `null` quando não há receita.
- **Variação:** mesmos números do mês anterior, para o front calcular a diferença.
- **Fluxo de caixa:** 12 meses terminando no mês escolhido, com receitas, despesas e resultado por mês.
- **Patrimônio no fim de cada mês:** saldos iniciais somados + receitas efetivadas − despesas efetivadas com data até o último dia do mês. Transferências entre contas próprias não mudam o total.
- **Despesas por categoria:** agrupadas pela categoria **principal**, com as subcategorias dentro. O que não tem categoria vira "Sem categoria". Ordem decrescente de valor.
- **Maiores gastos:** as 5 maiores despesas do mês.
- **Pendentes:** os lançamentos com status `pending`, por data (vencidos primeiro), no máximo 6.

## API (`/api/dashboard`, sessão obrigatória, tudo filtrado por usuário)

| Rota | Parâmetros | Resposta |
|---|---|---|
| `GET /summary` | `month=YYYY-MM` | `{month, balance, income, expense, savings_rate, previous:{income, expense, savings_rate}}` |
| `GET /cashflow` | `month` | `[{month, income, expense, net, balance}]` (12 itens, do mais antigo ao mais recente) |
| `GET /categories` | `month`, `kind=expense\|income` (padrão `expense`) | `[{id, name, color, total, children:[{id, name, color, total}]}]` |
| `GET /top-expenses` | `month`, `limit` (1..20, padrão 5) | `TransactionOut[]` |
| `GET /pending` | `limit` (padrão 6) | `TransactionOut[]` |

`POST /api/auth/demo` (exige CSRF; só funciona com `DEMO_ENABLED=True`): entra como `demo@bussola.app` e gera os dados se o usuário ainda não existir. Com a demo desligada, responde 404.

## Dados da demo (`manage.py seed_demo [--reset]`)

Determinísticos (`random.Random(42)`), cobrindo 12 meses até hoje:
- **Contas:** Nubank, Reserva, Carteira e Investimentos.
- **Entradas:** salário mensal, freelance em alguns meses.
- **Saídas fixas:** aluguel, educação e assinaturas.
- **Saídas variáveis:** mercado, restaurantes, transporte, saúde, lazer e compras.
- **Transferências:** mensais para a Reserva e os Investimentos.
- **Tag:** "viagem" num mês com gastos extras.
- **Mês atual:** contas futuras ficam pendentes.

`--reset` apaga os dados da demo e gera tudo de novo.

## Painel

1. **Topo:** "Olá, {nome}", seletor de mês e atalho "Novo lançamento".
2. **KPIs** (4 cartões): saldo total, receitas, despesas e taxa de poupança. Os números contam até o valor ao entrar e mostram a variação contra o mês anterior.
3. **Fluxo de caixa:** barras agrupadas de receitas e despesas por mês, num único eixo. O resultado aparece no tooltip.
4. **Despesas por categoria:** barras horizontais ordenadas, em uma só cor, com o valor e a % ao lado. Clicar numa categoria mostra as subcategorias. Escolhi barras em vez do donut da spec-mãe: com mais de 6 partes e valores próximos, comparam com mais precisão.
5. **Patrimônio:** gráfico de área com o fechamento de cada mês.
6. **Maiores gastos** e **Pendentes:** listas lado a lado.
- Cada widget tem o próprio skeleton e trata o próprio vazio.
- Os gráficos têm tooltip, legenda quando há 2 ou mais séries e uma tabela equivalente para leitor de tela.
- Cores dos gráficos validadas no fundo de cada tema (tokens `--chart-income` e `--chart-expense`).

## Critério de pronto

Testes de backend para cada endpoint (isolamento entre usuários, meses sem dados, transferências fora das somas, a demo e o comando). Testes de front para KPIs, listas, a tabela de categorias e o botão de demo. CI verde. Doc viva `docs/documentacao/dashboard.md` e trecho de demo em `auth.md`.
