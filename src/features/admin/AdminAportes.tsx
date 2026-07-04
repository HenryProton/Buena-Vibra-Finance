import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatUSD, MONTHS_ES } from "@/lib/format";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

export function AdminAportes() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["admin-aportes"],
    queryFn: async () => {
      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.from("monthly_contributions").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name"),
      ]);
      return { contribs: c ?? [], profiles: p ?? [] };
    },
  });

  const confirm = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "confirmado" | "pendiente" }) => {
      const patch: any = { status };
      if (status === "confirmado") { patch.confirmed_at = new Date().toISOString(); patch.confirmed_by = user!.id; }
      const { error } = await supabase.from("monthly_contributions").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Actualizado"); qc.invalidateQueries({ queryKey: ["admin-aportes"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const nameOf = (uid: string) => data?.profiles.find((p) => p.id === uid)?.full_name ?? "?";

  const reportados = (data?.contribs ?? []).filter((c) => c.status === "reportado");
  const otros = (data?.contribs ?? []).filter((c) => c.status !== "reportado");

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Aportes</h2>

      {reportados.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-primary">Por confirmar ({reportados.length})</h3>
          {reportados.map((a) => (
            <Card key={a.id} className="p-4 space-y-2">
              <div className="flex justify-between">
                <div>
                  <p className="font-medium">{nameOf(a.user_id)}</p>
                  <p className="text-xs text-muted-foreground">{MONTHS_ES[a.month - 1]} {a.year} · {a.num_acciones} acc</p>
                  {a.note && <p className="text-xs mt-1">{a.note}</p>}
                </div>
                <p className="font-bold">{formatUSD(Number(a.amount))}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => confirm.mutate({ id: a.id, status: "confirmado" })}>Confirmar</Button>
                <Button size="sm" variant="outline" onClick={() => confirm.mutate({ id: a.id, status: "pendiente" })}>Rechazar</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Historial</h3>
        {otros.map((a) => (
          <Card key={a.id} className="p-3 flex justify-between items-center">
            <div>
              <p className="text-sm font-medium">{nameOf(a.user_id)}</p>
              <p className="text-xs text-muted-foreground">{MONTHS_ES[a.month - 1]} {a.year}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold">{formatUSD(Number(a.amount))}</p>
              <Badge variant={a.status === "confirmado" ? "default" : "secondary"}>{a.status}</Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
