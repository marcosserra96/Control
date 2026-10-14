import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, FileUp, Info, Undo2 } from 'lucide-react'
import { PageHeader } from '@/app/AppLayout'
import { Button } from '@/components/ui/Button'
import { CategoryIcon, TransferIcon } from '@/components/ui/CategoryIcon'
import { Amount, EmptyState, ErrorNotice } from '@/components/ui/display'
import { Field, Select } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { shortDate } from '@/domain/dates'
import { formatBRL } from '@/domain/money'
import { reconcile, statementRange, toWrites, type ImportItem } from '@/domain/import/reconcile'
import { decodeBytes, ImportError, parseStatement, type Statement } from '@/domain/import/parse'
import { normalizeText } from '@/domain/import/categorize'
import type { Account, Category } from '@/domain/types'
import { useAccounts, useCategories, useDescriptions, useRepo } from '@/data/queries'
import { RowsSkeleton } from '@/features/dashboard/DashboardPage'
import { cn } from '@/lib/cn'

interface Loaded {
  statement: Statement
  fileName: string
}

export function ImportPage() {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function readFile(file: File) {
    setError(null)
    if (file.size > 10 * 1024 * 1024) return setError('Arquivo grande demais. Exporte um período menor (até alguns meses).')
    try {
      const text = decodeBytes(new Uint8Array(await file.arrayBuffer()))
      setLoaded({ statement: parseStatement(text, file.name), fileName: file.name })
    } catch (e) {
      setError(e instanceof ImportError ? e.message : 'Não consegui ler este arquivo. Confira se é um OFX ou CSV exportado pelo banco.')
    }
  }

  return (
    <>
      <PageHeader title="Importar extrato" />
      {loaded ? (
        <Review loaded={loaded} onReset={() => setLoaded(null)} />
      ) : (
        <Picker onFile={readFile} error={error} />
      )}
    </>
  )
}

// --- 1. escolher arquivo --------------------------------------------------------

function Picker({ onFile, error }: { onFile: (f: File) => void; error: string | null }) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  return (
    <div className="grid max-w-3xl grid-cols-1 gap-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center rounded-[var(--radius-card)] border-2 border-dashed px-6 py-12 text-center transition-colors',
          dragging ? 'border-brass bg-brass-soft' : 'border-line-strong bg-surface',
        )}
      >
        <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-brass-soft text-brass">
          <FileUp className="size-7" aria-hidden />
        </span>
        <p className="text-[17px] font-bold">Escolha o extrato ou a fatura</p>
        <p className="mt-1 max-w-sm text-sm text-muted">
          Arquivo OFX ou CSV baixado do banco. Ele é lido aqui no seu aparelho; só os lançamentos que você confirmar são salvos.
        </p>
        <Button size="lg" className="mt-6" onClick={() => input.current?.click()}>Escolher arquivo</Button>
        <input
          ref={input}
          type="file"
          accept=".ofx,.OFX,.csv,.CSV,.txt,text/csv,application/x-ofx,application/vnd.intu.qfx"
          className="sr-only"
          aria-label="Arquivo do extrato"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
        />
        {error && <p role="alert" className="mt-5 max-w-md rounded-xl bg-loss-soft px-4 py-3 text-sm text-loss">{error}</p>}
      </div>
      <BankHelp />
    </div>
  )
}

const BANK_HELP: { bank: string; steps: string }[] = [
  { bank: 'Nubank', steps: 'Conta: no app, toque em Conta › Pedir extrato, escolha o período e exporte em OFX ou CSV. O arquivo chega no seu e-mail.' },
  { bank: 'Inter', steps: 'No app ou no site, abra o Extrato, escolha o período e use Exportar em OFX.' },
  { bank: 'Bradesco', steps: 'No internet banking (site), abra Extrato, escolha o período e salve no formato OFX (às vezes chamado “Money”).' },
  { bank: 'Santander', steps: 'No internet banking (site), abra Extrato e use a opção de exportar/salvar em OFX.' },
  { bank: 'Caixa', steps: 'No internet banking (site), abra Extrato e use a opção de exportar em OFX.' },
]

function BankHelp() {
  const [open, setOpen] = useState<string | null>(null)
  return (
    <section aria-labelledby="como-baixar">
      <h2 id="como-baixar" className="mb-3 px-1 text-[15px] font-bold">Como baixar o arquivo</h2>
      <ul className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        {BANK_HELP.map((b) => (
          <li key={b.bank} className="border-b border-line last:border-0">
            <button
              onClick={() => setOpen(open === b.bank ? null : b.bank)}
              aria-expanded={open === b.bank}
              className="flex w-full items-center justify-between px-4 py-3.5 text-left font-semibold hover:bg-raised/60"
            >
              {b.bank}
              <ChevronDown className={cn('size-4 text-faint transition-transform', open === b.bank && 'rotate-180')} aria-hidden />
            </button>
            {open === b.bank && <p className="px-4 pb-4 text-sm text-muted">{b.steps}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-3 flex gap-2 px-1 text-[13px] text-faint">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          No iPhone: abra o anexo do e-mail ou o arquivo baixado, toque em Compartilhar › Salvar em Arquivos e depois em
          Escolher arquivo aqui. Os menus dos bancos mudam com o tempo; se não achar OFX, procure por CSV.
        </span>
      </p>
    </section>
  )
}

// --- 2. revisar -----------------------------------------------------------------

type Filter = 'new' | 'known' | 'ignored'

/** Escolhe a conta provável: a já usada para este arquivo, a da URL, ou uma com o nome do banco. */
function guessAccount(s: Statement, accounts: Account[], fromUrl: string | null): string {
  const active = accounts.filter((a) => !a.archived)
  const byKey = s.accountKey && active.find((a) => a.importKey === s.accountKey)
  if (byKey) return byKey.id
  if (fromUrl && active.some((a) => a.id === fromUrl)) return fromUrl
  const wanted = s.kind === 'card' ? active.filter((a) => a.type === 'credit_card') : s.kind === 'bank' ? active.filter((a) => a.type !== 'credit_card') : active
  const bank = s.bankName ? normalizeText(s.bankName).split(' ')[0] : null
  const byName = bank && wanted.find((a) => normalizeText(a.name).includes(bank))
  return (byName || wanted[0] || active[0])?.id ?? ''
}

function Review({ loaded, onReset }: { loaded: Loaded; onReset: () => void }) {
  const { statement, fileName } = loaded
  const repo = useRepo()
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const accounts = useAccounts()
  const categories = useCategories()
  const history = useDescriptions()
  const [accountId, setAccountId] = useState('')
  const [items, setItems] = useState<ImportItem[] | null>(null)
  const [filter, setFilter] = useState<Filter>('new')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<{ created: number; linked: number; importId: string; accountId: string } | null>(null)

  useEffect(() => {
    if (accounts.data && !accountId) setAccountId(guessAccount(statement, accounts.data, params.get('conta')))
  }, [accounts.data, accountId, statement, params])

  const account = accounts.data?.find((a) => a.id === accountId)
  const range = useMemo(() => statementRange(statement), [statement])
  const existing = useQuery({
    queryKey: ['transactions', { ...range, accountId }, 'import'],
    queryFn: () => repo.listTransactions({ ...range, accountId }),
    enabled: Boolean(accountId),
  })

  // Recalcula a conciliação ao trocar de conta (ou quando os dados chegam)
  useEffect(() => {
    if (!account || !existing.data || !categories.data || !history.data) return
    setItems(reconcile({
      statement, account, accounts: accounts.data ?? [], existing: existing.data,
      history: history.data, categories: categories.data,
    }))
  }, [account, existing.data, categories.data, history.data, statement, accounts.data])

  const counts = useMemo(() => ({
    new: items?.filter((i) => i.status === 'new').length ?? 0,
    known: items?.filter((i) => i.status === 'matched' || i.status === 'duplicate').length ?? 0,
    ignored: items?.filter((i) => i.status === 'ignored').length ?? 0,
  }), [items])

  useEffect(() => {
    if (items && counts.new === 0 && filter === 'new') setFilter(counts.known ? 'known' : 'ignored')
  }, [items, counts, filter])

  const visible = (items ?? []).filter((i) =>
    filter === 'new' ? i.status === 'new' : filter === 'known' ? i.status === 'matched' || i.status === 'duplicate' : i.status === 'ignored')
  const selected = (items ?? []).filter((i) => i.include && i.status !== 'duplicate' && i.status !== 'ignored')
  const toLink = (items ?? []).filter((i) => i.status === 'matched' && !i.include).length
  const outflow = selected.filter((i) => i.type === 'expense' || i.type === 'transfer').reduce((s, i) => s + i.amount, 0)
  const inflow = selected.filter((i) => i.type === 'income').reduce((s, i) => s + i.amount, 0)

  function update(key: string, patch: Partial<ImportItem>) {
    setItems((list) => list?.map((i) => (i.key === key ? { ...i, ...patch } : i)) ?? null)
  }

  async function save() {
    if (!items || !account) return
    setSaving(true)
    const importId = crypto.randomUUID()
    try {
      const { create, link } = toWrites(items, account.id, importId, () => crypto.randomUUID())
      for (let i = 0; i < create.length; i += 300) await repo.createTransactions(create.slice(i, i + 300))
      for (const l of link) await repo.updateTransaction(l.id, l.patch)
      if (statement.accountKey && account.importKey !== statement.accountKey) {
        await repo.saveAccount({ ...account, importKey: statement.accountKey })
      }
      await Promise.all(['transactions', 'balances', 'descriptions', 'accounts'].map((k) => qc.invalidateQueries({ queryKey: [k] })))
      setDone({ created: create.length, linked: link.length, importId, accountId: account.id })
    } catch (e) {
      toast.error(e)
    } finally {
      setSaving(false)
    }
  }

  async function undo() {
    if (!done) return
    try {
      const n = await repo.deleteImport(done.importId)
      await Promise.all(['transactions', 'balances', 'descriptions'].map((k) => qc.invalidateQueries({ queryKey: [k] })))
      toast.success(`Importação desfeita: ${n} lançamentos removidos`)
      onReset()
    } catch (e) {
      toast.error(e)
    }
  }

  if (done) {
    return (
      <div className="max-w-xl rounded-[var(--radius-card)] border border-line bg-surface p-6 text-center md:p-10">
        <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-gain-soft text-gain">
          <Check className="size-7" strokeWidth={2.6} aria-hidden />
        </span>
        <h2 className="display text-[26px] font-semibold">
          {done.created === 1 ? '1 lançamento importado' : `${done.created} lançamentos importados`}
        </h2>
        {done.linked > 0 && (
          <p className="mt-2 text-sm text-muted">
            {done.linked === 1
              ? '1 lançamento que você já tinha feito foi reconhecido e não foi duplicado.'
              : `${done.linked} lançamentos que você já tinha feito foram reconhecidos e não foram duplicados.`}
          </p>
        )}
        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={() => navigate(`/contas/${done.accountId}`)}>Ver na conta</Button>
          <Button variant="secondary" onClick={onReset}>Importar outro arquivo</Button>
        </div>
        {done.created > 0 && (
          <button onClick={undo} className="mx-auto mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
            <Undo2 className="size-4" aria-hidden /> Desfazer importação
          </button>
        )}
      </div>
    )
  }

  const activeAccounts = (accounts.data ?? []).filter((a) => !a.archived)
  const dates = statement.rows.map((r) => r.date).sort()

  return (
    <div className="pb-28">
      <div className="mb-5 grid grid-cols-1 gap-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 md:grid-cols-[1fr_320px] md:items-end md:p-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold" title={fileName}>{fileName}</p>
          <p className="text-[13px] text-muted">
            {statement.rows.length} lançamentos de {shortDate(dates[0]!)} a {shortDate(dates[dates.length - 1]!)}
            {statement.bankName && ` · ${statement.bankName}`}
          </p>
          <button onClick={onReset} className="mt-2 text-sm font-semibold text-brass hover:underline">Trocar arquivo</button>
        </div>
        <Field label={statement.kind === 'card' ? 'Fatura de qual cartão?' : 'Extrato de qual conta?'} htmlFor="import-account">
          <Select id="import-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
      </div>

      {activeAccounts.length === 0 ? (
        <EmptyState title="Cadastre a conta primeiro" action={<Link to="/contas?nova=1" className="font-semibold text-brass">Cadastrar conta</Link>}>
          Os lançamentos importados precisam de uma conta ou cartão de destino.
        </EmptyState>
      ) : (existing.error || categories.error) ? (
        <ErrorNotice error={existing.error ?? categories.error} onRetry={() => existing.refetch()} />
      ) : !items ? <RowsSkeleton count={6} /> : (
        <>
          <div role="tablist" aria-label="Situação" className="scrollbar-none -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
            {([
              ['new', `Novos (${counts.new})`],
              ['known', `Já no app (${counts.known})`],
              ['ignored', `Ignorados (${counts.ignored})`],
            ] as [Filter, string][]).map(([f, label]) => (
              <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
                className="h-8 shrink-0 rounded-full border border-line px-3.5 text-[13px] font-semibold text-muted hover:text-ink aria-selected:border-ink aria-selected:bg-ink aria-selected:text-bg">
                {label}
              </button>
            ))}
          </div>
          <p className="mb-3 px-1 text-[13px] text-faint">
            {filter === 'new' && 'Confira as categorias. Desmarque o que não quiser importar.'}
            {filter === 'known' && 'Já estão no app: lançados por você ou importados antes. Não serão duplicados.'}
            {filter === 'ignored' && 'Pagamentos de fatura no cartão não viram lançamento: o dinheiro sai pela conta que pagou.'}
          </p>

          {visible.length === 0 ? (
            <EmptyState compact title="Nada aqui" />
          ) : (
            <ul className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              {visible.map((it) => (
                <ItemRow key={it.key} item={it} accounts={activeAccounts} accountId={accountId}
                  categories={categories.data ?? []} onChange={(p) => update(it.key, p)} />
              ))}
            </ul>
          )}

          <div className="pb-safe fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] z-20 border-t border-line bg-bg/95 backdrop-blur-xl md:sticky md:bottom-0 md:mt-6 md:rounded-[var(--radius-card)] md:border">
            <div className="mx-auto flex max-w-[1120px] items-center gap-4 px-4 py-3 md:px-5">
              <p className="min-w-0 flex-1 text-[13px] text-muted">
                {selected.length > 0 ? (
                  <>
                    {outflow > 0 && <Amount value={outflow} type="expense" sign className="font-semibold" />}
                    {outflow > 0 && inflow > 0 && ' · '}
                    {inflow > 0 && <Amount value={inflow} type="income" sign className="font-semibold" />}
                    {toLink > 0 && <span className="block">+ {toLink} já lançados, só vinculados</span>}
                  </>
                ) : toLink > 0 ? `${toLink} já lançados serão vinculados ao extrato` : 'Nada novo para importar'}
              </p>
              <Button size="lg" loading={saving} disabled={selected.length === 0 && toLink === 0} onClick={save}>
                {selected.length > 0 ? `Importar ${selected.length}` : 'Confirmar'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ItemRow({
  item, accounts, accountId, categories, onChange,
}: {
  item: ImportItem
  accounts: Account[]
  accountId: string
  categories: Category[]
  onChange: (p: Partial<ImportItem>) => void
}) {
  const editable = item.status === 'new' || (item.status === 'matched' && item.include)
  const cat = categories.find((c) => c.id === item.categoryId)
  const kind = item.row.amount < 0 ? 'expense' : 'income'
  const options = categories.filter((c) => !c.archived && c.kind === kind)
  const value = item.type === 'transfer' ? `x:${item.toAccountId}` : item.categoryId ? `c:${item.categoryId}` : ''

  function onSelect(v: string) {
    if (v.startsWith('x:')) onChange({ type: 'transfer', toAccountId: v.slice(2), categoryId: null })
    else onChange({ type: kind, toAccountId: null, categoryId: v ? v.slice(2) : null })
  }

  const canToggle = item.status === 'new' || item.status === 'matched'
  return (
    <li className={cn('flex gap-3 border-b border-line px-3 py-3 last:border-0 md:px-4', !item.include && item.status === 'new' && 'opacity-55')}>
      {canToggle ? (
        <input
          type="checkbox"
          checked={item.include}
          onChange={(e) => onChange({ include: e.target.checked })}
          aria-label={item.status === 'matched' ? `Importar “${item.description}” mesmo assim` : `Importar “${item.description}”`}
          className="mt-2.5 size-5 shrink-0 accent-[var(--c-brass)]"
        />
      ) : <span className="w-5 shrink-0" />}
      <div className="hidden md:block">
        {item.type === 'transfer' ? <TransferIcon /> : <CategoryIcon icon={cat?.icon} color={cat?.color} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          {editable ? (
            <input
              value={item.description}
              onChange={(e) => onChange({ description: e.target.value })}
              maxLength={80}
              aria-label="Descrição"
              className="-mx-1.5 min-w-0 flex-1 rounded-lg bg-transparent px-1.5 py-1 text-[15px] font-semibold hover:bg-raised focus:bg-raised focus:outline-none"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate py-1 text-[15px] font-semibold">{item.description}</span>
          )}
          <Amount value={item.amount} type={item.type === 'transfer' ? 'expense' : item.type} sign className="shrink-0 py-1 text-[15px] font-semibold" />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="num text-[13px] text-faint">
            {shortDate(item.date)}
            {item.row.installment && ` · parcela ${item.row.installment.number}/${item.row.installment.total}`}
          </span>
          {editable ? (
            <select
              value={value}
              onChange={(e) => onSelect(e.target.value)}
              aria-label="Categoria"
              className={cn(
                'h-8 max-w-full rounded-full border px-3 text-[13px] font-semibold focus:border-brass focus:outline-none',
                value ? 'border-line bg-raised text-ink' : 'border-warn/50 bg-warn/10 text-warn',
              )}
            >
              <option value="">Sem categoria</option>
              {options.map((c) => <option key={c.id} value={`c:${c.id}`}>{c.name}</option>)}
              {kind === 'expense' && (
                <optgroup label="Transferência para">
                  {accounts.filter((a) => a.id !== accountId).map((a) => (
                    <option key={a.id} value={`x:${a.id}`}>{a.type === 'credit_card' ? `Pagar fatura · ${a.name}` : a.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          ) : item.reason ? (
            <span className="text-[13px] text-muted">{item.reason}</span>
          ) : null}
        </div>
        {item.status === 'matched' && item.matchedTx && !item.include && (
          <p className="mt-1 text-[12px] text-faint">
            Lançado como “{item.matchedTx.description}” em {shortDate(item.matchedTx.date)} · {formatBRL(item.matchedTx.amount)}
          </p>
        )}
      </div>
    </li>
  )
}
