// Petits composants d'interface réutilisés par tous les écrans
import { useEffect, useState } from 'react'
import { X, Download, FileText } from 'lucide-react'
import { fmtNum } from '../utils/format'

export function Spinner({ className = 'py-16' }) {
  return (
    <div className={`flex justify-center ${className}`}>
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

export function Badge({ def, value }) {
  const d = def[value] || { label: value, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${d.cls}`}>{d.label}</span>
}

export function Modal({ title, subtitle, onClose, children, size = 'max-w-lg' }) {
  useEffect(() => {
    const onKey = e => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/40 overflow-y-auto">
      <div className={`bg-white rounded-2xl shadow-xl w-full ${size} my-4`}>
        <div className="p-5 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-gray-900">{title}</h3>
            {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Fermer"><X size={20} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="label">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export function ExportButtons({ onExcel, onPdf, disabled }) {
  return (
    <>
      <button onClick={onExcel} disabled={disabled} className="btn btn-secondary btn-sm" title="Exporter en Excel">
        <Download size={14} /><span className="hidden sm:inline">Excel</span>
      </button>
      <button onClick={onPdf} disabled={disabled} className="btn btn-secondary btn-sm" title="Exporter en PDF">
        <FileText size={14} /><span className="hidden sm:inline">PDF</span>
      </button>
    </>
  )
}

export function Empty({ icon: Icon, text, children }) {
  return (
    <div className="card text-center py-14">
      {Icon && <Icon size={40} className="text-gray-300 mx-auto mb-3" />}
      <p className="text-gray-500 font-medium">{text}</p>
      {children}
    </div>
  )
}

// Saisie d'un montant formaté pendant la frappe (1 250 000) ; onChange reçoit un nombre ou ''
export function MoneyInput({ value, onChange, className = '', suffix = 'GNF', ...rest }) {
  const [text, setText] = useState(value === '' || value === null || value === undefined ? '' : fmtNum(value))
  useEffect(() => {
    const parsed = text.replace(/\D/g, '')
    if (String(value ?? '') !== parsed) setText(value === '' || value === null || value === undefined ? '' : fmtNum(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <div className="relative">
      <input
        {...rest}
        inputMode="numeric"
        className={`input pr-12 text-right tabular-nums ${className}`}
        value={text}
        onChange={e => {
          const digits = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
          setText(digits ? fmtNum(Number(digits)) : '')
          onChange(digits ? Number(digits) : '')
        }}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">{suffix}</span>
    </div>
  )
}

// Saisie d'un taux en %
export function RateInput({ value, onChange, ...rest }) {
  return (
    <div className="relative">
      <input {...rest} type="number" min="0" max="100" step="0.01" className="input pr-8 text-right"
        value={value} onChange={e => onChange(e.target.value)} />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">%</span>
    </div>
  )
}

export const errMsg = (err, fallback = 'Une erreur est survenue') => err?.response?.data?.error || fallback
