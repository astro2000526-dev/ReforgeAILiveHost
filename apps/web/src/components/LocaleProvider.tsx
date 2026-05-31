'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import { useRouter } from 'next/navigation'

import { translate, type Locale } from '@/lib/i18n'

type Ctx = {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: string) => string
}

const LocaleContext = createContext<Ctx | null>(null)

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale
  children: React.ReactNode
}) {
  const router = useRouter()
  const [locale, setLoc] = useState<Locale>(initialLocale)

  const setLocale = useCallback(
    (l: Locale) => {
      // 1 year, site-wide. Server Components read this on the next request.
      document.cookie = `locale=${l};path=/;max-age=31536000;samesite=lax`
      setLoc(l)
      router.refresh() // re-render Server Components with the new dictionary
    },
    [router]
  )

  const t = useCallback((key: string) => translate(locale, key), [locale])

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useI18n(): Ctx {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useI18n must be used within <LocaleProvider>')
  return ctx
}
