import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PLACEHOLDER_DOMAIN = "buenavibra.local";
const DEFAULT_PASSWORD = "123456";

function slugify(s: string): string {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "socio";
}

export const adminCreateSocio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { full_name: string; username?: string; num_acciones: number }) => {
    if (!input.full_name?.trim()) throw new Error("Nombre requerido");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Solo administradores");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Validaciones de duplicados (nombre visible y usuario visible)
    const fullName = data.full_name.trim();
    const { data: existing } = await supabaseAdmin.from("profiles").select("id, full_name, username");
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    if ((existing ?? []).some((p: any) => norm(p.full_name ?? "") === norm(fullName))) {
      throw new Error(`Ya existe un socio con el nombre "${fullName}". Usa un nombre distinto (por ejemplo agregando el apellido).`);
    }

    const explicit = !!data.username?.trim();
    const base = slugify(data.username || fullName);
    if (explicit && (existing ?? []).some((p: any) => (p.username ?? "").toLowerCase() === base)) {
      throw new Error(`El usuario "${base}" ya está en uso. Elige otro.`);
    }

    let username = base;
    let attempt = 0;
    let created: any = null;
    let lastErr: string | null = null;

    while (attempt < 10) {
      if ((existing ?? []).some((p: any) => (p.username ?? "").toLowerCase() === username)) {
        attempt++;
        username = `${base}${attempt + 1}`;
        continue;
      }
      const email = `${username}@${PLACEHOLDER_DOMAIN}`;
      const { data: res, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (!error) { created = res; break; }
      lastErr = error.message;
      if (!/already|registered|exists/i.test(error.message)) throw new Error(error.message);
      if (explicit) throw new Error(`El usuario "${username}" ya está en uso. Elige otro.`);
      attempt++;
      username = `${base}${attempt + 1}`;
    }
    if (!created) throw new Error(lastErr ?? "No se pudo crear el usuario");

    const uid = created.user!.id;
    const { error: upErr } = await supabaseAdmin.from("profiles").update({
      status: "activo",
      password_set: false,
      num_acciones: Math.max(1, Number(data.num_acciones) || 1),
      full_name: fullName,
      username,
    } as never).eq("id", uid);
    if (upErr) throw new Error(upErr.message);

    return { id: uid, username, password: DEFAULT_PASSWORD, full_name: fullName, login_email: `${username}@${PLACEHOLDER_DOMAIN}` };
  });

export const adminGetSocioLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Solo administradores");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    if (error) throw new Error(error.message);
    const email = res.user?.email ?? "";
    const isPlaceholder = email.endsWith(`@${PLACEHOLDER_DOMAIN}`);
    return { login_email: email, is_placeholder: isPlaceholder, default_password: DEFAULT_PASSWORD };
  });
