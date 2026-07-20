import { lazy, Suspense, useEffect, useState } from 'react'
import { LangContext, type Lang } from './lib/i18n'
import { Icon } from './components/icons'
import { drainOutbox } from './lib/offline'

const OfficerConsole = lazy(() => import('./components/officerConsole').then(mod => ({ default: mod.OfficerConsole })))
const EnterprisePicker = lazy(() => import('./components/enterprisePicker').then(mod => ({ default: mod.EnterprisePicker })))
type View = 'officer' | 'enterprise'

export default function App() {
  const [view, setView] = useState<View>(() => localStorage.getItem('sanket-view') === 'enterprise' ? 'enterprise' : 'officer')
  const [lang, setLang] = useState<Lang>(() => localStorage.getItem('sanket-lang') === 'hi' ? 'hi' : 'en')

  useEffect(() => {
    const sync = () => { void drainOutbox().catch(() => {}) }
    sync()
    window.addEventListener('online', sync)
    return () => window.removeEventListener('online', sync)
  }, [])
  useEffect(() => { localStorage.setItem('sanket-view', view) }, [view])
  useEffect(() => {
    document.documentElement.lang = lang
    localStorage.setItem('sanket-lang', lang)
  }, [lang])

  return <LangContext.Provider value={{ lang, setLang }}>
    <a href="#main" className="skip-link">{lang === 'hi' ? 'मुख्य सामग्री' : 'Skip to content'}</a>
    <header className="app-header no-print">
      <div className="app-header-inner">
        <a href="#main" className="flex items-center gap-3 font-semibold"><Icon.signal size={22} className="text-[var(--lime)]" /><span>संकेत <span className="mono text-sm">SANKET</span></span></a>
        <span className="mono hidden text-xs text-[var(--ink-dim)] sm:block">{lang === 'hi' ? 'स्थानीय डेमो' : 'LOCAL DEMO'}</span>
        <nav aria-label="Views" className="ml-auto flex gap-1">
          {(['officer', 'enterprise'] as const).map(key => <button key={key} aria-current={view === key ? 'page' : undefined} onClick={() => setView(key)} className="view-btn">
            {key === 'officer' ? (lang === 'hi' ? 'अधिकारी' : 'Field Officer') : (lang === 'hi' ? 'उद्यम' : 'Enterprise')}
          </button>)}
        </nav>
        <button onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} className="view-btn border border-[var(--edge)]" aria-label={lang === 'en' ? 'Switch to Hindi' : 'Switch to English'}>{lang === 'en' ? 'हिंदी' : 'EN'}</button>
      </div>
    </header>
    <main id="main" className="pb-12" tabIndex={-1}>
      <Suspense fallback={<p role="status" className="p-8 text-center">{lang === 'hi' ? 'लोड हो रहा है...' : 'Loading...'}</p>}>
        {view === 'officer' ? <OfficerConsole /> : <EnterprisePicker />}
      </Suspense>
    </main>
  </LangContext.Provider>
}
