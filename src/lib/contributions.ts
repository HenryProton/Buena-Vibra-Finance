import { supabase } from "@/integrations/supabase/client";

export type ContributionPayment = {
  id: string;
  contribution_id: string;
  user_id: string;
  channel_id: string | null;
  amount: number;
  payment_date: string;
  note: string | null;
  created_at: string;
};

/** Busca (o crea) la mensualidad del socio para ese mes y devuelve su id. */
export async function ensureContributionId(v: {
  user_id: string;
  year: number;
  month: number;
  num_acciones: number;
  confirmado?: boolean;
  confirmed_by?: string;
}): Promise<string> {
  const { data: existing } = await supabase
    .from("monthly_contributions")
    .select("id")
    .eq("user_id", v.user_id)
    .eq("year", v.year)
    .eq("month", v.month)
    .maybeSingle();
  if (existing) return existing.id;

  const insert: Record<string, unknown> = {
    user_id: v.user_id,
    year: v.year,
    month: v.month,
    num_acciones: v.num_acciones,
    amount: 0,
    status: v.confirmado ? "confirmado" : "reportado",
    reported_at: new Date().toISOString(),
  };
  if (v.confirmado) {
    insert.confirmed_at = new Date().toISOString();
    insert.confirmed_by = v.confirmed_by;
  }
  const { data, error } = await supabase
    .from("monthly_contributions")
    .insert(insert as never)
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** Registra un abono parcial (o total) a la mensualidad, con su pasarela y fecha. */
export async function addContributionPayment(v: {
  contribution_id: string;
  user_id: string;
  amount: number;
  channel_id: string | null;
  payment_date: string;
  note?: string | null;
}) {
  if (!(v.amount > 0)) throw new Error("El monto debe ser mayor que cero");
  const { error } = await supabase.from("contribution_payments").insert({
    contribution_id: v.contribution_id,
    user_id: v.user_id,
    amount: v.amount,
    channel_id: v.channel_id,
    payment_date: v.payment_date,
    note: v.note ?? null,
  });
  if (error) throw error;
}

export async function deleteContributionPayment(id: string) {
  const { error } = await supabase.from("contribution_payments").delete().eq("id", id);
  if (error) throw error;
}
