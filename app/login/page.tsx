"use client"

import { Suspense, useState } from "react"
import { useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Wallet, ShieldCheck, Users, Bell, Loader2, AlertCircle } from "lucide-react"

// NextAuth vuelve a /login?error=... cuando el ingreso falla. Sin este cartel
// el usuario ve la misma pantalla otra vez y parece que no pasó nada.
const errorMessages: Record<string, string> = {
  EmailNoAutorizado:
    "Tu email no está en la lista de acceso de la app. Pedile al administrador que lo agregue a ALLOWED_EMAILS.",
  CuentaDuplicada:
    "Tu email ya figura registrado con otra cuenta de Google. El administrador tiene que unificar el registro antes de que puedas entrar.",
  ErrorServidor: "No pudimos conectarnos con la base de datos. Volvé a intentar en un rato.",
  AccessDenied: "Tu cuenta no está autorizada para entrar a esta app. Pedile al administrador que agregue tu email.",
  OAuthAccountNotLinked: "Ese email ya está asociado a otra forma de ingreso.",
  Configuration: "Hay un problema de configuración del servidor. Intentá más tarde.",
  Verification: "El enlace de acceso venció o ya fue usado.",
}

function LoginContent() {
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const error = searchParams.get("error")
  const errorMessage = error
    ? errorMessages[error] || "No pudimos iniciar tu sesión. Volvé a intentarlo."
    : null

  const handleSignIn = () => {
    setLoading(true)
    signIn("google", { callbackUrl: "/" })
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 flex items-center justify-center px-4">
      {/* Fondo animado */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="auth-blob absolute -top-32 -left-24 h-96 w-96 rounded-full bg-blue-600/30 blur-3xl" />
        <div className="auth-blob absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-emerald-500/20 blur-3xl" style={{ animationDelay: "-4s" }} />
        <div className="auth-blob absolute -bottom-32 left-1/4 h-80 w-80 rounded-full bg-purple-600/20 blur-3xl" style={{ animationDelay: "-8s" }} />
        {/* Grid sutil */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
      </div>

      <div className="auth-fade-up relative z-10 w-full max-w-md">
        <div className="auth-glass rounded-3xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-5">
              <div className="absolute inset-0 rounded-2xl bg-blue-500/40 blur-xl" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 shadow-lg shadow-blue-900/50">
                <Wallet className="h-8 w-8 text-white" strokeWidth={2.2} />
              </div>
            </div>
            <h1 className="text-3xl font-bold tracking-tight auth-shimmer-text">Control de Gastos</h1>
            <p className="mt-2 text-sm text-slate-400 max-w-xs">
              Llevá las cuentas del hogar en pareja. Vencimientos, tarjetas y gastos fijos, todo en un solo lugar.
            </p>
          </div>

          {/* Features */}
          <div className="my-7 grid grid-cols-3 gap-3">
            {[
              { icon: Users, label: "Compartido" },
              { icon: Bell, label: "Vencimientos" },
              { icon: ShieldCheck, label: "Privado" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex flex-col items-center gap-2 rounded-2xl border border-slate-700/40 bg-slate-800/30 py-4 transition-colors hover:bg-slate-800/60"
              >
                <Icon className="h-5 w-5 text-blue-400" />
                <span className="text-[11px] font-medium text-slate-300">{label}</span>
              </div>
            ))}
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-left"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <p className="text-xs leading-relaxed text-red-200">{errorMessage}</p>
            </div>
          )}

          {/* Botón Google */}
          <Button
            onClick={handleSignIn}
            disabled={loading}
            className="group relative w-full overflow-hidden rounded-xl bg-white py-6 text-base font-semibold text-gray-800 shadow-lg transition-all hover:bg-white hover:shadow-xl hover:shadow-blue-900/20 active:scale-[0.98] disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none disabled:active:scale-100"
          >
            <span className="flex items-center justify-center gap-3">
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <svg viewBox="0 0 24 24" width="22" height="22">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              {loading ? "Conectando..." : "Continuar con Google"}
            </span>
          </Button>

          <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">
            Al ingresar podés crear un hogar nuevo o unirte
            <br />
            al de tu pareja con un código de invitación.
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          Hecho con 💙 para organizarnos mejor
        </p>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950" />}>
      <LoginContent />
    </Suspense>
  )
}
