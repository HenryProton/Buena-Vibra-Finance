import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import logo from "@/assets/logo.jpg";
import { requestRecoveryCode, verifyRecoveryCode } from "@/lib/recovery.functions";
import { KeyRound, ShieldCheck } from "lucide-react";

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

function RecuperarPage() {
  const navigate = useNavigate();
  const request = useServerFn(requestRecoveryCode);
  const verify = useServerFn(verifyRecoveryCode);

  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [info, setInfo] = useState<{ channel: string; hint: string; message: string } | null>(null);

  async function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await request({ data: { identifier } });
      setInfo({ channel: res.channel, hint: res.hint, message: res.message });
      setStep(2);
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo procesar la solicitud");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await verify({
        data: {
          identifier,
          code: String(fd.get("code") ?? ""),
          new_password: String(fd.get("password") ?? ""),
        },
      });
      toast.success(`Contraseña actualizada. Tu usuario es ${res.email}`);
      navigate({ to: "/auth" });
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo verificar el código");
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
            Te enviamos un código a tu correo o WhatsApp para restablecer tu contraseña.
          </p>
        </div>

        <Card className="p-6 space-y-4">
          {step === 1 ? (
            <form onSubmit={handleRequest} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="identifier">Correo, teléfono o cédula</Label>
                <Input
                  id="identifier"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
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
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-primary/10 border border-primary/30 p-3 space-y-1">
                <p className="text-sm font-semibold text-primary flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> Solicitud enviada
                </p>
                <p className="text-sm">{info?.message}</p>
                {info?.hint && <p className="text-xs text-muted-foreground">Enviado a {info.hint}</p>}
              </div>

              {info?.channel === "email" ? (
                <p className="text-sm text-muted-foreground">
                  Abre el enlace del correo para crear tu nueva contraseña. Si el administrador te dio un código de 6
                  dígitos, también puedes usarlo aquí abajo.
                </p>
              ) : null}

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
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Nueva contraseña</Label>
                  <Input id="password" name="password" type="password" minLength={6} required autoComplete="new-password" />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Guardando..." : "Cambiar contraseña"}
                </Button>
              </form>

              <Button variant="ghost" className="w-full" onClick={() => setStep(1)} disabled={loading}>
                Usar otro dato
              </Button>
            </div>
          )}

          <div className="pt-2 text-center">
            <Link to="/auth" className="text-sm text-primary underline">
              Volver a iniciar sesión
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
