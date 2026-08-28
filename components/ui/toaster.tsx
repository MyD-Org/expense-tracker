'use client'

import { useToast } from '@/hooks/use-toast'
import {
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast'

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    // Los avisos se van solos a los 3 s; mientras tanto se pueden tocar para
    // cerrarlos o deslizar hacia arriba (sin botón de cierre) para seguir
    // usando la pantalla.
    <ToastProvider duration={3000} swipeDirection="up" swipeThreshold={30}>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} onClick={() => dismiss(id)} {...props}>
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {title && <ToastTitle>{title}</ToastTitle>}
              {title && description && (
                <span aria-hidden className="text-slate-500">
                  ·
                </span>
              )}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
