// Server-side locale reader. Server Components call this to pick the dictionary
// for the current request, based on the `locale` cookie set by LanguageSwitcher.
import { cookies } from 'next/headers'

import { normalizeLocale, type Locale } from './i18n'

export async function getLocale(): Promise<Locale> {
  const store = await cookies()
  return normalizeLocale(store.get('locale')?.value)
}
