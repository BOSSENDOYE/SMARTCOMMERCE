/**
 * Panneau de configuration + test de l'imprimante thermique
 * S'intègre dans la page Paramètres
 */

import { useThermalPrinter } from '../../hooks/useThermalPrinter'
import {
  Printer, Plug, PlugZap, Check, X, AlertTriangle,
  Zap, Settings2, TestTube2,
} from 'lucide-react'

const STATUS_DISPLAY = {
  disconnected: { label: 'Non connectée', color: 'text-gray-500', dot: 'bg-gray-300' },
  connecting:   { label: 'Connexion...', color: 'text-blue-500', dot: 'bg-blue-400 animate-pulse' },
  connected:    { label: 'Connectée',    color: 'text-green-600', dot: 'bg-green-500' },
  printing:     { label: 'Impression...', color: 'text-blue-600', dot: 'bg-blue-500 animate-pulse' },
  error:        { label: 'Erreur',       color: 'text-red-600',   dot: 'bg-red-500' },
}

export default function ThermalPrinterPanel() {
  const {
    isSupported, status, error, config,
    connect, disconnect, updateConfig, testPrint,
  } = useThermalPrinter()

  const st = STATUS_DISPLAY[status]
  const isConnected = status === 'connected' || status === 'printing'

  if (!isSupported) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="text-yellow-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-yellow-800">Navigateur non compatible</p>
            <p className="text-sm text-yellow-700 mt-1">
              L'impression thermique directe nécessite <strong>Chrome</strong> ou <strong>Edge</strong> (version 89+).
              Utilisez Firefox ou Safari uniquement pour l'impression PDF via le navigateur.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Statut + connexion */}
      <div className="bg-white border rounded-2xl p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <Printer size={20} className="text-orange-600" />
            </div>
            <div>
              <div className="font-semibold text-gray-800">Imprimante thermique</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className={`w-2 h-2 rounded-full ${st.dot}`} />
                <span className={`text-sm ${st.color}`}>{st.label}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isConnected && (
              <button
                onClick={() => testPrint()}
                disabled={status === 'printing'}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm text-blue-600 border-blue-200 hover:bg-blue-50 disabled:opacity-50"
              >
                <TestTube2 size={14} /> Test
              </button>
            )}
            <button
              onClick={() => isConnected ? disconnect() : connect()}
              disabled={status === 'connecting' || status === 'printing'}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${
                isConnected
                  ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                  : 'bg-orange-600 text-white hover:bg-orange-700'
              }`}
            >
              {isConnected
                ? <><PlugZap size={15} /> Déconnecter</>
                : <><Plug size={15} /> Connecter</>
              }
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            <X size={14} /> {error}
          </div>
        )}

        {!isConnected && (
          <p className="mt-3 text-xs text-gray-500">
            Cliquez sur <strong>Connecter</strong> et sélectionnez le port USB de votre imprimante dans le dialogue du navigateur.
            Compatible : Epson TM series, Star TSP, Xprinter XP-80, Bixolon SRP-350.
          </p>
        )}
      </div>

      {/* Configuration */}
      <div className="bg-white border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings2 size={16} className="text-gray-500" />
          <h3 className="font-semibold text-gray-800">Configuration</h3>
        </div>

        <div className="space-y-4">
          {/* Largeur papier */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Largeur du papier</label>
            <div className="flex gap-3">
              {([58, 80] as const).map(w => (
                <button
                  key={w}
                  onClick={() => updateConfig({ paperWidth: w })}
                  className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition ${
                    config.paperWidth === w
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {w}mm
                  <div className="text-xs font-normal mt-0.5 text-gray-400">
                    {w === 58 ? '32 car/ligne' : '48 car/ligne'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Coupe automatique */}
          <div className="flex items-center justify-between py-3 border-t">
            <div>
              <div className="text-sm font-medium text-gray-700">Coupe automatique</div>
              <div className="text-xs text-gray-500 mt-0.5">Couper le ticket après impression</div>
            </div>
            <button
              onClick={() => updateConfig({ autoCut: !config.autoCut })}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                config.autoCut ? 'bg-orange-500' : 'bg-gray-200'
              }`}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                config.autoCut ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>

          {/* Tiroir caisse */}
          <div className="flex items-center justify-between py-3 border-t">
            <div>
              <div className="text-sm font-medium text-gray-700">Ouvrir tiroir-caisse</div>
              <div className="text-xs text-gray-500 mt-0.5">Déclencher l'ouverture après paiement espèces</div>
            </div>
            <button
              onClick={() => updateConfig({ openCashDrawer: !config.openCashDrawer })}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                config.openCashDrawer ? 'bg-orange-500' : 'bg-gray-200'
              }`}
            >
              <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                config.openCashDrawer ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </div>
      </div>

      {/* Guide de connexion */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={16} className="text-blue-600" />
          <h3 className="font-semibold text-blue-800">Comment connecter ?</h3>
        </div>
        <ol className="text-sm text-blue-700 space-y-1.5 list-decimal list-inside">
          <li>Branchez l'imprimante en USB sur l'ordinateur</li>
          <li>Allumez l'imprimante</li>
          <li>Cliquez sur <strong>Connecter</strong> ci-dessus</li>
          <li>Sélectionnez le port USB dans le dialogue</li>
          <li>Cliquez sur <strong>Test</strong> pour vérifier</li>
        </ol>
        <div className="mt-3 text-xs text-blue-500">
          Si aucun port n'apparaît, installez le pilote USB de votre imprimante.
          Epson : <em>Epson Advanced Printer Driver</em>. Xprinter / générique : <em>CH340/CP210x USB-Serial driver</em>.
        </div>
      </div>

      {/* Compatibilité */}
      <div className="bg-white border rounded-2xl p-5">
        <h3 className="font-semibold text-gray-700 mb-3 text-sm">Modèles testés et compatibles</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { brand: 'Epson', models: 'TM-T20, TM-T82, TM-T88' },
            { brand: 'Star', models: 'TSP100, TSP650, mPOP' },
            { brand: 'Xprinter', models: 'XP-80, XP-T890' },
            { brand: 'Bixolon', models: 'SRP-350, SRP-330' },
            { brand: 'Sewoo', models: 'LK-T212, LK-T320' },
            { brand: 'Générique', models: 'POS-80, RP80 (58/80mm)' },
          ].map(({ brand, models }) => (
            <div key={brand} className="flex items-start gap-2 text-sm">
              <Check size={14} className="text-green-500 mt-0.5 shrink-0" />
              <div>
                <div className="font-medium text-gray-700">{brand}</div>
                <div className="text-xs text-gray-400">{models}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
