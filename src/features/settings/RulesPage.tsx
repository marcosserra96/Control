import { useId, useState } from 'react'
import { ChevronRight, Plus, Replace } from 'lucide-react'
import { PageHeader } from '@/app/AppLayout'
import { Button } from '@/components/ui/Button'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { EmptyState, ErrorNotice } from '@/components/ui/display'
import { Field, Select, TextInput } from '@/components/ui/Field'
import { ConfirmSheet, Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import { MIN_PATTERN, normalizePattern, type DescriptionRule } from '@/domain/import/rules'
import type { Category } from '@/domain/types'
import { useCategories, useRepoMutation, useRules } from '@/data/queries'
import { RowsSkeleton } from '@/features/dashboard/DashboardPage'

export function RulesPage() {
  const rules = useRules()
  const categories = useCategories()
  const [editing, setEditing] = useState<DescriptionRule | 'new' | null>(null)
  const catMap = new Map((categories.data ?? []).map((c) => [c.id, c]))

  return (
    <>
      <PageHeader title="Nomes do extrato" actions={
        <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Novo</Button>
      } />
      <p className="mb-5 max-w-2xl text-[15px] text-muted">
        Quando o banco mostra um nome que você não reconhece, troque pelo nome real. Vale para as próximas importações e
        para o que já foi importado. Você também cria essas trocas corrigindo o nome na revisão da importação.
      </p>
      {rules.error && <ErrorNotice error={rules.error} onRetry={() => rules.refetch()} />}

      {rules.isPending ? <RowsSkeleton /> : (rules.data ?? []).length === 0 ? (
        <EmptyState icon={<Replace className="size-5" />} title="Nenhuma troca de nome ainda"
          action={<Button onClick={() => setEditing('new')}>Criar a primeira</Button>}>
          Exemplo: quando aparecer “PAG*JOSEDASILVA”, chamar de “Feira do José”.
        </EmptyState>
      ) : (
        <ul className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          {(rules.data ?? []).map((r) => {
            const cat = r.categoryId ? catMap.get(r.categoryId) : undefined
            return (
              <li key={r.id} className="border-b border-line last:border-0">
                <button onClick={() => setEditing(r)} className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left hover:bg-raised/60">
                  <CategoryIcon icon={cat?.icon ?? 'circle'} color={cat?.color} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{r.renameTo}</span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[13px] text-faint">
                      <span className="shrink-0">no banco</span>
                      <span className="truncate rounded-md bg-raised px-1.5 font-mono text-[12px] text-muted">{r.pattern}</span>
                    </span>
                    <span className="mt-0.5 block text-[13px] text-faint">{cat ? cat.name : 'Categoria sugerida pelo histórico'}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {editing && (
        <RuleForm
          key={editing === 'new' ? 'new' : editing.id}
          rule={editing === 'new' ? null : editing}
          categories={categories.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

export function RuleForm({
  rule, categories, onClose, initial,
}: {
  rule: DescriptionRule | null
  categories: Category[]
  onClose: () => void
  initial?: Partial<DescriptionRule>
}) {
  const toast = useToast()
  const id = useId()
  const [open, setOpen] = useState(true)
  const [confirm, setConfirm] = useState(false)
  const [pattern, setPattern] = useState(rule?.pattern ?? initial?.pattern ?? '')
  const [renameTo, setRenameTo] = useState(rule?.renameTo ?? initial?.renameTo ?? '')
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? initial?.categoryId ?? '')
  const [submitted, setSubmitted] = useState(false)

  const normalized = normalizePattern(pattern)
  const errors = {
    pattern: normalized.length < MIN_PATTERN ? `Use pelo menos ${MIN_PATTERN} letras ou números do texto do banco.` : null,
    renameTo: !renameTo.trim() ? 'Escreva o nome que quer ver.' : null,
  }

  const save = useRepoMutation(async (repo) => {
    // Trocar o padrão de uma regra existente: remove a antiga para não ficar duplicada
    if (rule && rule.pattern !== normalized) await repo.deleteRule(rule.id)
    const saved = await repo.saveRule({
      id: rule && rule.pattern === normalized ? rule.id : undefined,
      pattern: normalized, renameTo: renameTo.trim(), categoryId: categoryId || null,
    })
    return repo.applyRule(saved)
  }, ['rules'])
  const remove = useRepoMutation((repo) => repo.deleteRule(rule!.id), ['rules'])
  const close = (v: boolean) => { setOpen(v); if (!v) setTimeout(onClose, 200) }

  if (confirm && rule) {
    return (
      <ConfirmSheet open={open} onOpenChange={close} title="Excluir esta troca de nome?"
        description="As próximas importações voltam a mostrar o nome do banco. Lançamentos já renomeados continuam como estão."
        confirmLabel="Excluir" loading={remove.isPending}
        onConfirm={() => remove.mutate(undefined, { onSuccess: () => { close(false); toast.success('Troca de nome excluída') }, onError: toast.error })} />
    )
  }

  const expense = categories.filter((c) => !c.archived && c.kind === 'expense')
  const income = categories.filter((c) => !c.archived && c.kind === 'income')

  return (
    <Sheet open={open} onOpenChange={close} title={rule ? 'Editar nome' : 'Novo nome'}
      footer={<Button type="submit" form={id} block size="lg" loading={save.isPending}>Salvar</Button>}>
      <form id={id} className="flex flex-col gap-5" noValidate onSubmit={(e) => {
        e.preventDefault(); setSubmitted(true)
        if (errors.pattern || errors.renameTo) return
        save.mutate(undefined, {
          onSuccess: (n) => {
            close(false)
            toast.success(n ? `Salvo · ${n === 1 ? '1 lançamento renomeado' : `${n} lançamentos renomeados`}` : 'Salvo · vale para as próximas importações')
          },
          onError: toast.error,
        })
      }}>
        <Field label="Quando o extrato contiver" htmlFor={`${id}-p`} error={submitted ? errors.pattern : null}
          hint={normalized && normalized !== pattern ? <>Comparado como <span className="font-mono">{normalized}</span>, sem diferenciar maiúsculas, acentos e símbolos.</> : 'Um trecho do nome que aparece no banco. Quanto mais curto, mais lançamentos ele pega.'}>
          <TextInput id={`${id}-p`} value={pattern} maxLength={120} autoFocus={!rule && !initial?.pattern}
            placeholder="Ex.: PAG*JOSEDASILVA" onChange={(e) => setPattern(e.target.value)} aria-invalid={submitted && !!errors.pattern} />
        </Field>
        <Field label="Chamar de" htmlFor={`${id}-n`} error={submitted ? errors.renameTo : null}>
          <TextInput id={`${id}-n`} value={renameTo} maxLength={80} autoFocus={Boolean(initial?.pattern)}
            placeholder="Ex.: Feira do José" onChange={(e) => setRenameTo(e.target.value)} />
        </Field>
        <Field label="Categoria" htmlFor={`${id}-c`} hint="Opcional. Sem categoria, o app continua sugerindo pelo histórico.">
          <Select id={`${id}-c`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Manter a sugerida</option>
            <optgroup label="Despesas">{expense.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
            <optgroup label="Receitas">{income.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
          </Select>
        </Field>
        {rule && <button type="button" onClick={() => setConfirm(true)} className="self-start text-sm font-semibold text-loss hover:underline">Excluir</button>}
      </form>
    </Sheet>
  )
}
