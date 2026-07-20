import { sectorLabels } from '../lib/format'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { api, type DistrictRisk, type DistrictSummary, type EnterpriseRow, type LeadTime } from '../lib/api'
import { AnimatedNumber, SectorIcon } from './shared'
import { Icon } from './icons'
import { EnterpriseProfile } from './EnterpriseProfile'
import { CascadeOverlay, type CascadeResult } from './CascadeOverlay'
import { pendingCount } from '../lib/offline'
import { useT, type StringKey } from '../lib/i18n'

const LEVEL_COLOR: Record<string, string> = {
  alert: 'var(--sig-red)', warning: 'var(--sig-amber)',
  watch: 'var(--watch)', healthy: 'var(--sig-green)',
}
const RISK_KEY: Record<string, StringKey> = {
  alert: 'rAlert', warning: 'rWarning', watch: 'rWatch', healthy: 'rHealthy',
}
const blockLevel = (levels: Record<string, number>) =>
  levels.alert ? 'alert' : levels.warning ? 'warning' : levels.watch ? 'watch' : 'healthy'

const spring = { type: 'spring', stiffness: 300, damping: 30 } as const

/* ── editorial marquee ── */
function Marquee({ d }: { d: DistrictRisk }) {
  const items = d.signals.length
    ? d.signals.map(s => ({ hot: true, text: `${s.commodity.toUpperCase()} ${s.kind.replace('_', ' ').toUpperCase()} · z=${s.magnitude_z}` }))
    : [
        { hot: false, text: 'MAIZE - district mandis steady' },
        { hot: false, text: 'SOYBEAN - district mandis steady' },
        { hot: false, text: 'MONSOON - within climatology' },
      ]
  const row = [...items,
    { hot: false, text: `${d.kpis.total} ENTERPRISES MONITORED` },
    { hot: false, text: `${d.district.toUpperCase()} · VIDARBHA · MAHARASHTRA` },
    { hot: false, text: 'AGMARKNET LIVE · IMD CALIBRATED' }]
  const doubled = [...row, ...row]
  return (
    <div className="marquee border-b border-[var(--edge)] py-2.5">
      <div className="marquee-track mono text-[10px] font-medium tracking-[.22em]">
        {doubled.map((it, i) => (
          <span key={i} className={`flex items-center gap-2.5 ${it.hot ? 'text-[var(--sig-red)]' : 'text-[var(--ink-faint)]'}`}>
            <span className={`h-1 w-1 rounded-full ${it.hot ? 'bg-[var(--sig-red)] dot-live' : 'bg-[var(--lime)]'}`}
              style={it.hot ? undefined : { opacity: .5 }} />
            {it.text}
          </span>
        ))}
      </div>
    </div>
  )
}

/* ── stat band: huge numerals, thin rules ── */
function StatBand({ d, lead }: { d: DistrictRisk; lead: LeadTime | null }) {
  const { t } = useT()
  const stats = [
    { label: t('cStatMonitored'), value: d.kpis.total, tone: 'var(--ink)' },
    { label: t('cStatAlerts'), value: d.kpis.alerts, tone: d.kpis.alerts ? 'var(--sig-red)' : 'var(--ink)' },
    { label: t('cStatWarnings'), value: d.kpis.warnings, tone: d.kpis.warnings ? 'var(--sig-amber)' : 'var(--ink)' },
    { label: t('cStatLead'), value: lead?.median_lead_days ?? 0, tone: 'var(--lime)' },
  ]
  return (
    <motion.div className="grid grid-cols-2 divide-[var(--edge)] border-y border-[var(--edge)] md:grid-cols-4 md:divide-x"
      initial="off" animate="on" variants={{ on: { transition: { staggerChildren: .08 } } }}>
      {stats.map(s => (
        <motion.div key={s.label} className="px-5 py-5"
          variants={{ off: { opacity: 0, y: 18 }, on: { opacity: 1, y: 0, transition: spring } }}>
          <div className="display num text-[2.75rem] font-bold leading-none" style={{ color: s.tone }}>
            <AnimatedNumber value={s.value} />
          </div>
          <div className="mono mt-2 text-[9px] uppercase tracking-[.24em] text-[var(--ink-faint)]">{s.label}</div>
        </motion.div>
      ))}
    </motion.div>
  )
}

/* ── constellation map (ring layout, any district) ── */
function DistrictMap({ d, active, onSelectBlock }:
  { d: DistrictRisk; active: string | null; onSelectBlock: (b: string | null) => void }) {
  const names = Object.keys(d.blocks)
  const POS: Record<string, { x: number; y: number }> = {}
  names.forEach((n, i) => {
    const a = (i / names.length) * Math.PI * 2 - Math.PI / 3.2
    POS[n] = { x: 50 + 26 * Math.cos(a), y: 49 + 25 * Math.sin(a) }
  })
  const blocks = Object.entries(d.blocks)
  const edges: [string, string][] = []
  for (let i = 0; i < blocks.length; i++)
    for (let j = i + 1; j < blocks.length; j++) edges.push([blocks[i][0], blocks[j][0]])
  return (
    <svg viewBox="0 0 100 92" className="w-full">
      {edges.map(([a, b], i) => {
        const p1 = POS[a] ?? { x: 50, y: 50 }, p2 = POS[b] ?? { x: 50, y: 50 }
        return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
          stroke="var(--edge-lit)" strokeWidth=".4" strokeDasharray="2 3"
          style={{ animation: 'dashFlow 3s linear infinite' }} />
      })}
      {blocks.map(([name, b], bi) => {
        const p = POS[name] ?? { x: 50, y: 50 }
        const lvl = blockLevel(b.levels)
        const total = Object.values(b.levels).reduce((s, n) => s + n, 0)
        const flagged = (b.levels.alert ?? 0) + (b.levels.warning ?? 0) + (b.levels.watch ?? 0)
        const r = 6 + Math.min(6, total * 0.45)
        const c = LEVEL_COLOR[lvl]
        return (
          <motion.g key={name} onClick={() => onSelectBlock(active === name ? null : name)}
            className="cursor-pointer"
            initial={{ opacity: 0, scale: .6 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ ...spring, delay: bi * .1 }}>
            {lvl !== 'healthy' && (
              <circle cx={p.x} cy={p.y} r={r} fill="none" stroke={c} strokeWidth=".7" opacity=".55">
                <animate attributeName="r" values={`${r};${r * 2.1}`} dur="1.9s" repeatCount="indefinite" />
                <animate attributeName="opacity" values=".55;0" dur="1.9s" repeatCount="indefinite" />
              </circle>
            )}
            <circle cx={p.x} cy={p.y} r={r} fill={c} fillOpacity={active === name ? .5 : .2}
              stroke={c} strokeWidth={active === name ? 1.5 : .9}
              style={{ transition: 'all .4s ease', filter: lvl !== 'healthy' ? `drop-shadow(0 0 5px ${c})` : undefined }} />
            <text x={p.x} y={p.y - r - 3.2} textAnchor="middle" fill="var(--ink-dim)"
              fontSize="4.2" fontWeight="700" style={{ letterSpacing: '.12em' }}>{name.toUpperCase()}</text>
            <text x={p.x} y={p.y + 1.7} textAnchor="middle" fill="var(--ink)"
              fontSize="4.6" fontWeight="800" className="num">{flagged}/{total}</text>
          </motion.g>
        )
      })}
    </svg>
  )
}

/* ── section heading: the hero's two-tone voice, reused everywhere ── */
function SectionTitle({ a, b, accent = 'var(--lime)' }: { a: string; b: string; accent?: string }) {
  return (
    <h3 className="display text-xl font-bold tracking-tight">
      {a} <span className="serif-accent font-normal" style={{ color: accent }}>{b}</span>
    </h3>
  )
}

export function OfficerConsole() {
  const { t, lang } = useT()
  const [rows, setRows] = useState<EnterpriseRow[]>([])
  const [districtName, setDistrictName] = useState('Wardha')
  const [allDistricts, setAllDistricts] = useState<DistrictSummary[]>([])
  const [district, setDistrict] = useState<DistrictRisk | null>(null)
  const [lead, setLead] = useState<LeadTime | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [blockFilter, setBlockFilter] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [cascade, setCascade] = useState<CascadeResult | null>(null)

  const [error, setError] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const reqId = useRef(0)
  const refresh = useCallback(async (dn = districtName) => {
    const req = ++reqId.current
    setError('')
    try {
      const [r, d, l, ds] = await Promise.all([
        api.enterprises(dn), api.district(dn), api.leadtime(), api.districts()])
      if (req !== reqId.current) return
      setRows(r); setDistrict(d); setLead(l); setAllDistricts(ds)
    } catch (err) {
      if (req === reqId.current) setError(err instanceof Error ? err.message : 'Could not load the district.')
    } finally { if (req === reqId.current) setLoaded(true) }
  }, [districtName])
  useEffect(() => {
    setLoaded(false); setBlockFilter(null); setRows([]); setDistrict(null)
    void refresh()
  }, [refresh])

  const runShock = async (key: string, label: string) => {
    setBusy(label); setError('')
    try { setCascade(await api.shock(key)); await refresh() }
    catch (err) { setError(err instanceof Error ? err.message : 'The scenario failed.') }
    finally { setBusy(null) }
  }
  const runReset = async () => {
    setBusy(t('cReset')); setError('')
    try {
      if (await pendingCount()) throw new Error('Sync pending entries before resetting the demo.')
      await api.reset(); await refresh(); setSelected(null); setConfirmReset(false)
    } catch (err) { setError(err instanceof Error ? err.message : 'Reset failed.') }
    finally { setBusy(null) }
  }

  if (selected !== null)
    return <EnterpriseProfile id={selected} onBack={() => { setSelected(null); void refresh() }} />

  const visible = blockFilter ? rows.filter(r => r.block === blockFilter) : rows
  const needAttention = (district?.kpis.alerts ?? 0) + (district?.kpis.warnings ?? 0)

  return (
    <>
      <AnimatePresence>
        {cascade && <CascadeOverlay result={cascade} onDone={() => setCascade(null)} />}
      </AnimatePresence>
      {district && <Marquee d={district} />}
      {error && <div role="alert" className="mx-auto max-w-5xl px-6 py-4 text-sm text-[var(--sig-red)]">{error} <button onClick={() => void refresh()} className="underline">{t('retry')}</button></div>}

      {/* ── hero ── */}
      <section className="mx-auto w-full max-w-[1560px] px-6 pb-6 pt-8 md:px-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <motion.div className="kicker" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: .1 }}>
            {t('cKicker')} · {districtName}
          </motion.div>
          <div className="flex flex-wrap gap-1.5">
            {allDistricts.map(d => (
              <button key={d.district} onClick={() => setDistrictName(d.district)}
                className={`mono rounded-full border px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[.15em] transition-all ${districtName === d.district
                  ? 'border-[var(--lime)] bg-[var(--accent-soft)] text-[var(--lime)]'
                  : 'border-[var(--edge)] text-[var(--ink-faint)] hover:border-[var(--edge-lit)] hover:text-[var(--ink-dim)]'}`}>
                {d.district}
                {(d.alerts ?? 0) > 0 && <span className="ml-1.5 text-[var(--sig-red)]">●</span>}
              </button>
            ))}
          </div>
        </div>
        <motion.h1 key={districtName + lang} className="display mt-4 max-w-4xl text-[clamp(1.9rem,4vw,3.1rem)] font-bold leading-[1.08] tracking-tight text-[var(--ink)]"
          initial="off" animate="on" variants={{ on: { transition: { staggerChildren: .09, delayChildren: .1 } } }}>
          {[
            <span key="a">{districtName}{t('cHlA')}{' '}</span>,
            <span key="b" className="text-[var(--ink-faint)]">{t('cHlB')}{' '}</span>,
          ].map((chunk, i) => (
            <motion.span key={i} className="inline-block"
              variants={{ off: { opacity: 0, y: 24, filter: 'blur(6px)' }, on: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: .55, ease: [.2, .8, .2, 1] } } }}>
              {chunk}
            </motion.span>
          ))}
          {lang === 'hi' && <br />}
          <motion.span className="inline-block serif-accent font-normal text-[var(--lime)]" style={{ textShadow: '0 0 30px var(--lime-glow)' }}
            variants={{ off: { opacity: 0, y: 24, filter: 'blur(6px)' }, on: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: .55, ease: [.2, .8, .2, 1] } } }}>
            {needAttention > 0 ? `${needAttention} ${t('cNeedVisit')}` : t('cAllQuiet')}
          </motion.span>
        </motion.h1>
        {district && <div className="mt-7"><StatBand d={district} lead={lead} /></div>}
      </section>

      <div className="mx-auto grid w-full max-w-[1560px] gap-10 px-6 md:px-12 lg:grid-cols-[1fr_360px]">
        {/* ── triage: editorial ledger, not cards ── */}
        <div>
          <div className="flex items-baseline gap-4">
            <SectionTitle a={t('cTriageA')} b={t('cTriageB')} />
            {blockFilter && (
              <motion.button initial={{ opacity: 0, scale: .8 }} animate={{ opacity: 1, scale: 1 }}
                onClick={() => setBlockFilter(null)}
                className="mono rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-1 text-[9px] uppercase tracking-[.2em] text-[var(--lime)]">
                {blockFilter} - {t('cClear')} ×
              </motion.button>
            )}
          </div>

          {!loaded ? (
            <div className="mt-5 space-y-px">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-[76px]" />)}
            </div>
          ) : (
            <motion.div className="mt-5 border-t border-[var(--edge)]" initial="off" animate="on"
              variants={{ on: { transition: { staggerChildren: .04 } } }} key={blockFilter ?? 'all'}>
              {visible.map((e, idx) => (
                <motion.button key={e.id} layout onClick={() => setSelected(e.id)}
                  variants={{ off: { opacity: 0, y: 16 }, on: { opacity: 1, y: 0, transition: spring } }}
                  className="group grid w-full grid-cols-[2.6rem_1fr_auto_1.6rem] items-center gap-3 border-b border-[var(--edge)] py-4 pr-1 text-left transition-colors duration-300 hover:bg-[var(--accent-soft)] md:grid-cols-[3.2rem_1.15fr_.85fr_7.5rem_1.8rem] md:gap-5">
                  <span className="mono num text-sm text-[var(--ink-faint)] transition-colors group-hover:text-[var(--lime)]">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <div className="display truncate text-[17px] font-bold tracking-tight text-[var(--ink)] transition-transform duration-300 group-hover:translate-x-1">
                      {e.name}
                    </div>
                    {e.top_reason && (
                      <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-[var(--ink-dim)]">
                        <Icon.arrowRight size={10} className="shrink-0 text-[var(--ink-faint)]" />
                        {lang === 'hi' ? e.top_reason.text_hi : e.top_reason.text_en}
                      </div>
                    )}
                  </div>
                  <div className="mono hidden items-center gap-2 text-[9.5px] uppercase tracking-[.16em] text-[var(--ink-faint)] md:flex">
                    <SectorIcon sector={e.sector} size={13} className="text-[var(--ink-dim)]" />
                    <span className="truncate">{sectorLabels[e.sector]} · {e.village}</span>
                  </div>
                  <span className="serif-accent justify-self-end text-lg md:text-xl"
                    style={{ color: LEVEL_COLOR[e.risk] }}>
                    {t(RISK_KEY[e.risk])}
                  </span>
                  <span className="translate-x-0 text-[var(--ink-faint)] opacity-0 transition-all duration-300 group-hover:translate-x-1 group-hover:text-[var(--lime)] group-hover:opacity-100">
                    <Icon.arrowRight size={16} />
                  </span>
                </motion.button>
              ))}
            </motion.div>
          )}
        </div>

        {/* ── rail: rule-separated editorial sections, no widget boxes ── */}
        <div className="space-y-10">
          {district && (
            <motion.section initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: .15 }}>
              <SectionTitle a={t('cConstA')} b={t('cConstB')} />
              <div className="mt-2"><DistrictMap d={district} active={blockFilter} onSelectBlock={setBlockFilter} /></div>
            </motion.section>
          )}

          {district && district.bulletins.length > 0 && (
            <motion.section initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: .25 }}>
              <SectionTitle a={t('cBullA')} b={t('cBullB')} accent="var(--sig-red)" />
              <div className="mt-3 border-t border-[var(--edge)]">
                {district.bulletins.map((b, i) => (
                  <motion.div key={i} className="border-b border-[var(--edge)] py-3.5"
                    initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: .3 + i * .1 }}>
                    <div className="flex items-center gap-2 text-sm font-bold text-[var(--ink)]">
                      <SectorIcon sector={b.sector} size={14} className="text-[var(--sig-red)]" />
                      {sectorLabels[b.sector]}
                      <span className="mono num ml-auto text-[9px] font-bold tracking-[.14em] text-[var(--sig-red)]">
                        {b.stressed_units}/{b.exposed_units} {t('cStressed')}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--ink-dim)]">{b.text}</p>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          )}

          <motion.section initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: .35 }}>
            <SectionTitle a={t('cSimA')} b={t('cSimB')} />
            <p className="mt-1.5 max-w-[38ch] text-xs leading-relaxed text-[var(--ink-dim)]">{t('cSimSub')}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { key: 'feed_spike', label: t('cFeed'), color: 'var(--sig-amber)', border: 'var(--amber-border)', soft: 'var(--amber-soft)' },
                { key: 'monsoon_deficit', label: t('cMonsoon'), color: 'var(--sig-blue)', border: 'var(--blue-border)', soft: 'var(--blue-soft)' },
              ].map(s => (
                <motion.button key={s.key} disabled={!!busy}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: .95 }}
                  onClick={() => runShock(s.key, s.label)}
                  className="flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs font-bold transition-colors disabled:opacity-30"
                  style={{ color: s.color, borderColor: s.border }}
                  onMouseEnter={ev => (ev.currentTarget.style.background = s.soft)}
                  onMouseLeave={ev => (ev.currentTarget.style.background = 'transparent')}>
                  <Icon.play size={11} /> {s.label}
                </motion.button>
              ))}
              <motion.button disabled={!!busy} whileHover={{ scale: 1.04 }} whileTap={{ scale: .95 }}
                onClick={() => setConfirmReset(true)}
                className="flex items-center gap-2 rounded-full border border-[var(--edge-lit)] px-4 py-2.5 text-xs font-bold text-[var(--ink-dim)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)] disabled:opacity-30">
                <Icon.refresh size={11} /> {t('cReset')}
              </motion.button>
            </div>
            {confirmReset && <div className="mt-3 rounded-lg border border-[var(--edge)] p-3 text-sm">
              <p>{lang === 'hi' ? 'सभी मैनुअल प्रविष्टियाँ, नए उद्यम और अधिकारी नोट मिट जाएँगे।' : 'This removes all manual entries, new enterprises and officer notes.'}</p>
              <div className="mt-3 flex gap-3">
                <button disabled={!!busy} onClick={runReset} className="underline">{lang === 'hi' ? 'डेमो रीसेट करें' : 'Reset demo data'}</button>
                <button onClick={() => setConfirmReset(false)}>{lang === 'hi' ? 'रद्द करें' : 'Cancel'}</button>
              </div>
            </div>}
            {busy && (
              <div className="mono mt-3 flex items-center gap-2 text-[9px] uppercase tracking-[.2em] text-[var(--ink-faint)]">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--edge)] border-t-[var(--lime)]" />
                {busy} - {t('cRunning')}
              </div>
            )}
          </motion.section>
        </div>
      </div>
    </>
  )
}
