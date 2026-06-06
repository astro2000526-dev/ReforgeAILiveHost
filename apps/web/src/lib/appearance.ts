// Client-side appearance settings (per-device, stored in localStorage — never DB).
// Drives whole-app font / font-size / padding-density via CSS custom properties
// + a data-font attribute on <html>. Mirrors the theme-toggle localStorage pattern
// in components/AppHeader.tsx.
//
// The same logic is duplicated as a tiny inline script in app/layout.tsx so the
// vars are set before first paint (no flash). Keep the key + var names in sync.

export type AppFont = 'default' | 'noto' | 'inter' | 'mono'
export type FontScale = 0.875 | 1 | 1.125 | 1.25
export type Density = 'compact' | 'normal' | 'relaxed'

export type Appearance = {
  font: AppFont
  fontScale: FontScale
  density: Density
}

export const APPEARANCE_KEY = 'reforge_appearance'

export const APPEARANCE_DEFAULTS: Appearance = {
  font: 'default',
  fontScale: 1,
  density: 'normal',
}

// Padding (in rem) the .app-density utility applies for each density level.
export const DENSITY_PAD: Record<Density, string> = {
  compact: '0.75rem',
  normal: '1.5rem',
  relaxed: '2.5rem',
}

const FONT_SCALES: readonly FontScale[] = [0.875, 1, 1.125, 1.25]
const DENSITIES: readonly Density[] = ['compact', 'normal', 'relaxed']
const FONTS: readonly AppFont[] = ['default', 'noto', 'inter', 'mono']

function coerce(raw: unknown): Appearance {
  const v = (raw ?? {}) as Partial<Appearance>
  const font = FONTS.includes(v.font as AppFont) ? (v.font as AppFont) : APPEARANCE_DEFAULTS.font
  const fontScale = FONT_SCALES.includes(v.fontScale as FontScale)
    ? (v.fontScale as FontScale)
    : APPEARANCE_DEFAULTS.fontScale
  const density = DENSITIES.includes(v.density as Density) ? (v.density as Density) : APPEARANCE_DEFAULTS.density
  return { font, fontScale, density }
}

export function loadAppearance(): Appearance {
  if (typeof window === 'undefined') return APPEARANCE_DEFAULTS
  try {
    const raw = window.localStorage.getItem(APPEARANCE_KEY)
    if (!raw) return APPEARANCE_DEFAULTS
    return coerce(JSON.parse(raw))
  } catch {
    return APPEARANCE_DEFAULTS
  }
}

export function saveAppearance(a: Appearance): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(APPEARANCE_KEY, JSON.stringify(a))
  } catch {
    /* storage full / disabled — ignore */
  }
}

// Write CSS vars + data-font onto <html>. Safe to call on every change.
export function applyAppearance(a: Appearance): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.style.setProperty('--app-font-scale', String(a.fontScale))
  root.style.setProperty('--app-density-pad', DENSITY_PAD[a.density])
  root.setAttribute('data-font', a.font)
}
