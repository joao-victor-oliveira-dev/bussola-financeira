import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useAccountsList } from '@/api/generated/accounts/accounts'
import { getImportsListQueryKey, useImportsCreate } from '@/api/generated/imports/imports'
import type { BatchOut } from '@/api/generated/model'
import { FormError } from '@/components/FormError'
import { Field, NativeSelect, controlClass } from '@/components/forms'
import { SubmitButton } from '@/components/SubmitButton'
import { errorMessage } from '@/finance/cache'

const PRESETS = {
  auto: 'Detectar automaticamente',
  nubank_conta: 'Nubank (conta)',
  personalizado: 'Personalizado (escolher colunas)',
} as const
type Preset = keyof typeof PRESETS

const DATE_FORMATS = ['dd/mm/aaaa', 'aaaa-mm-dd', 'mm/dd/aaaa'] as const

/** Passo 1: conta + arquivo (+ mapeamento do CSV personalizado). */
export function UploadForm({ onUploaded }: { onUploaded: (batch: BatchOut) => void }) {
  const client = useQueryClient()
  const { data: accounts = [] } = useAccountsList()
  const upload = useImportsCreate()
  const active = accounts.filter((a) => !a.archived)
  const [accountId, setAccountId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preset, setPreset] = useState<Preset>('auto')
  const [columns, setColumns] = useState({ date: '', description: '', amount: '' })
  const [dateFormat, setDateFormat] = useState<(typeof DATE_FORMATS)[number]>('dd/mm/aaaa')
  const [decimal, setDecimal] = useState<',' | '.'>(',')
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [error, setError] = useState<string | null>(null)

  const isCsv = file ? /\.(csv|txt)$/i.test(file.name) : false
  const custom = isCsv && preset === 'personalizado'

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next = {
      account: accountId ? undefined : 'Escolha a conta do extrato.',
      file: file ? undefined : 'Escolha o arquivo OFX ou CSV.',
      columns:
        !custom || (columns.date && columns.description && columns.amount)
          ? undefined
          : 'Informe as colunas de data, descrição e valor.',
    }
    setErrors(next)
    if (Object.values(next).some(Boolean) || !file) return
    setError(null)
    try {
      const batch = await upload.mutateAsync({
        data: {
          account_id: Number(accountId),
          file,
          preset: isCsv ? preset : 'auto',
          ...(custom && {
            mapping: JSON.stringify({ ...columns, date_format: dateFormat, decimal }),
          }),
        },
      })
      await client.invalidateQueries({ queryKey: getImportsListQueryKey() })
      onUploaded(batch)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  const column = (key: keyof typeof columns, label: string) => (
    <Field label={label}>
      {({ id }) => (
        <input
          id={id}
          value={columns[key]}
          onChange={(e) => setColumns((c) => ({ ...c, [key]: e.target.value }))}
          placeholder="nome no cabeçalho"
          className={controlClass}
        />
      )}
    </Field>
  )

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid gap-5 rounded-2xl border border-border bg-card p-5 sm:p-6"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Conta" error={errors.account}>
          {({ id, describedBy, invalid }) => (
            <NativeSelect
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="" disabled>
                Escolha…
              </option>
              {active.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Arquivo do extrato" error={errors.file}>
          {({ id, describedBy, invalid }) => (
            <input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              type="file"
              accept=".ofx,.qfx,.csv,.txt"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className={`${controlClass} py-2 file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm file:text-foreground`}
            />
          )}
        </Field>
      </div>

      {isCsv && (
        <Field label="Formato do CSV">
          {({ id }) => (
            <NativeSelect
              id={id}
              value={preset}
              onChange={(e) => setPreset(e.target.value as Preset)}
            >
              {Object.entries(PRESETS).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      )}

      {custom && (
        <fieldset className="grid gap-4 rounded-xl border border-dashed border-border p-4">
          <legend className="px-1 text-sm font-medium">Colunas do arquivo</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            {column('date', 'Coluna da data')}
            {column('description', 'Coluna da descrição')}
            {column('amount', 'Coluna do valor')}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Formato da data">
              {({ id }) => (
                <NativeSelect
                  id={id}
                  value={dateFormat}
                  onChange={(e) => setDateFormat(e.target.value as typeof dateFormat)}
                >
                  {DATE_FORMATS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label="Separador decimal">
              {({ id }) => (
                <NativeSelect
                  id={id}
                  value={decimal}
                  onChange={(e) => setDecimal(e.target.value as ',' | '.')}
                >
                  <option value=",">Vírgula (1.234,56)</option>
                  <option value=".">Ponto (1,234.56)</option>
                </NativeSelect>
              )}
            </Field>
          </div>
          {errors.columns && <p className="text-sm text-expense">{errors.columns}</p>}
        </fieldset>
      )}

      <p className="text-sm text-muted-foreground">
        OFX ou CSV de até 2 MB. Você revisa tudo antes de importar; nada é criado sem confirmação.
      </p>
      <FormError message={error} />
      <div className="sm:w-56">
        <SubmitButton loading={upload.isPending}>Enviar extrato</SubmitButton>
      </div>
    </form>
  )
}
