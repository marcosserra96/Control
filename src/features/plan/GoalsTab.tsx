import { useId, useState } from 'react'
import { Flag, Plus, Target, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { CATEGORY_COLORS } from '@/components/ui/CategoryIcon'
import { Amount, EmptyState, ErrorNotice, ProgressBar } from '@/components/ui/display'
import { Field, MoneyInput, Segmented, TextInput, Toggle } from '@/components/ui/Field'
import { ConfirmSheet, Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { goalProgress } from '@/domain/analytics'
import { monthLabel, shortDate, today } from '@/domain/dates'
import { formatBRL } from '@/domain/money'
import type { Goal } from '@/domain/types'
import { useContributions, useGoals, useRepoMutation } from '@/data/queries'
import { RowsSkeleton } from '@/features/dashboard/DashboardPage'

export function GoalsTab() {
  const goals = useGoals()
  const contributions = useContributions()
  const [editing, setEditing] = useState<Goal | 'new' | null>(null)
  const [contributing, setContributing] = useState<Goal | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const list = (goals.data ?? []).filter((g) => showArchived || !g.archived)
  const archivedCount = (goals.data ?? []).filter((g) => g.archived).length

  return (
    <>
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">Separe dinheiro para objetivos e acompanhe quanto falta.</p>
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Nova meta</Button>
      </div>
      {goals.error && <ErrorNotice error={goals.error} onRetry={() => goals.refetch()} />}

      {goals.isPending ? <RowsSkeleton count={2} /> : list.length === 0 ? (
        <EmptyState icon={<Target className="size-5" />} title="Nenhuma meta ainda"
          action={<Button onClick={() => setEditing('new')}>Criar meta</Button>}>
          Uma viagem, a reserva de emergência, um carro. Registre os aportes e veja quanto guardar por mês.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {list.map((g) => {
            const p = goalProgress(g, contributions.data ?? [], today())
            const done = p.saved >= g.targetAmount
            return (
              <li key={g.id} className="flex flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `color-mix(in srgb, ${g.color} 16%, transparent)`, color: g.color }}>
                    {done ? <Flag className="size-5" aria-hidden /> : <Target className="size-5" aria-hidden />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <button onClick={() => setEditing(g)} className="block max-w-full truncate text-left font-bold hover:underline">{g.name}</button>
                    <p className="text-[13px] text-faint">
                      {g.targetDate ? `Até ${monthLabel(g.targetDate)}` : 'Sem prazo'}{g.archived && ' · arquivada'}
                    </p>
                  </div>
                  <span className="num text-sm font-bold" style={{ color: g.color }}>{Math.min(Math.round(p.ratio * 100), 999)}%</span>
                </div>
                <div className="mt-5">
                  <p className="mb-2 flex flex-wrap items-baseline gap-x-1.5">
                    <Amount value={p.saved} className="display text-[26px] font-semibold" />
                    <span className="num text-sm text-muted">de {formatBRL(g.targetAmount)}</span>
                  </p>
                  <ProgressBar value={p.ratio} tone={g.color} label={g.name} className="h-2" />
                  <p className="mt-2.5 text-[13px] text-muted">
                    {done ? 'Meta atingida.'
                      : p.monthlyNeeded ? <>Guarde <span className="num font-semibold text-ink">{formatBRL(p.monthlyNeeded)}</span> por mês para chegar no prazo.</>
                      : `Faltam ${formatBRL(g.targetAmount - p.saved)}.`}
                  </p>
                </div>
                {!g.archived && (
                  <div className="mt-5 flex gap-2 border-t border-line pt-4">
                    <Button variant="secondary" size="sm" block icon={<Plus className="size-4" />} onClick={() => setContributing(g)}>Guardar</Button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {archivedCount > 0 && (
        <button onClick={() => setShowArchived((v) => !v)} className="mt-6 text-sm font-semibold text-muted hover:text-ink">
          {showArchived ? 'Esconder arquivadas' : `Mostrar arquivadas (${archivedCount})`}
        </button>
      )}

      {editing && <GoalForm key={editing === 'new' ? 'new' : editing.id} goal={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {contributing && <ContributionForm key={contributing.id} goal={contributing} onClose={() => setContributing(null)} />}
    </>
  )
}

function GoalForm({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const toast = useToast()
  const id = useId()
  const contributions = useContributions()
  const [open, setOpen] = useState(true)
  const [confirm, setConfirm] = useState(false)
  const [name, setName] = useState(goal?.name ?? '')
  const [target, setTarget] = useState<number | null>(goal?.targetAmount ?? null)
  const [date, setDate] = useState(goal?.targetDate ?? '')
  const [color, setColor] = useState(goal?.color ?? CATEGORY_COLORS[3]!)
  const [archived, setArchived] = useState(goal?.archived ?? false)
  const [submitted, setSubmitted] = useState(false)
  const errors = {
    name: !name.trim() ? 'Dê um nome para a meta.' : null,
    target: !target || target <= 0 ? 'Informe quanto quer juntar.' : null,
  }

  const save = useRepoMutation((repo) => repo.saveGoal({
    id: goal?.id, name: name.trim(), targetAmount: target!, targetDate: date ? date.slice(0, 8) + '01' : null, color, archived,
  }), ['goals'])
  const remove = useRepoMutation((repo) => repo.deleteGoal(goal!.id), ['goals'])
  const removeContribution = useRepoMutation((repo, cid: string) => repo.deleteContribution(cid), ['goals'])
  const close = (v: boolean) => { setOpen(v); if (!v) setTimeout(onClose, 200) }

  const history = (contributions.data ?? []).filter((c) => c.goalId === goal?.id)

  if (confirm && goal) {
    return (
      <ConfirmSheet open={open} onOpenChange={close} title={`Excluir “${goal.name}”?`}
        description="A meta e o histórico de aportes serão apagados. Seus saldos de conta não mudam."
        confirmLabel="Excluir meta" loading={remove.isPending}
        onConfirm={() => remove.mutate(undefined, { onSuccess: () => { close(false); toast.success('Meta excluída') }, onError: toast.error })} />
    )
  }

  return (
    <Sheet open={open} onOpenChange={close} title={goal ? 'Editar meta' : 'Nova meta'}
      footer={<Button type="submit" form={id} block size="lg" loading={save.isPending}>{goal ? 'Salvar alterações' : 'Criar meta'}</Button>}>
      <form id={id} className="flex flex-col gap-5" noValidate onSubmit={(e) => {
        e.preventDefault(); setSubmitted(true)
        if (errors.name || errors.target) return
        save.mutate(undefined, { onSuccess: () => { close(false); toast.success(goal ? 'Meta atualizada' : 'Meta criada') }, onError: toast.error })
      }}>
        <Field label="Nome" htmlFor={`${id}-n`} error={submitted ? errors.name : null}>
          <TextInput id={`${id}-n`} value={name} maxLength={60} placeholder="Ex.: Viagem de férias" onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Quanto quer juntar" htmlFor={`${id}-t`} error={submitted ? errors.target : null}>
            <MoneyInput id={`${id}-t`} value={target} onChange={setTarget} />
          </Field>
          <Field label="Até quando" htmlFor={`${id}-d`} hint="Opcional">
            <TextInput id={`${id}-d`} type="month" value={date ? date.slice(0, 7) : ''} onChange={(e) => setDate(e.target.value ? e.target.value + '-01' : '')} />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-muted">Cor</legend>
          <div className="flex flex-wrap gap-2.5" role="radiogroup">
            {CATEGORY_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)}
                className="size-9 rounded-full ring-offset-2 ring-offset-surface aria-checked:ring-2 aria-checked:ring-ink" style={{ background: c }} />
            ))}
          </div>
        </fieldset>
        {goal && <Toggle checked={archived} onChange={setArchived} label="Arquivar" description="Esconde a meta sem apagar o histórico." />}
        {goal && history.length > 0 && (
          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-muted">Aportes</h3>
            <ul className="rounded-2xl border border-line">
              {history.map((c) => (
                <li key={c.id} className="flex items-center gap-3 border-b border-line px-3.5 py-2.5 last:border-0">
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold">{shortDate(c.date)}</span>
                    {c.note && <span className="text-faint"> · {c.note}</span>}
                  </span>
                  <Amount value={c.amount} type="auto" sign className="text-sm font-semibold" />
                  <IconButton label="Remover aporte" size="sm" onClick={() => removeContribution.mutate(c.id, { onError: toast.error })}>
                    <Trash2 className="size-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
          </section>
        )}
        {goal && <button type="button" onClick={() => setConfirm(true)} className="self-start text-sm font-semibold text-loss hover:underline">Excluir meta</button>}
      </form>
    </Sheet>
  )
}

function ContributionForm({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const toast = useToast()
  const id = useId()
  const [open, setOpen] = useState(true)
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [amount, setAmount] = useState<number | null>(null)
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const error = !amount || amount <= 0 ? 'Informe um valor maior que zero.' : null

  const save = useRepoMutation((repo) => repo.addContribution({
    goalId: goal.id, amount: direction === 'in' ? amount! : -amount!, date, note: note.trim() || null,
  }), ['goals'])
  const close = (v: boolean) => { setOpen(v); if (!v) setTimeout(onClose, 200) }

  return (
    <Sheet open={open} onOpenChange={close} title={goal.name}
      description="Registre aqui quanto separou. Para mover o dinheiro entre contas, lance também uma transferência."
      footer={<Button type="submit" form={id} block size="lg" loading={save.isPending}>{direction === 'in' ? 'Guardar' : 'Retirar'}</Button>}>
      <form id={id} className="flex flex-col gap-5" noValidate onSubmit={(e) => {
        e.preventDefault(); setSubmitted(true)
        if (error) return
        save.mutate(undefined, { onSuccess: () => { close(false); toast.success(direction === 'in' ? 'Aporte registrado' : 'Retirada registrada') }, onError: toast.error })
      }}>
        <Segmented label="Movimento" value={direction} onChange={setDirection}
          options={[{ value: 'in', label: 'Guardar', tone: 'gain' }, { value: 'out', label: 'Retirar', tone: 'loss' }]} />
        <div>
          <MoneyInput size="xl" value={amount} onChange={setAmount} autoFocus invalid={submitted && !!error} />
          {submitted && error && <p role="alert" className="mt-1 text-[13px] text-loss">{error}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Data" htmlFor={`${id}-d`}>
            <TextInput id={`${id}-d`} type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field>
          <Field label="Observação" htmlFor={`${id}-n`} hint="Opcional">
            <TextInput id={`${id}-n`} value={note} maxLength={80} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
      </form>
    </Sheet>
  )
}

