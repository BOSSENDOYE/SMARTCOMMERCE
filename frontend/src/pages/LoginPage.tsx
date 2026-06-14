import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAuthStore } from '../store/auth.store'
import api from '../lib/api'
import toast from 'react-hot-toast'
import { ShoppingCart, Eye, EyeOff, Loader2 } from 'lucide-react'

const schema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
})

type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore(s => s.setAuth)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    try {
      const res = await api.post('/auth/login', data)
      setAuth(res.data.user, res.data.token)
      navigate('/')
      toast.success(`Bienvenue, ${res.data.user.name} !`)
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Erreur de connexion'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand flex items-center justify-center p-4">
      {/* Déco background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 bg-primary opacity-10 rounded-full" />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-primary opacity-10 rounded-full" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-700 opacity-30 rounded-full" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl mb-4 shadow-xl">
            <ShoppingCart className="text-white" size={32} />
          </div>
          <h1 className="text-3xl font-bold text-white">Baobab</h1>
          <p className="text-brand-300 text-sm mt-1">Suite de gestion commerciale</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-6">Connexion</h2>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Adresse e-mail</label>
              <input
                type="email"
                {...register('email')}
                className="input"
                placeholder="vous@baobab.sn"
                autoComplete="email"
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
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary hover:bg-primary-600 disabled:bg-primary-300 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <><Loader2 size={16} className="animate-spin" /> Connexion...</> : 'Se connecter'}
            </button>
          </form>

          {/* Demo credentials */}
          <div className="mt-6 p-4 bg-primary-50 rounded-lg border border-primary-100">
            <p className="text-xs font-semibold text-brand mb-2">Comptes de démonstration :</p>
            <div className="space-y-1 text-xs text-brand-600">
              <p><span className="font-medium">Admin :</span> admin@smartcommerce.sn / Admin@2026!</p>
              <p><span className="font-medium">Gérant :</span> gerant@smartcommerce.sn / Gerant@2026!</p>
              <p><span className="font-medium">Caissier :</span> caissier@smartcommerce.sn / Caissier@2026!</p>
              <p><span className="font-medium">Boutiquier :</span> boutiquier@smartcommerce.sn / Boutique@2026!</p>
              <p><span className="font-medium">Restaurant :</span> restaurant@smartcommerce.sn / Resto@2026!</p>
            </div>
          </div>
        </div>

        <p className="text-center text-brand-300 text-xs mt-6">
          Baobab Suite · Dakar, Sénégal · Juin 2026
        </p>
      </div>
    </div>
  )
}
