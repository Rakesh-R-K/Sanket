import { sectorLabels, fmtINR } from '../lib/format'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  Area, ComposedChart, Line, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts'
import { api, type Profile } from '../lib/api'
import { RiskBadge, SectorIcon } from './shared'
import { Icon } from './icons'
import { SaakhReport } from './SaakhReport'
import { useT } from '../lib/i18n'

function CashFlowChart({ p }: { p: Profile }) {
  const hist = p.history.map(h => ({ month: h.month.slice(2), net: h.net }))
  const fc = p.forecast
  const data = [
    ...hist,
    ...(fc ? fc.points.map((pt, i) => ({
      month: pt.month.slice(2), forecast: pt.net,
      range: [fc.band[i].lo, fc.band[i].hi],
    })) : []),
  ]
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
        <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'var(--text-faint)' }} interval={2}
          axisLine={{ stroke: 'var(--edge)' }} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: 'var(--text-faint)' }} width={48} axisLine={false} tickLine={false}
          tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
        <Tooltip
          contentStyle={{ background: 'var(--surface-2)', borderRadius: 10, border: '1px solid var(--edge-lit)', fontSize: 12, color: 'var(--text)' }}
          labelStyle={{ color: 'var(--text-dim)' }}
          formatter={value => Array.isArray(value) ? value.map(v => fmtINR(Number(v))).join(' to ') : fmtINR(Number(value))} />
        <ReferenceLine y={0} stroke="var(--edge-lit)" strokeDasharray="4 4" />
        <Area dataKey="range" name="Indicative range" stroke="none" fill="var(--sig-green)" fillOpacity={0.12} isAnimationActive={false} />
        <Line dataKey="net" stroke="var(--sig-green)" dot={false} strokeWidth={2}
          name="Net (history)" isAnimationActive animationDuration={1000}
          style={{ filter: 'drop-shadow(0 0 4px var(--sig-green-glow))' }} />
        <Line dataKey="forecast" stroke="var(--sig-amber)" strokeDasharray="6 3"
          dot={{ r: 2.5, fill: 'var(--sig-amber)' }} strokeWidth={2}
          name="Forecast" isAnimationActive animationDuration={900} animationBegin={500}
          style={{ filter: 'drop-shadow(0 0 4px var(--sig-amber-glow))' }} />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export function EnterpriseProfile({ id, onBack }: { id: number; onBack: () => void }) {
  const { t, pick, lang } = useT()
  const [p, setP] = useState<Profile | null>(null)
  const [showSaakh, setShowSaakh] = useState(false)
  const [note, setNote] = useState('')
  const [logged, setLogged] = useState(false)

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [resolve, setResolve] = useState(false)
  const load = useCallback(async () => {
    try { setP(await api.profile(id)); setError('') }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load the enterprise.') }
  }, [id])
  useEffect(() => { void load() }, [load])
  if (!p && error) return <div className="p-6" role="alert">{error} <button onClick={load}>{t('retry')}</button> <button onClick={onBack}>{t('back')}</button></div>

  if (!p) return (
    <div className="mx-auto max-w-4xl space-y-3 p-4">
      <div className="skeleton h-14" /><div className="skeleton h-60" /><div className="skeleton h-32" />
    </div>
  )
  if (showSaakh) return <SaakhReport id={id} onBack={() => setShowSaakh(false)} />

  const worstFlag = p.flags[0]
  const logIntervention = async (ev: FormEvent) => {
    ev.preventDefault()
    if (!note.trim() || saving) return
    setSaving(true); setError('')
    try {
      await api.intervene({ enterprise_id: id, flag_id: worstFlag?.id, officer_note: note.trim(), resolve })
      setNote(''); setLogged(true); setResolve(false); await load()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save the note.') }
    finally { setSaving(false) }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      {error && <p role="alert" className="text-sm text-[var(--sig-red)]">{error}</p>}
      <div className="rise flex flex-wrap items-center gap-3">
        <button onClick={onBack}
          className="flex items-center gap-1 rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text-dim)] transition hover:border-[var(--edge-lit)] hover:text-[var(--text)]">
          <Icon.chevronLeft size={14} /> {t('back')}
        </button>
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-[var(--edge)] bg-[var(--deep)] text-[var(--sig-green)]">
          <SectorIcon sector={p.sector} size={20} />
        </span>
        <div>
          <h2 className="font-black leading-tight text-[var(--text)]">{p.name}</h2>
          <div className="mono text-[10px] uppercase tracking-wide text-[var(--text-faint)]">
            {sectorLabels[p.sector]} · {p.village}, {p.block} · {p.members} {t('cMembers')}
            {p.loan && <> · EMI {fmtINR(p.loan.emi)}/mo · {p.loan.lender}</>}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {worstFlag ? <RiskBadge risk={worstFlag.level} /> : <RiskBadge risk="healthy" />}
          <button onClick={() => setShowSaakh(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[rgba(45,212,160,.4)] bg-[rgba(45,212,160,.1)] px-3 py-2 text-xs font-bold text-[var(--sig-green)] transition hover:bg-[rgba(45,212,160,.18)] active:scale-95">
            <Icon.report size={13} /> {t('pSaakhBtn')}
          </button>
        </div>
      </div>

      <section className="panel rise rise-1 scanning">
        <div className="panel-head">
          <Icon.signal size={11} className="lit" /> {t('pChart')}
          {p.forecast && <span className="mono ml-auto normal-case tracking-normal text-[var(--text-faint)]">model: {p.forecast.model_tag}</span>}
        </div>
        <div className="p-3"><CashFlowChart p={p} /></div>
      </section>

      {p.flags.length > 0 && (
        <section className="panel rise rise-2">
          <div className="panel-head"><Icon.alert size={11} className="text-[var(--sig-amber)]" /> {t('pWhy')}</div>
          <div className="p-4">
            {p.flags.map(f => (
              <div key={f.id} className="mb-3 last:mb-0">
                <div className="mb-1.5 flex items-center gap-2">
                  <RiskBadge risk={f.level} small />
                  <span className="mono text-[10px] text-[var(--text-faint)]">{t('pOpened')} {f.opened_at}</span>
                </div>
                <ul className="stagger space-y-1.5">
                  {f.reasons.map((r, i) => (
                    <li key={i} className="flex gap-2 text-sm text-[var(--text-dim)]">
                      <Icon.arrowRight size={13} className="mt-1 shrink-0 text-[var(--sig-amber)]" />
                      {pick(r)}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel rise rise-3">
        <div className="panel-head"><Icon.check size={11} className="lit" /> {t('pLog')}</div>
        <div className="p-4">
          {logged && (
            <div className="fade mb-2 flex items-center gap-2 rounded-lg border border-[rgba(45,212,160,.3)] bg-[rgba(45,212,160,.08)] px-3 py-2 text-xs text-[var(--sig-green)]">
              <Icon.check size={13} /> {t('pLogged')}
            </div>
          )}
          <form onSubmit={logIntervention}>
            <label htmlFor="officer-note" className="mb-2 block text-sm">{t('pLog')}</label>
            <div className="flex flex-wrap gap-2">
            <input id="officer-note" name="officerNote" required maxLength={2000} value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. Visited; advised feed pre-purchase and EMI restructuring"
              className="min-w-0 flex-1 rounded-lg border border-[var(--edge)] bg-[var(--deep)] px-3 py-2 text-sm text-[var(--text)] outline-none transition placeholder:text-[var(--text-faint)] focus:border-[var(--sig-green)]" />
            <button disabled={saving}
              className="rounded-lg border border-[rgba(45,212,160,.4)] bg-[rgba(45,212,160,.12)] px-4 py-2 text-xs font-bold text-[var(--sig-green)] transition hover:bg-[rgba(45,212,160,.2)] active:scale-95">
              {saving ? t('saving') : t('pLogBtn')}
            </button>
            </div>
            {worstFlag && <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" name="resolveFlag" checked={resolve} onChange={ev => setResolve(ev.target.checked)} />{lang === 'hi' ? 'इस फ़्लैग को सुलझा हुआ चिह्नित करें' : 'Mark this flag resolved'}</label>}
          </form>
          {(p.action_history ?? []).length > 0 && <ul className="mt-3 space-y-2 text-xs text-[var(--text-dim)]">
            {p.action_history.map(action => <li key={action.id}>{lang === 'hi' ? 'पूरा किया' : 'Completed'}: {pick(action)}</li>)}
          </ul>}
          {p.interventions.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-[var(--text-dim)]">
              {p.interventions.map((iv, i) => (
                <li key={i} className="flex gap-1.5">
                  <Icon.check size={12} className="mt-0.5 shrink-0 text-[var(--sig-green)]" />
                  {iv.logged_at.slice(0, 10)} - {iv.officer_note}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="panel rise rise-4">
        <div className="panel-head"><Icon.database size={11} className="lit" /> {t('pRecent')}</div>
        <div className="grid gap-0.5 p-4 pt-2 text-xs">
          {p.recent_transactions.slice(0, 10).map((t, i) => (
            <div key={i} className="flex items-center justify-between border-b border-[var(--edge)]/40 py-1.5 last:border-0">
              <span className="flex items-center gap-2 text-[var(--text-dim)]">
                {t.type === 'income'
                  ? <Icon.income size={12} className="text-[var(--sig-green)]" />
                  : <Icon.expense size={12} className="text-[var(--text-faint)]" />}
                <span className="mono text-[10px]">{t.entered_at}</span> {t.note || t.type}
              </span>
              <span className={`mono num font-bold ${t.type === 'income' ? 'text-[var(--sig-green)]' : 'text-[var(--text-dim)]'}`}>
                {t.type === 'income' ? '+' : '−'}{fmtINR(t.amount)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
