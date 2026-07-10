import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export const adminCreateInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    full_name: string;
    num_acciones?: number;
    fecha_inicio?: string | null;
    fecha_fin?: string | null;
    expires_in_days?: number;
  }) => {
    if (!input.full_name?.trim()) throw new Error("Nombre requerido");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Solo administradores");

    const days = Math.max(1, Math.min(365, data.expires_in_days ?? 30));
    const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

    let code = generateCode();
    let attempt = 0;
    // avoid rare collision
    while (attempt < 5) {
      const { data: existing } = await context.supabase.from("invitations" as any).select("id").eq("code", code).maybeSingle();
      if (!existing) break;
      code = generateCode();
      attempt++;
    }

    const { data: inv, error } = await (context.supabase as any)
      .from("invitations")
      .insert({
        code,
        full_name: data.full_name,
        num_acciones: Math.max(1, Number(data.num_acciones) || 1),
        fecha_inicio: data.fecha_inicio || null,
        fecha_fin: data.fecha_fin || null,
        created_by: context.userId,
        expires_at: expires,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return inv;
  });

export const adminCancelInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Solo administradores");
    const { error } = await (context.supabase as any).from("invitations").update({ status: "anulada" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Called by newly-signed-up user to consume the invitation and activate their profile.
export const redeemInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { code: string }) => {
    if (!input.code?.trim()) throw new Error("Código requerido");
    return { code: input.code.trim().toUpperCase() };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: inv, error } = await supabaseAdmin
      .from("invitations" as any)
      .select("*")
      .eq("code", data.code)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) throw new Error("Invitación no encontrada");
    const invAny = inv as any;
    if (invAny.status !== "pendiente") throw new Error("Esta invitación ya fue utilizada o anulada");
    if (new Date(invAny.expires_at).getTime() < Date.now()) throw new Error("Invitación expirada");

    const { error: upErr } = await supabaseAdmin
      .from("profiles")
      .update({
        status: "activo",
        full_name: invAny.full_name,
        num_acciones: invAny.num_acciones,
        fecha_inicio: invAny.fecha_inicio,
        fecha_fin: invAny.fecha_fin,
      })
      .eq("id", context.userId);
    if (upErr) throw new Error(upErr.message);

    const { error: invUpErr } = await supabaseAdmin
      .from("invitations" as any)
      .update({ status: "usada", used_by: context.userId, used_at: new Date().toISOString() })
      .eq("id", invAny.id);
    if (invUpErr) throw new Error(invUpErr.message);

    return { ok: true };
  });
