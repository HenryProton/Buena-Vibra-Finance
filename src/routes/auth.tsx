import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/PasswordInput';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import logo from '@/assets/logo.jpg';
import { useServerFn } from '@tanstack/react-start';
import { redeemInvitation, lookupInvitation } from '@/lib/invitations.functions';

export const Route = createFileRoute('/auth')({
  head: () => ({ meta: [
    { title: 'Iniciar sesión — Buena Vibra Finance' },
    { name: 'description', content: 'Ingresa a tu cuenta de Buena Vibra Finance.' },
  ]}),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const redeem = useServerFn(redeemInvitation);
  const lookup = useServerFn(lookupInvitation);
  const [loading, setLoading] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [invite, setInvite] = useState<any>(null);
  const [tab, setTab] = useState<'login' | 'signup'>('login');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { if (data.session) navigate({ to: '/app' }); });
    const code = (new URLSearchParams(window.location.search).get('invite') || '').toUpperCase();
    if (!code) return;
    setInviteCode(code); setTab('signup');
    lookup({ data: { code } }).then(data => data ? setInvite(data) : toast.error('Invitación no válida o expirada')).catch(() => toast.error('Invitación no válida o expirada'));
  }, [navigate, lookup]);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoading(true);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email') || '').trim();
    const password = String(fd.get('password') || '');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error('Correo o PIN incorrectos');
      toast.success('¡Bienvenido!'); navigate({ to: '/app' });
    } catch (err: any) { toast.error(err?.message ?? 'No se pudo ingresar'); }
    finally { setLoading(false); }
  }

  async function handleSignup(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoading(true);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get('email') || '').trim();
    const password = String(fd.get('password') || '');
    const phone = String(fd.get('phone') || '').trim();
    const fullName = String(fd.get('full_name') || invite?.full_name || '').trim();
    if (password.length < 6) { setLoading(false); return toast.error('El PIN/contraseña debe tener al menos 6 caracteres.'); }
    try {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/app`, data: { full_name: fullName, phone } } });
      if (error) throw error;
      if (invite) {
        if (!data.session) {
          const signed = await supabase.auth.signInWithPassword({ email, password });
          if (signed.error) throw new Error('Confirma primero tu correo y vuelve a abrir la invitación.');
        }
        await redeem({ data: { code: inviteCode } });
        toast.success('¡Cuenta creada y activada!'); navigate({ to: '/app' });
      } else toast.success('Registro creado. Espera la aprobación del administrador.');
    } catch (err: any) { toast.error(err?.message ?? 'No se pudo crear la cuenta'); }
    finally { setLoading(false); }
  }

  return <div className="min-h-screen flex items-center justify-center p-4 bg-background"><div className="w-full max-w-md space-y-6">
    <div className="flex flex-col items-center gap-3"><img src={logo} alt="Buena Vibra Finance" className="h-24 w-24 rounded-2xl object-cover shadow-lg"/><h1 className="text-2xl font-bold text-center">Buena Vibra Finance</h1><p className="text-sm text-muted-foreground">Caja de ahorros</p></div>
    {invite && <Card className="p-4 bg-primary/10 border-primary/30"><p className="text-sm font-semibold text-primary">Invitación válida</p><p className="text-sm">Hola <strong>{invite.full_name}</strong>, completa tus datos para activar tu cuenta.</p></Card>}
    <Card className="p-6"><Tabs value={tab} onValueChange={v => setTab(v as 'login' | 'signup')}><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="login">Ingresar</TabsTrigger><TabsTrigger value="signup">{invite ? 'Aceptar invitación' : 'Registrarme'}</TabsTrigger></TabsList>
      <TabsContent value="login" className="mt-4"><form onSubmit={handleLogin} className="space-y-4"><div className="space-y-2"><Label htmlFor="email">Correo electrónico</Label><Input id="email" name="email" type="email" required autoComplete="username" /></div><div className="space-y-2"><Label htmlFor="password">PIN / contraseña</Label><PasswordInput id="password" name="password" required autoComplete="current-password" /></div><Button type="submit" className="w-full" disabled={loading}>{loading ? 'Ingresando...' : 'Ingresar'}</Button><p className="text-center"><Link to="/recuperar" className="text-sm text-primary underline">¿Olvidaste tu PIN?</Link></p></form></TabsContent>
      <TabsContent value="signup" className="mt-4"><form onSubmit={handleSignup} className="space-y-4"><div className="space-y-2"><Label htmlFor="full_name">Nombre completo</Label><Input id="full_name" name="full_name" required defaultValue={invite?.full_name ?? ''} /></div><div className="space-y-2"><Label htmlFor="phone">Teléfono <span className="text-destructive">*</span></Label><Input id="phone" name="phone" type="tel" required defaultValue={invite?.phone ?? ''} autoComplete="tel" /></div><div className="space-y-2"><Label htmlFor="s-email">Correo electrónico <span className="text-destructive">*</span></Label><Input id="s-email" name="email" type="email" required autoComplete="email" /></div><div className="space-y-2"><Label htmlFor="s-password">Crear PIN / contraseña</Label><PasswordInput id="s-password" name="password" required minLength={6} autoComplete="new-password" /></div><Button type="submit" className="w-full" disabled={loading}>{loading ? 'Creando...' : invite ? 'Crear cuenta y activar' : 'Crear cuenta'}</Button></form></TabsContent>
    </Tabs></Card>
  </div></div>;
}
