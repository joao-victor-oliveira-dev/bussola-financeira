# Finanças: contas, categorias, tags e lançamentos

## O que faz
Esta é a base do controle financeiro. O usuário cadastra contas (banco, poupança, carteira, investimento), registra receitas, despesas e transferências, organiza tudo por categoria (com um nível de subcategoria) e por tags, e vê o saldo de cada conta. A spec está em [`docs/specs/2026-11-13-fase-2-nucleo.md`](../specs/2026-11-13-fase-2-nucleo.md).

## Onde está o código
| Camada | Arquivo | Papel |
|---|---|---|
| Modelos | `backend/apps/finance/models.py` | `Account`, `Category`, `Tag`, `Transaction` + choices e constraints |
| Regras | `backend/apps/finance/services.py` | `create_default_categories`, `accounts_with_balance`, `resolve_transaction` |
| Filtros | `backend/apps/finance/filters.py` | `TransactionFilters`, `apply_filters`, `totals` |
| API | `backend/apps/finance/api/{accounts,categories,tags,transactions}.py` | Routers Ninja (todos com `django_auth`) |
| Schemas | `backend/apps/finance/schemas.py` | Entrada/saída; `MoneyOut` serializa dinheiro como string com 2 casas |
| Telas | `frontend/src/pages/{accounts,categories,transactions}/` | Contas, Categorias/Tags e Lançamentos |
| Utilitários | `frontend/src/lib/{money,dates,palette}.ts`, `frontend/src/finance/` | Formato BRL, máscara, meses, cache e rótulos |

## Endpoints (`/api`, sessão obrigatória; mutações exigem `X-CSRFToken`)
| Rota | Notas |
|---|---|
| `GET/POST /accounts`, `PATCH/DELETE /accounts/{id}` | `balance` calculado. Nome duplicado → 409. Conta com lançamentos (origem ou destino) → 409 "Arquive em vez de excluir." |
| `GET/POST /categories`, `PATCH/DELETE /categories/{id}` | Lista plana com `parent_id`. Pai inválido (de outro usuário, de outro tipo, já é filha ou é a própria categoria) → 422. Em uso ou com filhas → 409. |
| `GET/POST /tags`, `PATCH/DELETE /tags/{id}` | Duplicada (sem diferenciar maiúsculas) → 409. Excluir remove o vínculo com os lançamentos. |
| `GET /transactions` | Filtros `date_from`, `date_to`, `account`, `category`, `kind`, `status`, `tag`, `q`; `page`/`page_size` (máx. 100). Resposta `{items, count, page, page_size, totals}`. |
| `POST /transactions`, `GET/PATCH/DELETE /transactions/{id}` | `tag_ids` substitui as tags. No PATCH, `category_id`/`to_account_id` aceitam `null` para limpar. |

Um id de outro usuário responde **404**. Uma referência de outro usuário dentro do payload responde **422**. Anônimo recebe **401** `{"detail": "Não autenticado."}`.

## Regras de negócio e casos-limite
- **Saldo** = saldo inicial + receitas efetivadas − despesas efetivadas − transferências que saem + transferências que entram. Lançamentos pendentes não contam. O cálculo é feito com subquery em `accounts_with_balance`.
- **Transferência:** exige `to_account` diferente da conta de origem e nunca tem categoria. Se vier categoria, ela é ignorada. Nos outros tipos, `to_account` é sempre limpo. Isso também vale num PATCH que troca o tipo.
- **Categoria × tipo:** a categoria precisa ser do mesmo tipo do lançamento (422 caso contrário). No PATCH, a validação é feita sobre o estado mesclado (atual + alterações).
- **Constraints no banco:** `amount > 0`, transferência ⇔ destino preenchido, destino ≠ origem. A validação na API vem antes, então o usuário recebe 422 e não um erro 500.
- **Filtros:** `account` casa com a origem **ou** o destino. `category` inclui as subcategorias. `q` busca na descrição e nas observações, sem diferenciar maiúsculas.
- **Totais** cobrem o filtro inteiro (não só a página) e não incluem transferências.
- **Categorias padrão:** criadas no cadastro, na mesma transação do usuário (`create_default_categories`, idempotente).
- **Unicidade de categoria:** o banco tem `UniqueConstraint(nulls_distinct=False)`. A API também checa no código, porque no SQLite o `NULL` do pai fica fora da unicidade.

## Telas
- **Contas:** saldo total, cartões com a faixa na cor da conta e o saldo (negativo em coral), modal de criar/editar (com arquivar e excluir) e seção "Arquivadas" recolhida.
- **Categorias** (`/categorias`, só na sidebar; no celular há um atalho em Lançamentos): abas Despesas, Receitas e Tags, árvore de um nível e "+" para criar subcategoria direto no grupo.
- **Lançamentos:**
  - Seletor de mês, totais do filtro e filtros (busca com debounce de 300 ms, conta, categoria, tipo e status).
  - Os filtros vivem na URL: `?mes=2026-11&conta=1&tipo=expense&q=…&pagina=2`.
  - Lista agrupada por dia (Hoje, Ontem, dia por extenso), com menu Editar / Duplicar / Marcar como efetivado / Excluir. Excluir pede confirmação.
- **Modal de lançamento:**
  - Seletor de tipo segmentado e valor em destaque com máscara de centavos.
  - Na transferência, aparece "Para a conta" e some a categoria.
  - Abre pelo botão (desktop), pelo FAB (celular) e pela tecla **N**, que é ignorada enquanto se digita ou com um modal aberto.

## Dinheiro no front
- A API manda e recebe string decimal (`"1234.56"`).
- `formatBRL` só exibe. `parseBRL("1.234,56")` → `"1234.56"`. `maskBRLInput` trata os dígitos digitados como centavos. `sumMoney` soma em centavos inteiros.
- Nunca faça conta com `Number` sobre valores monetários.

## Como testar
- Backend: `cd backend && pytest apps/finance`. Cobre constraints, saldo, isolamento entre usuários, filtros, totais e PATCH incoerente.
- Front: `cd frontend && npm test`. Cobre `lib/money`, `lib/dates` e as páginas `accounts`, `categories` e `transactions`. No Windows, rode pelo PowerShell (veja `frontend.md`).

## Histórico de mudanças
- 2026-11-13: criação (Fase 2).
  - Decisão: não há campo de ícone em categoria e conta; a cor basta por enquanto.
  - Decisão: `<select>` nativo estilizado em vez do Select do Base UI, por ser acessível, ter o seletor nativo no celular e ser testável.
  - Decisão: JSON em snake_case.
  - Desvio do plano: num POST/PATCH de transferência, a categoria enviada é ignorada em vez de gerar 422. Nos outros tipos, o destino é limpo.
