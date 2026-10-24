import { Package, Wheat } from 'lucide-react'
import type { ProductKind } from '../hooks/useProductKindScope'

export function ProductKindSwitch({ kind, onChange, className = '' }: {
  kind: ProductKind
  onChange: (k: ProductKind) => void
  className?: string
}) {
  const options: [ProductKind, string, React.ReactNode][] = [
    ['raw_material', 'Matières premières', <Wheat key="r" size={15} />],
    ['finished', 'Produits finis', <Package key="f" size={15} />],
  ]

  return (
    <div className={`flex gap-1 bg-gray-100 p-1 rounded-xl w-fit ${className}`}>
      {options.map(([value, label, icon]) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
            kind === value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {icon} {label}
        </button>
      ))}
    </div>
  )
}
