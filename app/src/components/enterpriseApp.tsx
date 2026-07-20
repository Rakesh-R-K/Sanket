import { fmtINR, today } from '../lib/format'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { liveQuery } from 'dexie'
import { api, type Profile } from '../lib/api'
import { recordTxn, localdb, drainOutbox, type LocalTxn } from '../lib/offline'
import { useT } from '../lib/i18n'
import { Icon } from './icons'
import { SaakhReport } from './saakhReport'

type Tab = 'home' | 'entry' | 'alerts' | 'saakh'

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false)
    window.addEventListener('online', up); window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  return online
}

const typeIcons = { income: Icon.income, expense: Icon.expense, savings: Icon.savings, loan_repayment: Icon.loan } as const

function EntryForm({ enterpriseId, onSaved }: { enterpriseId: number; onSaved: () => void }) {
  const { t } = useT()
  const [type, setType] = useState<LocalTxn['type']>('income')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(today)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const types = ['income', 'expense', 'savings', 'loan_repayment'] as const

  const save = async (ev: FormEvent) => {
    ev.preventDefault()
    if (saving) return
    setSaving(true); setError(''); setMsg('')
    try {
      await recordTxn({ enterprise_id: enterpriseId, type, amount: Number(amount), note: note.trim(), entered_at: date })
      setAmount(''); setNote(''); setMsg(t('savedLocal'))
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('saveFailed'))
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={save} className="space-y-3 p-4">
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{t('entryType')}</legend>
        <div className="grid grid-cols-2 gap-2">
          {types.map(key => {
            const I = typeIcons[key]
            return <button type="button" key={key} onClick={() => setType(key)} aria-pressed={type === key}
              className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${type === key ? 'border-[var(--p-good)] bg-[var(--p-good-soft)]' : 'border-[var(--p-edge)]'}`}>
              <I size={16} />{t(key)}
            </button>
          })}
        </div>
      </fieldset>
      <label className="block text-sm" htmlFor="entry-amount">{t('amount')}</label>
      <input id="entry-amount" name="amount" type="number" inputMode="decimal" min="0.01" max="100000000" step="0.01" required
        value={amount} onChange={ev => setAmount(ev.target.value)} className="w-full rounded-lg border border-[var(--p-edge)] p-3" />
      <label className="block text-sm" htmlFor="entry-date">{t('entryDate')}</label>
      <input id="entry-date" name="date" type="date" required min="2000-01-01" max={today()} value={date}
        onChange={ev => setDate(ev.target.value)} className="w-full rounded-lg border border-[var(--p-edge)] p-3" />
      <label className="block text-sm" htmlFor="entry-note">{t('note')}</label>
      <input id="entry-note" name="note" maxLength={500} value={note} onChange={ev => setNote(ev.target.value)}
        className="w-full rounded-lg border border-[var(--p-edge)] p-3" />
      <button disabled={saving} className="w-full rounded-lg bg-[var(--p-good)] p-3 font-semibold text-[var(--on-accent)] disabled:opacity-50">
        {saving ? t('saving') : t('save')}
      </button>
      {msg && <p role="status" className="text-sm text-[var(--p-good)]">{msg}</p>}
      {error && <p role="alert" className="text-sm text-[var(--sig-red)]">{error}</p>}
    </form>
  )
}

function SavedEntries({ entries, online }: { entries: LocalTxn[]; online: boolean }) {
  const { t } = useT()
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const pending = entries.filter(row => !row.synced)
  const recent = [...pending, ...entries.filter(row => row.synced).slice(0, 5)]
  const retry = async () => {
    setSyncing(true); setError('')
    try { await drainOutbox() }
    catch { setError(t('saveFailed')) }
    finally { setSyncing(false) }
  }
  return <section className="border-t border-[var(--p-edge)] p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">{t('savedEntries')}</h3>
      {pending.length > 0 && <button type="button" disabled={!online || syncing} onClick={retry}
        className="rounded border border-[var(--p-edge)] px-3 py-2 text-xs disabled:opacity-50">
        {syncing ? t('syncing') : t('retrySync')}
      </button>}
    </div>
    {!recent.length && <p className="mt-2 text-sm text-[var(--p-dim)]">{t('noEntries')}</p>}
    <ol className="mt-2 space-y-3" aria-live="polite">
      {recent.map(row => <li key={row.id} className="border-t border-[var(--p-edge)] pt-3 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><span>{t(row.type)} · {row.entered_at}</span><strong>{fmtINR(row.amount)}</strong></div>
        {row.note && <p className="mt-1 break-words text-[var(--p-dim)]">{row.note}</p>}
        <p className={`mt-1 text-xs ${row.error ? 'text-[var(--sig-red)]' : 'text-[var(--p-good)]'}`}>
          {row.synced ? t('synced') : row.error ? t('syncFailed') : t('pending')}
        </p>
        {row.error && !row.synced && <p className="mt-1 text-xs text-[var(--p-dim)]">{row.error}</p>}
      </li>)}
    </ol>
    {error && <p role="alert" className="mt-2 text-sm text-[var(--sig-red)]">{error}</p>}
  </section>
}

function HealthCard({ p }: { p: Profile }) {
  const { t } = useT()
  const thisMonth = p.history[p.history.length - 1]
  const tight = p.forecast?.points.filter(pt => pt.net < 0) ?? []
  return (
    <div className="space-y-3 p-4">
      <div className="day-card p-4">
        <div className="day-title">{t('healthCard')}</div>
        <div className="mt-2 flex flex-wrap justify-between gap-4">
          <div>
            <div className="flex items-center gap-1 text-xs text-[var(--p-dim)]">
              <Icon.income size={11} className="text-[var(--p-good)]" /> {t('thisMonth')} · {t('in_')}
            </div>
            <div className="num text-xl font-semibold text-[var(--p-good)]">{fmtINR(thisMonth?.income ?? 0)}</div>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-1 text-xs text-[var(--p-dim)]">
              <Icon.expense size={11} /> {t('thisMonth')} · {t('out')}
            </div>
            <div className="num text-xl font-semibold text-[var(--p-ink)]">
              {fmtINR((thisMonth?.expense ?? 0) + (thisMonth?.repayment ?? 0))}
            </div>
          </div>
        </div>
      </div>

      <div className={`day-card p-4 ${tight.length ? '!border-[var(--p-warn-border)] !bg-[var(--p-warn-soft)]' : '!border-[var(--accent-border)] !bg-[var(--p-good-soft)]/60'}`}>
        <div className="day-title">{t('nextMonths')}</div>
        <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium">
          {tight.length
            ? <><Icon.warning size={15} className="text-[var(--p-warn)]" /> {t('tightMonths')}: {tight.map(m => m.month.slice(5)).join(', ')}</>
            : <><Icon.healthy size={15} className="text-[var(--p-good)]" /> {t('looksSteady')}</>}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {p.forecast?.points.map(pt => <div key={pt.month} className="rounded-md border border-[var(--edge)] p-2">
            <div className="text-xs text-[var(--p-dim)]">{pt.month}</div>
            <div className={`mt-1 text-sm ${pt.net < 0 ? 'text-[var(--p-warn)]' : 'text-[var(--p-good)]'}`}>{fmtINR(pt.net)}</div>
          </div>)}
        </div>
      </div>
    </div>
  )
}

function Alerts({ p, onAction }: { p: Profile; onAction: () => void }) {
  const { t, pick } = useT()
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState('')
  const done = async (id: number) => {
    setBusy(id); setError('')
    try { await api.suggestionDone(id); onAction() }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not save this action.') }
    finally { setBusy(null) }
  }
  const flags = p.flags
  if (!flags.length)
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center text-sm text-[var(--p-dim)]">
        <Icon.healthy size={28} className="text-[var(--p-good)]" />
        {t('noAlerts')}
      </div>
    )
  return (
    <div className="space-y-3 p-4">
      {error && <p role="alert" className="text-sm text-[var(--sig-red)]">{error}</p>}
      {flags.map(f => (
        <div key={f.id} className="day-card !border-[var(--p-warn-border)] p-4">
          <div className="mb-2 flex items-center gap-1.5 text-sm font-bold text-[var(--p-warn)]">
            <Icon.warning size={15} /> {f.level.toUpperCase()}
          </div>
          <ul className="space-y-1.5 text-sm text-[var(--p-ink)]">
            {f.reasons.map((r, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--p-warn)]" />
                {pick(r)}
              </li>
            ))}
          </ul>
          {f.suggestions.length > 0 && (
            <div className="mt-3 border-t border-[var(--p-edge)] pt-2.5">
              <div className="day-title mb-1.5">{t('suggestions')}</div>
              {f.suggestions.map(s => (
                <div key={s.id} className="mb-2 flex items-start gap-2 last:mb-0">
                  <p className="flex-1 text-sm text-[var(--p-ink)]">{pick(s)}</p>
                  {s.action_status === 'done'
                    ? <Icon.check size={15} className="mt-0.5 shrink-0 text-[var(--p-good)]" />
                    : <button disabled={busy !== null} onClick={() => void done(s.id)}
                        className="shrink-0 rounded-md bg-[var(--p-good)] px-2.5 py-1 text-xs font-semibold text-[var(--on-accent)] transition hover:opacity-90 active:scale-95">
                        {t('markDone')}
                      </button>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function EnterpriseApp({ enterpriseId }: { enterpriseId: number }) {
  const { t } = useT()
  const online = useOnline()
  const [tab, setTab] = useState<Tab>('home')
  const [p, setP] = useState<Profile | null>(null)
  const [entries, setEntries] = useState<LocalTxn[]>([])
  const [error, setError] = useState('')
  const pending = entries.filter(row => !row.synced).length

  const load = useCallback(async () => {
    try { setP(await api.profile(enterpriseId)); setError('') }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load this enterprise.') }
  }, [enterpriseId])
  useEffect(() => {
    const sub = liveQuery(() => localdb.outbox.where('enterprise_id').equals(enterpriseId).toArray())
      .subscribe({ next: rows => setEntries(rows.sort((a, b) => b.id! - a.id!)), error: () => setError('Local storage is unavailable.') })
    return () => sub.unsubscribe()
  }, [enterpriseId])
  useEffect(() => {
    void load()
    const reload = () => { void load() }
    window.addEventListener('sanket-sync', reload)
    window.addEventListener('online', reload)
    return () => { window.removeEventListener('sanket-sync', reload); window.removeEventListener('online', reload) }
  }, [load])

  if (tab === 'saakh') return <SaakhReport id={enterpriseId} onBack={() => setTab('home')} />

  const nav: { key: Tab; icon: keyof typeof Icon; label: string }[] = [
    { key: 'home', icon: 'home', label: t('home') },
    { key: 'entry', icon: 'plus', label: t('addEntry') },
    { key: 'alerts', icon: 'bell', label: t('alerts') },
  ]

  return (
    <div className="enterprise-record">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--edge)] bg-[var(--surface)] p-4">
        <div>
          <div className="font-bold leading-tight">{t('appName')}</div>
          <div className="text-sm text-[var(--ink-dim)]">{p?.name.split('(')[0].trim() ?? t('tagline')}</div>
        </div>
        <div className="text-right">
          <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${online ? 'bg-[var(--accent-soft)]' : 'bg-[var(--surface-2)]'}`}>
            {online ? <Icon.wifi size={11} /> : <Icon.wifiOff size={11} />}
            {online ? t('online') : t('offline')}
          </div>
          {pending > 0 && (
            <div className="num mt-1 text-[10px] opacity-90">{pending} {t('pendingSync')}</div>
          )}
        </div>
      </div>

      <div key={tab}>
        {error && <div role="alert" className="p-4 text-sm text-[var(--sig-red)]">{error} <button onClick={load} className="underline">{t('retry')}</button></div>}
        {p ? (
          <>
            {tab === 'home' && (
              <>
                <HealthCard p={p} />
                <div className="px-4 pb-4">
                  <button onClick={() => setTab('saakh')}
                    className="day-card day-card-hover flex w-full items-center gap-3 p-3.5 text-left">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--p-good-soft)] text-[var(--p-good)]">
                      <Icon.report size={18} />
                    </span>
                    <div className="flex-1">
                      <div className="text-sm font-bold text-[var(--p-good)]">{t('getSaakh')}</div>
                      <div className="text-xs text-[var(--p-dim)]">{t('saakhSub')}</div>
                    </div>
                    <Icon.arrowRight size={16} className="text-[var(--p-faint)]" />
                  </button>
                </div>
              </>
            )}
            {tab === 'entry' && <><EntryForm enterpriseId={enterpriseId} onSaved={load} /><SavedEntries entries={entries} online={online} /></>}
            {tab === 'alerts' && <Alerts p={p} onAction={load} />}
          </>
        ) : (
          <div className="space-y-3 p-4">
            <div className="skeleton h-24" /><div className="skeleton h-32" />
          </div>
        )}
      </div>
      <nav className="grid grid-cols-3 border-t border-[var(--p-edge)] bg-[var(--p-card)]">
        {nav.map(({ key, icon, label }) => {
          const I = Icon[icon]
          const active = tab === key
          const badge = key === 'alerts' ? (p?.flags.length ?? 0) : 0
          return (
            <button key={key} aria-current={active ? 'page' : undefined} onClick={() => setTab(key)}
              className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition ${active ? 'text-[var(--p-good)]' : 'text-[var(--p-dim)] hover:text-[var(--p-dim)]'}`}>
              <span className={`grid h-7 w-12 place-items-center rounded-full transition ${active ? 'bg-[var(--p-good-soft)]' : ''}`}>
                <I size={17} />
              </span>
              {label}
              {badge > 0 && (
                <span className="num absolute right-[calc(50%-22px)] top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--sig-red)] px-1 text-[9px] font-bold text-[var(--on-accent)]">
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
