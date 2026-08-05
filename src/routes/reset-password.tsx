import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import logo from "@/assets/logo.jpg";
import { AlertCircle, CheckCircle2, Copy } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Nueva contraseña — Buena Vibra Finance" },
      { name: "description", content: "Crea una nueva contraseña para tu cuenta de Buena Vibra Finance." },
      { property: "og:title", content: "Nueva contraseña — Buena Vibra Finance" },
      { property: "og:description", content: "Crea una nueva contraseña para tu cuenta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneEmail, setDoneEmail] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash ?? "";
    const isRecovery = hash.includes("type=recovery");
    supabase.auth.getSession().then(({ data }) => {
      setReady(isRecovery || !!data.session);
      setChecking(false);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
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
    const { data, error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    toast.success("Contraseña actualizada");
    setDoneEmail(data.user?.email ?? "");
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <img src={logo} alt="Buena Vibra Finance" className="h-20 w-20 rounded-2xl object-cover shadow-lg" />
          <h1 className="text-2xl font-bold text-center">Nueva contraseña</h1>
        </div>
        <Card className="p-6 space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 flex gap-2">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {doneEmail !== null ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-primary mx-auto" />
              <h2 className="font-bold text-lg">¡Contraseña actualizada!</h2>
              <div className="rounded-lg border bg-muted/40 p-3 space-y-1 text-left">
                <p className="text-xs text-muted-foreground">Tu usuario para iniciar sesión</p>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-sm break-all">{doneEmail || "—"}</p>
                  {doneEmail && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(doneEmail);
                        toast.success("Usuario copiado");
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
              <Button className="w-full" onClick={() => navigate({ to: "/app" })}>
                Entrar a la app
              </Button>
            </div>
          ) : checking ? (
            <p className="text-sm text-muted-foreground">Verificando el enlace...</p>
          ) : !ready ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Este enlace ya no es válido o lo abriste en otro navegador. Puedes recuperar tu acceso con un código de 6
                dígitos.
              </p>
              <Button className="w-full" onClick={() => navigate({ to: "/recuperar" })}>
                Recuperar con código
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nueva contraseña o PIN</Label>
                <PasswordInput id="password" name="password"  minLength={6} required autoComplete="new-password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Repite la contraseña</Label>
                <PasswordInput id="confirm" name="confirm"  minLength={6} required autoComplete="new-password" />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Guardando..." : "Guardar contraseña"}
              </Button>
            </form>
          )}

          {doneEmail === null && (
            <div className="pt-2 text-center space-x-3">
              <Link to="/recuperar" className="text-sm text-primary underline">
                Usar código
              </Link>
              <Link to="/auth" className="text-sm text-primary underline">
                Iniciar sesión
              </Link>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
