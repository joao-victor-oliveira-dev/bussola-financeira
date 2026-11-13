# Bússola Financeira — Design

Data: 2026-11-13 · Status: aprovado (2026-11-13)

## 1. Intenção e porquê

App web de controle financeiro pessoal com dashboards, construído **do zero como projeto de portfólio** para vagas **fullstack Python + React**. Ele precisa parecer um produto real: o recrutador entra com um clique num usuário demo cheio de dados e vê um app **bonito, animado, moderno e sofisticado**, com engenharia sólida por trás (API documentada, testes, CI, deploy).

## 2. Objetivos, não-objetivos e anti-objetivos

**Objetivos**
- Multiusuário com dados isolados por usuário (cadastro, login, logout).
- **Login demo** com um clique e dados fictícios realistas de 12 meses, recriados periodicamente.
- Lançamentos manuais rápidos + importação de extrato **OFX/CSV**.
- Cartão de crédito com faturas, compras parceladas e lançamentos recorrentes.
- Orçamento mensal por categoria.
- Dashboards com KPIs e gráficos animados.
- Responsivo (mobile-first) e instalável como **PWA**.
- Qualidade visível: OpenAPI/Swagger, testes back e front, CI, Docker Compose, README com GIF e arquitetura.

**Não-objetivos (fase 1)**
- Cobrança/planos, Open Finance/integração bancária, app nativo, multimoeda, contas compartilhadas entre usuários, investimentos detalhados (cotação de ativos).

**Anti-objetivos (falha mesmo funcionando)**
- Dinheiro em `float` ou somas com erro de arredondamento.
- Um usuário enxergar dados de outro.
- Visual de "template genérico" de admin/dashboard.
- Animações que deixam o uso lento ou que ignoram `prefers-reduced-motion`.
- Demo vazia ou quebrada no deploy.

## 3. Restrições

- Backend em Python/Django (perfil do autor), aproveitando auth, ORM e admin.
- Front em React (alvo das vagas).
- Hospedagem gratuita ou barata (Render/Railway/Fly + Vercel/Netlify).
- Idioma da UI: pt-BR, moeda BRL, datas dd/mm/aaaa.

## 4. Abordagens consideradas

| # | Abordagem | Prós | Contras |
|---|---|---|---|
| 1 | Django + HTMX + Alpine (monólito) | Rápido, um deploy, só Python | Mostra pouco de React, que é o alvo das vagas |
| **2** | **Django Ninja (API) + React SPA** | **Stack pedida em vagas fullstack; API documentada; front componentizado** | Dois apps, CORS/cookies, cerca do dobro do tempo |
| 3 | Híbrido (HTMX + API pública) | Mostra API com pouco custo | Não mostra React |

**Escolhida: 2**, porque o autor quer vagas fullstack Python + React.

Dentro da opção 2, o front em **Vite + React SPA** foi escolhido no lugar de **Next.js**. O Next criaria um segundo servidor Node que duplica o papel do Django e complica a autenticação. O visual animado e sofisticado vem das bibliotecas de UI e de animação, não do framework. *(Decisão do Claude, autorizada pelo autor.)*

## 5. Arquitetura

```
bussola-financeira/            (monorepo)
  backend/                     Django 5 + Django Ninja
    config/                    settings (base/dev/prod), urls, celery
    apps/
      users/                   User custom (login por e-mail), registro, demo
      finance/                 contas, categorias, tags, lançamentos, transferências
      cards/                   cartões, faturas, parcelamentos
      recurring/               regras de recorrência
      budgets/                 orçamento mensal
      imports/                 importação OFX/CSV, regras de categorização
      dashboard/               endpoints de agregação (somente leitura)
    each app: models.py, schemas.py (Pydantic), api.py (router), services.py, tests/
  frontend/                    Vite + React + TypeScript
  docker-compose.yml           postgres, redis, backend, worker, beat, frontend
  .github/workflows/ci.yml
```

**Regra de camadas (backend):** `api.py` só valida e serializa. A regra de negócio fica em `services.py`, e as consultas sempre partem de `request.user`, garantindo o isolamento. Um helper `get_owned_or_404(Model, pk, user)` é usado em todo lugar.

### Backend
- **Django 5 + Django Ninja**: schemas Pydantic, OpenAPI em `/api/docs`.
- **PostgreSQL**; dinheiro em `DecimalField(max_digits=14, decimal_places=2)` e `Decimal` no Python. No JSON os valores trafegam como **string** (`"1234.56"`), nunca como float.
- **Auth: sessão Django** com cookie httpOnly + CSRF. Endpoints: `GET /auth/csrf`, `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/demo`.
- **Celery + Redis**: processamento da importação, geração diária de recorrências (beat) e reset diário do usuário demo.
- **Admin Django** como backoffice.
- Testes: **pytest + pytest-django + factory_boy**; lint **ruff**; tipagem leve com **mypy** opcional.

### Frontend
- **Vite + React 19 + TypeScript**.
- **React Router** (rotas), **TanStack Query** (cache e estado do servidor), **react-hook-form + zod** (forms).
- **Tailwind CSS v4 + shadcn/ui** (componentes acessíveis sobre Radix), **lucide-react** (ícones), **sonner** (toasts).
- **Motion** (Framer Motion): transições de página, entradas em cascata, números que "contam" até o valor, layout animations em listas e cards.
- **Recharts** para gráficos, com animação de entrada.
- **Cliente da API gerado do OpenAPI** (orval) com tipos ponta a ponta.
- **vite-plugin-pwa**: manifest, ícones e cache do shell.
- Testes: **Vitest + Testing Library**; lint **ESLint + Prettier**.

### Deploy (mesma origem para os cookies)
- Backend + worker no **Render** (ou Railway), Postgres e Redis gerenciados.
- Front na **Vercel** com *rewrite* `/api/*` → backend. Para o navegador tudo é a mesma origem, então os cookies de sessão funcionam sem SameSite=None.
- Em dev, o proxy do Vite faz o mesmo (`/api` → `localhost:8000`).

## 6. Modelo de dados

Todos os modelos de usuário têm `user` FK, `created_at` e `updated_at`.

- **Account**: nome, tipo (`checking`, `savings`, `wallet`, `investment`), saldo inicial, cor, ícone, arquivada. O saldo é calculado (saldo inicial + entradas − saídas efetivadas).
- **Category**: nome, tipo (`income`/`expense`), pai opcional (subcategoria), cor, ícone. Um conjunto padrão é criado no cadastro.
- **Tag**: nome, cor (M2M com Transaction).
- **Transaction**: tipo (`income`, `expense`, `transfer`), valor (> 0), data, descrição, categoria, `account` **ou** `credit_card`, `to_account` (só transferência), status (`paid`/`pending`), notas, tags, `installment_plan` + `installment_number`, `recurring_rule`, `import_batch`, `external_id` (FITID do OFX, usado para deduplicar).
  - Constraints no banco: transferência exige `to_account ≠ account`, e um lançamento tem conta ou cartão, nunca ambos.
- **CreditCard**: nome, limite, dia de fechamento, dia de vencimento, conta de pagamento, cor.
- **Invoice** (fatura): cartão, mês de referência, data de fechamento, data de vencimento, status (`open`/`closed`/`paid`), lançamento de pagamento. A fatura de uma compra é definida pela data da compra e pelo dia de fechamento.
- **InstallmentPlan**: descrição, valor total, nº de parcelas. Gera N lançamentos em faturas consecutivas; o centavo restante vai na primeira parcela.
- **RecurringRule**: modelo do lançamento, frequência (`weekly`/`monthly`/`yearly`), dia, início e fim opcional. O job diário cria ocorrências `pending` até 60 dias à frente, de forma idempotente.
- **Budget**: categoria, mês, limite. Unique (user, categoria, mês). Há a ação "copiar orçamento do mês anterior".
- **ImportBatch**: arquivo, formato (`ofx`/`csv`), conta destino, status (`processing`/`preview`/`done`/`failed`), contadores.
- **ImportRow**: dados parseados, categoria sugerida, flag de duplicado, incluir sim/não.
- **CategorizationRule**: "descrição contém X → categoria Y", com prioridade. É aprendida opcionalmente quando o usuário corrige uma categoria na importação.

## 7. Funcionalidades e fluxos

**Lançamentos:** lista com filtros (período, conta/cartão, categoria, tipo, status, busca), paginação e totais do filtro. Um modal de "novo lançamento" fica sempre acessível pelo FAB no mobile e pelo atalho `N` no desktop. Ações: editar, duplicar, excluir e marcar como pago.

**Cartões:** cada cartão mostra a fatura atual (barra do limite usado), a lista por fatura e o botão "pagar fatura", que gera uma transferência/despesa na conta de pagamento.

**Recorrências:** CRUD de regras com uma prévia das próximas ocorrências.

**Orçamento:** tela do mês com cada categoria mostrando gasto/limite em barra animada, que muda de cor em 80% e em 100%.

**Importação:** upload → parsing em Celery → tela de prévia (duplicados marcados, categoria sugerida editável) → confirmar → lançamentos criados. CSV com mapeamento de colunas (data, descrição, valor) e presets para bancos comuns. OFX via `ofxparse`.

**Dashboard** (rota inicial), com seletor de período:
- KPIs: saldo total, receitas do mês, despesas do mês, taxa de poupança (com variação vs mês anterior).
- Fluxo de caixa dos últimos 12 meses: barras de receita vs despesa + linha de saldo.
- Despesas por categoria: donut com drill-down nas subcategorias.
- Evolução do patrimônio: área.
- Orçamento vs real (top categorias).
- Próximos vencimentos: faturas e recorrências pendentes.
- Maiores gastos do período.
- As agregações saem no ORM (`TruncMonth`, `Sum`, `annotate`), cada uma em um endpoint `GET /dashboard/...` próprio para carregar em paralelo, com skeletons.

**Demo:** o botão "Entrar como visitante" na tela de login chama `POST /auth/demo`. Um comando `manage.py seed_demo` gera 12 meses de dados realistas (salário, aluguel, mercado, cartão parcelado, recorrências, orçamento) e um job diário reseta a demo.

## 8. Direção visual

- **Dark-first** com tema claro e toggle. A paleta tem base grafite profunda e um acento verde-esmeralda/teal (a "bússola"), com receitas em verde, despesas em coral e neutros frios.
- Tipografia com personalidade para títulos e **números tabulares** para valores.
- Cards com borda sutil, leve profundidade e brilho de acento em hover. Nada de visual de "admin genérico".
- **Movimento com propósito**: transição suave entre páginas, entrada em cascata dos cards, contagem animada nos KPIs, gráficos que se desenham na entrada, layout animado ao filtrar listas, micro-interações em botões e toggles. Tudo desliga com `prefers-reduced-motion`.
- Layout: sidebar recolhível no desktop e bottom nav + FAB no mobile.
- A direção detalhada (fontes, tokens, componentes) é definida na fase de UI usando a skill frontend-design.

## 9. Fases de entrega

1. **Fundação:** monorepo, Docker Compose, CI, settings, User custom, auth por sessão, esqueleto do front (layout, tema, rotas, login), cliente OpenAPI.
2. **Núcleo:** contas, categorias, tags, lançamentos, transferências + telas.
3. **Dashboard v1** + `seed_demo` + login demo. Aqui já é um portfólio apresentável.
4. **Cartões, faturas, parcelamentos e recorrências** (Celery entra aqui).
5. **Orçamento.**
6. **Importação OFX/CSV** + regras de categorização.
7. **Polimento:** PWA, animações finais, acessibilidade, README com GIF e diagrama, deploy.

**Fase 2 do produto (fora deste escopo):** metas de economia, exportação CSV/PDF, relatórios por tag, notificações de vencimento, Open Finance.

## 10. Decisões tomadas pelo Claude (autorizado pelo autor)

Django Ninja (vs DRF); sessão + CSRF (vs JWT); Vite SPA (vs Next.js); shadcn/ui + Motion + Recharts; orval para o cliente; Render + Vercel com rewrite; valores como string decimal no JSON; Celery desde a fase 4; ordem das fases; escopo do MVP = núcleo + cartão/parcelas/recorrências + orçamento + importação (metas na fase 2).

## 11. Deixado para o builder

Nomes exatos de endpoints e campos secundários, presets de CSV por banco, paleta e fontes finais (via frontend-design), estratégia de paginação (cursor ou offset), estrutura interna dos componentes React.
