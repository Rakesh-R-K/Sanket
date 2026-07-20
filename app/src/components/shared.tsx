import type { Risk } from '../lib/api'
import { useT } from '../lib/i18n'
import { Icon } from './icons'

const riskMeta: Record<Risk, { label: string; cls: string; icon: keyof typeof Icon }> = {
  alert: { label: 'Alert', cls: 'chip-alert', icon: 'alert' },
  warning: { label: 'Warning', cls: 'chip-warning', icon: 'warning' },
  watch: { label: 'Watch', cls: 'chip-watch', icon: 'watch' },
  healthy: { label: 'Healthy', cls: 'chip-healthy', icon: 'healthy' },
}

export function RiskBadge({ risk, small }: { risk: Risk; small?: boolean }) {
  const { lang } = useT()
  const m = riskMeta[risk]
  const I = Icon[m.icon]
  return (
    <span className={`risk-chip ${m.cls} ${small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'}`}>
      <I size={small ? 11 : 13} />{lang === 'hi' ? ({ alert: 'खतरा', warning: 'चेतावनी', watch: 'नज़र रखें', healthy: 'सामान्य' })[risk] : m.label}
    </span>
  )
}

export function SectorIcon({ sector, size = 18, className = '' }: { sector: string; size?: number; className?: string }) {
  const I = Icon[sector as keyof typeof Icon] ?? Icon.rural_retail
  return <I size={size} className={className} />
}
