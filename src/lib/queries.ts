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
