# Fase 7 (Polimento e deploy): plano de implementação

**Spec:** [docs/specs/2026-11-16-fase-7-polimento-deploy.md](../specs/2026-11-16-fase-7-polimento-deploy.md)
**Branch:** `feat/fase-7-polimento` (a partir de `develop`), um commit por tarefa, revisão ao final e PR para `develop`.

## Foco de revisão
1. O service worker não pode guardar respostas de `/api`. Sair da conta e trocar de usuário não pode mostrar dado de outra pessoa.
2. O endpoint interno compara o segredo em tempo constante. Sem `CRON_SECRET` configurado, fica desligado (404).
3. Produção com `DEBUG=False`: CSRF via o domínio do Vercel (`CSRF_TRUSTED_ORIGINS`), cookies `Secure` e o proxy HTTPS reconhecido.
4. Rotas lazy com erro de rede ao carregar o chunk (depois de um deploy novo): a página se recupera, sem tela branca.

---

### Task 1: divisão do código por página
- `router.tsx` com `lazy()` e `Suspense` (fallback de skeleton) por rota.
- Um error boundary que recarrega quando o chunk falha.
- Teste: as rotas continuam renderizando (suíte atual). Build sem aviso de 500 kB.

### Task 2: PWA
- `vite-plugin-pwa`, `manifest`, ícones em `public/` (gerados da agulha) e `navigateFallbackDenylist: [/^\/api/]`.
- Teste: a configuração do workbox exclui `/api`. Build gera `sw.js` e `manifest.webmanifest`.

### Task 3: acessibilidade
- Skip link e `id="conteudo"` no `main`.
- Rodar axe nas páginas, nos dois temas, e corrigir o que aparecer.
- Teste do skip link.

### Task 4: produção e deploy
- `whitenoise` e as settings de produção.
- Endpoint `POST /api/internal/daily`.
- `render.yaml`, `vercel.json` e `.github/workflows/daily.yml`.
- Testes do endpoint (403, 404 sem segredo, 200 executa).

### Task 5: README + screenshots + docs + revisão + PR
