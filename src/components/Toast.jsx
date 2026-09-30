import { createContext, useContext, useState, useCallback } from 'react'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((msg, type = 'success') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 md:left-auto md:right-5 md:translate-x-0 md:top-5 md:bottom-auto z-50 flex flex-col gap-2 items-center md:items-end pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`bg-slate-900 text-white px-4 py-2.5 rounded-md text-sm font-medium shadow-lg pointer-events-auto animate-slide-in border-l-4 ${t.type === 'error' ? 'border-red-500' : 'border-green-500'}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
