import { Link } from 'react-router-dom'
import {
  ShoppingCart, Package, Users, BarChart3, Wifi, Smartphone,
  BookOpen, ChevronRight, CheckCircle, Star, Globe, Shield,
} from 'lucide-react'

const features = [
  { icon: ShoppingCart, title: 'Caisse POS',          desc: 'Point de vente rapide, hors-ligne, multi-paiements (Wave, Orange Money...)' },
  { icon: Package,      title: 'Stock & Inventaire',  desc: 'Suivi en temps réel, alertes, transferts multi-magasins' },
  { icon: Users,        title: 'Clients & Fidélité',  desc: 'Gestion de la clientèle, points de fidélité, crédit client' },
  { icon: BarChart3,    title: 'Rapports',             desc: 'Tableaux de bord, KPIs ventes, rotations des stocks' },
  { icon: BookOpen,     title: 'Comptabilité SYSCOHADA', desc: 'Journal, grand livre, conforme aux normes OHADA' },
  { icon: Smartphone,   title: 'PWA Mobile',          desc: 'Fonctionne sur Android sans connexion internet' },
]

const plans = [
  {
    name: 'Starter',
    price: 'Sur devis',
    desc: 'Petite boutique, 1 magasin',
    features: ['POS + Ventes', 'Stock & Inventaire', 'Clients & Fidélité', 'Sync hors-ligne'],
    highlight: false,
  },
  {
    name: 'Business',
    price: 'Sur devis',
    desc: 'PME, jusqu\'à 5 magasins',
    features: ['Tout Starter', 'Achats / Fournisseurs', 'Facturation & Devis', 'CRM Pipeline', 'SMS / WhatsApp'],
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Sur devis',
    desc: 'Grande surface, magasins illimités',
    features: ['Tout Business', 'Comptabilité SYSCOHADA', 'Restaurant & KDS', 'API / Webhooks', 'Support dédié'],
    highlight: false,
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Nav */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <ShoppingCart className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">Baobab</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-gray-400">
            <a href="#features" className="hover:text-white transition">Fonctionnalités</a>
            <a href="#plans" className="hover:text-white transition">Tarifs</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="text-sm text-gray-300 hover:text-white transition px-3 py-1.5"
            >
              Connexion
            </Link>
            <a
              href="#contact"
              className="text-sm bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg transition font-medium"
            >
              Demander l'accès
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium px-3 py-1.5 rounded-full mb-6">
          <Star className="w-3.5 h-3.5" />
          Solution ERP conçue pour l'Afrique
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 leading-tight">
          Gérez votre commerce<br />
          <span className="text-indigo-400">simplement et efficacement</span>
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">
          Baobab est une plateforme ERP tout-en-un : caisse POS, stock, clients, comptabilité SYSCOHADA.
          Fonctionne hors-ligne, sur mobile, avec Wave et Orange Money.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="#contact"
            className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold transition shadow-lg shadow-indigo-900/40"
          >
            Demander une démo <ChevronRight className="w-4 h-4" />
          </a>
          <Link
            to="/login"
            className="flex items-center justify-center gap-2 px-6 py-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-sm font-medium transition"
          >
            Accéder à mon espace
          </Link>
        </div>

        {/* Stats */}
        <div className="mt-16 grid grid-cols-3 gap-4 max-w-lg mx-auto">
          {[
            { v: '100%', l: 'Hors-ligne PWA' },
            { v: 'OHADA', l: 'Comptabilité conforme' },
            { v: 'Wave+OM', l: 'Mobile Money intégré' },
          ].map(s => (
            <div key={s.l} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xl font-bold text-indigo-400">{s.v}</p>
              <p className="text-xs text-gray-500 mt-1">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3">Tout ce dont vous avez besoin</h2>
          <p className="text-gray-400">Un seul outil pour gérer toute votre activité commerciale</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-gray-900 border border-gray-800 hover:border-indigo-500/40 rounded-2xl p-6 transition group">
              <div className="w-10 h-10 bg-indigo-600/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-600/30 transition">
                <Icon className="w-5 h-5 text-indigo-400" />
              </div>
              <h3 className="font-semibold text-white mb-1.5">{title}</h3>
              <p className="text-sm text-gray-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Plans */}
      <section id="plans" className="max-w-6xl mx-auto px-4 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3">Plans d'abonnement</h2>
          <p className="text-gray-400">Choisissez l'offre adaptée à votre activité</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map(plan => (
            <div
              key={plan.name}
              className={`relative rounded-2xl p-6 border ${
                plan.highlight
                  ? 'bg-indigo-600 border-indigo-500 shadow-2xl shadow-indigo-900/40'
                  : 'bg-gray-900 border-gray-800'
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white text-indigo-700 text-xs font-bold px-3 py-1 rounded-full shadow">
                  Populaire
                </div>
              )}
              <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
              <p className={`text-sm mb-4 ${plan.highlight ? 'text-indigo-200' : 'text-gray-400'}`}>{plan.desc}</p>
              <p className="text-2xl font-bold mb-6">{plan.price}</p>
              <ul className="space-y-2 mb-6">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-sm">
                    <CheckCircle className={`w-4 h-4 shrink-0 ${plan.highlight ? 'text-indigo-200' : 'text-green-500'}`} />
                    <span className={plan.highlight ? 'text-indigo-100' : 'text-gray-300'}>{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href="#contact"
                className={`block text-center py-2.5 rounded-xl text-sm font-semibold transition ${
                  plan.highlight
                    ? 'bg-white text-indigo-700 hover:bg-indigo-50'
                    : 'bg-gray-800 hover:bg-gray-700 text-white border border-gray-700'
                }`}
              >
                Demander l'accès
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* Contact / CTA */}
      <section id="contact" className="max-w-2xl mx-auto px-4 py-20">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
          <Globe className="w-10 h-10 text-indigo-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Demandez votre accès</h2>
          <p className="text-gray-400 text-sm mb-6">
            Remplissez ce formulaire et notre équipe vous contactera sous 24h pour configurer votre espace.
          </p>
          <form className="space-y-3 text-left" onSubmit={e => e.preventDefault()}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Nom de l'entreprise</label>
                <input type="text" placeholder="Ex : Boutique Diallo" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Votre nom</label>
                <input type="text" placeholder="Prénom Nom" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Email</label>
                <input type="email" placeholder="vous@exemple.com" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Téléphone</label>
                <input type="tel" placeholder="+221 77 000 00 00" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Plan souhaité</label>
              <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500">
                <option value="">Sélectionner un plan</option>
                <option value="starter">Starter — 1 magasin</option>
                <option value="business">Business — jusqu'à 5 magasins</option>
                <option value="enterprise">Enterprise — illimité</option>
              </select>
            </div>
            <button
              type="submit"
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-semibold transition shadow-lg shadow-indigo-900/30"
            >
              Envoyer la demande
            </button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8 text-center text-xs text-gray-600">
        <p>© {new Date().getFullYear()} Baobab by DSTComputing. Tous droits réservés.</p>
        <div className="flex items-center justify-center gap-4 mt-3">
          <Link to="/login" className="hover:text-gray-400 transition">Espace client</Link>
          <span>·</span>
          <Link to="/superadmin/login" className="hover:text-gray-400 transition flex items-center gap-1">
            <Shield className="w-3 h-3" /> SuperAdmin
          </Link>
        </div>
      </footer>
    </div>
  )
}
