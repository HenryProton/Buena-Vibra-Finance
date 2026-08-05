import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import logo from "@/assets/logo.jpg";
import { requestRecoveryCode, verifyRecoveryCode } from "@/lib/recovery.functions";
import { KeyRound, ShieldCheck, AlertCircle, CheckCircle2, Copy } from "lucide-react";

export const Route = createFileRoute("/recuperar")({
  head: () => ({
    meta: [
      { title: "Recuperar acceso — Buena Vibra Finance" },
      {
        name: "description",
        content: "Recupera tu usuario o contraseña de Buena Vibra Finance con un código enviado a tu correo o WhatsApp.",
      },
      { property: "og:title", content: "Recuperar acceso — Buena Vibra Finance" },
      { property: "og:description", content: "Recupera tu contraseña con un código por correo o WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RecuperarPage,
});

type Info = { channel: string; hint: string; message: string };
type Done = { email: string; full_name: string | null; placeholder: boolean };

function StepDots({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={`h-2 rounded-full transition-all ${
            n === step ? "w-8 bg-primary" : n < step ? "w-2 bg-primary/60" : "w-2 bg-muted"
          }`}
        />
      ))}
    </div>
  );
}

function RecuperarPage() {
  const navigate = useNavigate();
  const request = useServerFn(requestRecoveryCode);
  const verify = useServerFn(verifyRecoveryCode);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  function validIdentifier(v: string) {
    const t = v.trim();
    if (t.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t);
    return t.replace(/\D/g, "").length >= 5;
  }

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validIdentifier(identifier)) {
      setError("Escribe un correo válido, o tu teléfono/cédula (mínimo 5 dígitos).");
      return;
    }
    setLoading(true);
    try {
      const res = await request({ data: { identifier: identifier.trim() } });
      if (!res.found) {
        setError(res.message);
        return;
      }
      setInfo({ channel: res.channel, hint: res.hint, message: res.message });
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo procesar la solicitud");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    const confirm = String(fd.get("confirm") ?? "");
    if (password !== confirm) {
      setError("Las contraseñas no coinciden");
      return;
    }
    setLoading(true);
    try {
      const res = await verify({
        data: { identifier: identifier.trim(), code: String(fd.get("code") ?? ""), new_password: password },
      });
      setDone({ email: res.email, full_name: res.full_name, placeholder: res.placeholder });
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo verificar el código");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <img src={logo} alt="Buena Vibra Finance" className="h-20 w-20 rounded-2xl object-cover shadow-lg" />
          <h1 className="text-2xl font-bold text-center">Recuperar acceso</h1>
          <p className="text-sm text-muted-foreground text-center">
            Tres pasos: identifícate, escribe el código y crea tu nueva contraseña.
          </p>
          <StepDots step={step} />
        </div>

        <Card className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 flex gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {step === 1 && (
            <form onSubmit={handleRequest} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="identifier">Correo, teléfono o cédula</Label>
                <Input
                  id="identifier"
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="ejemplo@correo.com o 04141234567"
                  required
                  maxLength={120}
                />
                <p className="text-xs text-muted-foreground">
                  Si no recuerdas tu usuario, escribe tu teléfono o cédula y te lo mostramos al terminar.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                <KeyRound className="mr-2 h-4 w-4" />
                {loading ? "Enviando..." : "Enviar código"}
              </Button>
            </form>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-lg bg-primary/10 border border-primary/30 p-3 space-y-1">
                <p className="text-sm font-semibold text-primary flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> Solicitud enviada
                </p>
                <p className="text-sm">{info?.message}</p>
                {info?.hint && <p className="text-xs text-muted-foreground">Enviado a {info.hint}</p>}
              </div>

              {info?.channel === "email" && (
                <p className="text-sm text-muted-foreground">
                  Abre el enlace del correo para crear tu nueva contraseña, o usa aquí el código de 6 dígitos.
                </p>
              )}

              <form onSubmit={handleVerify} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Código de 6 dígitos</Label>
                  <Input
                    id="code"
                    name="code"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    placeholder="123456"
                    className="text-center text-xl tracking-[0.4em] font-mono"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Nueva contraseña o PIN</Label>
                  <PasswordInput id="password" name="password"  minLength={6} required autoComplete="new-password" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Repite la contraseña</Label>
                  <PasswordInput id="confirm" name="confirm"  minLength={6} required autoComplete="new-password" />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Guardando..." : "Cambiar contraseña"}
                </Button>
              </form>

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setError(null);
                  setStep(1);
                }}
                disabled={loading}
              >
                Usar otro dato
              </Button>
            </div>
          )}

          {step === 3 && done && (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
              <div>
                <h2 className="font-bold text-lg">¡Contraseña actualizada!</h2>
                {done.full_name && <p className="text-sm text-muted-foreground">{done.full_name}</p>}
              </div>
              <div className="rounded-lg border bg-muted/40 p-3 space-y-1 text-left">
                <p className="text-xs text-muted-foreground">Tu usuario para iniciar sesión</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-sm break-all">{done.email || "—"}</p>
                  {done.email && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(done.email);
                        toast.success("Usuario copiado");
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                {done.placeholder && (
                  <p className="text-xs text-muted-foreground">
                    Este usuario fue creado por el administrador. Al entrar puedes cambiarlo por tu correo real desde tu
                    perfil.
                  </p>
                )}
              </div>
              <Button className="w-full" onClick={() => navigate({ to: "/auth" })}>
                Iniciar sesión
              </Button>
            </div>
          )}

          {step !== 3 && (
            <div className="pt-2 text-center">
              <Link to="/auth" className="text-sm text-primary underline">
                Volver a iniciar sesión
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
