import { useEffect, useRef } from 'react'
import { sectorLabels } from '../lib/format'
import { useT } from '../lib/i18n'

export interface CascadeResult {
  shock: string
  signals: { commodity: string; kind: string; magnitude_z: number }[]
  flagged: number
  enterprises: number
  by_level?: Record<string, number>
  by_sector?: Record<string, number>
}

export function CascadeOverlay({ result, onDone }: { result: CascadeResult; onDone: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const { lang } = useT()
  useEffect(() => { if (!ref.current?.open) ref.current?.showModal() }, [])
  return <dialog ref={ref} className="cascade-stage max-h-[85dvh] overflow-auto rounded-xl border border-[var(--edge)] bg-[var(--surface)] text-[var(--ink)]"
    aria-labelledby="cascade-title" onCancel={ev => { ev.preventDefault(); onDone() }}>
    <div className="flex items-center justify-between gap-4">
      <h2 id="cascade-title" className="text-xl font-semibold">{lang === 'hi' ? 'परिदृश्य लागू हुआ' : 'Scenario applied'}</h2>
      <button onClick={onDone} className="rounded border border-[var(--edge)] px-3 py-2 text-sm">{lang === 'hi' ? 'बंद करें' : 'Close'}</button>
    </div>
    <p className="mt-3 text-sm text-[var(--ink-dim)]">{result.shock}</p>
    <p className="mt-4">{result.flagged} / {result.enterprises} {lang === 'hi' ? 'उद्यमों पर फ़्लैग हैं।' : 'enterprises have open flags.'}</p>
    <ul className="mt-4 space-y-2 text-sm">
      {result.signals.map((signal, idx) => <li key={idx}>{signal.commodity}: {signal.kind.replaceAll('_', ' ')} (z={signal.magnitude_z})</li>)}
      {!result.signals.length && <li>{lang === 'hi' ? 'कोई बाहरी संकेत सीमा से बाहर नहीं है।' : 'No external signal crossed its threshold.'}</li>}
    </ul>
    <dl className="mt-4 space-y-2 border-t border-[var(--edge)] pt-4 text-sm">
      {Object.entries(result.by_sector ?? {}).map(([sector, count]) => <div className="flex justify-between gap-4" key={sector}><dt>{sectorLabels[sector]}</dt><dd className="mono">{count}</dd></div>)}
    </dl>
  </dialog>
}
