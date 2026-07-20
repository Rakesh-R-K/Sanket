// Professional SVG icon system - replaces all emoji. Stroke-based, inherits
// currentColor, consistent 24px grid (lucide-style geometry, hand-rolled to
// keep the bundle dependency-free).
interface IconProps { size?: number; className?: string; strokeWidth?: number }

function base(paths: React.ReactNode, { size = 16, className = '', strokeWidth = 2 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round"
      strokeLinejoin="round" className={className} aria-hidden>
      {paths}
    </svg>
  )
}

export const Icon = {
  // sectors
  dairy: (p: IconProps = {}) => base(<>
    <path d="M8 3l1.5 3M16 3l-1.5 3" /><path d="M6 6h12l1 5c0 4-3 9-7 9s-8-5-7-9l1-5z" />
    <circle cx="10" cy="12" r=".5" fill="currentColor" /><circle cx="14" cy="12" r=".5" fill="currentColor" />
    <path d="M10 16c.7.7 3.3.7 4 0" /></>, p),
  poultry: (p: IconProps = {}) => base(<>
    <path d="M16 8a4 4 0 10-8 0c0 2-1 3-3 4l2 1v3a5 5 0 0010 0v-3l2-1c-2-1-3-2-3-4z" />
    <path d="M12 4V2" /><circle cx="10.5" cy="8" r=".5" fill="currentColor" /></>, p),
  food_processing: (p: IconProps = {}) => base(<>
    <path d="M3 21h18" /><path d="M5 21V10l4 3V10l4 3V7l6 4v10" /></>, p),
  handicrafts: (p: IconProps = {}) => base(<>
    <path d="M12 3v18M5 8c2-3 12-3 14 0M5 16c2 3 12 3 14 0" />
    <path d="M7 5v14M17 5v14" strokeWidth={1.2} /></>, p),
  rural_retail: (p: IconProps = {}) => base(<>
    <path d="M4 7h16l-1 4a3 3 0 01-3 2.5A3 3 0 0113 11a3 3 0 01-2 2.5A3 3 0 018 11a3 3 0 01-3 2.5L4 7z" />
    <path d="M5 13v8h14v-8M9 21v-5h6v5" /><path d="M6 7l1-4h10l1 4" /></>, p),
  // risk levels
  alert: (p: IconProps = {}) => base(<>
    <path d="M12 2L2 20h20L12 2z" /><path d="M12 9v5" /><circle cx="12" cy="17" r=".6" fill="currentColor" /></>, p),
  warning: (p: IconProps = {}) => base(<>
    <circle cx="12" cy="12" r="9" /><path d="M12 7v6" /><circle cx="12" cy="16.5" r=".6" fill="currentColor" /></>, p),
  watch: (p: IconProps = {}) => base(<>
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></>, p),
  healthy: (p: IconProps = {}) => base(<>
    <circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.5 2.5L16 9.5" /></>, p),
  // actions & objects
  income: (p: IconProps = {}) => base(<>
    <path d="M12 19V5M6 11l6-6 6 6" /></>, p),
  expense: (p: IconProps = {}) => base(<>
    <path d="M12 5v14M6 13l6 6 6-6" /></>, p),
  savings: (p: IconProps = {}) => base(<>
    <rect x="3" y="8" width="18" height="12" rx="2" /><path d="M3 12h18" /><path d="M8 4h8l1 4H7l1-4z" /></>, p),
  loan: (p: IconProps = {}) => base(<>
    <rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>, p),
  report: (p: IconProps = {}) => base(<>
    <path d="M6 2h9l5 5v15H6V2z" /><path d="M15 2v5h5" /><path d="M9 13l2 2 4-4" /></>, p),
  map: (p: IconProps = {}) => base(<>
    <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></>, p),
  signal: (p: IconProps = {}) => base(<>
    <path d="M4 20l4-8 4 4 4-9 4 5" /><circle cx="20" cy="12" r="1" fill="currentColor" /></>, p),
  bell: (p: IconProps = {}) => base(<>
    <path d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 19a2 2 0 004 0" /></>, p),
  home: (p: IconProps = {}) => base(<>
    <path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>, p),
  plus: (p: IconProps = {}) => base(<>
    <circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>, p),
  sun: (p: IconProps = {}) => base(<>
    <circle cx="12" cy="12" r="4.5" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" /></>, p),
  moon: (p: IconProps = {}) => base(<path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 108.5 10.5z" />, p),
  chevronLeft: (p: IconProps = {}) => base(<path d="M14 6l-6 6 6 6" />, p),
  print: (p: IconProps = {}) => base(<>
    <path d="M7 8V3h10v5" /><rect x="4" y="8" width="16" height="8" rx="1" /><path d="M7 14h10v7H7v-7z" /></>, p),
  wifi: (p: IconProps = {}) => base(<>
    <path d="M2 9a15 15 0 0120 0M5.5 12.5a10 10 0 0113 0M9 16a5 5 0 016 0" /><circle cx="12" cy="19" r="1" fill="currentColor" /></>, p),
  wifiOff: (p: IconProps = {}) => base(<>
    <path d="M2 9a15 15 0 018.5-4.3M14.5 4.9A15 15 0 0122 9M5.5 12.5a10 10 0 015.2-2.7M15 10.5c1.3.4 2.5 1 3.5 2M9 16a5 5 0 016 0" />
    <circle cx="12" cy="19" r="1" fill="currentColor" /><path d="M3 3l18 18" /></>, p),
  play: (p: IconProps = {}) => base(<path d="M7 4l13 8-13 8V4z" />, p),
  refresh: (p: IconProps = {}) => base(<>
    <path d="M20 11a8 8 0 10.6 4" /><path d="M20 4v7h-7" /></>, p),
  users: (p: IconProps = {}) => base(<>
    <circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0" /><path d="M16 5a3.5 3.5 0 010 7M17.5 14a6.5 6.5 0 014 6" /></>, p),
  clock: (p: IconProps = {}) => base(<>
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, p),
  arrowRight: (p: IconProps = {}) => base(<path d="M5 12h14M13 6l6 6-6 6" />, p),
  check: (p: IconProps = {}) => base(<path d="M4 12.5l5 5L20 6.5" />, p),
  database: (p: IconProps = {}) => base(<>
    <ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>, p),
}

export type IconName = keyof typeof Icon
