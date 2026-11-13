# Fase 2: Núcleo (contas, categorias, tags e lançamentos)

**Status:** decidido pelo Claude (autorizado pelo autor: "siga sua recomendação e só me notifique"), 2026-11-13
**Design-mãe:** [2026-11-13-bussola-financeira-design.md](2026-11-13-bussola-financeira-design.md) (seções 6 e 7)

## Intenção

Dar ao usuário o ciclo básico de controle financeiro: cadastrar contas, registrar receitas, despesas e transferências, organizá-las por categoria e tag e ver o saldo de cada conta. A Fase 3 (dashboard) consome estes dados.

## Escopo

**Dentro:** app `finance` com Account, Category, Tag e Transaction; CRUD via API; lista de lançamentos com filtros, paginação e totais; categorias padrão no cadastro; telas Contas, Lançamentos e Categorias; modal de novo lançamento (FAB no mobile, atalho `N` no desktop); 401 traduzido.

**Fora (fases seguintes):** cartão, fatura e parcelas (o campo `credit_card` entra na Fase 4), recorrências, importação, orçamento e dashboard.

## Modelo de dados (app `finance`)

Todos têm `user` FK, `created_at` e `updated_at`. Dinheiro é `DecimalField(max_digits=14, decimal_places=2)`.

- **Account**: `name`, `type` (`checking`|`savings`|`wallet`|`investment`), `initial_balance` (pode ser negativo), `color` (hex), `archived`. Unique (user, name). O saldo é **calculado**: inicial + receitas pagas − despesas pagas − transferências pagas que saem + transferências pagas que entram.
- **Category**: `name`, `kind` (`income`|`expense`), `parent` (opcional, **só um nível**), `color`. Unique (user, kind, parent, name). Não há campo de ícone: a cor basta nesta fase.
- **Tag**: `name`, `color`. Unique (user, name).
- **Transaction**: `kind` (`income`|`expense`|`transfer`), `amount` (> 0), `date`, `description`, `category` (null em transferência; o `kind` precisa bater com o da categoria), `account`, `to_account` (só em transferência), `status` (`paid`|`pending`), `notes`, `tags` (M2M).
  - CheckConstraints: `amount > 0`; transferência ⇔ `to_account` preenchido; `to_account ≠ account`.

## Regras

- Toda consulta é filtrada por `request.user`. Um id de outro usuário responde 404, e uma referência alheia no payload responde 422.
- Ao excluir uma conta com lançamentos, a API responde 409 ("arquive em vez de excluir"). Ao excluir uma categoria com lançamentos ou subcategorias, também 409. Excluir uma tag remove o vínculo.
- O cadastro cria as categorias padrão. Despesa: Moradia, Alimentação (Mercado, Restaurantes), Transporte, Saúde, Educação, Lazer, Compras, Assinaturas, Outros. Receita: Salário, Freelance, Investimentos, Outros.
- Lista de lançamentos: filtros `date_from`, `date_to`, `account` (casa com conta de origem **ou** destino), `category` (inclui as subcategorias), `kind`, `status`, `tag`, `q` (descrição ou notas). Paginação por offset (`page`, `page_size`, máx. 100). A ordem é data desc e depois id desc. A resposta traz `totals` do filtro inteiro (receitas, despesas e saldo do filtro), sem contar transferências.
- O JSON fica em snake_case e os valores vão como string decimal.

## API (`/api`, todas exigem sessão)

| Recurso | Rotas |
|---|---|
| `/accounts` | GET (com `balance`), POST, PATCH `/{id}`, DELETE `/{id}` |
| `/categories` | GET (lista plana com `parent_id`), POST, PATCH `/{id}`, DELETE `/{id}` |
| `/tags` | GET, POST, PATCH `/{id}`, DELETE `/{id}` |
| `/transactions` | GET (filtros + paginação + totais), POST, GET `/{id}`, PATCH `/{id}`, DELETE `/{id}` |

## Telas

- **Contas** (`/contas`): saldo total no topo e grade de cartões de conta (cor da conta numa faixa lateral, saldo em números tabulares, verde ou coral). Criar e editar em modal. Arquivadas ficam numa seção recolhida.
- **Lançamentos** (`/lancamentos`):
  - Seletor de mês (‹ novembro de 2026 ›), filtros (conta, categoria, tipo, status, busca) e totais do filtro.
  - Lista agrupada por dia, com valor colorido por tipo e badge "pendente".
  - O layout se anima ao filtrar.
  - Ações por item: editar, duplicar, marcar como pago e excluir (com confirmação).
- **Categorias** (`/categorias`): abas Despesas, Receitas e Tags. Nas categorias, a árvore de um nível; nas tags, a lista. Criar, editar e excluir.
- **Novo lançamento** (modal):
  - Seletor de tipo segmentado (Despesa, Receita, Transferência), valor em destaque com máscara BRL, data, descrição, conta (e conta destino na transferência), categoria filtrada pelo tipo, tags, status e notas.
  - Abre pelo botão no topo da lista, pelo FAB no mobile e pela tecla `N` no desktop.

## Critério de pronto

Testes de backend para constraints, saldo, isolamento entre usuários, filtros e totais. Testes de front para utilitários de dinheiro, formulário e páginas com fetch mockado. CI verde. Doc viva `docs/documentacao/financas.md` e índice atualizado.
