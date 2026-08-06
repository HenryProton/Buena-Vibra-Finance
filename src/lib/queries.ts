import { useEffect } from "react";
import { setDefaultPausedMonths } from "@/lib/loan-math";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useCajaSettings() {
  return useQuery({
    queryKey: ["caja-settings"],
    queryFn: async () => {
      const { data } = await supabase.from("caja_settings").select("*").maybeSingle();
      return data;
    },
  });
}

/** Meses en los que la caja está pausada: no se generan intereses ni aportes obligatorios. */
export function useCajaPauses() {
  const q = useQuery({
    queryKey: ["caja-pauses"],
    queryFn: async () => {
      const { data } = await supabase
        .from("caja_pauses")
        .select("*")
        .order("year")
        .order("month");
      return data ?? [];
    },
  });
  const rows = q.data ?? [];
  const keys = rows.map((r) => `${r.year}-${String(r.month).padStart(2, "0")}`);
  const isPausedMonth = (year: number, month: number) =>
    keys.includes(`${year}-${String(month).padStart(2, "0")}`);
  useEffect(() => {
    setDefaultPausedMonths(keys);
  }, [keys.join(",")]);
  return { ...q, rows, pausedMonths: keys, isPausedMonth };
}

export function useChannels(onlyActive = false) {
  return useQuery({
    queryKey: ["channels", onlyActive],
    queryFn: async () => {
      let q = supabase.from("channels").select("*").order("orden");
      if (onlyActive) q = q.eq("activo", true);
      const { data } = await q;
      return data ?? [];
    },
  });
}

/** Saldo disponible de una pasarela (fuente de verdad en el servidor). Solo admins. */
export function useChannelBalance(channelId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ["channel-balance", channelId],
    enabled: !!channelId && enabled,
    queryFn: async () => {
      const { getChannelBalance } = await import("@/lib/channels.functions");
      return await getChannelBalance({ data: { channelId: channelId as string } });
    },
  });
}

/** Abonos parciales de mensualidades (todos, o los de un socio). */
export function useContributionPayments(userId?: string | null) {
  return useQuery({
    queryKey: ["contribution-payments", userId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("contribution_payments").select("*").order("payment_date", { ascending: false });
      if (userId) q = q.eq("user_id", userId);
      const { data } = await q;
      return data ?? [];
    },
  });
}
