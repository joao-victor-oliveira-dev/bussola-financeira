# Documentação viva — índice

Uma página por área do sistema, descrevendo **como funciona hoje** (não como foi planejado — isso fica em `docs/specs/`).
Cada página é criada quando a área é construída e atualizada a cada mudança.

| Área | Documento | Status |
|---|---|---|
| Arquitetura e infraestrutura (monorepo, Docker, CI, deploy) | [`arquitetura.md`](arquitetura.md) | ativo (Fase 1) |
| Autenticação e usuário demo | [`auth.md`](auth.md) | ativo (Fase 1); demo na Fase 3 |
| Frontend (estrutura, tema, animações, cliente da API) | [`frontend.md`](frontend.md) | ativo (Fase 1) |
| Contas, categorias, tags e lançamentos | `financas.md` | planejado (Fase 2) |
| Dashboard e agregações | `dashboard.md` | planejado (Fase 3) |
| Cartões, faturas e parcelamentos | `cartoes.md` | planejado (Fase 4) |
| Recorrências e tarefas Celery | `recorrencias.md` | planejado (Fase 4) |
| Orçamento | `orcamento.md` | planejado (Fase 5) |
| Importação OFX/CSV | `importacao.md` | planejado (Fase 6) |

## Modelo de página

```markdown
# <Área>
## O que faz
## Onde está o código
## Modelos / endpoints / telas
## Regras de negócio e casos-limite
## Como testar
## Histórico de mudanças
```
