import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function sixDigits(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function maskEmail(email: string): string {
  const [u, d] = email.split("@");
  if (!u || !d) return "•••";
  const head = u.slice(0, 2);
  return `${head}${"•".repeat(Math.max(2, u.length - 2))}@${d}`;
}

function maskPhone(phone: string): string {
  const clean = phone.replace(/\s+/g, "");
  return `${"•".repeat(Math.max(0, clean.length - 4))}${clean.slice(-4)}`;
}

function isPlaceholderEmail(email: string): boolean {
  return /@(app\.local|socio\.local|temp\.local)$/i.test(email);
}

async function sendWhatsapp(to: string, body: string): Promise<boolean> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const twilioKey = process.env["TWILIO_API_KEY"];
  const from = process.env["TWILIO_WHATSAPP_FROM"];
  if (!lovableKey || !twilioKey || !from) return false;
  try {
    const res = await fetch("https://connector-gateway.lovable.dev/twilio/Messages.json", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": twilioKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        To: to.startsWith("whatsapp:") ? to : `whatsapp:${to}`,
        From: from.startsWith("whatsapp:") ? from : `whatsapp:${from}`,
        Body: body,
      }),
    });
    if (!res.ok) {
      console.error(`[recovery] Twilio error ${res.status}: ${await res.text()}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[recovery] Twilio request failed", e);
    return false;
  }
}

/**
 * Public: the user types their email, phone or cédula. We locate the account,
 * generate a 6-digit code and try to deliver it (email link / WhatsApp).
 * The response never reveals whether the account exists beyond a masked hint.
 */
export const requestRecoveryCode = createServerFn({ method: "POST" })
  .inputValidator((input: { identifier: string }) => {
    const identifier = (input.identifier ?? "").trim();
    if (identifier.length < 3 || identifier.length > 120) throw new Error("Dato inválido");
    return { identifier };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const raw = data.identifier;
    const generic = {
      ok: true as const,
      channel: "admin" as string,
      hint: "",
      message:
        "Si los datos coinciden con una cuenta, enviaremos un código de 6 dígitos. Si no lo recibes, el administrador puede reenviártelo.",
    };

    // Find the auth user: by email, or via profile (phone / cédula)
    let userId: string | null = null;
    let email: string | null = null;
    let phone: string | null = null;
    let fullName: string | null = null;

    const looksLikeEmail = raw.includes("@");
    const digits = raw.replace(/\D/g, "");

    if (looksLikeEmail) {
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = list?.users.find((u) => (u.email ?? "").toLowerCase() === raw.toLowerCase());
      if (found) {
        userId = found.id;
        email = found.email ?? null;
      }
    } else if (digits.length >= 5) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, phone, cedula")
        .or(`phone.ilike.%${digits}%,cedula.ilike.%${digits}%`)
        .limit(2);
      const prof = (profs ?? [])[0];
      if (prof) {
        userId = prof.id;
        phone = prof.phone;
        fullName = prof.full_name;
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(prof.id);
        email = u?.user?.email ?? null;
      }
    }

    if (!userId) return generic;

    if (!fullName) {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("full_name, phone")
        .eq("id", userId)
        .maybeSingle();
      fullName = prof?.full_name ?? null;
      phone = phone ?? prof?.phone ?? null;
    }

    const code = sixDigits();
    const realEmail = email && !isPlaceholderEmail(email) ? email : null;
    let channel: "email" | "whatsapp" | "admin" = "admin";
    let destination: string | null = null;
    let delivered = false;

    if (realEmail) {
      channel = "email";
      destination = realEmail;
    } else if (phone) {
      channel = "whatsapp";
      destination = phone;
    }

    await supabaseAdmin.from("recovery_requests" as never).insert({
      user_id: userId,
      identifier: raw,
      channel,
      code,
      full_name: fullName,
      destination,
      delivered: false,
    } as never);

    const text = `Buena Vibra Finance: tu código de recuperación es ${code}. Vence en 20 minutos. Si no lo solicitaste, ignora este mensaje.`;

    if (channel === "whatsapp" && destination) {
      delivered = await sendWhatsapp(destination, text);
    }

    if (channel === "email" && destination) {
      // Supabase envía el correo con el enlace de recuperación.
      const site = process.env["SITE_URL"] ?? "";
      const { error } = await supabaseAdmin.auth.resetPasswordForEmail(destination, {
        redirectTo: site ? `${site}/reset-password` : undefined,
      });
      delivered = !error;
      if (error) console.error("[recovery] email error", error.message);
    }

    if (delivered) {
      await supabaseAdmin
        .from("recovery_requests" as never)
        .update({ delivered: true } as never)
        .eq("code", code)
        .eq("user_id", userId);
    }

    return {
      ok: true as const,
      channel,
      hint:
        channel === "email" && destination
          ? maskEmail(destination)
          : channel === "whatsapp" && destination
            ? maskPhone(destination)
            : "",
      message:
        channel === "email"
          ? "Te enviamos un correo con el enlace y el código para restablecer tu contraseña."
          : channel === "whatsapp" && delivered
            ? "Te enviamos un código por WhatsApp."
            : "No pudimos enviarlo automáticamente. El administrador recibió tu solicitud y te enviará el código por WhatsApp.",
    };
  });

/** Public: verify the 6-digit code and set a new password. */
export const verifyRecoveryCode = createServerFn({ method: "POST" })
  .inputValidator((input: { identifier: string; code: string; new_password: string }) => {
    const identifier = (input.identifier ?? "").trim();
    const code = (input.code ?? "").trim();
    const new_password = input.new_password ?? "";
    if (!identifier) throw new Error("Dato requerido");
    if (!/^\d{6}$/.test(code)) throw new Error("El código debe tener 6 dígitos");
    if (new_password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
    if (new_password.length > 72) throw new Error("Contraseña demasiado larga");
    return { identifier, code, new_password };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: reqs } = await supabaseAdmin
      .from("recovery_requests" as never)
      .select("*")
      .eq("identifier", data.identifier)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const req = (reqs ?? [])[0] as
      | { id: string; user_id: string; code: string; expires_at: string; attempts: number }
      | undefined;

    if (!req) throw new Error("Solicitud no encontrada. Pide un código nuevo.");
    if (req.attempts >= 5) throw new Error("Demasiados intentos. Pide un código nuevo.");
    if (new Date(req.expires_at).getTime() < Date.now()) throw new Error("El código venció. Pide uno nuevo.");

    if (req.code !== data.code) {
      await supabaseAdmin
        .from("recovery_requests" as never)
        .update({ attempts: req.attempts + 1 } as never)
        .eq("id", req.id);
      throw new Error("Código incorrecto");
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.user_id, {
      password: data.new_password,
    });
    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from("recovery_requests" as never)
      .update({ used_at: new Date().toISOString() } as never)
      .eq("id", req.id);

    const { data: u } = await supabaseAdmin.auth.admin.getUserById(req.user_id);
    const userEmail = u?.user?.email ?? "";

    return { ok: true as const, email: userEmail };
  });

/** Admin: pending recovery requests, so the code can be forwarded manually. */
export const adminListRecoveryRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Solo administradores");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("recovery_requests" as never)
      .select("id, identifier, channel, code, full_name, destination, delivered, used_at, expires_at, created_at")
      .is("used_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as Array<{
      id: string;
      identifier: string;
      channel: string;
      code: string;
      full_name: string | null;
      destination: string | null;
      delivered: boolean;
      expires_at: string;
      created_at: string;
    }>;
  });
