import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ShoppingCart, Package, Users, BarChart3, Wifi, CreditCard,
  Building2, Check, X as XIcon, ArrowRight, Menu, Star,
  Smartphone, Shield, Zap, MessageSquare, FileText,
  Coffee, BookOpen, Target, Loader2, ChevronRight,
  Phone, Mail, MapPin, TrendingUp, Globe
} from 'lucide-react'
import api from '../lib/api'
import toast from 'react-hot-toast'

// ── Data ─────────────────────────────────────────────────────────────────────

const features = [
  {
    icon: <ShoppingCart className="w-6 h-6" />,
    title: 'Point de Vente (POS)',
    description: 'Caisse rapide avec support hors-ligne, imprimante thermique et Mobile Money intégré (Wave, Orange Money).',
    color: 'bg-orange-100 text-orange-600',
  },
  {
    icon: <Package className="w-6 h-6" />,
    title: 'Gestion des Stocks',
    description: 'Suivi en temps réel, alertes de seuil, dates de péremption, lots et mouvements automatiques.',
    color: 'bg-blue-100 text-blue-600',
  },
  {
    icon: <Users className="w-6 h-6" />,
    title: 'Clients & Fidélité',
    description: 'CRM intégré, programme de fidélité, crédit client, historique complet et segmentation.',
    color: 'bg-green-100 text-green-600',
  },
  {
    icon: <Coffee className="w-6 h-6" />,
    title: 'Module Restaurant',
    description: 'Gestion des tables, commandes par table, cuisine KDS, menus et réservations intégrés.',
    color: 'bg-amber-100 text-amber-600',
  },
  {
    icon: <BookOpen className="w-6 h-6" />,
    title: 'Comptabilité SYSCOHADA',
    description: 'Saisie automatique des écritures, bilan, compte de résultat, grand livre et balance.',
    color: 'bg-purple-100 text-purple-600',
  },
  {
    icon: <Wifi className="w-6 h-6" />,
    title: 'PWA Hors-ligne',
    description: 'Fonctionne sans internet. Synchronisation automatique dès le retour de la connexion.',
    color: 'bg-cyan-100 text-cyan-600',
  },
  {
    icon: <CreditCard className="w-6 h-6" />,
    title: 'Mobile Money',
    description: 'Wave, Orange Money et Free Money nativement intégrés dans la caisse en un clic.',
    color: 'bg-emerald-100 text-emerald-600',
  },
  {
    icon: <Building2 className="w-6 h-6" />,
    title: 'Multi-magasins',
    description: 'Gérez plusieurs points de vente depuis un seul tableau de bord centralisé et unifié.',
    color: 'bg-indigo-100 text-indigo-600',
  },
  {
    icon: <BarChart3 className="w-6 h-6" />,
    title: 'Rapports Avancés',
    description: 'Tableaux de bord en temps réel, exports PDF/Excel, analyse des ventes et de la rentabilité.',
    color: 'bg-rose-100 text-rose-600',
  },
]

const featureKeys = [
  'POS + Ventes',
  'Stock / Inventaire',
  'Clients + Fidélité',
  'Achats / Fournisseurs',
  'Facturation / Devis',
  'CRM Pipeline',
  'Restaurant / KDS',
  'Comptabilité SYSCOHADA',
  'Multi-magasins',
  'Sync Offline PWA',
  'Rapports avancés',
  'API / Webhooks',
  'SMS / WhatsApp',
  'Mobile Money (Wave/OM)',
] as const

const plans = [
  {
    name: 'Starter',
    slug: 'starter',
    target: 'Petite boutique',
    price_monthly: 15000,
    price_quarterly: 40000,
    price_yearly: 150000,
    max_stores: 1,
    max_users: 3,
    highlighted: false,
    badge: null as string | null,
    borderClass: 'border-gray-200',
    btnClass: 'bg-gray-100 hover:bg-gray-200 text-brand',
    features: {
      'POS + Ventes': true, 'Stock / Inventaire': true, 'Clients + Fidélité': true,
      'Achats / Fournisseurs': false, 'Facturation / Devis': false, 'CRM Pipeline': false,
      'Restaurant / KDS': false, 'Comptabilité SYSCOHADA': false, 'Multi-magasins': false,
      'Sync Offline PWA': true, 'Rapports avancés': false, 'API / Webhooks': false,
      'SMS / WhatsApp': false, 'Mobile Money (Wave/OM)': true,
    },
  },
  {
    name: 'Business',
    slug: 'business',
    target: 'PME multi-sites',
    price_monthly: 35000,
    price_quarterly: 95000,
    price_yearly: 350000,
    max_stores: 5,
    max_users: 20,
    highlighted: true,
    badge: 'Le plus populaire',
    borderClass: 'border-primary',
    btnClass: 'bg-primary hover:bg-primary-600 text-white',
    features: {
      'POS + Ventes': true, 'Stock / Inventaire': true, 'Clients + Fidélité': true,
      'Achats / Fournisseurs': true, 'Facturation / Devis': true, 'CRM Pipeline': true,
      'Restaurant / KDS': true, 'Comptabilité SYSCOHADA': false, 'Multi-magasins': true,
      'Sync Offline PWA': true, 'Rapports avancés': true, 'API / Webhooks': false,
      'SMS / WhatsApp': true, 'Mobile Money (Wave/OM)': true,
    },
  },
  {
    name: 'Enterprise',
    slug: 'enterprise',
    target: 'Grande surface / chaîne',
    price_monthly: null as number | null,
    price_quarterly: null as number | null,
    price_yearly: null as number | null,
    max_stores: -1,
    max_users: -1,
    highlighted: false,
    badge: null as string | null,
    borderClass: 'border-brand',
    btnClass: 'bg-brand hover:bg-brand-700 text-white',
    features: {
      'POS + Ventes': true, 'Stock / Inventaire': true, 'Clients + Fidélité': true,
      'Achats / Fournisseurs': true, 'Facturation / Devis': true, 'CRM Pipeline': true,
      'Restaurant / KDS': true, 'Comptabilité SYSCOHADA': true, 'Multi-magasins': true,
      'Sync Offline PWA': true, 'Rapports avancés': true, 'API / Webhooks': true,
      'SMS / WhatsApp': true, 'Mobile Money (Wave/OM)': true,
    },
  },
]

const activityTypes = [
  { value: 'boutique', label: 'Boutique / Épicerie' },
  { value: 'supermarche', label: 'Supermarché / Grande surface' },
  { value: 'restaurant', label: 'Restaurant / Café / Fast-food' },
  { value: 'pharmacie', label: 'Pharmacie / Parapharmacie' },
  { value: 'depot', label: 'Dépôt / Grossiste' },
  { value: 'boulangerie', label: 'Boulangerie / Pâtisserie' },
  { value: 'salon', label: 'Salon de beauté / Coiffure' },
  { value: 'autre', label: 'Autre activité' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatXOF(amount: number) {
  return new Intl.NumberFormat('fr-SN', {
    style: 'currency', currency: 'XOF', maximumFractionDigits: 0,
  }).format(amount)
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly')
  const [formData, setFormData] = useState({
    company_name: '', contact_name: '', email: '', phone: '',
    activity_type: '', city: '', country: 'Sénégal',
    plan_slug: '', duration_months: '3', notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const getPrice = (plan: typeof plans[0]) => {
    if (!plan.price_monthly) return 'Sur devis'
    if (billingCycle === 'monthly') return formatXOF(plan.price_monthly) + ' / mois'
    if (billingCycle === 'quarterly') return formatXOF(plan.price_quarterly!) + ' / trim.'
    return formatXOF(plan.price_yearly!) + ' / an'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.company_name || !formData.contact_name || !formData.email || !formData.phone || !formData.activity_type) {
      toast.error('Veuillez remplir tous les champs obligatoires')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/onboarding/request', {
        ...formData,
        duration_months: parseInt(formData.duration_months),
      })
      setSubmitted(true)
      toast.success('Demande envoyée ! Notre équipe vous contactera sous 24h.')
    } catch {
      toast.error("Erreur lors de l'envoi. Veuillez réessayer.")
    } finally {
      setSubmitting(false)
    }
  }

  const selectPlan = (slug: string) => {
    setFormData(d => ({ ...d, plan_slug: slug }))
    document.getElementById('onboarding')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen bg-white font-sans">

      {/* ── NAVBAR ─────────────────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/96 backdrop-blur-sm border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-md">
                <ShoppingCart className="text-white" size={18} />
              </div>
              <div>
                <span className="font-bold text-brand text-lg leading-none">Baobab</span>
                <span className="block text-[10px] text-gray-400 leading-none">SmartCommerce Suite</span>
              </div>
            </div>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-6 text-sm font-medium">
              <a href="#features" className="text-gray-600 hover:text-primary transition-colors">Fonctionnalités</a>
              <a href="#pricing" className="text-gray-600 hover:text-primary transition-colors">Tarifs</a>
              <a href="#onboarding" className="text-gray-600 hover:text-primary transition-colors">Démarrer</a>
              <Link to="/login" className="text-gray-600 hover:text-brand transition-colors">Se connecter</Link>
              <a
                href="#onboarding"
                className="bg-primary hover:bg-primary-600 text-white px-5 py-2.5 rounded-lg transition-colors font-semibold shadow-sm"
              >
                Demander un accès
              </a>
            </div>

            {/* Mobile button */}
            <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-2 text-gray-600 rounded-lg hover:bg-gray-100">
              <Menu size={22} />
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 px-4 py-4 space-y-1">
            {[
              { href: '#features', label: 'Fonctionnalités' },
              { href: '#pricing', label: 'Tarifs' },
              { href: '#onboarding', label: 'Démarrer' },
            ].map(item => (
              <a key={item.href} href={item.href} onClick={() => setMenuOpen(false)}
                className="block py-2.5 px-3 text-sm text-gray-600 hover:text-primary hover:bg-gray-50 rounded-lg"
              >
                {item.label}
              </a>
            ))}
            <Link to="/login" onClick={() => setMenuOpen(false)}
              className="block py-2.5 px-3 text-sm text-gray-600 hover:text-primary hover:bg-gray-50 rounded-lg"
            >
              Se connecter
            </Link>
            <a href="#onboarding" onClick={() => setMenuOpen(false)}
              className="block py-3 px-3 text-sm bg-primary text-white text-center rounded-lg font-semibold mt-2"
            >
              Demander un accès
            </a>
          </div>
        )}
      </nav>

      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <section className="relative bg-brand pt-16 overflow-hidden">
        {/* Decorations */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-primary opacity-10 rounded-full" />
          <div className="absolute top-32 -left-24 w-72 h-72 bg-brand-500 opacity-40 rounded-full" />
          <div className="absolute bottom-20 right-1/4 w-48 h-48 bg-primary opacity-8 rounded-full" />
          <div className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: 'radial-gradient(circle, #ffffff 1px, transparent 1px)', backgroundSize: '32px 32px' }}
          />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-36">
          <div className="text-center max-w-4xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-primary/15 border border-primary/25 text-primary px-4 py-2 rounded-full text-sm font-semibold mb-8">
              <Star size={14} className="fill-current" />
              La suite de gestion commerciale N°1 pour l'Afrique de l'Ouest
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
              Gérez votre commerce{' '}
              <span className="text-primary">comme un pro</span>
            </h1>

            <p className="text-lg sm:text-xl text-brand-300 max-w-2xl mx-auto mb-10 leading-relaxed">
              Baobab est la plateforme SaaS tout-en-un pensée pour les commerçants d'Afrique.
              POS, Stock, CRM, Restaurant, Comptabilité SYSCOHADA et Mobile Money — dans une seule app.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <a href="#onboarding"
                className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-600 text-white font-semibold px-8 py-4 rounded-xl text-base transition-all shadow-xl shadow-primary/30 hover:shadow-primary/40 hover:-translate-y-0.5"
              >
                Demander une démo gratuite <ArrowRight size={18} />
              </a>
              <Link to="/login"
                className="inline-flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 text-white font-semibold px-8 py-4 rounded-xl text-base transition-colors border border-white/20"
              >
                Se connecter <ChevronRight size={18} />
              </Link>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-6 max-w-md mx-auto">
              {[
                { value: '500+', label: 'Commerces actifs' },
                { value: '2M+', label: 'Transactions / mois' },
                { value: '4 pays', label: "Afrique de l'Ouest" },
              ].map(stat => (
                <div key={stat.label} className="text-center">
                  <div className="text-2xl sm:text-3xl font-bold text-primary">{stat.value}</div>
                  <div className="text-xs text-brand-300 mt-1 leading-tight">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Wave */}
        <div className="relative -mb-px">
          <svg viewBox="0 0 1440 72" xmlns="http://www.w3.org/2000/svg" className="w-full block fill-white">
            <path d="M0,36 C240,72 480,0 720,36 C960,72 1200,0 1440,36 L1440,72 L0,72 Z" />
          </svg>
        </div>
      </section>

      {/* ── LOGOS / TRUSTED BY ─────────────────────────────────────────────── */}
      <section className="py-10 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-6">
            Utilisé par des commerçants au Sénégal, en Côte d'Ivoire, au Mali et au Cameroun
          </p>
          <div className="flex flex-wrap justify-center gap-8 items-center text-gray-300">
            {['Boutique Express', 'Supermarché Yoff', 'Restaurant Teranga', 'Pharmacie Dakar', 'Dépôt Keur Serigne'].map(name => (
              <span key={name} className="text-sm font-semibold tracking-wide">{name}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ───────────────────────────────────────────────────────── */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-brand mb-4">Tout ce dont vous avez besoin</h2>
            <p className="text-gray-500 max-w-xl mx-auto text-base">
              Une suite complète de modules métier interconnectés, accessibles depuis n'importe quel appareil.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(f => (
              <div key={f.title}
                className="group bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-xl hover:border-primary/20 hover:-translate-y-1 transition-all duration-300 cursor-default"
              >
                <div className={`w-12 h-12 ${f.color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  {f.icon}
                </div>
                <h3 className="font-semibold text-brand text-base mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────────────────── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-brand mb-4">Comment ça marche ?</h2>
            <p className="text-gray-500">Démarrez en 3 étapes simples</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 relative">
            {/* Connecting line (desktop) */}
            <div className="hidden md:block absolute top-8 left-1/3 right-1/3 h-0.5 bg-primary/20" />

            {[
              {
                step: '01', icon: <MessageSquare className="w-7 h-7 text-primary" />,
                title: 'Faites votre demande',
                desc: 'Remplissez le formulaire avec les informations de votre commerce et le plan souhaité. Gratuit et sans engagement.',
              },
              {
                step: '02', icon: <Shield className="w-7 h-7 text-primary" />,
                title: 'Validation & Configuration',
                desc: 'Notre équipe valide votre demande, configure votre espace dédié et vous prépare un compte en moins de 24h.',
              },
              {
                step: '03', icon: <Zap className="w-7 h-7 text-primary" />,
                title: 'Démarrez immédiatement',
                desc: 'Recevez vos identifiants par email et commencez à vendre, gérer vos stocks et servir vos clients dès aujourd\'hui.',
              },
            ].map((item, i) => (
              <div key={i} className="relative text-center">
                <div className="relative inline-flex items-center justify-center w-16 h-16 bg-white border-2 border-primary/20 rounded-2xl mb-6 shadow-sm">
                  {item.icon}
                  <span className="absolute -top-3 -right-3 w-7 h-7 bg-primary text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {i + 1}
                  </span>
                </div>
                <h3 className="font-bold text-brand text-lg mb-3">{item.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed max-w-xs mx-auto">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-brand mb-4">Nos plans tarifaires</h2>
            <p className="text-gray-500 max-w-xl mx-auto mb-8">
              Des tarifs adaptés à chaque taille de commerce. En FCFA (XOF), sans frais cachés.
            </p>

            {/* Billing toggle */}
            <div className="inline-flex items-center bg-gray-100 p-1 rounded-xl gap-1">
              {([
                { key: 'monthly', label: 'Mensuel' },
                { key: 'quarterly', label: 'Trimestriel' },
                { key: 'yearly', label: 'Annuel' },
              ] as const).map(c => (
                <button key={c.key} onClick={() => setBillingCycle(c.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    billingCycle === c.key ? 'bg-white text-brand shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {billingCycle === 'yearly' && (
              <div className="mt-3 inline-flex items-center gap-1 text-sm text-green-600 font-semibold bg-green-50 px-3 py-1 rounded-full">
                <TrendingUp size={14} /> Économisez jusqu'à 17% avec la facturation annuelle
              </div>
            )}
          </div>

          {/* Plan cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-6">
            {plans.map(plan => (
              <div key={plan.slug}
                className={`relative bg-white border-2 rounded-2xl p-6 flex flex-col transition-shadow ${plan.borderClass} ${
                  plan.highlighted ? 'shadow-2xl shadow-primary/15' : 'shadow-sm hover:shadow-md'
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-bold px-4 py-1.5 rounded-full whitespace-nowrap shadow-sm">
                    {plan.badge}
                  </div>
                )}

                <div className="mb-5">
                  <h3 className="font-bold text-brand text-xl mb-1">{plan.name}</h3>
                  <p className="text-gray-500 text-sm">{plan.target}</p>
                </div>

                <div className="mb-5">
                  <div className="text-2xl font-bold text-brand">{getPrice(plan)}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {plan.max_stores === -1 ? 'Magasins illimités' : `${plan.max_stores} magasin${plan.max_stores > 1 ? 's' : ''}`}
                    {' · '}
                    {plan.max_users === -1 ? 'Utilisateurs illimités' : `${plan.max_users} utilisateurs`}
                  </div>
                </div>

                <div className="space-y-2.5 flex-1 mb-6 border-t border-gray-100 pt-5">
                  {featureKeys.map(feat => {
                    const enabled = (plan.features as Record<string, boolean>)[feat]
                    return (
                      <div key={feat} className="flex items-center gap-2.5 text-sm">
                        {enabled
                          ? <Check size={15} className="text-green-500 flex-shrink-0" />
                          : <XIcon size={15} className="text-gray-250 flex-shrink-0 opacity-40" />
                        }
                        <span className={enabled ? 'text-gray-700' : 'text-gray-400'}>{feat}</span>
                      </div>
                    )
                  })}
                </div>

                <button
                  onClick={() => selectPlan(plan.slug)}
                  className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors ${plan.btnClass}`}
                >
                  Choisir {plan.name}
                </button>
              </div>
            ))}
          </div>

          {/* Custom plan */}
          <div className="bg-brand rounded-2xl p-6 max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Globe size={18} className="text-primary" />
                  <h3 className="font-bold text-white text-lg">Plan Custom / Sur mesure</h3>
                </div>
                <p className="text-brand-300 text-sm">
                  Grande chaîne, franchise, besoins spéciaux ou intégrations spécifiques ? Discutons de votre projet.
                </p>
              </div>
              <button
                onClick={() => selectPlan('custom')}
                className="flex-shrink-0 bg-primary hover:bg-primary-600 text-white px-6 py-3 rounded-xl font-semibold text-sm transition-colors"
              >
                Nous contacter
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ───────────────────────────────────────────────────── */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-brand mb-4">Ce que disent nos clients</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                name: 'Aminata Diallo',
                role: 'Gérante, Supermarché Yoff',
                text: 'Baobab a transformé notre gestion. On voit nos stocks en temps réel et on accepte Wave directement à la caisse. Nos clients adorent !',
                stars: 5,
              },
              {
                name: 'Moussa Konaté',
                role: 'Propriétaire, Restaurant Le Teranga',
                text: 'La gestion des tables et des commandes est devenue un jeu d\'enfant. Le module KDS a réduit nos erreurs de commande de 90%.',
                stars: 5,
              },
              {
                name: 'Fatou Sow',
                role: 'Directrice, Pharmacie Centrale',
                text: "On gère 3 pharmacies depuis un seul tableau de bord. La comptabilité SYSCOHADA automatique nous économise 2 jours de travail par mois.",
                stars: 5,
              },
            ].map(t => (
              <div key={t.name} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="flex gap-0.5 mb-4">
                  {Array(t.stars).fill(0).map((_, i) => (
                    <Star key={i} size={14} className="text-amber-400 fill-amber-400" />
                  ))}
                </div>
                <p className="text-gray-600 text-sm leading-relaxed mb-4 italic">"{t.text}"</p>
                <div>
                  <div className="font-semibold text-brand text-sm">{t.name}</div>
                  <div className="text-gray-400 text-xs">{t.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ONBOARDING FORM ────────────────────────────────────────────────── */}
      <section id="onboarding" className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-brand mb-4">Démarrez maintenant</h2>
            <p className="text-gray-500">
              Remplissez ce formulaire et notre équipe vous contactera sous 24h pour activer votre espace.
            </p>
          </div>

          {submitted ? (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-12 text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="text-green-600 w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-green-800 mb-2">Demande envoyée !</h3>
              <p className="text-green-700 text-sm leading-relaxed">
                Merci pour votre intérêt. Notre équipe examinera votre demande et vous contactera
                à l'adresse <strong>{formData.email}</strong> dans les 24h ouvrées.
              </p>
              <button
                onClick={() => setSubmitted(false)}
                className="mt-6 text-sm text-green-600 hover:text-green-800 underline"
              >
                Envoyer une autre demande
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nom de l'entreprise <span className="text-red-500">*</span>
                  </label>
                  <input type="text" className="input" placeholder="Ex: Supermarché Dakar"
                    value={formData.company_name}
                    onChange={e => setFormData(d => ({ ...d, company_name: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Votre nom complet <span className="text-red-500">*</span>
                  </label>
                  <input type="text" className="input" placeholder="Ex: Ibrahima Diallo"
                    value={formData.contact_name}
                    onChange={e => setFormData(d => ({ ...d, contact_name: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input type="email" className="input" placeholder="vous@email.com"
                    value={formData.email}
                    onChange={e => setFormData(d => ({ ...d, email: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Téléphone <span className="text-red-500">*</span>
                  </label>
                  <input type="tel" className="input" placeholder="+221 77 000 00 00"
                    value={formData.phone}
                    onChange={e => setFormData(d => ({ ...d, phone: e.target.value }))}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Type d'activité <span className="text-red-500">*</span>
                  </label>
                  <select className="input" value={formData.activity_type}
                    onChange={e => setFormData(d => ({ ...d, activity_type: e.target.value }))}
                    required
                  >
                    <option value="">Sélectionner...</option>
                    {activityTypes.map(a => (
                      <option key={a.value} value={a.value}>{a.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ville</label>
                  <input type="text" className="input" placeholder="Ex: Dakar"
                    value={formData.city}
                    onChange={e => setFormData(d => ({ ...d, city: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Plan souhaité</label>
                  <select className="input" value={formData.plan_slug}
                    onChange={e => setFormData(d => ({ ...d, plan_slug: e.target.value }))}
                  >
                    <option value="">Je ne sais pas encore</option>
                    <option value="starter">Starter — 1 magasin, 3 utilisateurs</option>
                    <option value="business">Business — 5 magasins, 20 utilisateurs</option>
                    <option value="enterprise">Enterprise — Illimité</option>
                    <option value="custom">Custom — Sur mesure</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Durée souhaitée</label>
                  <select className="input" value={formData.duration_months}
                    onChange={e => setFormData(d => ({ ...d, duration_months: e.target.value }))}
                  >
                    <option value="1">1 mois</option>
                    <option value="3">3 mois</option>
                    <option value="6">6 mois</option>
                    <option value="12">1 an</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Message (optionnel)</label>
                <textarea className="input resize-none" rows={3}
                  placeholder="Décrivez votre projet, vos besoins spécifiques, le nombre de caisses, de magasins..."
                  value={formData.notes}
                  onChange={e => setFormData(d => ({ ...d, notes: e.target.value }))}
                />
              </div>

              <button type="submit" disabled={submitting}
                className="w-full bg-primary hover:bg-primary-600 disabled:bg-primary-300 text-white font-semibold py-4 rounded-xl transition-colors flex items-center justify-center gap-2 text-base shadow-lg shadow-primary/20"
              >
                {submitting
                  ? <><Loader2 size={18} className="animate-spin" /> Envoi en cours...</>
                  : <>Envoyer ma demande <ArrowRight size={18} /></>
                }
              </button>

              <p className="text-center text-xs text-gray-400">
                En envoyant ce formulaire, vous acceptez d'être recontacté par notre équipe commerciale.
                Vos données sont traitées avec confidentialité conformément à notre politique de vie privée.
              </p>
            </form>
          )}
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer className="bg-brand text-white py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center">
                  <ShoppingCart className="text-white" size={18} />
                </div>
                <span className="font-bold text-lg">Baobab</span>
              </div>
              <p className="text-brand-300 text-sm leading-relaxed">
                La suite de gestion commerciale pensée pour l'Afrique de l'Ouest. Simple, puissante, abordable.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Modules</h4>
              <ul className="space-y-2 text-brand-300 text-sm">
                {['Point de Vente (POS)', 'Gestion des Stocks', 'CRM & Clients', 'Restaurant & KDS', 'Comptabilité SYSCOHADA'].map(m => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Plans</h4>
              <ul className="space-y-2 text-brand-300 text-sm">
                {['Starter', 'Business', 'Enterprise', 'Custom'].map(p => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-4">Contact</h4>
              <ul className="space-y-3 text-brand-300 text-sm">
                <li className="flex items-center gap-2"><MapPin size={13} /> Dakar, Sénégal</li>
                <li className="flex items-center gap-2"><Mail size={13} /> contact@baobab.sn</li>
                <li className="flex items-center gap-2"><Phone size={13} /> +221 78 000 00 00</li>
              </ul>
            </div>
          </div>

          <div className="border-t border-brand-700 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-brand-400 text-xs">© 2026 Baobab SmartCommerce Suite. Tous droits réservés.</p>
            <div className="flex items-center gap-4">
              <Link to="/login" className="text-brand-300 hover:text-primary text-xs transition-colors">
                Connexion Commerçants
              </Link>
              <span className="text-brand-600">·</span>
              <Link to="/superadmin/login" className="text-brand-400 hover:text-brand-300 text-xs transition-colors">
                Accès SuperAdmin
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
