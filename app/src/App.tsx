import { useContext, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LangContext, useT, type Lang } from './lib/i18n'
import { Landing } from './components/Landing'
import { OfficerConsole } from './components/OfficerConsole'
import { EnterprisePicker } from './components/EnterprisePicker'
import { Icon } from './components/icons'
import { drainOutbox } from './lib/offline'

type View = 'landing' | 'officer' | 'enterprise'
export type Theme = 'dark' | 'light'

function AppHeader({ view, setView, theme, setTheme }:
  { view: View; setView: (v: View) => void; theme: Theme; setTheme: (t: Theme) => void }) {
  const { t, lang } = useT()
  const setLang = useContext(LangContext).setLang
  return (
    <header className="no-print sticky top-0 z-20 border-b border-[var(--edge)] bg-[color-mix(in_srgb,var(--bg)_78%,transparent)] backdrop-blur-xl">
      <div className="flex w-full flex-wrap items-center gap-3 px-4 py-3 md:px-8">
        <button onClick={() => setView('landing')} className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-full border border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--lime)]">
            <Icon.signal size={15} />
          </span>
          <span className="display text-sm font-bold tracking-tight">संकेत SANKET</span>
          <span className="mono ml-1 hidden text-[8px] uppercase tracking-[.25em] text-[var(--ink-faint)] md:block">← {t('overview')}</span>
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative flex rounded-full border border-[var(--edge)] bg-[var(--bg-2)] p-1 text-xs font-bold">
            {(['officer', 'enterprise'] as View[]).map(r => (
              <button key={r} onClick={() => setView(r)}
                className={`relative z-10 flex items-center gap-1.5 rounded-full px-3.5 py-1.5 transition-colors duration-300 ${view === r ? 'text-[var(--on-accent)]' : 'text-[var(--ink-faint)] hover:text-[var(--ink-dim)]'}`}>
                {view === r && (
                  <motion.span layoutId="role-pill" className="absolute inset-0 -z-10 rounded-full bg-[var(--accent-btn)]"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
                )}
                {r === 'officer' ? <Icon.users size={12} /> : <Icon.home size={12} />}
                {r === 'officer' ? t('roleOfficer') : t('roleEnterprise')}
              </button>
            ))}
          </div>
          <motion.button whileHover={{ scale: 1.06 }} whileTap={{ scale: .94 }}
            onClick={() => setLang(lang === 'en' ? 'hi' : 'en')}
            className="rounded-full border border-[var(--edge)] bg-[var(--bg-2)] px-3.5 py-1.5 text-xs font-bold text-[var(--ink-dim)] transition-colors hover:text-[var(--lime)]">
            {lang === 'en' ? 'हिंदी' : 'EN'}
          </motion.button>
          <motion.button whileHover={{ scale: 1.08, rotate: 14 }} whileTap={{ scale: .92 }}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="toggle theme"
            className="grid h-8 w-8 place-items-center rounded-full border border-[var(--edge)] bg-[var(--bg-2)] text-[var(--ink-dim)] transition-colors hover:text-[var(--lime)]">
            {theme === 'dark' ? <Icon.sun size={14} /> : <Icon.moon size={14} />}
          </motion.button>
        </div>
      </div>
    </header>
  )
}

export default function App() {
  const [view, setView] = useState<View>('landing')
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('sanket-lang') as Lang) || 'en')
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('sanket-theme') as Theme) || 'dark')

  useEffect(() => {
    const sync = () => { void drainOutbox().catch(() => {}) }
    sync()
    window.addEventListener('online', sync)
    return () => window.removeEventListener('online', sync)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('sanket-theme', theme)
  }, [theme])
  useEffect(() => { localStorage.setItem('sanket-lang', lang) }, [lang])

  return (
    <LangContext.Provider value={{ lang, setLang }}>
      <div className="mesh" />

      {view !== 'landing' && (
        <AppHeader view={view} setView={setView} theme={theme} setTheme={setTheme} />
      )}

      <main className={view === 'landing' ? '' : 'pb-14 pt-1'}>
        <AnimatePresence mode="wait">
          <motion.div key={view + lang}
            initial={{ opacity: 0, y: 28, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -20, filter: 'blur(8px)' }}
            transition={{ duration: .5, ease: [.22, .8, .22, 1] }}>
            {view === 'landing' && <Landing onEnter={setView} theme={theme} setTheme={setTheme} />}
            {view === 'officer' && <OfficerConsole />}
            {view === 'enterprise' && <EnterprisePicker />}
          </motion.div>
        </AnimatePresence>
      </main>
    </LangContext.Provider>
  )
}
