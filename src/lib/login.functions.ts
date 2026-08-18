import { createServerFn } from '@tanstack/react-start';

function norm(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function digits(s: string) { return s.replace(/\D/g, ''); }

async function resolveAccount(identifier: string) {
  const id = identifier.trim();
  if (!id) throw new Error('Escribe tu correo, teléfono o nombre');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: profiles, error } = await supabaseAdmin.from('profiles').select('id, full_name, username, phone, cedula, password_set, status');
  if (error) throw new Error('No se pudo consultar la cuenta');

  let match: any;
  if (id.includes('@')) {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const u = data?.users.find(x => (x.email ?? '').toLowerCase() === id.toLowerCase());
    if (u) match = profiles?.find((p: any) => p.id === u.id);
    if (!match && u) return { userId: u.id, email: u.email ?? '', passwordSet: true, fullName: '' };
  }
  if (!match) {
    const n = norm(id), d = digits(id);
    match = profiles?.find((p: any) => norm(p.full_name ?? '') === n)
      ?? profiles?.find((p: any) => (p.username ?? '').toLowerCase() === id.toLowerCase())
      ?? (d.length >= 7 ? profiles?.find((p: any) => digits(p.phone ?? '') === d) : undefined)
      ?? (d.length >= 5 ? profiles?.find((p: any) => digits(p.cedula ?? '') === d) : undefined);
  }
  if (!match) throw new Error('No encontramos una cuenta con esos datos.');
  const { data, error: userError } = await supabaseAdmin.auth.admin.getUserById(match.id);
  if (userError || !data.user?.email) throw new Error('No se pudo obtener la cuenta.');
  return { userId: match.id, email: data.user.email, passwordSet: match.password_set !== false, fullName: match.full_name ?? '' };
}

export const lookupAccount = createServerFn({ method: 'POST' }).inputValidator((input: { identifier: string }) => input).handler(async ({ data }) => {
  const acc = await resolveAccount(data.identifier);
  return { fullName: acc.fullName, passwordSet: acc.passwordSet };
});

export const loginWithIdentifier = createServerFn({ method: 'POST' }).inputValidator((input: { identifier: string; password: string }) => input).handler(async ({ data }) => {
  const acc = await resolveAccount(data.identifier);
  const { createClient } = await import('@supabase/supabase-js');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const url = process.env.SUPABASE_URL;
  if (!key || !url) throw new Error('Servidor no configurado');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: res, error } = await client.auth.signInWithPassword({ email: acc.email, password: data.password });
  if (error || !res.session) throw new Error('Credenciales incorrectas');
  return { access_token: res.session.access_token, refresh_token: res.session.refresh_token };
});

export const firstTimeLogin = createServerFn({ method: 'POST' }).inputValidator((input: { identifier: string }) => input).handler(async ({ data }) => {
  const acc = await resolveAccount(data.identifier);
  if (acc.passwordSet) throw new Error('Esta cuenta ya tiene PIN/contraseña. Usa recuperación si lo olvidaste.');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email: acc.email });
  if (error || !link.properties?.hashed_token) throw new Error('No se pudo iniciar el acceso.');
  return { token_hash: link.properties.hashed_token, fullName: acc.fullName };
});
