import { useId, useState } from 'react'
import { Plus } from 'lucide-react'
import { PageHeader } from '@/app/AppLayout'
import { Button } from '@/components/ui/Button'
import { CATEGORY_COLORS, CATEGORY_ICONS, CategoryIcon } from '@/components/ui/CategoryIcon'
import { ErrorNotice } from '@/components/ui/display'
import { Field, Segmented, TextInput, Toggle } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { useToast } from '@/components/ui/Toast'
import type { Category, CategoryKind } from '@/domain/types'
import { useCategories, useRepoMutation } from '@/data/queries'
import { RowsSkeleton } from '@/features/dashboard/DashboardPage'
import { cn } from '@/lib/cn'

export function CategoriesPage() {
  const categories = useCategories()
  const [kind, setKind] = useState<CategoryKind>('expense')
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const list = (categories.data ?? []).filter((c) => c.kind === kind)
  const active = list.filter((c) => !c.archived)
  const archived = list.filter((c) => c.archived)

  return (
    <>
      <PageHeader title="Categorias" actions={<Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>Nova</Button>} />
      <Segmented label="Tipo" value={kind} onChange={setKind} className="mb-5 max-w-xs"
        options={[{ value: 'expense', label: 'Despesas', tone: 'loss' }, { value: 'income', label: 'Receitas', tone: 'gain' }]} />
      {categories.error && <ErrorNotice error={categories.error} onRetry={() => categories.refetch()} />}
      {categories.isPending ? <RowsSkeleton /> : (
        <>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((c) => (
              <li key={c.id}>
                <button onClick={() => setEditing(c)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 text-left hover:border-line-strong">
                  <CategoryIcon icon={c.icon} color={c.color} />
                  <span className="truncate font-semibold">{c.name}</span>
                </button>
              </li>
            ))}
          </ul>
          {archived.length > 0 && (
            <>
              <h2 className="mb-2 mt-8 text-[15px] font-bold text-muted">Arquivadas</h2>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {archived.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => setEditing(c)} className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-line px-3.5 py-3 text-left opacity-70 hover:opacity-100">
                      <CategoryIcon icon={c.icon} color={c.color} />
                      <span className="truncate font-semibold">{c.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      {editing && <CategoryForm key={editing === 'new' ? 'new' : editing.id} category={editing === 'new' ? null : editing} kind={kind} onClose={() => setEditing(null)} />}
    </>
  )
}

function CategoryForm({ category, kind, onClose }: { category: Category | null; kind: CategoryKind; onClose: () => void }) {
  const toast = useToast()
  const id = useId()
  const [open, setOpen] = useState(true)
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState(category?.icon ?? 'circle')
  const [color, setColor] = useState(category?.color ?? CATEGORY_COLORS[0]!)
  const [archived, setArchived] = useState(category?.archived ?? false)
  const [submitted, setSubmitted] = useState(false)
  const error = !name.trim() ? 'Dê um nome para a categoria.' : null
  const save = useRepoMutation((repo) => repo.saveCategory({
    id: category?.id, name: name.trim(), kind: category?.kind ?? kind, icon, color, archived,
  }), ['categories'])
  const close = (v: boolean) => { setOpen(v); if (!v) setTimeout(onClose, 200) }

  return (
    <Sheet open={open} onOpenChange={close} title={category ? 'Editar categoria' : 'Nova categoria'}
      footer={<Button type="submit" form={id} block size="lg" loading={save.isPending}>{category ? 'Salvar alterações' : 'Criar'}</Button>}>
      <form id={id} className="flex flex-col gap-5" noValidate onSubmit={(e) => {
        e.preventDefault(); setSubmitted(true)
        if (error) return
        save.mutate(undefined, { onSuccess: () => { close(false); toast.success(category ? 'Categoria atualizada' : 'Categoria criada') }, onError: toast.error })
      }}>
        <div className="flex items-end gap-3">
          <CategoryIcon icon={icon} color={color} size="lg" />
          <Field label="Nome" htmlFor={`${id}-n`} error={submitted ? error : null} className="flex-1">
            <TextInput id={`${id}-n`} value={name} maxLength={40} autoFocus={!category} onChange={(e) => setName(e.target.value)} />
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
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-muted">Ícone</legend>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-8" role="radiogroup">
            {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
              <button key={key} type="button" role="radio" aria-checked={icon === key} aria-label={key} onClick={() => setIcon(key)}
                className={cn('flex aspect-square items-center justify-center rounded-xl border transition-colors',
                  icon === key ? 'border-transparent' : 'border-line text-muted hover:text-ink')}
                style={icon === key ? { background: `color-mix(in srgb, ${color} 20%, transparent)`, color } : undefined}>
                <Icon className="size-5" />
              </button>
            ))}
          </div>
        </fieldset>
        {category && <Toggle checked={archived} onChange={setArchived} label="Arquivar"
          description="Some da escolha ao lançar. Lançamentos antigos continuam com ela." />}
      </form>
    </Sheet>
  )
}
