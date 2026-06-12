import { useQuery } from '@tanstack/react-query'
import api from '../../lib/api'
import { useAuthStore } from '../../store/auth.store'
import { Settings, Store, Users, Shield, Printer } from 'lucide-react'

export default function SettingsPage() {
  const { user } = useAuthStore()

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Settings size={24} /> Paramètres</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="card hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
              <Store size={20} className="text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Magasin</h3>
              <p className="text-xs text-gray-500">Informations, NINEA, RC</p>
            </div>
          </div>
          <p className="text-sm text-gray-600">{user?.store?.name}</p>
          <p className="text-xs text-gray-400 mt-1">
            {user?.store?.license_grande_surface && <span className="badge-info mr-1">Grande Surface</span>}
            {user?.store?.license_restaurant && <span className="badge-success">Restaurant</span>}
          </p>
        </div>

        <div className="card hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
              <Users size={20} className="text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Utilisateurs & Rôles</h3>
              <p className="text-xs text-gray-500">Gestion des accès et permissions</p>
            </div>
          </div>
          <p className="text-sm text-gray-600">Gérer les comptes utilisateurs</p>
        </div>

        <div className="card hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
              <Shield size={20} className="text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Sécurité</h3>
              <p className="text-xs text-gray-500">Mot de passe, PIN, sessions</p>
            </div>
          </div>
          <p className="text-sm text-gray-600">Journal d'audit et traces</p>
        </div>

        <div className="card hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <Printer size={20} className="text-orange-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Impression</h3>
              <p className="text-xs text-gray-500">Tickets, factures, étiquettes</p>
            </div>
          </div>
          <p className="text-sm text-gray-600">Configuration des imprimantes</p>
        </div>
      </div>

      {/* System info */}
      <div className="card bg-gray-50">
        <h3 className="font-semibold text-gray-700 mb-3">Informations système</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Version</p>
            <p className="font-medium">1.0.0 Phase 1</p>
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
