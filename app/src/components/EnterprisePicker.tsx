import { useEffect, useState, type FormEvent } from 'react'
import { api, type EnterpriseInput } from '../lib/api'
import { sectorLabels } from '../lib/format'
import { useT } from '../lib/i18n'
import { EnterpriseApp } from './EnterpriseApp'

const districts = ['Wardha', 'Nagpur', 'Amravati', 'Yavatmal'] as const

export function EnterprisePicker() {
  const { lang } = useT()
  const [district, setDistrict] = useState(() => localStorage.getItem('sanket-district') || 'Wardha')
  const [id, setId] = useState(() => Number(localStorage.getItem('sanket-enterprise')) || 0)
  const [rows, setRows] = useState<{ id: number; name: string }[]>([])
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const label = (en: string, hi: string) => lang === 'hi' ? hi : en

  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    api.enterprises(district).then(res => {
      if (!active) return
      setRows(res)
      setId(prev => res.some(row => row.id === prev) ? prev : res[0]?.id ?? 0)
    }).catch(err => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [district, reload])
  useEffect(() => {
    localStorage.setItem('sanket-enterprise', String(id))
    localStorage.setItem('sanket-district', district)
  }, [id, district])

  const create = async (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault()
    if (busy) return
    const form = new FormData(ev.currentTarget)
    const data: EnterpriseInput = {
      name: String(form.get('name')).trim(), village: String(form.get('village')).trim(),
      block: String(form.get('block')).trim(), district,
      sector: String(form.get('sector')), members: Number(form.get('members')),
    }
    setBusy(true); setError('')
    try {
      const res = await api.createEnterprise(data)
      setRows(prev => [...prev, { id: res.id, name: data.name }])
      setId(res.id); setAdding(false)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not register this enterprise.') }
    finally { setBusy(false) }
  }

  return <div className="mx-auto w-full max-w-3xl p-4">
    <section className="mb-5 space-y-4">
      <h1 className="text-2xl font-semibold">{label('Enterprise records', 'उद्यम के रिकॉर्ड')}</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">{label('District', 'जिला')}
          <select value={district} disabled={busy} onChange={ev => { setDistrict(ev.target.value); setRows([]); setId(0) }} className="mt-1 block w-full rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-3">
            {districts.map(name => <option key={name}>{name}</option>)}
          </select>
        </label>
        <label className="min-w-0 text-sm">{label('Enterprise', 'उद्यम')}
          <select value={id} disabled={loading || busy || !rows.length} onChange={ev => { setId(Number(ev.target.value)); setAdding(false) }} className="mt-1 block w-full rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-3">
            {!rows.length && <option value={0}>{loading ? label('Loading...', 'लोड हो रहा है...') : label('No enterprises', 'कोई उद्यम नहीं')}</option>}
            {rows.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
          </select>
        </label>
      </div>
      <button disabled={busy} onClick={() => setAdding(!adding)} className="rounded-lg border border-[var(--accent-border)] px-4 py-2 text-sm text-[var(--lime)]">
        {adding ? label('Cancel registration', 'पंजीकरण रद्द करें') : label('Register enterprise', 'उद्यम जोड़ें')}
      </button>
      {error && <p role="alert" className="text-sm text-[var(--sig-red)]">{error} <button onClick={() => setReload(n => n + 1)} className="underline">{label('Retry', 'फिर कोशिश करें')}</button></p>}
    </section>
    {adding ? <form onSubmit={create} className="panel space-y-4 p-5">
      <h2 className="font-semibold">{label('New enterprise', 'नया उद्यम')}</h2>
      <p className="text-sm text-[var(--ink-dim)]">{label('Registration needs a connection. The first forecast uses peers in the same district and sector.', 'पंजीकरण के लिए कनेक्शन चाहिए। पहला अनुमान इसी जिले और क्षेत्र के उद्यमों पर आधारित है।')}</p>
      {(['name', 'village', 'block'] as const).map(key => <label key={key} className="block text-sm">
        {key === 'name' ? label('Name', 'नाम') : key === 'village' ? label('Village', 'गाँव') : label('Block', 'ब्लॉक')}
        <input name={key} required pattern=".*\S.*" maxLength={key === 'name' ? 120 : 80} className="mt-1 block w-full rounded-lg border border-[var(--edge)] p-3" />
      </label>)}
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">{label('Sector', 'क्षेत्र')}<select name="sector" className="mt-1 block w-full rounded-lg border border-[var(--edge)] bg-[var(--surface)] p-3">
          {Object.entries(sectorLabels).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
        </select></label>
        <label className="text-sm">{label('Members', 'सदस्य')}<input name="members" type="number" required min={1} max={500} step={1} defaultValue={1} className="mt-1 block w-full rounded-lg border border-[var(--edge)] p-3" /></label>
      </div>
      <button disabled={busy} className="rounded-lg bg-[var(--accent-btn)] px-4 py-3 font-semibold text-[var(--on-accent)] disabled:opacity-50">{busy ? label('Saving...', 'सहेज रहा है...') : label('Create enterprise', 'उद्यम बनाएँ')}</button>
    </form> : id > 0 && !loading ? <EnterpriseApp key={id} enterpriseId={id} /> : null}
  </div>
}
