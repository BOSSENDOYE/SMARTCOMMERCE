import { useState } from 'react'
import { Monitor, X, Download, ShoppingCart } from 'lucide-react'
import { useInstallPWA } from '../hooks/useInstallPWA'

export default function InstallPWABanner() {
  const { canInstall, install, dismiss } = useInstallPWA()
  const [installing, setInstalling] = useState(false)

  if (!canInstall) return null

  const handleInstall = async () => {
    setInstalling(true)
    await install()
    setInstalling(false)
  }

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] w-full max-w-sm px-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
        {/* Header coloré */}
        <div className="bg-brand px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center flex-shrink-0">
            <ShoppingCart size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">Baobab SmartCommerce</p>
            <p className="text-xs text-brand-300">Installer l'application</p>
          </div>
          <button
            onClick={dismiss}
            className="text-brand-300 hover:text-white transition-colors p-1 rounded-lg hover:bg-brand-700"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-3">
          <div className="flex items-start gap-3 mb-3">
            <Monitor size={18} className="text-brand mt-0.5 flex-shrink-0" />
            <p className="text-sm text-gray-600">
              Installez Baobab sur votre bureau pour un accès rapide, même sans connexion.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleInstall}
              disabled={installing}
              className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary-600 text-white text-sm font-semibold py-2.5 px-4 rounded-xl transition-colors disabled:opacity-60"
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
      </div>
    </div>
  )
}
