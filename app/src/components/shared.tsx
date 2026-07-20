import { useEffect, useRef, useState } from 'react'
import type { Risk } from '../lib/api'
import { Icon } from './icons'

const RISK_META: Record<Risk, { label: string; cls: string; icon: keyof typeof Icon }> = {
  alert: { label: 'Alert', cls: 'chip-alert', icon: 'alert' },
  warning: { label: 'Warning', cls: 'chip-warning', icon: 'warning' },
  watch: { label: 'Watch', cls: 'chip-watch', icon: 'watch' },
  healthy: { label: 'Healthy', cls: 'chip-healthy', icon: 'healthy' },
}

export function RiskBadge({ risk, small }: { risk: Risk; small?: boolean }) {
  const m = RISK_META[risk]
  const I = Icon[m.icon]
  return (
    <span className={`risk-chip ${m.cls} ${small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'}`}>
      <I size={small ? 11 : 13} />{m.label}
    </span>
  )
}

export function SectorIcon({ sector, size = 18, className = '' }: { sector: string; size?: number; className?: string }) {
  const I = Icon[sector as keyof typeof Icon] ?? Icon.rural_retail
  return <I size={size} className={className} />
}

/** Animated counter: eases toward its target whenever `value` changes. */
export function AnimatedNumber({ value, duration = 700, format }:
  { value: number; duration?: number; format?: (n: number) => string }) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  useEffect(() => {
    const from = fromRef.current
    if (from === value) return
    const t0 = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(from + (value - from) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = value
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return <span className="num">{format ? format(display) : Math.round(display)}</span>
}
