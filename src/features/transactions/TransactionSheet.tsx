import { createContext, use, useId, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { Field, MoneyInput, Segmented, Select, TextInput, Toggle } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { composeTransactions } from '@/domain/compose'
import { addDays, endOfMonth, monthLabel, shortDate, today } from '@/domain/dates'
import { invoiceDueDate, invoiceMonthFor } from '@/domain/invoice'
import { formatBRL, splitInstallments } from '@/domain/money'
import type { Account, Category, Frequency, ISODate, Transaction, TxType } from '@/domain/types'
import { FREQUENCY_LABEL } from '@/domain/types'
import { useAccounts, useCategories, useDescriptions, useRepoMutation } from '@/data/queries'
import { cn } from '@/lib/cn'

interface OpenOptions {
  type?: TxType
  accountId?: string
  toAccountId?: string
  amount?: number
  description?: string
  date?: ISODate
  invoiceMonth?: ISODate | null
}

interface TxSheetApi {
  openNew: (opts?: OpenOptions) => void
  openEdit: (tx: Transaction) => void
}

const TxSheetContext = createContext<TxSheetApi | null>(null)

export function useTxSheet(): TxSheetApi {
  const ctx = use(TxSheetContext)
  if (!ctx) throw new Error('TxSheetProvider ausente')
  return ctx
}

type State = { mode: 'new'; opts: OpenOptions; key: number } | { mode: 'edit'; tx: Transaction; key: number } | null

export function TxSheetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(null)
  const [open, setOpen] = useState(false)
  const api: TxSheetApi = {
    openNew: (opts = {}) => { setState({ mode: 'new', opts, key: Date.now() }); setOpen(true) },
    openEdit: (tx) => { setState({ mode: 'edit', tx, key: Date.now() }); setOpen(true) },
  }
  return (
    <TxSheetContext value={api}>
      {children}
      {state && <TransactionForm key={state.key} state={state} open={open} onOpenChange={setOpen} />}
    </TxSheetContext>
  )
}

// ---------------------------------------------------------------------------

type Repeat = 'none' | Frequency

function TransactionForm({
  state, open, onOpenChange,
}: {
  state: NonNullable<State>
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const toast = useToast()
  const formId = useId()
  const { data: accounts = [] } = useAccounts()
  const { data: categories = [] } = useCategories()
  const { data: descriptions = [] } = useDescriptions()

  const editing = state.mode === 'edit' ? state.tx : null
  const opts = state.mode === 'new' ? state.opts : {}
  const activeAccounts = accounts.filter((a) => !a.archived || a.id === editing?.accountId)
  const defaultAccount = activeAccounts.find((a) => a.type !== 'credit_card') ?? activeAccounts[0]

  const [type, setType] = useState<TxType>(editing?.type ?? opts.type ?? 'expense')
  const [amount, setAmount] = useState<number | null>(editing?.amount ?? opts.amount ?? null)
  const [description, setDescription] = useState(editing?.description ?? opts.description ?? '')
  const [date, setDate] = useState<ISODate>(editing?.date ?? opts.date ?? today())
  const [accountId, setAccountId] = useState(editing?.accountId ?? opts.accountId ?? defaultAccount?.id ?? '')
  const [toAccountId, setToAccountId] = useState(editing?.toAccountId ?? opts.toAccountId ?? '')
  const [categoryId, setCategoryId] = useState<string | null>(editing?.categoryId ?? null)
  const [paid, setPaid] = useState(editing?.paid ?? true)
  const [notes, setNotes] = useState(editing?.notes ?? '')
  const [installments, setInstallments] = useState(1)
  const [repeat, setRepeat] = useState<Repeat>('none')
  const [moreOpen, setMoreOpen] = useState(Boolean(editing?.notes))
  const [submitted, setSubmitted] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const account = accounts.find((a) => a.id === accountId)
  const isCard = account?.type === 'credit_card'
  const kindCategories = categories.filter((c) => !c.archived && c.kind === (type === 'income' ? 'income' : 'expense'))

  const errors = {
    amount: !amount || amount <= 0 ? 'Informe um valor maior que zero.' : null,
    account: !accountId ? 'Escolha uma conta.' : null,
    to: type === 'transfer' && (!toAccountId || toAccountId === accountId) ? 'Escolha uma conta de destino diferente da origem.' : null,
  }
  const valid = !errors.amount && !errors.account && !errors.to

  const save = useRepoMutation(async (repo) => {
    if (!account || !amount) return
    const finalDescription =
      description.trim() ||
      (type === 'transfer'
        ? `Para ${accounts.find((a) => a.id === toAccountId)?.name ?? 'outra conta'}`
        : categories.find((c) => c.id === categoryId)?.name ?? (type === 'income' ? 'Receita' : 'Despesa'))

    if (editing) {
      const [row] = composeTransactions(
        { type, amount, date, description: finalDescription, notes, accountId, toAccountId: toAccountId || null,
          categoryId, paid, installments: 1, invoiceMonth: editing.invoiceMonth },
        account, () => '', accounts.find((a) => a.id === toAccountId),
      )
      // Mantém vínculos de parcelamento/recorrência ao editar uma ocorrência
      // (e o vínculo com o banco, senão a próxima importação duplicaria o lançamento)
      const { installmentGroup, installmentNumber, installmentTotal, recurrenceId, externalId, importId, ...patch } = row!
      void installmentGroup; void installmentNumber; void installmentTotal; void recurrenceId; void externalId; void importId
      // Parcelas mantêm a fatura original, para não desalinhar a sequência
      if (editing.installmentGroup && editing.accountId === accountId) patch.invoiceMonth = editing.invoiceMonth
      await repo.updateTransaction(editing.id, patch)
      return
    }

    if (repeat !== 'none' && type !== 'transfer') {
      await repo.saveRecurrence({
        description: finalDescription, type, amount, accountId, categoryId, frequency: repeat,
        startDate: date, endDate: null, active: true,
      })
      await repo.generateRecurring(endOfMonth(today()))
      return
    }

    const rows = composeTransactions(
      { type, amount, date, description: finalDescription, notes, accountId, toAccountId: toAccountId || null,
        categoryId, paid, installments: type === 'expense' ? installments : 1, invoiceMonth: opts.invoiceMonth ?? null },
      account, () => crypto.randomUUID(), accounts.find((a) => a.id === toAccountId),
    )
    await repo.createTransactions(rows)
  }, ['transactions', 'recurrences'])

  const remove = useRepoMutation(async (repo, scope: 'one' | 'rest') => {
    if (!editing) return
    if (scope === 'rest' && editing.installmentGroup && editing.installmentNumber) {
      await repo.deleteInstallments(editing.installmentGroup, editing.installmentNumber)
    } else {
      await repo.deleteTransaction(editing.id)
    }
  }, ['transactions'])

  function submit() {
    setSubmitted(true)
    if (!valid) return
    save.mutate(undefined, {
      onSuccess: () => {
        onOpenChange(false)
        toast.success(
          editing ? 'Lançamento atualizado'
            : repeat !== 'none' ? 'Lançamento recorrente criado'
            : installments > 1 && type === 'expense' ? `${installments} parcelas lançadas`
            : 'Lançamento salvo',
        )
      },
      onError: toast.error,
    })
  }

  function pickDescription(value: string) {
    setDescription(value)
    if (categoryId) return
    const match = descriptions.find((d) => d.description.toLowerCase() === value.trim().toLowerCase())
    if (match?.categoryId && match.type === type) setCategoryId(match.categoryId)
  }

  function changeType(t: TxType) {
    setType(t)
    const cat = categories.find((c) => c.id === categoryId)
    if (cat && cat.kind !== (t === 'income' ? 'income' : 'expense')) setCategoryId(null)
    if (t === 'transfer' && isCard) setAccountId(defaultAccount?.id ?? '')
  }

  const title = editing
    ? 'Editar lançamento'
    : { expense: 'Nova despesa', income: 'Nova receita', transfer: 'Nova transferência' }[type]

  const suggestions = useMemo(
    () => descriptions.filter((d) => d.type === type).slice(0, 60),
    [descriptions, type],
  )
  const installmentValue = amount && installments > 1 ? splitInstallments(amount, installments)[1] : null

  if (confirmDelete && editing) {
    return (
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title="Excluir lançamento?"
        description={
          editing.installmentGroup
            ? `“${editing.description}” é a parcela ${editing.installmentNumber} de ${editing.installmentTotal}.`
            : `“${editing.description}” de ${formatBRL(editing.amount)} será removido e os saldos recalculados.`
        }
        footer={
          editing.installmentGroup ? (
            <div className="flex w-full flex-col gap-2">
              <Button variant="danger" block loading={remove.isPending && remove.variables === 'rest'}
                onClick={() => remove.mutate('rest', { onSuccess: () => { onOpenChange(false); toast.success('Parcelas excluídas') }, onError: toast.error })}>
                Excluir esta e as próximas
              </Button>
              <Button variant="secondary" block loading={remove.isPending && remove.variables === 'one'}
                onClick={() => remove.mutate('one', { onSuccess: () => { onOpenChange(false); toast.success('Parcela excluída') }, onError: toast.error })}>
                Excluir só esta parcela
              </Button>
              <Button variant="ghost" block onClick={() => setConfirmDelete(false)}>Voltar</Button>
            </div>
          ) : (
            <>
              <Button variant="secondary" block onClick={() => setConfirmDelete(false)}>Voltar</Button>
              <Button variant="danger" block loading={remove.isPending}
                onClick={() => remove.mutate('one', { onSuccess: () => { onOpenChange(false); toast.success('Lançamento excluído') }, onError: toast.error })}>
                Excluir
              </Button>
            </>
          )
        }
      >
        {editing.recurrenceId && (
          <p className="text-sm text-muted">
            Só esta ocorrência será removida. Para parar a repetição, vá em Planejar › Recorrentes.
          </p>
        )}
      </Sheet>
    )
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          {editing && (
            <IconButton label="Excluir lançamento" onClick={() => setConfirmDelete(true)} className="size-11 text-loss hover:bg-loss-soft hover:text-loss">
              <Trash2 className="size-5" />
            </IconButton>
          )}
          <Button type="submit" form={formId} block size="lg" loading={save.isPending}>
            {editing ? 'Salvar alterações' : 'Salvar'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={(e) => { e.preventDefault(); submit() }} className="flex flex-col gap-5" noValidate>
        {!editing?.installmentGroup && !editing?.recurrenceId && (
          <Segmented
            label="Tipo de lançamento"
            value={type}
            onChange={changeType}
            options={[
              { value: 'expense', label: 'Despesa', tone: 'loss' },
              { value: 'income', label: 'Receita', tone: 'gain' },
              { value: 'transfer', label: 'Transferência', tone: 'brass' },
            ]}
          />
        )}

        <div>
          <label htmlFor={`${formId}-amount`} className="sr-only">Valor</label>
          <MoneyInput id={`${formId}-amount`} size="xl" value={amount} onChange={setAmount} autoFocus={!editing}
            invalid={submitted && !!errors.amount} />
          {submitted && errors.amount && <p role="alert" className="mt-1 text-[13px] text-loss">{errors.amount}</p>}
          {editing?.installmentGroup && (
            <p className="mt-1 text-[13px] text-muted">Parcela {editing.installmentNumber} de {editing.installmentTotal}</p>
          )}
        </div>

        <Field label="Descrição" htmlFor={`${formId}-desc`}>
          <TextInput
            id={`${formId}-desc`}
            list={`${formId}-suggestions`}
            maxLength={80}
            placeholder={type === 'transfer' ? 'Ex.: Guardar na reserva' : type === 'income' ? 'Ex.: Salário' : 'Ex.: Mercado do mês'}
            value={description}
            onChange={(e) => pickDescription(e.target.value)}
          />
          <datalist id={`${formId}-suggestions`}>
            {suggestions.map((s) => <option key={s.description} value={s.description} />)}
          </datalist>
        </Field>

        {type !== 'transfer' && (
          <CategoryPicker categories={kindCategories} value={categoryId} onChange={setCategoryId} />
        )}

        {type === 'transfer' ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <AccountSelect label="Sai de" id={`${formId}-from`} accounts={activeAccounts.filter((a) => a.type !== 'credit_card')}
              value={accountId} onChange={setAccountId} error={submitted ? errors.account : null} />
            <AccountSelect label="Vai para" id={`${formId}-to`} accounts={activeAccounts.filter((a) => a.id !== accountId)}
              value={toAccountId} onChange={setToAccountId} error={submitted ? errors.to : null} placeholder="Escolha a conta" />
          </div>
        ) : (
          <AccountSelect label={type === 'income' ? 'Recebido em' : 'Pago com'} id={`${formId}-acc`}
            accounts={type === 'income' ? activeAccounts.filter((a) => a.type !== 'credit_card' || a.id === accountId) : activeAccounts}
            value={accountId} onChange={setAccountId} error={submitted ? errors.account : null} />
        )}

        <DatePicker id={`${formId}-date`} value={date} onChange={setDate} />

        {!isCard && type !== 'transfer' && (
          <Toggle
            checked={paid}
            onChange={setPaid}
            label={type === 'income' ? 'Já recebi' : 'Já foi pago'}
            description={paid ? 'Entra no saldo da conta' : 'Fica como pendente até você confirmar'}
          />
        )}
        {isCard && type === 'expense' && account?.closingDay && account.dueDay && (
          <p className="rounded-xl bg-raised px-3.5 py-2.5 text-[13px] text-muted">
            {(() => {
              const inv = invoiceMonthFor(date, account!.closingDay!, account!.dueDay!)
              return `Entra na fatura de ${monthLabel(inv)}, que vence em ${shortDate(invoiceDueDate(inv, account!.dueDay!))}.`
            })()}
            {installments > 1 && ' As próximas parcelas vão para as faturas seguintes.'}
          </p>
        )}

        <div className="rounded-2xl border border-line">
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            aria-expanded={moreOpen}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-muted hover:text-ink"
          >
            {editing ? 'Observação' : type === 'transfer' ? 'Observação' : 'Parcelar, repetir ou anotar'}
            <ChevronDown className={cn('size-4 transition-transform', moreOpen && 'rotate-180')} />
          </button>
          {moreOpen && (
            <div className="flex flex-col gap-4 border-t border-line px-4 pb-4 pt-4">
              {!editing && type === 'expense' && repeat === 'none' && (
                <Field
                  label="Parcelas"
                  htmlFor={`${formId}-inst`}
                  hint={installmentValue ? `${installments}× de ${formatBRL(installmentValue)} — uma por mês a partir desta data` : 'À vista'}
                >
                  <Select id={`${formId}-inst`} value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
                    <option value={1}>À vista</option>
                    {Array.from({ length: 47 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}×</option>)}
                  </Select>
                </Field>
              )}
              {!editing && type !== 'transfer' && installments === 1 && (
                <Field label="Repetir" htmlFor={`${formId}-rep`}
                  hint={repeat === 'none' ? undefined : 'As próximas ocorrências são criadas automaticamente como pendentes.'}>
                  <Select id={`${formId}-rep`} value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
                    <option value="none">Não repetir</option>
                    {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
                  </Select>
                </Field>
              )}
              <Field label="Observação" htmlFor={`${formId}-notes`}>
                <textarea
                  id={`${formId}-notes`}
                  rows={2}
                  maxLength={500}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full resize-none rounded-[var(--radius-control)] border border-line bg-raised/60 px-3.5 py-3 text-[15px] placeholder:text-faint focus:border-brass focus:outline-none"
                />
              </Field>
            </div>
          )}
        </div>
      </form>
    </Sheet>
  )
}

function CategoryPicker({
  categories, value, onChange,
}: {
  categories: Category[]
  value: string | null
  onChange: (v: string | null) => void
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-semibold text-muted">Categoria</legend>
      <div role="radiogroup" className="-mx-1 flex flex-wrap gap-2 px-1">
        {categories.map((c) => {
          const selected = value === c.id
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(selected ? null : c.id)}
              className={cn(
                'flex h-10 items-center gap-2 rounded-full border pl-1 pr-3.5 text-sm font-medium transition-colors',
                selected ? 'border-transparent text-ink' : 'border-line text-muted hover:border-line-strong hover:text-ink',
              )}
              style={selected ? { background: `color-mix(in srgb, ${c.color} 22%, transparent)`, borderColor: c.color } : undefined}
            >
              <CategoryIcon icon={c.icon} color={c.color} size="sm" className="!size-8 !rounded-full" />
              {c.name}
            </button>
          )
        })}
        {categories.length === 0 && <p className="text-sm text-faint">Nenhuma categoria. Crie em Mais › Categorias.</p>}
      </div>
    </fieldset>
  )
}

function AccountSelect({
  label, id, accounts, value, onChange, error, placeholder,
}: {
  label: string
  id: string
  accounts: Account[]
  value: string
  onChange: (v: string) => void
  error?: string | null
  placeholder?: string
}) {
  return (
    <Field label={label} htmlFor={id} error={error}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error || undefined}>
        {(placeholder || !value) && <option value="">{placeholder ?? 'Escolha a conta'}</option>}
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </Select>
    </Field>
  )
}

function DatePicker({ id, value, onChange }: { id: string; value: ISODate; onChange: (v: ISODate) => void }) {
  const t = today()
  const quick = [
    { label: 'Hoje', value: t },
    { label: 'Ontem', value: addDays(t, -1) },
  ]
  return (
    <Field label="Data" htmlFor={id}>
      <div className="flex gap-2">
        {quick.map((q) => (
          <button
            key={q.label}
            type="button"
            onClick={() => onChange(q.value)}
            aria-pressed={value === q.value}
            className="h-12 shrink-0 rounded-[var(--radius-control)] border border-line px-4 text-sm font-semibold text-muted hover:text-ink aria-pressed:border-brass aria-pressed:bg-brass-soft aria-pressed:text-brass"
          >
            {q.label}
          </button>
        ))}
        <TextInput id={id} type="date" value={value} onChange={(e) => e.target.value && onChange(e.target.value)} className="min-w-0 flex-1" />
      </div>
    </Field>
  )
}
