import { useState } from 'react'
import { X, Download, ShoppingCart, ArrowUpFromLine, Plus } from 'lucide-react'
import { useInstallPWA } from '../hooks/useInstallPWA'

export default function InstallPWABanner() {
  const { canInstall, isIOS, install, dismiss } = useInstallPWA()
  const [installing, setInstalling] = useState(false)

  if (!canInstall) return null

  const handleInstall = async () => {
    if (isIOS) return
    setInstalling(true)
    await install()
    setInstalling(false)
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] w-full max-w-sm px-4 pointer-events-none">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden pointer-events-auto">

        {/* Header orange */}
        <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <ShoppingCart size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">Baobab SmartCommerce</p>
            <p className="text-xs text-orange-100">Installer l'application</p>
          </div>
          <button onClick={dismiss} className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors" aria-label="Fermer">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          {isIOS ? (
            /* ── iOS : pas de beforeinstallprompt, guider manuellement ── */
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Ajouter à l'écran d'accueil :</p>
              <ol className="space-y-2">
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                  Appuyez sur <ArrowUpFromLine size={14} className="inline text-blue-600 mx-1 flex-shrink-0" /> <strong>Partager</strong>
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">2</span>
                  Choisissez <Plus size={13} className="inline text-blue-600 mx-0.5 flex-shrink-0" /> <strong>Sur l'écran d'accueil</strong>
                </li>
                <li className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">3</span>
                  Confirmez en tapant <strong>Ajouter</strong>
                </li>
              </ol>
              <button onClick={dismiss} className="mt-3 w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors">
                Ne plus afficher pendant 7 jours
              </button>
            </div>
          ) : (
            /* ── Android / Desktop Chrome : bouton d'installation natif ── */
            <div>
              <p className="text-sm text-gray-600 mb-3">
                Accédez à Baobab comme une application native, même hors connexion.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleInstall}
                  disabled={installing}
                  className="flex-1 flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold py-2.5 px-4 rounded-xl transition-colors disabled:opacity-60"
                >
                  <Download size={15} className={installing ? 'animate-bounce' : ''} />
                  {installing ? 'Installation…' : 'Installer'}
                </button>
                <button
                  onClick={dismiss}
                  className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  Plus tard
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
