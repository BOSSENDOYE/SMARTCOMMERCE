import { Sun, Moon, Check, Palette, Monitor } from 'lucide-react'
import {
  usePreferencesStore,
  COLOR_PALETTES,
  type ThemeMode,
  type PrimaryColorKey,
} from '../../store/preferences.store'

// ── Preview mini-card ─────────────────────────────────────────────────────────

function ThemeCard({
  mode,
  active,
  onClick,
}: {
  mode: ThemeMode
  active: boolean
  onClick: () => void
}) {
  const isDark = mode === 'dark'

  return (
    <button
      onClick={onClick}
      className={`relative rounded-2xl overflow-hidden border-2 transition-all w-full aspect-[4/3] ${
        active
          ? 'border-[color:var(--color-primary)] shadow-lg scale-[1.02]'
          : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      {/* Mini preview */}
      <div className={`w-full h-full flex ${isDark ? 'bg-slate-900' : 'bg-gray-100'}`}>
        {/* Sidebar preview */}
        <div className="w-8 h-full bg-[#002f59] flex flex-col gap-1 p-1 pt-2">
          <div className="w-4 h-1 rounded bg-white/40 mx-auto" />
          <div className="w-4 h-1 rounded" style={{ background: 'var(--color-primary)' }} />
          <div className="w-4 h-1 rounded bg-white/20 mx-auto" />
          <div className="w-4 h-1 rounded bg-white/20 mx-auto" />
          <div className="w-4 h-1 rounded bg-white/20 mx-auto" />
        </div>
        {/* Content preview */}
        <div className="flex-1 p-2 space-y-1.5">
          <div className={`h-2 rounded w-16 ${isDark ? 'bg-slate-600' : 'bg-gray-300'}`} />
          <div className={`rounded p-1.5 space-y-1 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
            <div className={`h-1.5 rounded w-full ${isDark ? 'bg-slate-600' : 'bg-gray-200'}`} />
            <div className={`h-1.5 rounded w-3/4 ${isDark ? 'bg-slate-700' : 'bg-gray-100'}`} />
          </div>
          <div className={`rounded p-1.5 space-y-1 ${isDark ? 'bg-slate-800' : 'bg-white'}`}>
            <div className={`h-1.5 rounded w-full ${isDark ? 'bg-slate-600' : 'bg-gray-200'}`} />
          </div>
          <div className="flex gap-1 mt-1">
            <div className="h-4 rounded flex-1 text-[5px] flex items-center justify-center text-white font-bold"
              style={{ background: 'var(--color-primary)' }}>
              OK
            </div>
            <div className={`h-4 rounded flex-1 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />
          </div>
        </div>
      </div>

      {/* Label */}
      <div className={`absolute bottom-0 inset-x-0 py-1.5 text-xs font-semibold text-center backdrop-blur-sm ${
        isDark ? 'bg-slate-900/80 text-slate-200' : 'bg-white/80 text-gray-700'
      }`}>
        {isDark ? (
          <span className="flex items-center justify-center gap-1"><Moon size={11} /> Sombre</span>
        ) : (
          <span className="flex items-center justify-center gap-1"><Sun size={11} /> Clair</span>
        )}
      </div>

      {/* Check active */}
      {active && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-white"
          style={{ background: 'var(--color-primary)' }}>
          <Check size={11} />
        </div>
      )}
    </button>
  )
}

// ── Color swatch ──────────────────────────────────────────────────────────────

function ColorSwatch({
  colorKey,
  active,
  onClick,
}: {
  colorKey: PrimaryColorKey
  active: boolean
  onClick: () => void
}) {
  const palette = COLOR_PALETTES[colorKey]

  return (
    <button
      onClick={onClick}
      title={palette.name}
      className={`relative w-10 h-10 rounded-xl transition-all hover:scale-110 ${
        active ? 'ring-2 ring-offset-2 scale-110' : ''
      }`}
      style={{
        background: palette.DEFAULT,
        ...(active ? { '--tw-ring-color': palette.DEFAULT } as React.CSSProperties : {}),
      }}
    >
      {active && (
        <Check size={16} className="absolute inset-0 m-auto text-white drop-shadow" />
      )}
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PreferencesPage() {
  const { theme, primaryColor, setTheme, setPrimaryColor } = usePreferencesStore()
  const activePalette = COLOR_PALETTES[primaryColor]

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Monitor size={22} /> Préférences d'affichage
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Personnalisez l'apparence de SmartCommerce selon vos goûts.
        </p>
      </div>

      {/* ── Thème ──────────────────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Sun size={18} className="text-amber-500" />
          <h2 className="font-semibold text-gray-900">Mode d'affichage</h2>
        </div>
        <p className="text-sm text-gray-500">
          Choisissez entre le mode clair ou sombre selon votre environnement de travail.
        </p>
        <div className="grid grid-cols-2 gap-4 max-w-sm">
          <ThemeCard mode="light" active={theme === 'light'} onClick={() => setTheme('light')} />
          <ThemeCard mode="dark"  active={theme === 'dark'}  onClick={() => setTheme('dark')}  />
        </div>
      </section>

      {/* ── Couleur primaire ───────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Palette size={18} style={{ color: 'var(--color-primary)' }} />
          <h2 className="font-semibold text-gray-900">Couleur principale</h2>
        </div>
        <p className="text-sm text-gray-500">
          La couleur est appliquée sur les boutons, les liens actifs et les éléments d'action.
        </p>

        {/* Swatches */}
        <div className="flex flex-wrap gap-3">
          {(Object.keys(COLOR_PALETTES) as PrimaryColorKey[]).map(key => (
            <ColorSwatch
              key={key}
              colorKey={key}
              active={primaryColor === key}
              onClick={() => setPrimaryColor(key)}
            />
          ))}
        </div>

        {/* Selected color info */}
        <div className="flex items-center gap-3 p-3 rounded-xl mt-2"
          style={{ background: activePalette['50'] }}>
          <div className="w-8 h-8 rounded-lg flex-shrink-0"
            style={{ background: activePalette.DEFAULT }} />
          <div>
            <p className="text-sm font-semibold" style={{ color: activePalette['600'] }}>
              {activePalette.name}
            </p>
            <p className="text-xs" style={{ color: activePalette['700'] }}>
              {activePalette.DEFAULT}
            </p>
          </div>
          <span className="ml-auto text-xs px-2 py-1 rounded-lg font-medium text-white"
            style={{ background: activePalette.DEFAULT }}>
            Actif
          </span>
        </div>
      </section>

      {/* ── Aperçu boutons ─────────────────────────────────────────────────── */}
      <section className="bg-white rounded-2xl border shadow-sm p-6 space-y-4">
        <h2 className="font-semibold text-gray-900">Aperçu</h2>
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary text-sm">Enregistrer</button>
          <button className="btn-secondary text-sm">Annuler</button>
          <button className="btn-danger text-sm">Supprimer</button>
          <span className="badge-info">Actif</span>
          <span className="badge-success">Validé</span>
        </div>
        <p className="text-sm text-gray-500">
          Les préférences sont sauvegardées automatiquement dans votre navigateur.
        </p>
      </section>
    </div>
  )
}
