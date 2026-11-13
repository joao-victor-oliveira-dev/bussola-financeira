# Fase 4 (Cartões e recorrências): plano de implementação

**Goal:** cartão de crédito com faturas, parcelamentos, pagamento sem contagem dupla, recorrências automáticas e Celery.
**Spec:** [docs/specs/2026-11-13-fase-4-cartoes-recorrencias.md](../specs/2026-11-13-fase-4-cartoes-recorrencias.md)
**Branch:** `feat/fase-4-cartoes` (a partir de `develop`), um commit por tarefa, revisão de código ao final e PR para `develop`.

## Restrições globais
- Dinheiro em `Decimal`. Tudo filtrado por usuário. Refs de outro usuário no payload → 422. Id de outro usuário → 404.
- Testes de front pelo PowerShell.
- Cada mudança de API: `export_openapi` + `api:gen`.

## Foco de revisão
1. Compra no dia exato do fechamento, em 31/dez e com vencimento menor que o fechamento.
2. Parcelamento de R$ 100 em 3x → 33,34 + 33,33 + 33,33 (o total bate).
3. Pagar a fatura não altera receitas, despesas nem patrimônio; só o saldo da conta.
4. Rodar a geração de recorrências duas vezes não duplica. Editar a regra não mexe nas efetivadas.
5. Trocar um lançamento de cartão para conta (PATCH) recalcula `invoice`, sem deixar a FK órfã.

---

### Task 1: modelos + migração
- `CreditCard`, `Invoice`, `InstallmentPlan`, `RecurringRule`.
- `Transaction`: `account` passa a aceitar nulo e ganha `credit_card`, `to_credit_card`, `invoice`, `installment_plan`, `installment_number` e `recurring_rule`, com novas constraints. Unique `(recurring_rule, date)`.
- `services/cards.py`:
  - `invoice_reference(card, date) -> str`
  - `invoice_dates(card, ref) -> (closing, due)`
  - `get_or_create_invoice(card, ref)`
  - `invoice_status(invoice, today)`
- Testes: regras de fatura nas bordas, constraints e saldo das contas com pagamento.

### Task 2: API de cartões, faturas e pagamento
- `api/cards.py`.
- `resolve_transaction` aceita `credit_card_id` e atribui `invoice`.
- `TransactionOut` ganha `credit_card_id`, `invoice` e `installment`. O filtro `card` entra na lista.
- Testes: CRUD, fatura atual e limite, detalhe da fatura, pagar e desfazer, 409 e 422, isolamento, e painel e patrimônio sem contagem dupla.

### Task 3: parcelamentos
- `api/installments.py`, `services/installments.py` (`create_plan`).
- Testes: centavos, faturas consecutivas, descrições, exclusão em cascata e cartão alheio → 422.

### Task 4: recorrências + Celery
- `services/recurring.py` (`occurrences(rule, start, end)`, `generate(rule, today)`, `regenerate`).
- `api/recurring.py`, `config/celery.py`, `apps/finance/tasks.py`.
- Settings `CELERY_*` e comando `generate_recurring`.
- docker-compose com redis, worker e beat. `requirements.txt` com `celery[redis]`.
- Testes: datas por frequência (31 de cada mês, 29/fev anual, semanal), idempotência, regeneração ao editar, exclusão e tarefas eager.

### Task 5: painel de vencimentos
- `GET /dashboard/invoices-due`. O widget passa a se chamar "Próximos vencimentos".
- Testes de backend e de front.

### Task 6: tela Cartões
- `pages/cards/{CardsPage,CreditCardTile,CardFormDialog,InvoicePanel,PayInvoiceDialog}.tsx`.
- Testes: lista com limite, criar cartão, navegar fatura e pagar.

### Task 7: modal de lançamento com cartão e parcelas
- Seletor Conta/Cartão e campo Parcelas.
- Lista de lançamentos mostra cartão e parcela.
- Testes: compra no cartão envia `credit_card_id`. Parcelas > 1 chama `/installments`.

### Task 8: tela Recorrências
- `pages/recurring/{RecurringPage,RecurringFormDialog}.tsx` e item na sidebar.
- Testes: lista com próximas datas, criar e pausar.

### Task 9: demo + docs + verificação + revisão
- Demo ganha cartão, compras parceladas e recorrências.
- Docs `cartoes.md` e `recorrencias.md`, índice, README e arquitetura (Celery).
- Screenshots.
- Revisão de código da fase e correções.
