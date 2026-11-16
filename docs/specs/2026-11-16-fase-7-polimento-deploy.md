# Fase 7: Polimento, PWA, acessibilidade e deploy

**Status:** decidido pelo Claude (autorizado: "caso haja perguntas, siga o seu recomendado"), 2026-11-16
**Design-mãe:** [2026-11-13-bussola-financeira-design.md](2026-11-13-bussola-financeira-design.md) (fase 7; deploy Render + Vercel com rewrite)

## Intenção

Deixar o portfólio pronto para ser visitado:
- Carrega rápido (pacote dividido por página).
- Instala no celular (PWA).
- Passa numa checagem automática de acessibilidade.
- Tem um README que vende o projeto.
- Tem tudo configurado para o deploy. O único passo manual que sobra é criar as contas no Render e no Vercel.

## Decisões

- **Divisão do código por página:** `React.lazy` nas rotas, com fallback de skeleton. O Recharts fica só no chunk do painel. Meta: nenhum chunk acima de 500 kB.
- **PWA com `vite-plugin-pwa`:**
  - Manifest com ícones gerados a partir da agulha do logo (192, 512 e maskable).
  - O service worker guarda o app shell. A `/api` **nunca** entra no cache (NetworkOnly): dado financeiro tem de vir sempre do servidor.
  - Atualização automática.
- **Acessibilidade:**
  - Link "Pular para o conteúdo".
  - `axe-core` (via Playwright) nas páginas principais, nos dois temas. Problemas sérios e críticos são corrigidos.
  - Contraste verificado.
- **Deploy:**
  - **API no Render**, como web service Python, com o Postgres do Render. Fica num `render.yaml` (Blueprint).
  - **Front no Vercel**, com um `vercel.json` que reescreve `/api/*` para o Render. Assim API e front ficam na **mesma origem**, e o cookie de sessão e o CSRF funcionam sem CORS.
- **Tarefas diárias em produção sem worker pago:** um endpoint interno `POST /api/internal/daily`, protegido por `X-Cron-Secret`, roda a geração de recorrências e o reset da demo. Um workflow agendado do GitHub Actions chama esse endpoint às 3h de Brasília. No Docker e no ambiente local continua o Celery beat.
- **Estáticos do admin com WhiteNoise.** Em produção valem `SECURE_PROXY_SSL_HEADER`, HSTS e cookies seguros.
- **README:** screenshots reais (painel, lançamentos, cartões, orçamento, importação, celular), diagrama de arquitetura em Mermaid, "Experimente como visitante" e como fazer o deploy. Sem GIF, porque não há ffmpeg no ambiente; dá para gerar depois.

## Fora do escopo

Domínio próprio, monitoramento (Sentry), notificações push.

## Critério de pronto

- `npm run build` sem aviso de chunk grande.
- Lighthouse e PWA instaláveis, com manifest e service worker válidos.
- Axe sem violações sérias ou críticas nas páginas principais.
- Testes do endpoint interno: sem segredo → 403, com segredo → executa.
- `render.yaml`, `vercel.json` e o workflow agendado versionados.
- README e doc de arquitetura atualizados.
- Revisão de código e PR.
- **Passo manual (do autor):** criar as contas no Render e no Vercel e apontar o repositório. O passo a passo fica no README.
