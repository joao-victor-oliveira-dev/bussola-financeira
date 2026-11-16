# Importação de extrato (OFX/CSV) e regras de categorização

## O que faz
O usuário envia o extrato do banco (OFX ou CSV) para uma conta. O sistema monta uma **prévia**: duplicados já desmarcados e categoria sugerida. O usuário revisa e confirma. As categorias corrigidas podem virar **regras** para as próximas importações. Uma importação pode ser **desfeita**. A spec está em [`docs/specs/2026-11-16-fase-6-importacao.md`](../specs/2026-11-16-fase-6-importacao.md).

Arquivos para testar: [`docs/exemplos/extrato-exemplo.csv`](../exemplos/extrato-exemplo.csv) e [`extrato-exemplo.ofx`](../exemplos/extrato-exemplo.ofx). Na demo eles já chegam com categorias sugeridas.

## Onde está o código
| Camada | Arquivo | Papel |
|---|---|---|
| Leitores | `backend/apps/finance/importers/{common,ofx,csv_reader}.py` | `parse_ofx`, `parse_csv` → `ParseResult(rows, errors)`, `normalize_text`, `parse_decimal`, `decode_bytes` |
| Serviço | `backend/apps/finance/importers/service.py` | `create_batch`, `process_batch`, `suggest_category`, `confirm_batch`, `undo_batch` |
| Tarefa | `backend/apps/finance/tasks.py` | `finance.process_import` (eager sem broker) |
| Modelos | `backend/apps/finance/models.py` | `ImportBatch`, `ImportRow`, `CategorizationRule` e `Transaction.import_batch`/`external_id` |
| API | `backend/apps/finance/api/imports.py` | `/imports` e `/rules` |
| Tela | `frontend/src/pages/import/` | `ImportPage`, `UploadForm`, `PreviewTable`, `ImportHistory`, `RulesPanel` |

## Leitura dos arquivos
- **OFX:** parser próprio, sem `ofxparse`, que está sem manutenção.
  - Lê os blocos `<STMTTRN>` em SGML (tags sem fechamento) ou XML.
  - Datas `YYYYMMDD[hhmmss][.xxx][TZ]`. Valor com ponto ou vírgula.
  - A descrição é `NAME - MEMO`. O identificador é o `FITID`.
  - O separador decimal do `TRNAMT` é o **último** entre `,` e `.` (`guess_decimal`): `1,234.56` → 1234,56.
  - Valor 0 é ignorado. Uma transação inválida vira erro de linha e não derruba o lote.
- **CSV:**
  - Preset `nubank_conta` (`Data,Valor,Identificador,Descrição`, `dd/mm/aaaa`, ponto decimal), detectado pelo cabeçalho no modo `auto`.
  - Ou `personalizado`, com mapeamento: colunas de data, descrição e valor, mais identificador opcional, formato de data e separador decimal.
  - O separador `,` ou `;` é detectado sozinho. Arquivo UTF-8 com BOM ou Latin-1.
  - Linhas vazias são ignoradas. Linhas inválidas são reportadas com o número real da linha.
- **Sem identificador do banco:** `external_id` = hash de data, valor, descrição normalizada e **nº da repetição** no arquivo. É estável entre reimportações e distingue dois lançamentos iguais no mesmo dia.
- **Sinal:** negativo → despesa, positivo → receita. A linha guarda o valor absoluto.
- **Conteúdo:** fica em `ImportBatch.raw`, limite de 2 MB. Não há `FileField` porque o servidor não tem disco persistente. É **limpo** depois de confirmar ou falhar, e a listagem nem o carrega (`defer`).
- **Qualquer erro de leitura**, inclusive inesperado, marca o lote como `failed` com mensagem. Nenhum lote fica preso em `processing`. Mapeamento que não é um objeto JSON de textos → 422 já no upload.

## Prévia
- **Duplicado** (desmarcado por padrão):
  - mesmo `external_id` na conta;
  - **ou** lançamento existente na conta com mesma data, valor e tipo (pega o que foi digitado à mão);
  - **ou** repetido no próprio arquivo.
- **Sugestão** (do mesmo tipo da linha):
  1. Regra ativa cujo padrão está contido na descrição normalizada. Vence a maior prioridade e, depois, o padrão mais longo.
  2. A categoria usada da última vez para a mesma descrição (até os 2000 lançamentos mais recentes).
  3. Nenhuma.
- **Status do lote:** `processing` → `preview` (ou `failed`, com `error`) → `done` → `undone`. A tela consulta a cada 1 s enquanto o lote está `processing`, o que acontece com Celery de verdade.

## Confirmar e desfazer
- **Confirmar:** recebe a lista de linhas `{id, include, category_id}`. Uma linha omitida entra se não for duplicada, com a sugestão.
  - Cria lançamentos **efetivados** com `import_batch` e `external_id`.
  - É atômico e trava o lote: uma segunda confirmação → 409.
  - Uma categoria de outro usuário ou de outro tipo → 422.
- **Aprender** (opt-in, desligado por padrão): cada **padrão distinto** cuja categoria foi trocada cria ou atualiza uma regra com padrão = descrição normalizada e prioridade 10. Uma regra **feita à mão** com o mesmo padrão nunca é sobrescrita nem reativada. `rules_learned` conta regras, não linhas.
- **Desfazer:**
  - Lote confirmado: remove os lançamentos dele e marca `undone`. Se algum deles estiver numa fatura paga (foi movido para um cartão), responde **409** e não remove nada.
  - Prévia ou falha: descarta o lote.
  - Relê o lote do banco antes de decidir, porque o objeto em mãos pode estar desatualizado.

## Endpoints
| Rota | Notas |
|---|---|
| `POST /api/imports` | multipart: `file`, `account_id`, `preset` (`auto`/`nubank_conta`/`personalizado`), `mapping` (JSON). Conta alheia ou arquivada, arquivo > 2 MB, extensão diferente de `.ofx/.qfx/.csv/.txt`, CSV sem colunas reconhecidas ou JSON inválido → 422. Exige CSRF. |
| `GET /api/imports` | Últimos 20 lotes |
| `GET /api/imports/{id}` | Lote + linhas |
| `POST /api/imports/{id}/confirm` | `{rows, learn}` → `{created, rules_learned}` |
| `DELETE /api/imports/{id}` | Desfaz ou descarta |
| `GET/POST /api/rules`, `PATCH/DELETE /api/rules/{id}` | O padrão é normalizado ao salvar. Duplicado (mesmo padrão e tipo) → 409. Categoria alheia → 422. |

## Front
- `customFetch` não define `Content-Type` quando o corpo é `FormData`: o navegador põe o boundary.
- O lote aberto fica na URL (`/importar?lote=7`). Recarregar mantém a revisão.
- Na prévia, o select de categoria só mostra as do mesmo tipo da linha. O botão diz quantos lançamentos vão ser criados.
- Abaixo ficam o histórico (Revisar / Desfazer, com confirmação) e as regras (criar, ativar e desativar, excluir; as aprendidas aparecem com o rótulo "aprendida").

## Como testar
- Backend: `pytest apps/finance/tests/test_importers.py test_import_service.py test_import_api.py`.
- Front: `src/pages/import/ImportPage.test.tsx` e o teste de FormData em `src/api/http.test.ts`.
- Manual: entre como visitante, vá em Importar, envie `docs/exemplos/extrato-exemplo.csv` para o Nubank e depois reenvie o mesmo arquivo (tudo vem como "Já existe").

## Histórico de mudanças
- 2026-11-16: criação (Fase 6).
- 2026-11-16: revisão da Fase 6. Lote nunca fica preso, desfazer respeita fatura paga, regra manual preservada, conta arquivada recusada, `raw` limpo, decimal do OFX, `ImportConflict` (409 por tipo) e tela de erro para lote inexistente.
