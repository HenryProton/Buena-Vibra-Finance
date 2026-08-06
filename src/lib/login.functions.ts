import { createServerFn } from "@tanstack/react-start";

/** Normaliza un texto para comparar nombres (sin acentos, minúsculas, espacios simples). */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function digits(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Resuelve el correo de acceso a partir de un identificador libre:
 * nombre completo, teléfono, cédula o correo.
 */
async function resolveAccount(identifier: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const id = identifier.trim();
  if (!id) throw new Error("Escribe tu nombre, teléfono o correo");

  const { data: profiles, error } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, phone, cedula, password_set, status");
  if (error) throw new Error(error.message);

  let match: (typeof profiles)[number] | undefined;

  if (id.includes("@")) {
    const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const u = list?.users.find((x) => (x.email ?? "").toLowerCase() === id.toLowerCase());
    if (u) match = profiles?.find((p) => p.id === u.id);
    if (!match && u) {
      return { userId: u.id, email: u.email ?? "", passwordSet: true, fullName: "" };
    }
  }

  if (!match) {
    const n = norm(id);
    const d = digits(id);
    match =
      profiles?.find((p) => norm(p.full_name ?? "") === n) ??
      (d.length >= 7 ? profiles?.find((p) => digits(p.phone ?? "") === d) : undefined) ??
      (d.length >= 5 ? profiles?.find((p) => digits(p.cedula ?? "") === d) : undefined) ??
      profiles?.filter((p) => norm(p.full_name ?? "").startsWith(n) && n.length >= 3)[0];
  }

  if (!match) throw new Error("No encontramos una cuenta con esos datos. Verifica tu nombre o pide ayuda al administrador.");

  const { data: res, error: uErr } = await supabaseAdmin.auth.admin.getUserById(match.id);
  if (uErr || !res.user?.email) throw new Error("No se pudo obtener la cuenta. Contacta al administrador.");

  return {
    userId: match.id,
    email: res.user.email,
    passwordSet: match.password_set !== false,
    fullName: match.full_name ?? "",
  };
}

/** Consulta si un identificador existe y si ya tiene contraseña definida. */
export const lookupAccount = createServerFn({ method: "POST" })
  .inputValidator((input: { identifier: string }) => input)
  .handler(async ({ data }) => {
    const acc = await resolveAccount(data.identifier);
    return { fullName: acc.fullName, passwordSet: acc.passwordSet };
  });

/** Inicio de sesión con nombre / teléfono / correo + contraseña. */
export const loginWithIdentifier = createServerFn({ method: "POST" })
  .inputValidator((input: { identifier: string; password: string }) => input)
  .handler(async ({ data }) => {
    const acc = await resolveAccount(data.identifier);
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"]!;
    const client = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: any, init: any) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: res, error } = await client.auth.signInWithPassword({ email: acc.email, password: data.password });
    if (error || !res.session) throw new Error("Contraseña incorrecta");
    return {
      access_token: res.session.access_token,
      refresh_token: res.session.refresh_token,
    };
  });

/**
 * Primer ingreso sin contraseña: solo para cuentas creadas por el administrador
 * que todavía no han definido una contraseña propia.
 */
export const firstTimeLogin = createServerFn({ method: "POST" })
  .inputValidator((input: { identifier: string }) => input)
  .handler(async ({ data }) => {
    const acc = await resolveAccount(data.identifier);
    if (acc.passwordSet) {
      throw new Error("Esta cuenta ya tiene contraseña. Ingresa con tu contraseña o usa la recuperación.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: acc.email,
    });
    if (error || !link.properties?.hashed_token) throw new Error("No se pudo iniciar el acceso. Contacta al administrador.");
    return { token_hash: link.properties.hashed_token, fullName: acc.fullName };
  });
