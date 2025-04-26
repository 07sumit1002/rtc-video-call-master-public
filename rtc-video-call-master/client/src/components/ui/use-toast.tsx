// Simple toast implementation
import { createContext, useContext, useState, ReactNode } from "react"

interface Toast {
  id: string
  title?: string
  description?: string
  variant?: "default" | "destructive"
}

interface ToastContextType {
  toasts: Toast[]
  toast: (props: Omit<Toast, "id">) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = (props: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts((prev) => [...prev, { id, ...props }])
    
    // Auto dismiss after 3 seconds
    setTimeout(() => {
      dismiss(id)
    }, 3000)
    
    return id
  }

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed bottom-0 right-0 p-4 space-y-2 z-50">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`p-4 rounded shadow-lg ${
                t.variant === "destructive" ? "bg-red-100 text-red-800" : "bg-white"
              }`}
            >
              {t.title && <div className="font-semibold">{t.title}</div>}
              {t.description && <div>{t.description}</div>}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  
  return context
} 