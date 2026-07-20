import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type DistrictRisk, type DistrictSummary, type EnterpriseRow, type LeadTime } from '../lib/api'
import { sectorLabels } from '../lib/format'
import { localdb, pendingCount } from '../lib/offline'
import { useT, type StringKey } from '../lib/i18n'
import { EnterpriseProfile } from './enterpriseProfile'
import { CascadeOverlay, type CascadeResult } from './cascadeOverlay'
import { RiskBadge } from './shared'

const riskKey: Record<string, StringKey> = { alert: 'rAlert', warning: 'rWarning', watch: 'rWatch', healthy: 'rHealthy' }

export function OfficerConsole() {
  const { t, lang } = useT()
  const [rows, setRows] = useState<EnterpriseRow[]>([])
  const [districtName, setDistrictName] = useState('Wardha')
  const [allDistricts, setAllDistricts] = useState<DistrictSummary[]>([])
  const [district, setDistrict] = useState<DistrictRisk | null>(null)
  const [lead, setLead] = useState<LeadTime | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [blockFilter, setBlockFilter] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sector, setSector] = useState('')
  const [risk, setRisk] = useState('')
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
      await api.reset(); await localdb.outbox.where('synced').equals(1).delete(); await refresh(); setSelected(null); setConfirmReset(false)
    } catch (err) { setError(err instanceof Error ? err.message : 'Reset failed.') }
    finally { setBusy(null) }
  }

  if (selected !== null)
    return <EnterpriseProfile id={selected} onBack={() => { setSelected(null); void refresh() }} />

  const visible = rows.filter(row => (!blockFilter || row.block === blockFilter)
    && (!sector || row.sector === sector) && (!risk || row.risk === risk)
    && `${row.name} ${row.village}`.toLowerCase().includes(query.trim().toLowerCase()))

  const label = (en: string, hi: string) => lang === 'hi' ? hi : en
  const clear = () => { setQuery(''); setSector(''); setRisk(''); setBlockFilter(null) }
  return <div className="workspace">
    {cascade && <CascadeOverlay result={cascade} onDone={() => setCascade(null)} />}
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div><p className="eyebrow">{label('FIELD RECORDS', 'क्षेत्र के रिकॉर्ड')}</p><h1 className="mt-2 text-3xl font-semibold">{districtName} {label('overview', 'अवलोकन')}</h1></div>
      <label className="text-sm">{label('District', 'जिला')}
        <select value={districtName} onChange={ev => setDistrictName(ev.target.value)} className="mt-1 block min-w-44">
          {(allDistricts.length ? allDistricts.map(row => row.district) : [districtName]).map(name => <option key={name}>{name}</option>)}
        </select>
      </label>
    </div>
    <p className="mb-5 max-w-3xl text-sm leading-relaxed text-[var(--ink-dim)]">{label('Generated enterprise records and shared market/rainfall series. Use the scenarios to inspect how the rules respond.', 'उद्यम के रिकॉर्ड और साझा बाजार/वर्षा श्रृंखलाएँ डेमो के लिए बनाई गई हैं। परिदृश्य चलाकर नियमों का असर देखें।')}</p>
    {error && <p role="alert" className="mb-4 text-sm text-[var(--sig-red)]">{error} <button onClick={() => void refresh()} className="underline">{t('retry')}</button></p>}
    {district && <dl className="stat-grid mb-7">
      {[
        [t('cStatMonitored'), district.kpis.total], [t('cStatAlerts'), district.kpis.alerts],
        [t('cStatWarnings'), district.kpis.warnings], [label('Projected lead, days', 'अनुमानित अग्रिम दिन'), lead?.median_lead_days ?? '-'],
      ].map(([title, value]) => <div key={title}><dt>{title}</dt><dd>{value}</dd></div>)}
    </dl>}
    <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_300px]">
      <section className="min-w-0" aria-labelledby="triage-title">
        <h2 id="triage-title" className="text-xl font-semibold">{label('Triage', 'प्राथमिकता')}</h2>
        <p className="mt-1 text-sm text-[var(--ink-dim)]">{label('Open an enterprise to review its cash flow and record a visit.', 'नकदी प्रवाह देखने और मुलाकात दर्ज करने के लिए उद्यम खोलें।')}</p>
        <div className="my-4 grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_1fr_1fr]">
          <label className="text-sm">{label('Search name or village', 'नाम या गाँव खोजें')}<input type="search" value={query} onChange={ev => setQuery(ev.target.value)} className="mt-1 block w-full" /></label>
          <label className="text-sm">{label('Sector', 'क्षेत्र')}<select value={sector} onChange={ev => setSector(ev.target.value)} className="mt-1 block w-full">
            <option value="">{label('All sectors', 'सभी क्षेत्र')}</option>{Object.entries(sectorLabels).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
          </select></label>
          <label className="text-sm">{label('Risk', 'जोखिम')}<select value={risk} onChange={ev => setRisk(ev.target.value)} className="mt-1 block w-full">
            <option value="">{label('All levels', 'सभी स्तर')}</option>{Object.entries(riskKey).map(([key, name]) => <option key={key} value={key}>{t(name)}</option>)}
          </select></label>
        </div>
        <div className="mb-3 flex flex-wrap justify-between gap-2 text-sm text-[var(--ink-dim)]">
          <p role="status">{visible.length} / {rows.length} {label('enterprises', 'उद्यम')}{blockFilter && ` · ${blockFilter}`}</p>
          {(query || sector || risk || blockFilter) && <button onClick={clear} className="underline">{label('Clear filters', 'फ़िल्टर हटाएँ')}</button>}
        </div>
        {!loaded ? <div className="skeleton h-52" /> : !visible.length ? <p className="panel p-6 text-sm">{label('No enterprises match these filters.', 'इन फ़िल्टरों से कोई उद्यम नहीं मिला।')}</p> : <div className="triage-list">
          {visible.map(row => <button key={row.id} onClick={() => setSelected(row.id)} className="triage-row">
            <div className="min-w-0"><h3 className="font-medium">{row.name}</h3><p className="mt-1 text-xs text-[var(--ink-dim)]">{sectorLabels[row.sector]} · {row.village}</p>
              {row.top_reason && <p className="mt-2 text-sm text-[var(--ink-dim)]">{lang === 'hi' ? row.top_reason.text_hi : row.top_reason.text_en}</p>}
            </div><RiskBadge risk={row.risk} />
          </button>)}
        </div>}
      </section>
      <aside className="space-y-6">
        {district && <section className="panel p-4"><h2 className="font-semibold">{label('Blocks', 'ब्लॉक')}</h2><p className="my-2 text-xs text-[var(--ink-dim)]">{label('Flagged / total enterprises', 'फ़्लैग वाले / कुल उद्यम')}</p>
          <div className="space-y-2">{Object.entries(district.blocks).map(([name, block]) => {
            const total = Object.values(block.levels).reduce((sum, n) => sum + n, 0)
            return <button key={name} aria-pressed={blockFilter === name} onClick={() => setBlockFilter(blockFilter === name ? null : name)} className="block-btn"><span>{name}</span><span className="mono">{total - (block.levels.healthy ?? 0)} / {total}</span></button>
          })}</div>
        </section>}
        {district && district.bulletins.length > 0 && <section className="panel p-4"><h2 className="mb-3 font-semibold">{label('Sector notes', 'क्षेत्र के नोट')}</h2><div className="space-y-4">{district.bulletins.map((row, idx) => <div key={idx}><h3 className="text-sm font-medium">{sectorLabels[row.sector]}</h3><p className="mt-1 text-xs leading-relaxed text-[var(--ink-dim)]">{row.text}</p></div>)}</div></section>}
        <section className="panel p-4"><h2 className="font-semibold">{label('Demo scenarios', 'डेमो परिदृश्य')}</h2><p className="mt-2 text-xs leading-relaxed text-[var(--ink-dim)]">{label('Changes the shared series for every demo district and recalculates forecasts and flags.', 'सभी डेमो जिलों की साझा श्रृंखला बदलकर अनुमान और फ़्लैग फिर गणना करता है।')}</p>
          <div className="mt-4 grid gap-2">
            <button className="action-btn" disabled={!!busy} onClick={() => runShock('feed_spike', t('cFeed'))}>{t('cFeed')}</button>
            <button className="action-btn" disabled={!!busy} onClick={() => runShock('monsoon_deficit', t('cMonsoon'))}>{t('cMonsoon')}</button>
            <button className="action-btn" disabled={!!busy} onClick={() => setConfirmReset(true)}>{t('cReset')}</button>
          </div>
          {busy && <p role="status" className="mt-3 text-sm">{busy}: {t('cRunning')}</p>}
          {confirmReset && <div className="mt-4 border-t border-[var(--edge)] pt-4 text-sm"><p>{label('This removes all manual entries, new enterprises and officer notes.', 'सभी मैनुअल प्रविष्टियाँ, नए उद्यम और अधिकारी नोट मिट जाएँगे।')}</p><div className="mt-3 flex flex-wrap gap-3"><button disabled={!!busy} onClick={runReset} className="text-[var(--sig-red)] underline">{label('Reset demo data', 'डेमो रीसेट करें')}</button><button onClick={() => setConfirmReset(false)}>{label('Cancel', 'रद्द करें')}</button></div></div>}
        </section>
        <p className="text-xs leading-relaxed text-[var(--ink-dim)]">{label('Projected lead counts days until forecasted distress across all flagged enterprises. It is not a measured prediction score.', 'अनुमानित अग्रिम दिन सभी फ़्लैग वाले उद्यमों में संभावित संकट तक का समय है। यह मापी गई सटीकता नहीं है।')}</p>
      </aside>
    </div>
  </div>
}
