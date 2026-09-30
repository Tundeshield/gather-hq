export default function Modal({ show, onClose, title, subtitle, children, actions }) {
  if (!show) return null
  return (
    <div className="fixed inset-0 bg-black/45 z-50 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-lg p-7 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        {title && <div className="text-lg font-bold text-black mb-1">{title}</div>}
        {subtitle && <div className="text-sm text-slate-500 mb-5">{subtitle}</div>}
        {children}
        {actions && <div className="flex gap-2 justify-end mt-5 flex-wrap">{actions}</div>}
      </div>
    </div>
  )
}
