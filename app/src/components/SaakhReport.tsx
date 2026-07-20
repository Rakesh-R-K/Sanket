import { sectorLabels, fmtINR } from '../lib/format'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { Icon } from './icons'

type SaakhData = Awaited<ReturnType<typeof api.saakh>>

// Tiny inline sparkline: 24 months of net cash flow, pure SVG (prints well)
function Spark({ values }: { values: number[] }) {
  if (!values.length) return null
  const w = 640, h = 80
  const min = Math.min(...values, 0), max = Math.max(...values, 1)
  const x = (i: number) => values.length === 1 ? w / 2 : (i / (values.length - 1)) * w
  const y = (v: number) => h - ((v - min) / (max - min)) * h
  const zero = y(0)
  const path = values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 80 }}>
      <line x1="0" y1={zero} x2={w} y2={zero} stroke="#d1d5db" strokeDasharray="4 4" />
      <path d={path} fill="none" stroke="#166534" strokeWidth="2.5" />
    </svg>
  )
}

export function SaakhReport({ id, onBack }: { id: number; onBack: () => void }) {
  const [d, setD] = useState<SaakhData | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { void api.saakh(id).then(setD).catch(err => setError(err.message)) }, [id])
  if (error) return <div role="alert" className="p-6">{error} <button onClick={onBack}>Back</button></div>
  if (!d) return <div className="p-8 text-sm text-[var(--text-dim)]">Preparing report…</div>

  const nets = d.history.map(h => h.net)
  const positiveMonths = d.history.filter(h => h.net > 0).length
  const disc = d.discipline
  const tight = d.forecast?.points.filter(p => p.net < 0) ?? []

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="no-print rise mb-3 flex gap-2">
        <button onClick={onBack}
          className="flex items-center gap-1 rounded-lg border border-[var(--edge)] bg-[var(--surface)] px-3 py-1.5 text-sm text-[var(--text-dim)] transition hover:border-[var(--edge-lit)] hover:text-[var(--text)]">
          <Icon.chevronLeft size={14} /> Back
        </button>
        <button onClick={() => window.print()}
          className="flex items-center gap-1.5 rounded-lg bg-green-800 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-green-900 active:scale-95">
          <Icon.print size={14} /> Print / Save PDF
        </button>
      </div>

      <div id="saakh-report" className="paper rise rise-1 border-2 !border-green-900 p-4 sm:p-8">
        {/* header */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-green-900 pb-4">
          <div>
            <div className="text-2xl font-black tracking-wide text-green-900">SAAKH रिपोर्ट</div>
            <div className="text-xs text-stone-500">Cash-flow record · साख रिपोर्ट</div>
          </div>
          <div className="text-right text-xs text-stone-500">
            <div className="font-semibold text-stone-700">Sanket Platform</div>
            <div>Generated {d.generated_at.slice(0, 10)}</div>
            <div>Local demo report</div>
          </div>
        </div>

        {/* 1. identity */}
        <section className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-xs font-bold uppercase text-stone-400">Enterprise</div>
            <div className="font-bold">{d.name}</div>
            <div>{sectorLabels[d.sector]} · {d.members} members</div>
            <div>{d.village}, {d.block}, {d.district} district</div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase text-stone-400">Track record</div>
            <div>{disc.active_months} months of records · {disc.entries} entries</div>
            <div>First entry: {String(disc.first_entry).slice(0, 10)}</div>
            {d.loan && <div>Current loan: {fmtINR(d.loan.principal)} ({d.loan.lender}), EMI {fmtINR(d.loan.emi)}</div>}
          </div>
        </section>

        {/* 2. cash-flow summary */}
        <section className="mt-5">
          <div className="text-xs font-bold uppercase text-stone-400">24-month net cash flow</div>
          <Spark values={nets} />
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4 text-center text-sm">
            <div className="rounded bg-green-50 p-2">
              <div className="text-lg font-bold text-green-900">{positiveMonths}/{d.history.length}</div>
              <div className="text-[10px] text-stone-500">months cash-positive</div>
            </div>
            <div className="rounded bg-green-50 p-2">
              <div className="text-lg font-bold text-green-900">{disc.savings_regularity_pct}%</div>
              <div className="text-[10px] text-stone-500">savings regularity</div>
            </div>
            <div className="rounded bg-green-50 p-2">
              <div className="text-lg font-bold text-green-900">{disc.repayment_regularity_pct}%</div>
              <div className="text-[10px] text-stone-500">repayment regularity</div>
            </div>
            <div className="rounded bg-green-50 p-2">
              <div className="text-lg font-bold text-green-900">{disc.shocks_survived}</div>
              <div className="text-[10px] text-stone-500">flags resolved</div>
            </div>
          </div>
        </section>

        {/* 3. forecast */}
        <section className="mt-5 text-sm">
          <div className="text-xs font-bold uppercase text-stone-400">6-month outlook (Sanket forecast)</div>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {d.forecast?.points.map(pt => (
              <div key={pt.month} className={`flex-1 rounded p-2 text-center ${pt.net < 0 ? 'bg-amber-100' : 'bg-emerald-100'}`}>
                <div className="text-[10px] text-stone-500">{pt.month}</div>
                <div className="text-xs font-bold">{fmtINR(pt.net)}</div>
              </div>
            ))}
          </div>
          {tight.length > 0 && (
            <p className="mt-1 text-xs text-stone-600">
              {tight.length} month(s) show a negative projected net. Forecasts are estimates.
            </p>
          )}
        </section>

        {/* 4. resilience history */}
        <section className="mt-5 text-sm">
          <div className="text-xs font-bold uppercase text-stone-400">Officer notes</div>
          {d.interventions.length ? (
            <ul className="mt-1 space-y-0.5 text-xs">
              {d.interventions.map((iv, i) => (
                <li key={i}>+ {iv.logged_at.slice(0, 10)} - {iv.officer_note} {iv.outcome && `→ ${iv.outcome}`}</li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-stone-500">No officer notes recorded.</p>
          )}
        </section>

        {/* 5. open risk, transparent */}
        {d.flags.length > 0 && (
          <section className="mt-5 text-sm">
            <div className="text-xs font-bold uppercase text-stone-400">Current risk factors (disclosed transparently)</div>
            <ul className="mt-1 space-y-0.5 text-xs">
              {d.flags.flatMap(f => f.reasons).map((r, i) => <li key={i}>– {r.text_en}</li>)}
            </ul>
          </section>
        )}

        {/* footer */}
        <div className="mt-6 border-t pt-3 text-[10px] leading-relaxed text-stone-500">
          {d.disclaimer_en}
        </div>
      </div>
    </div>
  )
}
