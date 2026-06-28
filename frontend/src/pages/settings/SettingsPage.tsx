import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import {
  Settings, Store, Users, Shield, Printer, ArrowRight, X, Palette, Menu, Tag, Bell, Mail,
} from 'lucide-react'
import { usePreferencesStore, COLOR_PALETTES } from '../../store/preferences.store'
import ThermalPrinterPanel from '../../components/thermal/ThermalPrinterPanel'

interface SettingCard {
  icon: React.ReactNode
  iconBg: string
  title: string
  desc: string
  detail?: string
  onClick?: () => void
  adminOnly?: boolean
}

export default function SettingsPage() {
  const { user, can } = useAuthStore()
  const navigate = useNavigate()
  const [showThermal, setShowThermal] = useState(false)
  const { theme, primaryColor } = usePreferencesStore()
  const activePalette = COLOR_PALETTES[primaryColor]

  const isSuperAdmin = user?.roles?.includes('super_admin')

  const cards: SettingCard[] = [
    {
      icon: <Store size={20} className="text-primary" />,
      iconBg: 'bg-primary-100',
      title: 'Magasins',
      desc: 'Points de vente & dépôts',
      detail: user?.store?.name,
      onClick: () => navigate('/stores'),
      adminOnly: true,
    },
    {
      icon: <Users size={20} className="text-green-600" />,
      iconBg: 'bg-green-100',
      title: 'Utilisateurs & Rôles',
      desc: 'Gestion des accès et permissions',
      detail: 'Gérer les comptes utilisateurs',
      onClick: () => navigate('/users'),
    },
    {
      icon: <Shield size={20} className="text-purple-600" />,
      iconBg: 'bg-purple-100',
      title: 'Sécurité',
      desc: 'Mot de passe, PIN, sessions',
      detail: 'Journal d\'audit et traces',
    },
    {
      icon: <Printer size={20} className="text-orange-600" />,
      iconBg: 'bg-orange-100',
      title: 'Modèles d\'impression',
      desc: 'Tickets, factures, étiquettes',
      detail: 'Personnaliser les modèles d\'impression',
      onClick: () => navigate('/print-templates'),
    },
    {
      icon: <Printer size={20} className="text-orange-700" />,
      iconBg: 'bg-orange-50 border border-orange-200',
      title: 'Imprimante thermique',
      desc: 'ESC/POS — 58mm / 80mm',
      detail: 'Configurer l\'imprimante USB pour tickets de caisse',
      onClick: () => setShowThermal(true),
    },
    {
      icon: <Palette size={20} style={{ color: activePalette.DEFAULT }} />,
      iconBg: 'rounded-xl flex items-center justify-center',
      title: 'Préférences d\'affichage',
      desc: `Thème ${theme === 'dark' ? 'sombre' : 'clair'} · Couleur ${activePalette.name}`,
      detail: 'Mode sombre / clair · Couleur principale',
      onClick: () => navigate('/preferences'),
    },
    {
      icon: <Menu size={20} className="text-teal-600" />,
      iconBg: 'bg-teal-100',
      title: 'Personnalisation du menu',
      desc: 'Renommer, réorganiser et masquer les items',
      detail: 'Donnez vos propres appellations aux modules',
      onClick: () => navigate('/menu-settings'),
    },
    {
      icon: <Tag size={20} className="text-blue-600" />,
      iconBg: 'bg-blue-100',
      title: 'Catégories clients',
      desc: 'Gros, Demi-Gros, Détail…',
      detail: 'Gérer les niveaux de prix par type de client',
      onClick: () => navigate('/client-categories'),
    },
    {
      icon: <Bell size={20} className="text-rose-600" />,
      iconBg: 'bg-rose-100',
      title: 'Relances factures',
      desc: 'Règles de relance automatique',
      detail: 'Configurer les délais et canaux de relance (SMS, email)',
      onClick: () => navigate('/invoice-reminders'),
    },
    {
      icon: <Mail size={20} className="text-blue-600" />,
      iconBg: 'bg-blue-100',
      title: 'Configuration Email',
      desc: 'SMTP de votre organisation',
      detail: 'Configurez votre propre serveur SMTP pour l\'envoi d\'emails',
      onClick: () => navigate('/mail-settings'),
    },
  ]

  const visibleCards = cards.filter(c => !c.adminOnly || isSuperAdmin || can('manage_stores'))

  return (
    <div className="p-3 sm:p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        <Settings size={24} /> Paramètres
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibleCards.map(card => (
          <div
            key={card.title}
            onClick={card.onClick}
            className={`bg-white rounded-2xl border shadow-sm p-5 flex flex-col gap-3 transition-all ${
              card.onClick
                ? 'cursor-pointer hover:shadow-md hover:border-primary/30 group'
                : 'cursor-default'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 ${card.iconBg} rounded-xl flex items-center justify-center`}>
                  {card.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{card.title}</h3>
                  <p className="text-xs text-gray-500">{card.desc}</p>
                </div>
              </div>
              {card.onClick && (
                <ArrowRight size={16} className="text-gray-300 group-hover:text-primary transition-colors" />
              )}
            </div>
            {card.detail && (
              <p className="text-sm text-gray-600">{card.detail}</p>
            )}
          </div>
        ))}
      </div>

      {/* Modal imprimante thermique */}
      {showThermal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center overflow-y-auto p-4">
          <div className="bg-gray-50 rounded-2xl shadow-2xl w-full max-w-lg my-6">
            <div className="flex items-center justify-between px-5 py-4 bg-white rounded-t-2xl border-b">
              <div className="flex items-center gap-2">
                <Printer size={18} className="text-orange-600" />
                <h2 className="font-bold text-gray-800">Imprimante thermique ESC/POS</h2>
              </div>
              <button onClick={() => setShowThermal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-5">
              <ThermalPrinterPanel />
            </div>
          </div>
        </div>
      )}

      {/* System info */}
      <div className="bg-gray-50 rounded-2xl border p-5">
        <h3 className="font-semibold text-gray-700 mb-3">Informations système</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Version</p>
            <p className="font-medium">Baobab 1.0.0</p>
          </div>
          <div>
            <p className="text-gray-500">Stack</p>
            <p className="font-medium">Laravel 11 + React 18</p>
          </div>
          <div>
            <p className="text-gray-500">Devise</p>
            <p className="font-medium">FCFA (XOF)</p>
          </div>
          <div>
            <p className="text-gray-500">Fuseau horaire</p>
            <p className="font-medium">Africa/Dakar (GMT+0)</p>
          </div>
        </div>
      </div>
    </div>
  )
}
