# Recorrências e tarefas Celery

## O que faz
Salário, aluguel e assinaturas são cadastrados uma vez como **regra**. O sistema cria os lançamentos de cada período como **pendentes**, até 60 dias à frente. O usuário só efetiva cada um quando acontece.

## Onde está o código
| Camada | Arquivo | Papel |
|---|---|---|
| Modelo | `backend/apps/finance/models.py` | `RecurringRule` e `Transaction.recurring_rule` (unique `(recurring_rule, date)`) |
| Regras | `backend/apps/finance/recurring.py` | `occurrences`, `generate`, `regenerate`, `clear_future_pending`, `next_dates`, `generate_all` |
| API | `backend/apps/finance/api/recurring.py` | CRUD com `next_dates` |
| Tarefas | `backend/apps/finance/tasks.py`, `backend/config/celery.py` | `finance.generate_all_recurring`, `finance.reset_demo` |
| Comando | `manage.py generate_recurring` | Mesma geração, sem Celery |
| Tela | `frontend/src/pages/recurring/` | `RecurringPage`, `RecurringFormDialog` |

## Regras
- **Datas:**
  - Semanal: a cada 7 dias a partir do início.
  - Mensal: o dia do início. Dias 29 a 31 viram o último dia nos meses curtos.
  - Anual: a mesma data. 29/02 vira 28/02 em anos não bissextos.
  - Todas respeitam `end_date`.
- **Geração:** cria as ocorrências de **hoje até hoje+60** que ainda não existem. É idempotente: pula as datas existentes, e o banco garante a unicidade. **Não preenche o passado**: uma regra criada com início antigo começa a gerar a partir de hoje.
- **Editar:** apaga as ocorrências **futuras pendentes** e gera de novo. As efetivadas e as passadas ficam como estão.
- **Pausar** (`active=false`): limpa as futuras pendentes. `next_dates` fica vazio.
- **Excluir:** limpa as futuras pendentes. O histórico fica desvinculado (`SET_NULL`).
- **Validação:** usa as mesmas regras de um lançamento (`resolve_transaction`): refs do usuário, conta **ou** cartão, cartão só para despesa, transferência com destino diferente. Fim antes do início → 422.
- **Cartão:** cada ocorrência cai na fatura certa da sua data.

## Celery
- **Broker:** Redis via `CELERY_BROKER_URL`. **Sem broker** (dev local e testes), `CELERY_TASK_ALWAYS_EAGER=True`: as tarefas rodam no próprio processo.
- **Beat:** a cada 24 h, `finance.generate_all_recurring` e `finance.reset_demo` (o reset só age com `DEMO_ENABLED`).
- **Docker Compose:** serviços `redis`, `worker` (`celery -A config worker`) e `beat` (`celery -A config beat`), com as mesmas variáveis do backend (âncora YAML `backend-env`).
- **Sem Docker:** rode `python manage.py generate_recurring` quando quiser. A API também gera ao criar ou editar uma regra.

## Endpoints
`GET/POST /api/recurring`, `PATCH/DELETE /api/recurring/{id}`. A saída inclui `next_dates` (as 3 próximas a partir de hoje).

## Tela
- Lista com valor, "Mensal, todo dia 10 · Nubank", "Próximas: 10 de dez, 10 de jan, …" e um switch para pausar ou retomar.
- Modal com tipo, valor, descrição, frequência, início, fim opcional, conta ou cartão (despesa), conta destino (transferência) e categoria.
- Fica na sidebar. No celular, há um atalho no topo de Lançamentos.

## Como testar
- Backend: `pytest apps/finance/tests/test_recurring.py`, que cobre datas, idempotência, regeneração, API, comando e tarefa eager.
- Front: `src/pages/recurring/RecurringPage.test.tsx`.

## Histórico de mudanças
- 2026-11-14: criação (Fase 4).
