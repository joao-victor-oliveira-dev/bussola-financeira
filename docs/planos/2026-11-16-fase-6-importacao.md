# Fase 6 (Importação): plano de implementação

**Goal:** importar extrato OFX/CSV com prévia, duplicados, categoria sugerida e regras aprendidas.
**Spec:** [docs/specs/2026-11-16-fase-6-importacao.md](../specs/2026-11-16-fase-6-importacao.md)
**Branch:** `feat/fase-6-importacao` (a partir de `develop`), um commit por tarefa, revisão de código ao final e PR para `develop`.

## Foco de revisão
1. OFX com `TRNAMT` em vírgula, data com fuso `[-3:BRT]` e tags SGML sem fechamento.
2. CSV com BOM, `;` e "1.234,56". Linhas vazias ou com valor inválido são reportadas, sem derrubar o lote.
3. Reimportar o mesmo arquivo: tudo marcado como duplicado, e nada é criado se o usuário não marcar.
4. Confirmar duas vezes → 409, sem lançamentos duplicados.
5. Arquivo de outro usuário, conta alheia ou categoria alheia na confirmação → 404/422.

---

### Task 1: parsers puros (OFX e CSV)
- `apps/finance/importers/{ofx,csv_reader,common}.py`. As funções devolvem `ParsedRow(date, description, amount: Decimal, external_id)` e uma lista de erros por linha.
- Testes unitários com arquivos de exemplo em `tests/fixtures/`.

### Task 2: modelos + serviço de importação + regras
- Modelos e migração.
- `apps/finance/importers/service.py`: `create_batch`, `process_batch` (parse, duplicados, sugestão), `confirm_batch`, `undo_batch`.
- `suggest_category`. Tarefa Celery `finance.process_import`.
- Testes: duplicados (3 casos), sugestão (regra > histórico), confirmar com aprendizado, desfazer, 409.

### Task 3: API (imports + rules)
- Upload multipart (Ninja `File`/`Form`), limites, CRUD de regras.
- `customFetch` sem `Content-Type` em FormData.
- Export do OpenAPI e cliente.

### Task 4: tela Importar
- `pages/import/{ImportPage,UploadForm,PreviewTable,ImportHistory,RulesPanel}.tsx` e item na sidebar.
- Testes: upload envia FormData, a prévia desmarca duplicados, confirmar envia as edições e as regras.

### Task 5: docs + verificação visual (com arquivos reais de exemplo) + revisão + PR
