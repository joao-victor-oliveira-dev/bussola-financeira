# Fase 6: Importação de extrato (OFX/CSV) e regras de categorização

**Status:** decidido pelo Claude (autorizado: "caso haja perguntas, siga o seu recomendado"), 2026-11-16
**Design-mãe:** [2026-11-13-bussola-financeira-design.md](2026-11-13-bussola-financeira-design.md) (ImportBatch, ImportRow, CategorizationRule; fluxo de importação)

## Intenção

O usuário não precisa digitar o extrato do banco: ele envia o arquivo, revisa uma prévia (com duplicados já marcados e categoria sugerida) e confirma. Quanto mais ele usa, melhores ficam as sugestões, porque as correções viram regras.

## Escopo

**Dentro:**
- Upload de **OFX** e **CSV** para uma **conta**.
- Parsing assíncrono (Celery; sem broker roda na hora).
- Prévia com duplicados e categoria sugerida. Confirmação com edição de categoria e inclusão.
- Regras "descrição contém X → categoria Y" com prioridade, aprendidas opcionalmente.
- Desfazer uma importação. Histórico das importações.

**Fora:** importar fatura de cartão de crédito (fica para depois), Open Finance, PDF.

## Decisões

- **Parser OFX próprio**, em vez do `ofxparse` previsto no design-mãe. O formato que importa (`<STMTTRN>` com `TRNTYPE`, `DTPOSTED`, `TRNAMT`, `FITID`, `NAME`/`MEMO`) é pequeno, e o `ofxparse` está sem manutenção desde 2021. O parser lê SGML e XML, aceita datas `YYYYMMDD[hhmmss][.xxx][TZ]` e valores com ponto ou vírgula.
- **O conteúdo do arquivo fica no banco** (`ImportBatch.raw`, limite de **2 MB**), sem `FileField`. O Render não tem disco persistente, e o arquivo só serve para o parsing.
- **CSV:**
  - **Presets:** `nubank_conta` (`Data,Valor,Identificador,Descrição`, datas `dd/mm/aaaa`, ponto decimal) e `personalizado`.
  - **Mapeamento do `personalizado`:** coluna de data, de descrição e de valor, mais uma coluna opcional de identificador, formato de data (`dd/mm/aaaa`, `aaaa-mm-dd` ou `mm/dd/aaaa`) e separador decimal (vírgula ou ponto).
  - **Separador de colunas:** detectado sozinho (`,` ou `;`).
  - **Codificação:** UTF-8 com BOM ou Latin-1.
- **Sinal:** valor negativo vira despesa e valor positivo vira receita. Linha com valor 0 é ignorada.
- **Identificador externo:**
  - OFX usa o `FITID`.
  - CSV usa a coluna de identificador, se houver. Senão, usa um hash de data, valor e descrição normalizada.
- **Duplicado** (desmarcado por padrão na prévia):
  - Mesmo `external_id` na mesma conta.
  - **Ou** um lançamento existente na conta com mesma data, mesmo valor e mesmo tipo, que pega o que foi digitado à mão.
  - **Ou** repetido dentro do próprio arquivo.
- **Categoria sugerida** (do mesmo tipo da linha), nesta ordem:
  1. Regra ativa de maior prioridade cujo padrão está contido na descrição (sem diferenciar maiúsculas e acentos).
  2. A categoria usada da última vez num lançamento com a mesma descrição normalizada.
  3. Nenhuma.
- **Aprender:** na confirmação, com "lembrar minhas correções" ligado, cada linha cuja categoria o usuário trocou cria (ou atualiza) uma regra. O padrão é a descrição normalizada e a prioridade é 10, acima das regras manuais padrão (0).
- **Confirmar:** cria lançamentos **efetivados**, ligados ao `import_batch`, com `external_id`. É atômico. Uma importação só pode ser confirmada uma vez (409).
- **Desfazer:** exclui os lançamentos que vieram da importação e marca o lote como desfeito. Uma prévia não confirmada é simplesmente descartada.

## Modelos

- `ImportBatch`: conta, nome do arquivo, formato, opções (JSON), conteúdo, status (`processing`/`preview`/`done`/`failed`/`undone`), erro e contadores.
- `ImportRow`: lote, linha, data, descrição, tipo, valor, `external_id`, categoria sugerida, `is_duplicate`.
- `CategorizationRule`: padrão, categoria, prioridade e se está ativa. Unique (usuário, padrão, tipo da categoria).
- `Transaction`: ganha `import_batch` e `external_id`, com índice em (conta, `external_id`).

## API (sessão, filtrado por usuário)

| Rota | Notas |
|---|---|
| `POST /imports` | multipart: `file`, `account_id`, `preset` (`auto`/`nubank_conta`/`personalizado`) e `mapping` (JSON, só no personalizado). Arquivo > 2 MB, formato desconhecido ou conta de outro usuário → 422. Responde o lote (já em `preview` sem broker). |
| `GET /imports` | Últimos 20 lotes |
| `GET /imports/{id}` | Lote + linhas (com sugestão e duplicado) |
| `POST /imports/{id}/confirm` | `{rows: [{id, include, category_id}], learn: bool}` → `{created, rules_learned}`. Linhas omitidas seguem o padrão (inclui se não é duplicada, com a categoria sugerida). |
| `DELETE /imports/{id}` | Prévia: descarta. Confirmada: desfaz (remove os lançamentos). |
| `GET/POST /rules`, `PATCH/DELETE /rules/{id}` | Regras de categorização |

## Tela

**Importar** (`/importar`, na sidebar, com atalho em Lançamentos):

1. **Enviar.** Conta, arquivo e preset. O preset é automático pela extensão; no CSV personalizado aparecem os campos de mapeamento.
2. **Revisar.** Tabela com caixa "incluir", data, descrição, valor colorido, categoria (select já com a sugestão) e o selo "Duplicado". Mostra os totais (n linhas, duplicados, a importar), a opção "Lembrar as categorias que eu corrigir" e o botão "Importar N lançamentos" (ou "Descartar").
3. **Concluído.** Toast e link para Lançamentos.

Abaixo ficam o **histórico** (com "Desfazer") e as **regras de categorização** (criar, ativar e desativar, excluir).

## Critério de pronto

Testes de backend para:
- OFX (SGML e XML, datas com fuso, vírgula decimal).
- CSV (os dois presets, `;` e vírgula decimal, BOM).
- Duplicados (FITID, manual e dentro do arquivo).
- Sugestão por regra e por histórico.
- Confirmação com edição e aprendizado.
- Desfazer.
- Limites de tamanho e formato.
- Isolamento entre usuários.

Testes de front para o upload, a prévia e o confirmar. Doc viva `importacao.md`. Revisão de código ao final.
