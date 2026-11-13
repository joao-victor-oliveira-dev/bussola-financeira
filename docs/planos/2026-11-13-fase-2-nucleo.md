# Fase 2 (Núcleo): plano de implementação

**Goal:** contas, categorias, tags e lançamentos de ponta a ponta (API + telas).
**Spec:** [docs/specs/2026-11-13-fase-2-nucleo.md](../specs/2026-11-13-fase-2-nucleo.md)
**Branch:** `feat/fase-2-nucleo`, com um commit por tarefa e PR ao final.

## Restrições globais
- Dinheiro em `Decimal` (string no JSON). Toda query passa por `.filter(user=request.user)`.
- Backend com TDD em pytest (`cd backend && venv/Scripts/python -m pytest`), ruff limpo. Front com vitest, oxlint, prettier e tsc limpos.
- Após mudar a API: `python manage.py export_openapi` + `npm run api:gen` (o CI checa o diff).
- Rotas Ninja com `operation_id` camelCase explícito (`accountsList`, `accountsCreate`…).

## Foco de revisão
1. Referência a conta, categoria ou tag de outro usuário no payload → 422, nunca vazar dados.
2. PATCH que troca `kind` para transferência sem `to_account`, ou de transferência para despesa mantendo `to_account` → validação coerente (422), não erro 500 de IntegrityError.
3. Totais do filtro calculados sobre o conjunto inteiro, não só sobre a página.
4. Valor digitado "1.234,56" no front → envia "1234.56". Valores negativos ou zero são recusados.
5. Exclusão de conta ou categoria em uso → 409 com mensagem clara.

---

### Task 1: modelos `finance` + categorias padrão
- Create: `backend/apps/finance/{__init__,apps,models,admin,services}.py`, migrations, `tests/{factories,test_models,test_defaults}.py`.
- Modify: `config/settings.py` (INSTALLED_APPS), `apps/users/services.py` (`register_user` chama `create_default_categories(user)` na mesma transação).
- Testes:
  - CheckConstraints (`amount<=0`, transferência sem destino, destino = origem, despesa com `to_account`) levantam IntegrityError.
  - `create_default_categories` cria a árvore da spec e é idempotente.
  - Um cadastro via API cria categorias.
- Produces: `Account`, `Category`, `Tag`, `Transaction` com os choices `AccountType`, `CategoryKind`, `TxKind`, `TxStatus`; `services.create_default_categories(user) -> None`; `services.accounts_with_balance(user) -> QuerySet[Account]` (anotado com `balance`).

### Task 2: API de contas + 401 traduzido
- Create: `apps/finance/api/{__init__,accounts}.py`, `apps/finance/schemas.py`, `apps/finance/api/common.py` (`get_owned(model, user, id)` → 404).
- Modify: `config/api.py` (routers + `exception_handler(AuthenticationError)` → 401 `{"detail":"Não autenticado."}`).
- Testes:
  - CRUD.
  - `balance` (receita paga +, despesa paga −, pendente ignorada, transferência sai e entra).
  - Isolamento (404 para a conta alheia).
  - Nome duplicado → 409.
  - Exclusão com lançamentos → 409.
  - Anônimo → 401 em pt-BR.

### Task 3: API de categorias e tags
- Create: `apps/finance/api/{categories,tags}.py`.
- Testes:
  - CRUD.
  - Parent precisa ser do mesmo usuário e do mesmo kind, e não pode ter parent (um nível só) → 422.
  - Exclusão de categoria com lançamento ou com filhas → 409.
  - Duplicado → 409.
  - Isolamento.

### Task 4: API de lançamentos
- Create: `apps/finance/api/transactions.py`, `apps/finance/filters.py`.
- Comportamento:
  - Valida coerência em `services.validate_transaction(user, data) -> dict` (refs do usuário, kind × category, regras de transferência) antes de salvar. PATCH valida o estado mesclado.
  - GET retorna `{items, count, page, page_size, totals:{income, expense, net}}`.
- Testes:
  - Cada filtro, incluindo `category` com subcategorias, `account` casando com origem ou destino, e busca `q`.
  - Totais sobre o conjunto inteiro.
  - Paginação.
  - Refs alheias → 422.
  - PATCH incoerente → 422.
  - Tags por id.
- Depois: export do OpenAPI + `api:gen`.

### Task 5: base do front para finanças
- Adicionar componentes shadcn: dialog, select, tabs, badge, dropdown-menu, alert-dialog, skeleton, textarea, popover, checkbox.
- Create:
  - `src/lib/money.ts`: `formatBRL(value: string|number) -> string`, `parseBRL(input: string) -> string|null` ("1.234,56" → "1234.56"), `maskBRLInput(raw) -> string`.
  - `src/lib/dates.ts`: `monthRange(date) -> {from,to}` em ISO e `formatDayHeader(iso)`.
  - `src/components/MoneyInput.tsx`, `src/components/ColorPicker.tsx` (paleta fixa de 8 cores acessíveis), `src/components/ConfirmDialog.tsx`.
- Testes: `money.test.ts` e `dates.test.ts`.

### Task 6: tela Contas
- Create: `src/pages/accounts/{AccountsPage,AccountCard,AccountFormDialog}.tsx`.
- Testes: lista com saldos formatados, total, criar conta (POST com o payload certo), arquivadas recolhidas.

### Task 7: tela Categorias e tags
- Create: `src/pages/categories/{CategoriesPage,CategoryFormDialog,TagFormDialog}.tsx`.
- Modify: `nav.ts` (item "Categorias" com ícone `Shapes`, `mobile: false`), `Sidebar`/`BottomNav` (respeitar `mobile`) e `router.tsx`.
- Testes: abas, árvore pai → filhas, criar subcategoria, 409 vira toast/erro.

### Task 8: tela Lançamentos + modal de novo lançamento
- Create: `src/pages/transactions/{TransactionsPage,TransactionFilters,TransactionList,TransactionFormDialog,useTransactionFilters}.ts(x)`, `src/components/Fab.tsx`.
- Comportamento:
  - O filtro de mês e os demais vivem na URL (search params).
  - Atalho `N` (fora de inputs).
  - FAB no mobile.
  - Ações de editar, duplicar, marcar como pago e excluir.
  - Invalidação de `transactions` e `accounts` após mutações.
- Testes:
  - O form troca os campos por tipo.
  - Envia valor parseado.
  - A tecla N abre o modal.
  - Lista agrupada por dia com totais.
  - Excluir pede confirmação.

### Task 9: docs + verificação visual
- Create: `docs/documentacao/financas.md`.
- Modify: índice `docs/documentacao/README.md` e roadmap do README (Fase 2 ✓).
- Verificar: fluxo real com os dois servidores e screenshots (desktop e mobile, temas claro e escuro).
