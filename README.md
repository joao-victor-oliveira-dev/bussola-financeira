# 🧭 Bússola Financeira

Controle financeiro pessoal com dashboards: contas, cartões de crédito, parcelamentos, recorrências, orçamento mensal e importação de extratos — com uma interface moderna, animada e responsiva (instalável como PWA).

> Projeto de portfólio fullstack **Python + React**. Status: **em construção** — Fases 1 a 3 concluídas (fundação; contas, categorias e lançamentos; painel e demo).
>
> **Experimente sem cadastro:** na tela de login, clique em **Entrar como visitante** para ver o app com 12 meses de dados de exemplo.

## ✨ Funcionalidades

- **Lançamentos** de receitas, despesas e transferências, com categorias, subcategorias e tags
- **Cartões de crédito** com faturas, compras parceladas e pagamento de fatura
- **Recorrências** (salário, aluguel, assinaturas) geradas automaticamente
- **Orçamento mensal** por categoria com alertas visuais
- **Importação de extrato** OFX/CSV com detecção de duplicados e categorização automática
- **Dashboards**: saldo, fluxo de caixa, gastos por categoria, evolução patrimonial, próximos vencimentos
- **Modo visitante**: entre com um clique numa conta demo com 12 meses de dados

## 🛠️ Stack

| Camada | Tecnologias |
|---|---|
| Backend | Python, Django 5, Django Ninja (OpenAPI), PostgreSQL, Celery + Redis |
| Frontend | React, TypeScript, Vite, TanStack Query, Tailwind CSS, shadcn/ui, Motion, Recharts |
| Qualidade | pytest, factory_boy, Vitest, Testing Library, Ruff, oxlint, Prettier, GitHub Actions |
| Infra | Docker Compose, Render (API), Vercel (front) |

## 🏗️ Arquitetura

```
React SPA (Vercel) ──/api/*──▶ Django + Ninja (Render) ──▶ PostgreSQL
                                     │
                                     └──▶ Redis ◀── Celery worker/beat
                                                   (importação, recorrências, reset da demo)
```

Autenticação por sessão (cookie httpOnly + CSRF), servida na mesma origem via rewrite.

## 🚀 Como rodar localmente

### Com Docker
```bash
docker compose up --build
```
Front em http://localhost:5173 · API em http://localhost:8000/api/docs

### Sem Docker
Requisitos: Python 3.13 e Node 24.

```bash
# API (SQLite por padrão)
cd backend
cp .env.example .env
python -m venv venv
source venv/bin/activate         # Windows: venv\Scripts\activate
pip install -r requirements-dev.txt
python manage.py migrate
python manage.py runserver

# Front (outro terminal)
cd frontend
npm install
npm run dev
```

### Testes e qualidade
```bash
cd backend && pytest && ruff check .   # com o venv ativo
cd frontend && npm test && npm run lint && npm run typecheck
```

## 📚 Documentação

- Design do projeto: [docs/specs/2026-11-13-bussola-financeira-design.md](docs/specs/2026-11-13-bussola-financeira-design.md)
- Documentação por área: [docs/documentacao/](docs/documentacao/README.md)
- API interativa (após rodar): `http://localhost:8000/api/docs`

## 🗺️ Roadmap

- [x] Fase 1 — Fundação (monorepo, Docker, CI, auth, esqueleto do front)
- [x] Fase 2 — Contas, categorias e lançamentos
- [x] Fase 3 — Dashboard + usuário demo
- [ ] Fase 4 — Cartões, parcelamentos e recorrências
- [ ] Fase 5 — Orçamento
- [ ] Fase 6 — Importação OFX/CSV
- [ ] Fase 7 — PWA, polimento visual e deploy
