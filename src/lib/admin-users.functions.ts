import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const adminCreateSocio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { email: string; password: string; full_name: string; num_acciones: number }) => {
    if (!input.email || !input.password || input.password.length < 6) throw new Error("Email y contraseña (mín 6) requeridos");
    if (!input.full_name?.trim()) throw new Error("Nombre requerido");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Solo administradores");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) throw new Error(error.message);
    const uid = created.user!.id;

    // Trigger created a pending profile with 1 acción — activate it and set acciones.
    const { error: upErr } = await supabaseAdmin.from("profiles").update({
      status: "activo",
      num_acciones: Math.max(1, Number(data.num_acciones) || 1),
      full_name: data.full_name,
    }).eq("id", uid);
    if (upErr) throw new Error(upErr.message);

    return { id: uid };
  });
