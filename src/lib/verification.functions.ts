import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PLACEHOLDER_DOMAIN = "buenavibra.local";

export function normalizeUsername(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "")
    .slice(0, 24);
}

/** Sincroniza el estado de verificación del correo del usuario actual. */
export const syncMyVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: res, error } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (error) throw new Error(error.message);
    const email = res.user?.email ?? "";
    const isPlaceholder = email.endsWith(`@${PLACEHOLDER_DOMAIN}`);
    const emailVerified = !isPlaceholder && !!res.user?.email_confirmed_at;

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("email_verified, phone_verified, phone")
      .eq("id", context.userId)
      .maybeSingle();

    if (prof && (prof as any).email_verified !== emailVerified) {
      await supabaseAdmin.from("profiles").update({ email_verified: emailVerified } as never).eq("id", context.userId);
    }

    return {
      email,
      is_placeholder: isPlaceholder,
      email_verified: emailVerified,
      phone_verified: !!(prof as any)?.phone_verified,
      phone: (prof as any)?.phone ?? null,
    };
  });

/** Comprueba si un usuario visible está libre (no distingue mayúsculas ni acentos). */
export const checkUsernameAvailable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { username: string; user_id?: string }) => input)
  .handler(async ({ data, context }) => {
    const username = normalizeUsername(data.username);
    if (username.length < 3) return { available: false, username, reason: "El usuario debe tener al menos 3 caracteres" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .select("id, username")
      .ilike("username", username);
    if (error) throw new Error(error.message);
    const owner = data.user_id ?? context.userId;
    const taken = (rows ?? []).some((r: any) => r.id !== owner);
    return { available: !taken, username, reason: taken ? "Ese usuario ya está en uso" : null };
  });

/** Guarda el usuario visible del socio actual. */
export const setMyUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { username: string }) => input)
  .handler(async ({ data, context }) => {
    const username = normalizeUsername(data.username);
    if (username.length < 3) throw new Error("El usuario debe tener al menos 3 caracteres");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin.from("profiles").select("id").ilike("username", username);
    if ((rows ?? []).some((r: any) => r.id !== context.userId)) throw new Error("Ese usuario ya está en uso, elige otro");
    const { error } = await supabaseAdmin.from("profiles").update({ username } as never).eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { username };
  });

/** El administrador confirma que verificó el teléfono del socio (por llamada o WhatsApp). */
export const adminSetPhoneVerified = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { user_id: string; verified: boolean }) => input)
  .handler(async ({ data, context }) => {
    const { data: canAccess } = await context.supabase.rpc("can_access_socio", {
      _admin_id: context.userId,
      _socio_id: data.user_id,
    });
    if (!canAccess) throw new Error("No tienes permiso para este socio");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ phone_verified: data.verified } as never)
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
