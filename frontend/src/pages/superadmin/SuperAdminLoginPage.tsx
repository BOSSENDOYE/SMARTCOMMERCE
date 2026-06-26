import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useSuperAdminStore } from '../../store/superAdmin.store'
import { ShieldCheck, Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import axios from 'axios'

const schema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})
type FormData = z.infer<typeof schema>

const saApi = axios.create({
  baseURL: (import.meta.env.VITE_API_URL ?? 'http://localhost:8000') + '/api/v1',
  headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
})

export default function SuperAdminLoginPage() {
  const navigate = useNavigate()
  const setAuth = useSuperAdminStore(s => s.setAuth)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const res = await saApi.post('/superadmin/auth/login', data)
      setAuth(res.data.admin, res.data.token)
      navigate('/superadmin')
      toast.success(`Bienvenue, ${res.data.admin.name} !`)
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { message?: string } }; message?: string }
      if (!axiosErr.response) {
        toast.error(`Impossible de joindre le serveur. Vérifiez que le backend est démarré sur le port 8000.`)
      } else {
        const msg = axiosErr.response.data?.message ?? `Erreur ${axiosErr.response.status}`
        toast.error(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand flex items-center justify-center p-4">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-primary opacity-10 rounded-full" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-primary opacity-10 rounded-full" />
        <div className="absolute top-1/3 left-1/4 w-64 h-64 bg-brand-700 opacity-40 rounded-full" />
        <div className="absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Back link */}
        <Link to="/" className="inline-flex items-center gap-2 text-brand-300 hover:text-white text-sm mb-8 transition-colors">
          <ArrowLeft size={14} /> Retour à l'accueil
        </Link>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl mb-4 shadow-xl">
            <ShieldCheck className="text-white" size={30} />
          </div>
          <h1 className="text-3xl font-bold text-white">SuperAdmin</h1>
          <p className="text-brand-300 text-sm mt-1">Plateforme Baobab · Accès restreint</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex items-center gap-2 mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <ShieldCheck size={16} className="text-amber-600 flex-shrink-0" />
            <p className="text-amber-700 text-xs font-medium">
              Cet espace est réservé aux administrateurs de la plateforme.
            </p>
          </div>

          <h2 className="text-xl font-semibold text-gray-800 mb-6">Connexion administrateur</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adresse e-mail</label>
              <input type="email" {...register('email')} className="input"
                placeholder="admin@baobab.sn" autoComplete="email"
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  {...register('password')}
                  className="input pr-10"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <button type="submit" disabled={loading}
              className="w-full bg-brand hover:bg-brand-700 disabled:bg-brand-400 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading
                ? <><Loader2 size={16} className="animate-spin" /> Connexion...</>
                : 'Se connecter'
              }
            </button>
          </form>
        </div>

        <div className="mt-6 text-center">
          <Link to="/login" className="text-brand-300 hover:text-white text-xs transition-colors">
            Accès commerçants →
          </Link>
        </div>
      </div>
    </div>
  )
}
