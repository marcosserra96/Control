import { useId, useState } from 'react'
import { Pause, Plus, Repeat } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { Amount, Badge, EmptyState, ErrorNotice } from '@/components/ui/display'
import { Field, MoneyInput, Segmented, Select, TextInput, Toggle } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { addDays, addMonths, endOfMonth, shortDate, today } from '@/domain/dates'
import { formatBRL } from '@/domain/money'
import { FREQUENCY_LABEL, type Frequency, type ISODate, type Recurrence } from '@/domain/types'
import { useAccounts, useCategories, useRecurrences, useRepoMutation } from '@/data/queries'
import { RowsSkeleton } from '@/features/dashboard/DashboardPage'

/** Próxima data de uma recorrência a partir de hoje. */
function nextDate(r: Recurrence, ref: ISODate): ISODate | null {
  for (let i = 0; i < 2000; i++) {
    const d = r.frequency === 'monthly' ? addMonths(r.startDate, i)
      : r.frequency === 'yearly' ? addMonths(r.startDate, i * 12)
      : addDays(r.startDate, i * 7)
    if (r.endDate && d > r.endDate) return null
    if (d >= ref) return d
  }
  return null
}

/** Quanto a recorrência pesa por mês, para comparar assinaturas semanais e anuais. */
function monthlyWeight(r: Recurrence) {
  return r.frequency === 'monthly' ? r.amount : r.frequency === 'yearly' ? Math.round(r.amount / 12) : Math.round((r.amount * 52) / 12)
}

export function RecurrencesTab() {
  const recurrences = useRecurrences()
  const accounts = useAccounts()
  const categories = useCategories()
  const [editing, setEditing] = useState<Recurrence | 'new' | null>(null)
  const catMap = new Map((categories.data ?? []).map((c) => [c.id, c]))
  const accMap = new Map((accounts.data ?? []).map((a) => [a.id, a]))
  const t = today()

  const list = [...(recurrences.data ?? [])].sort((a, b) => Number(b.active) - Number(a.active) || a.description.localeCompare(b.description))
  const active = list.filter((r) => r.active)
  const monthlyOut = active.filter((r) => r.type === 'expense').reduce((s, r) => s + monthlyWeight(r), 0)
  const monthlyIn = active.filter((r) => r.type === 'income').reduce((s, r) => s + monthlyWeight(r), 0)

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        {active.length > 0 ? (
          <p className="text-sm text-muted">
            Por mês: <Amount value={monthlyOut} className="font-semibold text-loss" /> em contas fixas
            {monthlyIn > 0 && <> e <Amount value={monthlyIn} className="font-semibold text-gain" /> de entradas fixas</>}
          </p>
        ) : <span />}
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Nova recorrência</Button>
      </div>
      {recurrences.error && <ErrorNotice error={recurrences.error} onRetry={() => recurrences.refetch()} />}

      {recurrences.isPending ? <RowsSkeleton /> : list.length === 0 ? (
        <EmptyState icon={<Repeat className="size-5" />} title="Contas fixas e assinaturas aparecem aqui"
          action={<Button onClick={() => setEditing('new')}>Cadastrar recorrência</Button>}>
          Aluguel, streaming, academia, salário. Os lançamentos são criados sozinhos como pendentes, para você confirmar.
        </EmptyState>
      ) : (
        <ul className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          {list.map((r) => {
            const c = r.categoryId ? catMap.get(r.categoryId) : undefined
            const next = r.active ? nextDate(r, t) : null
            return (
              <li key={r.id} className="border-b border-line last:border-0">
                <button onClick={() => setEditing(r)} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left hover:bg-raised/60">
                  <CategoryIcon icon={c?.icon} color={r.active ? c?.color : '#5c6476'} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.description}</span>
                    <span className="text-[13px] text-faint">
                      {FREQUENCY_LABEL[r.frequency]} · {accMap.get(r.accountId)?.name ?? '—'}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Amount value={r.amount} type={r.type} sign className="font-semibold" />
                    {r.active ? (
                      next ? <span className="text-[12px] text-faint">próxima {shortDate(next)}</span> : <Badge>Encerrada</Badge>
                    ) : <Badge><Pause className="mr-1 size-3" aria-hidden />Pausada</Badge>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {editing && <RecurrenceForm key={editing === 'new' ? 'new' : editing.id} recurrence={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function RecurrenceForm({ recurrence, onClose }: { recurrence: Recurrence | null; onClose: () => void }) {
  const toast = useToast()
  const id = useId()
  const accounts = useAccounts()
  const categories = useCategories()
  const [open, setOpen] = useState(true)
  const [confirm, setConfirm] = useState(false)
  const [type, setType] = useState<Recurrence['type']>(recurrence?.type ?? 'expense')
  const [description, setDescription] = useState(recurrence?.description ?? '')
  const [amount, setAmount] = useState<number | null>(recurrence?.amount ?? null)
  const activeAccounts = (accounts.data ?? []).filter((a) => !a.archived)
  const [accountId, setAccountId] = useState(recurrence?.accountId ?? activeAccounts[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState(recurrence?.categoryId ?? '')
  const [frequency, setFrequency] = useState<Frequency>(recurrence?.frequency ?? 'monthly')
  const [startDate, setStartDate] = useState(recurrence?.startDate ?? today())
  const [endDate, setEndDate] = useState(recurrence?.endDate ?? '')
  const [active, setActive] = useState(recurrence?.active ?? true)
  const [submitted, setSubmitted] = useState(false)

  const errors = {
    description: !description.trim() ? 'Dê um nome, como “Aluguel”.' : null,
    amount: !amount || amount <= 0 ? 'Informe um valor maior que zero.' : null,
    account: !accountId ? 'Escolha uma conta.' : null,
    end: endDate && endDate < startDate ? 'O fim precisa ser depois do início.' : null,
  }
  const valid = Object.values(errors).every((e) => !e)

  const save = useRepoMutation(async (repo) => {
    await repo.saveRecurrence({
      id: recurrence?.id, description: description.trim(), type, amount: amount!, accountId,
      categoryId: categoryId || null, frequency, startDate, endDate: endDate || null, active,
    })
    await repo.generateRecurring(endOfMonth(today()))
  }, ['recurrences'])

  const remove = useRepoMutation((repo, removeFuture: boolean) => repo.deleteRecurrence(recurrence!.id, removeFuture), ['recurrences'])

  const close = (v: boolean) => { setOpen(v); if (!v) setTimeout(onClose, 200) }
  const kindCats = (categories.data ?? []).filter((c) => !c.archived && c.kind === type)

  if (confirm && recurrence) {
    return (
      <Sheet open={open} onOpenChange={close} title={`Excluir “${recurrence.description}”?`}
        description="Os lançamentos que já aconteceram continuam no extrato."
        footer={
          <div className="flex w-full flex-col gap-2">
            <Button variant="danger" block loading={remove.isPending && remove.variables === true}
              onClick={() => remove.mutate(true, { onSuccess: () => { close(false); toast.success('Recorrência excluída') }, onError: toast.error })}>
              Excluir e apagar pendentes futuros
            </Button>
            <Button variant="secondary" block loading={remove.isPending && remove.variables === false}
              onClick={() => remove.mutate(false, { onSuccess: () => { close(false); toast.success('Recorrência excluída') }, onError: toast.error })}>
              Excluir e manter o que já foi criado
            </Button>
            <Button variant="ghost" block onClick={() => setConfirm(false)}>Voltar</Button>
          </div>
        }
      >
        <span />
      </Sheet>
    )
  }

  return (
    <Sheet open={open} onOpenChange={close} title={recurrence ? 'Editar recorrência' : 'Nova recorrência'}
      footer={<Button type="submit" form={id} block size="lg" loading={save.isPending}>{recurrence ? 'Salvar alterações' : 'Criar'}</Button>}>
      <form id={id} className="flex flex-col gap-5" noValidate onSubmit={(e) => {
        e.preventDefault(); setSubmitted(true)
        if (!valid) return
        save.mutate(undefined, { onSuccess: () => { close(false); toast.success(recurrence ? 'Recorrência atualizada' : 'Recorrência criada') }, onError: toast.error })
      }}>
        <Segmented label="Tipo" value={type} onChange={(v) => { setType(v); setCategoryId('') }}
          options={[{ value: 'expense', label: 'Despesa', tone: 'loss' }, { value: 'income', label: 'Receita', tone: 'gain' }]} />
        <Field label="Descrição" htmlFor={`${id}-d`} error={submitted ? errors.description : null}>
          <TextInput id={`${id}-d`} value={description} maxLength={80} onChange={(e) => setDescription(e.target.value)} aria-invalid={submitted && !!errors.description} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Valor" htmlFor={`${id}-a`} error={submitted ? errors.amount : null}>
            <MoneyInput id={`${id}-a`} value={amount} onChange={setAmount} invalid={submitted && !!errors.amount} />
          </Field>
          <Field label="Frequência" htmlFor={`${id}-f`}>
            <Select id={`${id}-f`} value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
              {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Conta" htmlFor={`${id}-acc`} error={submitted ? errors.account : null}>
            <Select id={`${id}-acc`} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Categoria" htmlFor={`${id}-cat`}>
            <Select id={`${id}-cat`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Sem categoria</option>
              {kindCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Primeira vez" htmlFor={`${id}-s`} hint={recurrence ? 'Alterar não move o que já foi criado.' : undefined}>
            <TextInput id={`${id}-s`} type="date" value={startDate} onChange={(e) => e.target.value && setStartDate(e.target.value)} />
          </Field>
          <Field label="Termina em" htmlFor={`${id}-e`} hint={!endDate ? 'Opcional' : undefined} error={errors.end}>
            <TextInput id={`${id}-e`} type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        {recurrence && (
          <>
            <Toggle checked={active} onChange={setActive} label="Ativa" description="Pausada, não cria novos lançamentos." />
            <p className="text-[13px] text-faint">Mudanças de valor valem para os próximos lançamentos criados. {amount ? `Valor atual: ${formatBRL(amount)}.` : ''}</p>
            <button type="button" onClick={() => setConfirm(true)} className="self-start text-sm font-semibold text-loss hover:underline">Excluir recorrência</button>
          </>
        )}
      </form>
    </Sheet>
  )
}
