# Cartões, faturas e parcelamentos

## O que faz
Esta área cuida do cartão de crédito:
- As compras viram itens da fatura certa.
- Compras parceladas se espalham pelos meses.
- O limite usado é acompanhado.
- A fatura é paga a partir de uma conta, sem contar o gasto duas vezes.

A spec está em [`docs/specs/2026-11-13-fase-4-cartoes-recorrencias.md`](../specs/2026-11-13-fase-4-cartoes-recorrencias.md).

## Onde está o código
| Camada | Arquivo | Papel |
|---|---|---|
| Modelos | `backend/apps/finance/models.py` | `CreditCard`, `Invoice`, `InstallmentPlan` e os campos novos de `Transaction` |
| Regras | `backend/apps/finance/cards.py` | `invoice_reference`, `invoice_dates`, `get_or_create_invoice`, `invoice_status`, `invoice_total`, `limit_used`, `invoice_summary` |
| Parcelas | `backend/apps/finance/installments.py` | `split_amount`, `add_months`, `create_plan` |
| API | `backend/apps/finance/api/{cards,installments}.py` | Cartões, faturas, pagamento e parcelamentos |
| Telas | `frontend/src/pages/cards/` | `CardsPage`, `CreditCardTile`, `CardFormDialog`, `InvoicePanel` (com `PayInvoiceDialog`) |
| Modal de lançamento | `frontend/src/pages/transactions/{TransactionFormDialog,SourceToggle}.tsx` | "Pagar com: Conta / Cartão" e o campo Parcelas |

## Modelo contábil
- **Compra no cartão:** despesa com `credit_card` e sem `account`. Conta como gasto na data da compra (totais, painel, patrimônio) e não mexe no saldo de nenhuma conta.
- **Pagamento da fatura:** transferência da conta para o cartão (`to_credit_card`). O saldo da conta cai, mas não é despesa. Nada é contado duas vezes.
- **Constraints no banco:**
  - `tx_one_source`: conta **ou** cartão.
  - `tx_card_only_expense`: lançamento de cartão é sempre despesa.
  - `tx_transfer_one_destination`: transferência tem exatamente um destino, conta ou cartão.

## Fatura
- **Referência** = mês em que a fatura **fecha**. Compra até o dia de fechamento, inclusive, cai no mês da compra. Depois disso, no mês seguinte (31/dez → janeiro).
- **Vencimento:** dia `due_day`. Se for menor ou igual ao fechamento, vence no mês seguinte.
- Dias entre **1 e 28**: constraint no banco, 422 na API e validação no formulário.
- **Status** é calculado, não salvo: `paid` (tem pagamento), `closed` (hoje passou do fechamento), `open`.
- **`Transaction.invoice`** é preenchido ao salvar. Se a data ou o cartão mudarem num PATCH, a fatura é recalculada. Trocar para conta limpa o campo.
- **Limite usado:** compras de faturas ainda não pagas.
- **Fatura paga fica travada:** compra ou parcela nova que cairia nela → 422. Alterar valor, data, cartão ou tipo, ou excluir um item dela → 409. Excluir um plano com parcela em fatura paga → 409. Descrição, categoria, notas e tags continuam editáveis. Para mexer, desfaça o pagamento.
- **A validação não grava nada:** a fatura só é criada ao salvar.

## Parcelamento
- `split_amount`: as parcelas são arredondadas para baixo e o centavo que sobra vai na **1ª** (100 em 3x = 33,34 + 33,33 + 33,33).
- **Datas:** a mesma data a cada mês. O dia 31 vira o último dia nos meses curtos. Cada parcela cai na sua fatura.
- **Descrição:** "Notebook (2/10)". A API devolve `installment: "2/10"`.
- Excluir o plano exclui as parcelas. Editar um plano exige excluir e recriar. Uma parcela isolada pode ser editada, mas não troca de cartão (o formulário trava).

## Endpoints
| Rota | Notas |
|---|---|
| `GET/POST /api/cards`, `PATCH/DELETE /api/cards/{id}` | Inclui `limit_used` e `current_invoice`. Nome duplicado (sem diferenciar maiúsculas) → 409. Excluir com compras ou pagamentos → 409. |
| `GET /api/cards/{id}/invoices/{YYYY-MM}` | Resumo + itens. Referência inválida → 422. |
| `POST /api/cards/{id}/invoices/{ref}/pay` | `{account_id?, date?}`. Sem conta, usa a conta de pagamento do cartão. Já paga → 409. Vazia → 422. Conta de outro usuário → 422. |
| `DELETE /api/cards/{id}/invoices/{ref}/pay` | Remove a transferência e reabre a fatura. |
| `POST /api/installments`, `DELETE /api/installments/{id}` | Cria ou exclui o plano. Cartão ou categoria inválidos → 422. 2 a 48 parcelas. |
| `GET /api/dashboard/invoices-due?days=30` | Faturas com itens, não pagas, vencidas ou vencendo na janela (widget "Próximos vencimentos"). |

O pagamento de fatura **não** pode ser editado por `PATCH /transactions` (409): desfaça pela tela do cartão.

## Telas
- **Cartões:**
  - Cada cartão aparece como um cartão "físico", na cor dele, com status, total da fatura atual, fechamento e vencimento.
  - A barra de limite muda de cor: primária, latão a partir de 80% e coral a partir de 100%.
  - Clicar no cartão abre a fatura com navegação por mês. O cartão e a fatura ficam na URL (`?cartao=3&fatura=2026-11`), para o painel linkar direto.
- **Pagar fatura:** escolhe conta e data. O botão mostra o valor.
- **Painel:** "Próximos vencimentos" lista as faturas a pagar, com link "Pagar", junto com os lançamentos pendentes.

## Como testar
- Backend: `pytest apps/finance/tests/test_cards_models.py test_cards_api.py test_installments_api.py test_invoices_due.py`.
- Front: `npm test`. Os testes ficam em `src/pages/cards/CardsPage.test.tsx` e nos testes de cartão e parcelas em `TransactionsPage.test.tsx`.

## Histórico de mudanças
- 2026-11-14: criação (Fase 4).
- 2026-11-14: revisão da Fase 4. Faturas pagas travadas, validação sem efeito colateral e `invalidateMoney` também invalidando `/api/cards`. A prévia das parcelas usa `splitMoney` (centavos), igual ao servidor.
