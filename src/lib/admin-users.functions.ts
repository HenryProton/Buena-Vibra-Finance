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
    const base = slugify(data.username || data.full_name);
    let username = base;
    let attempt = 0;
    let created: any = null;
    let lastErr: string | null = null;

    while (attempt < 10) {
      const email = `${username}@${PLACEHOLDER_DOMAIN}`;
      const { data: res, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: DEFAULT_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: data.full_name },
      });
      if (!error) { created = res; break; }
      lastErr = error.message;
      if (!/already|registered|exists/i.test(error.message)) throw new Error(error.message);
      attempt++;
      username = `${base}${attempt + 1}`;
    }
    if (!created) throw new Error(lastErr ?? "No se pudo crear el usuario");

    const uid = created.user!.id;
    const { error: upErr } = await supabaseAdmin.from("profiles").update({
      status: "activo",
      num_acciones: Math.max(1, Number(data.num_acciones) || 1),
      full_name: data.full_name,
    }).eq("id", uid);
    if (upErr) throw new Error(upErr.message);

    return { id: uid, username, password: DEFAULT_PASSWORD, login_email: `${username}@${PLACEHOLDER_DOMAIN}` };
  });
