# Bússola Financeira — índice para o Claude

App de controle financeiro + dashboards (portfólio fullstack). Stack: Django + Django Ninja + PostgreSQL + Celery | Vite + React + TS.

Este arquivo é **só um mapa**. Não copie conteúdo para cá: leia o arquivo indicado quando a tarefa pedir.

## Onde procurar

| Assunto | Arquivo |
|---|---|
| Visão geral, como rodar | `README.md` |
| Design aprovado (escopo, stack, modelo de dados, fases) | `docs/specs/2026-11-13-bussola-financeira-design.md` |
| Índice da documentação viva por área | `docs/documentacao/README.md` |
| Specs de rotinas novas | `docs/specs/` |
| Planos de implementação | `docs/planos/` |

## Regras do projeto

- Toda rotina nova: spec em `docs/specs/` **antes**, doc viva em `docs/documentacao/<area>.md` **depois**, e a linha correspondente no índice `docs/documentacao/README.md`.
- Ao alterar uma área, leia e atualize a doc dela no mesmo trabalho.
- Escolhas técnicas: siga a recomendação e apenas informe. Pergunte só para ações externas/irreversíveis.
- Dinheiro sempre `Decimal` (string no JSON), nunca float. Toda consulta filtrada por `request.user`.
- Git: branches `feat/*`/`fix/*` saem de `develop`; PRs vão para `develop`. `develop → main` só quando o autor pedir. Revisão de código ao fim de cada fase.
