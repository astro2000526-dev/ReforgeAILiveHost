'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

import { LOCALES, LOCALE_LABELS } from '@/lib/i18n'
import { BrandMark } from './BrandMark'
import { useI18n } from './LocaleProvider'

// Show the login affordance only when real auth is turned on. Default off keeps
// the demo experience (no login UI). NEXT_PUBLIC_* is inlined at build time.
const AUTH_ENABLED = process.env.NEXT_PUBLIC_AUTH_ENABLED === '1'

function ThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const saved = localStorage.getItem('theme')
    const isDark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
    setDark(isDark)
    document.documentElement.classList.toggle('dark', isDark)
  }, [])
  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    >
      {dark ? '☀️' : '🌙'}
    </button>
  )
}

export function AppHeader() {
  const { locale, setLocale, t } = useI18n()
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()
  const links = [
    { href: '/dashboard', label: t('nav.console') },
    { href: '/avatars', label: t('nav.avatars') },
    { href: '/plan', label: t('nav.plan') },
    { href: '/live', label: t('nav.live') },
    { href: '/gallery', label: t('nav.gallery') },
    { href: '/status', label: t('nav.status') },
    { href: '/settings', label: '⚙ Settings' },
  ]
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-4">
          <Link href="/" className="brandmark-host flex items-center gap-2.5">
            <BrandMark size={30} />
            <span className="flex items-baseline gap-2">
              <span className="font-display text-sm font-semibold tracking-tight">{t('app.name')}</span>
              <span className="rounded-full border border-gold/40 px-1.5 py-px text-[10px] font-mono uppercase tracking-widest text-gold">
                MVP
              </span>
            </span>
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {links.map((l) => {
              const active = pathname === l.href || pathname.startsWith(l.href + '/')
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  data-active={active}
                  className="nav-underline rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground data-[active=true]:text-foreground"
                >
                  {l.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <nav className="flex items-center gap-1">
          {AUTH_ENABLED && (
            <Link
              href="/login"
              className="hidden rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors sm:inline-block"
            >
              เข้าสู่ระบบ
            </Link>
          )}
          <ThemeToggle />
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLocale(l)}
              aria-pressed={locale === l}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                locale === l
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {LOCALE_LABELS[l]}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors sm:hidden"
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </nav>
      </div>
      {menuOpen && (
        <nav className="border-t border-border/60 px-6 py-2 sm:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              {l.label}
            </Link>
          ))}
          {AUTH_ENABLED && (
            <Link
              href="/login"
              onClick={() => setMenuOpen(false)}
              className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              เข้าสู่ระบบ
            </Link>
          )}
        </nav>
      )}
    </header>
  )
}
