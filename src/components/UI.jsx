// Reusable UI primitives

export function Btn({ children, variant = 'primary', className = '', ...props }) {
  const base = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all cursor-pointer border disabled:opacity-60 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700',
    secondary: 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50',
    danger: 'bg-red-500 text-white border-red-500 hover:bg-red-600',
    success: 'bg-green-600 text-white border-green-600 hover:bg-green-700',
    ghost: 'bg-transparent text-slate-600 border-transparent hover:bg-slate-100',
  }
  return <button className={`${base} ${variants[variant]} ${className}`} {...props}>{children}</button>
}

export function IconBtn({ children, className = '', danger = false, ...props }) {
  return (
    <button
      className={`w-8 h-8 flex items-center justify-center border border-slate-200 rounded-md text-slate-400 bg-white transition-all
        ${danger ? 'hover:border-red-400 hover:text-red-500 hover:bg-red-50' : 'hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50'}
        ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}

export function Badge({ children, variant = 'default' }) {
  const variants = {
    active: 'bg-blue-100 text-blue-600 border border-blue-200',
    closed: 'bg-slate-100 text-slate-500 border border-slate-200',
    registration: 'bg-blue-100 text-blue-600 border border-blue-200',
    checkin: 'bg-green-100 text-green-700 border border-green-200',
    late: 'bg-amber-100 text-amber-700 border border-amber-200',
    default: 'bg-slate-100 text-slate-600 border border-slate-200',
  }
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-sm ${variants[variant]}`}>{children}</span>
}

export function StatCard({ label, value, hero = false }) {
  return (
    <div className={`rounded-lg p-4 border ${hero ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-200'}`}>
      <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${hero ? 'text-blue-200' : 'text-slate-400'}`}>{label}</div>
      <div className={`text-3xl font-bold leading-none ${hero ? 'text-white' : 'text-black'}`}>{value}</div>
    </div>
  )
}

export function Card({ children, className = '' }) {
  return <div className={`bg-white border border-slate-200 rounded-lg ${className}`}>{children}</div>
}

export function Input({ label, required, error, ...props }) {
  return (
    <div className="mb-3.5">
      {label && <label className="block text-sm font-medium text-black mb-1.5">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>}
      <input className="w-full border border-slate-200 rounded-md px-3 py-2.5 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white" {...props} />
      {error && <div className="text-red-500 text-xs mt-1">{error}</div>}
    </div>
  )
}

export function Textarea({ label, required, ...props }) {
  return (
    <div className="mb-3.5">
      {label && <label className="block text-sm font-medium text-black mb-1.5">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>}
      <textarea className="w-full border border-slate-200 rounded-md px-3 py-2.5 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white resize-y min-h-[70px]" {...props} />
    </div>
  )
}

export function Select({ label, required, children, ...props }) {
  return (
    <div className="mb-3.5">
      {label && <label className="block text-sm font-medium text-black mb-1.5">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>}
      <select className="w-full border border-slate-200 rounded-md px-3 py-2.5 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-100 bg-white cursor-pointer" {...props}>{children}</select>
    </div>
  )
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-slate-200'}`} onClick={() => onChange(!checked)}>
        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
      {label && <span className="text-xs text-slate-500">{label}</span>}
    </label>
  )
}

export function EmptyState({ icon, title, subtitle }) {
  return (
    <div className="text-center py-12 px-4">
      {icon && <div className="text-4xl mb-3">{icon}</div>}
      <div className="text-sm font-medium text-slate-600">{title}</div>
      {subtitle && <div className="text-xs text-slate-400 mt-1">{subtitle}</div>}
    </div>
  )
}

export function Spinner({ dark = false }) {
  return <div className={`w-4 h-4 border-2 rounded-full animate-spin ${dark ? 'border-blue-200 border-t-blue-600' : 'border-white/40 border-t-white'}`} />
}
