import { useId, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CATEGORY_COLORS } from '@/components/ui/CategoryIcon'
import { Field, MoneyInput, Select, TextInput, Toggle } from '@/components/ui/Field'
import { ConfirmSheet, Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { ACCOUNT_TYPE_LABEL, type Account, type AccountType } from '@/domain/types'
import { useRepoMutation } from '@/data/queries'

export function AccountForm({
  account, open, onOpenChange, onSaved, onDeleted,
}: {
  account: Account | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved?: (a: Account) => void
  onDeleted?: () => void
}) {
  const toast = useToast()
  const id = useId()
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<AccountType>(account?.type ?? 'checking')
  const [color, setColor] = useState(account?.color ?? CATEGORY_COLORS[0]!)
  const [initial, setInitial] = useState<number | null>(account?.initialBalance ?? 0)
  const [limit, setLimit] = useState<number | null>(account?.creditLimit ?? null)
  const [closingDay, setClosingDay] = useState(account?.closingDay ?? 1)
  const [dueDay, setDueDay] = useState(account?.dueDay ?? 10)
  const [includeInTotal, setInclude] = useState(account?.includeInTotal ?? true)
  const [archived, setArchived] = useState(account?.archived ?? false)
  const [submitted, setSubmitted] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const isCard = type === 'credit_card'
  const nameError = !name.trim() ? 'Dê um nome para reconhecer a conta.' : null

  const save = useRepoMutation((repo) => repo.saveAccount({
    id: account?.id, name: name.trim(), type, color,
    initialBalance: isCard ? 0 : initial ?? 0,
    creditLimit: isCard ? limit : null,
    closingDay: isCard ? closingDay : null,
    dueDay: isCard ? dueDay : null,
    includeInTotal, archived, sortOrder: account?.sortOrder ?? Date.now() % 100000,
    importKey: account?.importKey ?? null,
  }), ['accounts'])

  const remove = useRepoMutation((repo) => repo.deleteAccount(account!.id), ['accounts', 'transactions', 'recurrences'])

  function submit() {
    setSubmitted(true)
    if (nameError) return
    save.mutate(undefined, {
      onSuccess: (a) => {
        onOpenChange(false)
        toast.success(account ? 'Conta atualizada' : `${isCard ? 'Cartão' : 'Conta'} criado`)
        onSaved?.(a)
      },
      onError: toast.error,
    })
  }

  if (confirm && account) {
    return (
      <ConfirmSheet
        open={open}
        onOpenChange={onOpenChange}
        title={`Excluir “${account.name}”?`}
        description="Todos os lançamentos, transferências e recorrências desta conta serão apagados de vez. Se quiser só tirar da tela, arquive."
        confirmLabel="Excluir conta e lançamentos"
        loading={remove.isPending}
        onConfirm={() => remove.mutate(undefined, {
          onSuccess: () => { onOpenChange(false); toast.success('Conta excluída'); onDeleted?.() },
          onError: toast.error,
        })}
      />
    )
  }

  const days = Array.from({ length: 31 }, (_, i) => i + 1)

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={account ? 'Editar conta' : 'Nova conta'}
      footer={<Button type="submit" form={id} block size="lg" loading={save.isPending}>{account ? 'Salvar alterações' : 'Criar'}</Button>}
    >
      <form id={id} onSubmit={(e) => { e.preventDefault(); submit() }} className="flex flex-col gap-5" noValidate>
        <Field label="Tipo" htmlFor={`${id}-type`}>
          <Select id={`${id}-type`} value={type} onChange={(e) => setType(e.target.value as AccountType)} disabled={Boolean(account)}>
            {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABEL[t]}</option>)}
          </Select>
        </Field>
        <Field label="Nome" htmlFor={`${id}-name`} error={submitted ? nameError : null}>
          <TextInput id={`${id}-name`} value={name} maxLength={60} autoFocus={!account}
            placeholder={isCard ? 'Ex.: Cartão do banco' : 'Ex.: Conta do banco'}
            onChange={(e) => setName(e.target.value)} aria-invalid={submitted && !!nameError} />
        </Field>

        {isCard ? (
          <>
            <Field label="Limite" htmlFor={`${id}-limit`} hint="Opcional. Usado para mostrar quanto do limite já está comprometido.">
              <MoneyInput id={`${id}-limit`} value={limit} onChange={setLimit} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Fecha no dia" htmlFor={`${id}-close`}>
                <Select id={`${id}-close`} value={closingDay} onChange={(e) => setClosingDay(Number(e.target.value))}>
                  {days.map((d) => <option key={d} value={d}>{d}</option>)}
                </Select>
              </Field>
              <Field label="Vence no dia" htmlFor={`${id}-due`}>
                <Select id={`${id}-due`} value={dueDay} onChange={(e) => setDueDay(Number(e.target.value))}>
                  {days.map((d) => <option key={d} value={d}>{d}</option>)}
                </Select>
              </Field>
            </div>
            <p className="-mt-2 text-[13px] text-faint">
              Compras feitas a partir do dia {closingDay} entram na fatura do mês seguinte.
            </p>
          </>
        ) : (
          <Field label={account ? 'Saldo inicial' : 'Saldo de hoje'} htmlFor={`${id}-initial`}
            hint={account ? 'O saldo que a conta tinha antes do primeiro lançamento.' : 'Quanto há na conta agora. Use “-” se estiver negativa.'}>
            <MoneyInput id={`${id}-initial`} value={initial} onChange={setInitial} allowNegative />
          </Field>
        )}

        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-muted">Cor</legend>
          <div className="flex flex-wrap gap-2.5" role="radiogroup">
            {CATEGORY_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c}
                onClick={() => setColor(c)}
                className="size-9 rounded-full ring-offset-2 ring-offset-surface transition-shadow aria-checked:ring-2 aria-checked:ring-ink"
                style={{ background: c }} />
            ))}
          </div>
        </fieldset>

        {!isCard && (
          <Toggle checked={includeInTotal} onChange={setInclude} label="Somar no saldo total"
            description="Desative para contas que você não quer ver no saldo do Início." />
        )}
        {account && (
          <Toggle checked={archived} onChange={setArchived} label="Arquivar"
            description="Some das listas e do lançamento, mas mantém o histórico." />
        )}
        {account && (
          <button type="button" onClick={() => setConfirm(true)} className="self-start text-sm font-semibold text-loss hover:underline">
            Excluir conta
          </button>
        )}
      </form>
    </Sheet>
  )
}
