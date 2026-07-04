import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatUSD, daysBetween } from "@/lib/format";
import { toast } from "sonner";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

export function AdminPrestamos() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["admin-prestamos"],
    queryFn: async () => {
      const [{ data: loans }, { data: pays }, { data: profiles }] = await Promise.all([
        supabase.from("loans").select("*").order("created_at", { ascending: false }),
        supabase.from("loan_payments").select("*"),
        supabase.from("profiles").select("id, full_name"),
      ]);
      return { loans: loans ?? [], pays: pays ?? [], profiles: profiles ?? [] };
    },
  });

  const nameOf = (uid: string) => data?.profiles.find((p) => p.id === uid)?.full_name ?? "?";

  const updateLoan = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await supabase.from("loans").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Actualizado"); qc.invalidateQueries({ queryKey: ["admin-prestamos"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmPay = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("loan_payments").update({ status: "confirmado", confirmed_at: new Date().toISOString(), confirmed_by: user!.id }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Confirmado"); qc.invalidateQueries({ queryKey: ["admin-prestamos"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendientes = (data?.loans ?? []).filter((l) => l.status === "pendiente_aprobacion");
  const activos = (data?.loans ?? []).filter((l) => l.status === "activo");
  const pagosPend = (data?.pays ?? []).filter((p) => p.status === "reportado");

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Préstamos</h2>

      {pendientes.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-primary">Solicitudes ({pendientes.length})</h3>
          {pendientes.map((l) => (
            <SolicitudCard key={l.id} loan={l} name={nameOf(l.user_id)}
              onApprove={(rate) => updateLoan.mutate({ id: l.id, patch: { status: "activo", daily_rate: rate, approved_at: new Date().toISOString(), approved_by: user!.id, disbursed_at: new Date().toISOString() } })}
              onReject={() => updateLoan.mutate({ id: l.id, patch: { status: "rechazado" } })}
            />
          ))}
        </section>
      )}

      {pagosPend.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-primary">Abonos por confirmar ({pagosPend.length})</h3>
          {pagosPend.map((p) => (
            <Card key={p.id} className="p-3 space-y-2">
              <div className="flex justify-between">
                <div>
                  <p className="text-sm font-medium">{nameOf(p.user_id)}</p>
                  <p className="text-xs text-muted-foreground">Cap {formatUSD(Number(p.amount_capital))} · Int {formatUSD(Number(p.amount_interest))}</p>
                  {p.note && <p className="text-xs mt-1">{p.note}</p>}
                </div>
              </div>
              <Button size="sm" onClick={() => confirmPay.mutate(p.id)}>Confirmar abono</Button>
            </Card>
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Activos ({activos.length})</h3>
        {activos.map((l) => {
          const paid = (data?.pays ?? []).filter((p) => p.loan_id === l.id && p.status === "confirmado");
          const paidCap = paid.reduce((a, p) => a + Number(p.amount_capital), 0);
          const paidInt = paid.reduce((a, p) => a + Number(p.amount_interest), 0);
          const dias = daysBetween(l.disbursed_at ?? l.approved_at ?? l.created_at);
          const intGen = Math.max(0, Number(l.principal) * Number(l.daily_rate) * dias - paidInt);
          const cap = Math.max(0, Number(l.principal) - paidCap);
          return (
            <Card key={l.id} className="p-3 space-y-1">
              <div className="flex justify-between">
                <p className="font-medium">{nameOf(l.user_id)}</p>
                <p className="font-bold">{formatUSD(Number(l.principal))}</p>
              </div>
              <div className="text-xs text-muted-foreground">
                Cap pendiente: {formatUSD(cap)} · Int acumulado: {formatUSD(intGen)} · {dias} días · {(Number(l.daily_rate) * 100).toFixed(2)}%/día
              </div>
              {cap === 0 && intGen === 0 && (
                <Button size="sm" variant="outline" onClick={() => updateLoan.mutate({ id: l.id, patch: { status: "pagado" } })}>Marcar pagado</Button>
              )}
            </Card>
          );
        })}
      </section>
    </div>
  );
}

function SolicitudCard({ loan, name, onApprove, onReject }: { loan: any; name: string; onApprove: (rate: number) => void; onReject: () => void }) {
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState("1.00");
  return (
    <Card className="p-4 space-y-2">
      <div className="flex justify-between">
        <div>
          <p className="font-medium">{name}</p>
          {loan.note && <p className="text-xs text-muted-foreground">{loan.note}</p>}
        </div>
        <p className="font-bold">{formatUSD(Number(loan.principal))}</p>
      </div>
      <div className="flex gap-2">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm">Aprobar</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Aprobar préstamo</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Tasa de interés diario (%)</Label>
                <Input type="number" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
                <p className="text-xs text-muted-foreground">Default 1%. Ajustable individualmente.</p>
              </div>
              <Button className="w-full" onClick={() => { onApprove(Number(rate) / 100); setOpen(false); }}>Confirmar aprobación</Button>
            </div>
          </DialogContent>
        </Dialog>
        <Button size="sm" variant="outline" onClick={onReject}>Rechazar</Button>
      </div>
    </Card>
  );
}
