import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ThemeMode = 'light' | 'dark'

export type PrimaryColorKey =
  | 'orange' | 'blue' | 'green' | 'purple'
  | 'teal'   | 'indigo' | 'rose' | 'amber'

interface ColorShades {
  name: string
  hex: string          // swatch color shown in picker
  DEFAULT: string
  '50': string
  '100': string
  '600': string
  '700': string
}

// ── Palettes de couleurs ───────────────────────────────────────────────────────

export const COLOR_PALETTES: Record<PrimaryColorKey, ColorShades> = {
  orange: {
    name: 'Orange',    hex: '#ff7631',
    DEFAULT: '#ff7631', '50': '#fff4ef', '100': '#ffe6d9', '600': '#e65c18', '700': '#bf4a10',
  },
  blue: {
    name: 'Bleu',      hex: '#2563eb',
    DEFAULT: '#2563eb', '50': '#eff6ff', '100': '#dbeafe', '600': '#1d4ed8', '700': '#1e40af',
  },
  green: {
    name: 'Vert',      hex: '#16a34a',
    DEFAULT: '#16a34a', '50': '#f0fdf4', '100': '#dcfce7', '600': '#15803d', '700': '#166534',
  },
  purple: {
    name: 'Violet',    hex: '#9333ea',
    DEFAULT: '#9333ea', '50': '#faf5ff', '100': '#f3e8ff', '600': '#7c3aed', '700': '#6d28d9',
  },
  teal: {
    name: 'Turquoise', hex: '#0d9488',
    DEFAULT: '#0d9488', '50': '#f0fdfa', '100': '#ccfbf1', '600': '#0f766e', '700': '#115e59',
  },
  indigo: {
    name: 'Indigo',    hex: '#4f46e5',
    DEFAULT: '#4f46e5', '50': '#eef2ff', '100': '#e0e7ff', '600': '#4338ca', '700': '#3730a3',
  },
  rose: {
    name: 'Rose',      hex: '#e11d48',
    DEFAULT: '#e11d48', '50': '#fff1f2', '100': '#ffe4e6', '600': '#be123c', '700': '#9f1239',
  },
  amber: {
    name: 'Ambre',     hex: '#d97706',
    DEFAULT: '#d97706', '50': '#fffbeb', '100': '#fef3c7', '600': '#b45309', '700': '#92400e',
  },
}

// ── Appliquer le thème au DOM ─────────────────────────────────────────────────

export function applyPreferencesToDOM(theme: ThemeMode, primaryColor: PrimaryColorKey) {
  const root = document.documentElement
  const palette = COLOR_PALETTES[primaryColor]

  // Dark / Light class on <html>
  root.classList.toggle('dark', theme === 'dark')

  // Primary color CSS variables
  root.style.setProperty('--color-primary',     palette.DEFAULT)
  root.style.setProperty('--color-primary-600', palette['600'])
  root.style.setProperty('--color-primary-700', palette['700'])
  root.style.setProperty('--color-primary-100', palette['100'])
  root.style.setProperty('--color-primary-50',  palette['50'])
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface PreferencesState {
  theme:        ThemeMode
  primaryColor: PrimaryColorKey
  setTheme:        (theme:  ThemeMode)       => void
  setPrimaryColor: (color:  PrimaryColorKey) => void
  applyOnBoot:     () => void
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set, get) => ({
      theme:        'light',
      primaryColor: 'orange',

      setTheme: (theme) => {
        set({ theme })
        applyPreferencesToDOM(theme, get().primaryColor)
      },

      setPrimaryColor: (primaryColor) => {
        set({ primaryColor })
        applyPreferencesToDOM(get().theme, primaryColor)
      },

      applyOnBoot: () => {
        applyPreferencesToDOM(get().theme, get().primaryColor)
      },
    }),
    { name: 'sc-preferences' }
  )
)
