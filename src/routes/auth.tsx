import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/PasswordInput";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import logo from "@/assets/logo.jpg";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { redeemInvitation, lookupInvitation } from "@/lib/invitations.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Iniciar sesión — Buena Vibra Finance" },
      { name: "description", content: "Ingresa a tu caja de ahorros Buena Vibra Finance." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState<string>("");
  const [invite, setInvite] = useState<any>(null);
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [identifier, setIdentifier] = useState("");
  const [needsPassword, setNeedsPassword] = useState<boolean | null>(null);
  const redeem = useServerFn(redeemInvitation);
  const lookup = useServerFn(lookupInvitation);
  const lookupAcc = useServerFn(lookupAccount);
  const login = useServerFn(loginWithIdentifier);
  const firstLogin = useServerFn(firstTimeLogin);


  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
    });
    const params = new URLSearchParams(window.location.search);
    const code = (params.get("invite") || "").toUpperCase();
    if (code) {
      setInviteCode(code);
      setTab("signup");
      (async () => {
        try {
          const data = await lookup({ data: { code } });
          if (data) setInvite(data);
          else toast.error("Invitación no válida o expirada");
        } catch {
          toast.error("Invitación no válida o expirada");
        }
      })();
    }
  }, [navigate]);

  async function applySession(access_token: string, refresh_token: string) {
    const { error } = await supabase.auth.setSession({ access_token, refresh_token });
    if (error) throw new Error(error.message);
  }

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const id = String(fd.get("identifier") || identifier).trim();
    const password = String(fd.get("password") || "");
    try {
      if (!password) {
        const info = await lookupAcc({ data: { identifier: id } });
        if (!info.passwordSet) {
          await doFirstTime(id);
          return;
        }
        setNeedsPassword(true);
        toast.error("Escribe tu contraseña o PIN");
        return;
      }
      const res = await login({ data: { identifier: id, password } });
      await applySession(res.access_token, res.refresh_token);
      toast.success("¡Bienvenido!");
      navigate({ to: "/app" });
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo ingresar");
    } finally {
      setLoading(false);
    }
  }

  async function doFirstTime(id: string) {
    const res = await firstLogin({ data: { identifier: id } });
    const { error } = await supabase.auth.verifyOtp({ token_hash: res.token_hash, type: "magiclink" });
    if (error) throw new Error(error.message);
    toast.success(`¡Hola ${res.fullName || ""}! Completa tu correo y teléfono en tu perfil.`);
    navigate({ to: "/app" });
  }

  async function handleFirstTime() {
    if (!identifier.trim()) return toast.error("Escribe tu nombre para continuar");
    setLoading(true);
    try {
      await doFirstTime(identifier.trim());
    } catch (err: any) {
      toast.error(err?.message ?? "No se pudo ingresar");
      setNeedsPassword(true);
    } finally {
      setLoading(false);
    }
  }


  async function handleSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email"));
    const password = String(fd.get("password"));
    const fullName = String(fd.get("full_name") || invite?.full_name || "");

    const { data: signUpData, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
        data: { full_name: fullName },
      },
    });
    if (error) { setLoading(false); return toast.error(error.message); }

    // If invite, ensure a session and redeem
    if (invite) {
      if (!signUpData.session) {
        // try sign-in (email confirmation may be disabled but session missing)
        await supabase.auth.signInWithPassword({ email, password });
      }
      try {
        await redeem({ data: { code: inviteCode } });
        toast.success("¡Cuenta creada y activada!");
        setLoading(false);
        navigate({ to: "/app" });
        return;
      } catch (e: any) {
        toast.error(`Cuenta creada, pero no se pudo aplicar la invitación: ${e.message ?? e}`);
      }
    } else {
      toast.success("Registro exitoso. Espera la aprobación del administrador.");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-3">
          <img src={logo} alt="Buena Vibra Finance" className="h-24 w-24 rounded-2xl object-cover shadow-lg" />
          <h1 className="text-2xl font-bold text-center">Buena Vibra Finance</h1>
          <p className="text-sm text-muted-foreground text-center">Caja de ahorros</p>
        </div>

        {invite && (
          <Card className="p-4 bg-primary/10 border-primary/30 space-y-1">
            <p className="text-sm font-semibold text-primary">Invitación válida</p>
            <p className="text-sm">Hola <strong>{invite.full_name}</strong>, has sido invitado como socio.</p>
            <p className="text-xs text-muted-foreground">{invite.num_acciones} acción(es) · Código {invite.code}</p>
          </Card>
        )}

        <Card className="p-6">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Ingresar</TabsTrigger>
              <TabsTrigger value="signup">{invite ? "Aceptar invitación" : "Registrarme"}</TabsTrigger>
            </TabsList>

            <TabsContent value="login" className="mt-4">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="identifier">Tu nombre, teléfono o correo</Label>
                  <Input
                    id="identifier"
                    name="identifier"
                    required
                    autoComplete="username"
                    placeholder="Ej: Alvaro Reyes"
                    value={identifier}
                    onChange={(e) => { setIdentifier(e.target.value); setNeedsPassword(null); }}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Puedes escribir tu nombre completo tal como aparece en la caja, tu número de teléfono o tu correo.
                  </p>
                </div>
                {needsPassword !== false && (
                  <div className="space-y-2">
                    <Label htmlFor="password">Contraseña o PIN</Label>
                    <PasswordInput id="password" name="password" autoComplete="current-password" />
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Ingresando..." : "Ingresar"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={loading}
                  onClick={handleFirstTime}
                >
                  Es mi primera vez (sin contraseña)
                </Button>
                <p className="text-center">
                  <Link to="/recuperar" className="text-sm text-primary underline">
                    ¿Olvidaste tu usuario o contraseña?
                  </Link>
                </p>
              </form>
            </TabsContent>


            <TabsContent value="signup" className="mt-4">
              <form onSubmit={handleSignup} className="space-y-4">
                {!invite && (
                  <div className="space-y-2">
                    <Label htmlFor="invite_code">Código de invitación (opcional)</Label>
                    <Input
                      id="invite_code"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      onBlur={async () => {
                        if (!inviteCode) return;
                        try {
                          const data = await lookup({ data: { code: inviteCode } });
                          if (data) setInvite(data);
                          else toast.error("Código no válido o expirado");
                        } catch {
                          toast.error("Código no válido o expirado");
                        }
                      }}
                      placeholder="Ej: A3F9K2LM"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="full_name">Nombre completo</Label>
                  <Input id="full_name" name="full_name" required defaultValue={invite?.full_name ?? ""} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s-email">Correo</Label>
                  <Input id="s-email" name="email" type="email" required autoComplete="email" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s-password">Contraseña</Label>
                  <PasswordInput id="s-password" name="password"  required minLength={6} autoComplete="new-password" />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? "Creando cuenta..." : invite ? "Crear cuenta y activar" : "Crear cuenta"}
                </Button>
                {!invite && (
                  <p className="text-xs text-muted-foreground text-center">
                    Sin invitación, tu cuenta quedará pendiente de aprobación por el administrador.
                  </p>
                )}
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
