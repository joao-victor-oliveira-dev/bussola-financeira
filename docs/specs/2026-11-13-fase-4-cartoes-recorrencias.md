# Fase 4: Cartões, faturas, parcelamentos e recorrências

**Status:** decidido pelo Claude (autorizado: "siga sua recomendação e só me notifique"), 2026-11-13
**Design-mãe:** [2026-11-13-bussola-financeira-design.md](2026-11-13-bussola-financeira-design.md) (seções 6 e 7)

## Intenção

Cobrir o que mais pesa nas finanças do dia a dia: o cartão de crédito (compras que viram fatura, parcelas que se espalham pelos meses, o pagamento da fatura) e as contas que se repetem (salário, aluguel, assinaturas). O usuário não deve precisar lançar a mesma coisa todo mês.

## Modelo contábil (a decisão central)

- **Compra no cartão** = despesa com `credit_card` (sem `account`). Ela conta como gasto na data da compra: entra nos totais, no painel e no patrimônio. Não mexe no saldo de nenhuma conta.
- **Pagamento da fatura** = **transferência** da conta de pagamento para o cartão (`to_credit_card`). O saldo da conta cai, mas ela não conta como despesa (transferências ficam fora das somas). Assim nada é contado duas vezes.
- **Patrimônio** continua sendo saldos iniciais + receitas − despesas efetivadas. A dívida do cartão já está embutida, porque a compra reduziu o patrimônio e o pagamento é neutro.
- Constraints no banco:
  - Todo lançamento tem conta **ou** cartão, nunca os dois.
  - Lançamento de cartão é sempre despesa.
  - Transferência tem exatamente um destino: conta ou cartão.

## Fatura

- **Mês de referência** = o mês em que a fatura **fecha**. Se o dia da compra for menor ou igual ao dia de fechamento, a compra entra na fatura que fecha naquele mês. Se passar do fechamento, entra na do mês seguinte.
- **Vencimento:** dia `due_day`. Se for menor ou igual ao dia de fechamento, vence no mês seguinte ao do fechamento.
- Dias de fechamento e vencimento ficam entre **1 e 28**, para não depender de meses curtos.
- **Status** (calculado, não armazenado):
  - `paid`: há pagamento.
  - `closed`: hoje passou do fechamento.
  - `open`: nos outros casos.
- A tabela `Invoice` guarda cartão, referência e o lançamento de pagamento. As linhas são criadas sob demanda.
- **Total da fatura:** soma das compras atribuídas a ela (FK `invoice` no lançamento, preenchida ao salvar).
- **Limite usado:** compras das faturas ainda não pagas.

## Parcelamento

- `InstallmentPlan` guarda cartão, descrição, valor total, número de parcelas (2 a 48), data da compra e categoria.
- Gera N despesas no cartão, uma por mês a partir da data da compra, cada uma caindo na fatura certa.
- O centavo que sobra da divisão vai na **primeira** parcela. As descrições ficam como "Notebook (1/10)".
- Excluir o plano exclui as parcelas. Editar o plano fica fora desta fase (exclua e recrie).

## Recorrências

- `RecurringRule` guarda o modelo do lançamento: tipo, valor, descrição, conta ou cartão, conta destino, categoria. Também guarda frequência (`weekly`/`monthly`/`yearly`), início, fim opcional e se está ativa.
- **Dia da ocorrência:** o dia da semana do início (semanal), o dia do mês do início, limitado ao último dia do mês (mensal), ou a mesma data todo ano (anual).
- **Geração:** cria ocorrências **pendentes** até **60 dias à frente**, de forma idempotente (unique `(recurring_rule, date)`). Roda ao criar ou editar a regra e no job diário.
- Editar a regra apaga as ocorrências futuras **pendentes** e gera de novo. As efetivadas e as passadas ficam como estão.
- Excluir a regra apaga as ocorrências futuras pendentes e mantém o histórico (desvinculado).

## Celery

- `config/celery.py`, broker Redis via `CELERY_BROKER_URL`.
- Sem broker (desenvolvimento local, testes), `CELERY_TASK_ALWAYS_EAGER=True`: as tarefas rodam na hora.
- Beat diário:
  - `generate_recurring`: todas as regras ativas.
  - `reset_demo`: `seed_demo --reset`, só se `DEMO_ENABLED`.
- O docker-compose ganha `redis`, `worker` e `beat`.

## API (sessão, tudo filtrado por usuário)

| Rota | Notas |
|---|---|
| `GET/POST /cards`, `PATCH/DELETE /cards/{id}` | Inclui `current_invoice` (referência, fechamento, vencimento, total, status) e `limit_used`. Excluir com lançamentos → 409 (arquive). |
| `GET /cards/{id}/invoices/{YYYY-MM}` | Fatura com itens. |
| `POST /cards/{id}/invoices/{YYYY-MM}/pay` | `{account_id?, date?}` → cria a transferência. Já paga → 409. Sem itens → 422. |
| `DELETE /cards/{id}/invoices/{YYYY-MM}/pay` | Desfaz o pagamento. |
| `POST /installments`, `DELETE /installments/{id}` | Cria ou exclui o plano e as parcelas. |
| `GET/POST /recurring`, `PATCH/DELETE /recurring/{id}` | Inclui `next_dates` (as 3 próximas). |
| `GET /dashboard/invoices-due` | Faturas não pagas com vencimento até 30 dias à frente, para o widget de vencimentos. |
| `/transactions` | Ganha `credit_card_id`, `invoice` (referência) e `installment` (`"3/10"`). O filtro `account` aceita também `card`. |

## Telas

- **Cartões** (`/cartoes`):
  - Um cartão visual por cartão, com nome, cor, barra de limite usado, fatura atual (total, fecha em, vence em, status) e botão "Pagar fatura".
  - Ao clicar num cartão, abre o detalhe da fatura, com navegação por mês (‹ ›), itens e total. Pagar ou desfazer o pagamento.
  - Criar e editar cartão em modal.
- **Modal de lançamento:** em despesa, um seletor "Pagar com: Conta / Cartão". No cartão aparece "Parcelas" (1 a 48). Mais de 1 parcela cria um plano. Na edição, uma parcela mostra "Parcela 3/10" e não pode trocar de cartão.
- **Recorrências** (`/recorrencias`, na sidebar, com atalho a partir de Lançamentos no celular):
  - Lista de regras com frequência, valor, próximas 3 datas, ativa ou pausada.
  - Modal de criar e editar.
- **Painel:** "Pendentes" vira **"Próximos vencimentos"**, mostrando faturas a vencer (com botão pagar) e lançamentos pendentes.

## Critério de pronto

Testes de backend para:
- Regra de fatura nas bordas (dia igual ao fechamento, virada de ano, vencimento no mês seguinte).
- Centavos das parcelas.
- Pagamento sem contar duas vezes (saldo, painel, patrimônio).
- Recorrência idempotente e regeneração ao editar.
- Constraints e isolamento entre usuários.

Testes de front para cartões, fatura, modal com cartão e parcelas, e recorrências. CI verde. Docs vivas `cartoes.md` e `recorrencias.md`. Revisão de código ao final.
