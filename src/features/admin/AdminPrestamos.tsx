import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatUSD } from "@/lib/format";
import { projectDebt, rateLabel, type RateType } from "@/lib/loan-math";
import { toast } from "sonner";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useChannels } from "@/lib/queries";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";

export function AdminPrestamos() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: channels = [] } = useChannels();
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
  const chName = (id?: string | null) => channels.find((c) => c.id === id)?.nombre ?? "—";

  const updateLoan = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await supabase.from("loans").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Actualizado"); qc.invalidateQueries({ queryKey: ["admin-prestamos"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmPay = useMutation({
    mutationFn: async ({ id, channel_id }: { id: string; channel_id: string | null }) => {
      const { error } = await supabase.from("loan_payments").update({
        status: "confirmado",
        confirmed_at: new Date().toISOString(),
        confirmed_by: user!.id,
        ...(channel_id ? { channel_id } : {}),
      }).eq("id", id);
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
            <SolicitudCard key={l.id} loan={l} name={nameOf(l.user_id)} channels={channels}
              onApprove={(v) => updateLoan.mutate({ id: l.id, patch: {
                status: "activo",
                rate_type: v.rate_type,
                rate_value: v.rate_value,
                daily_rate: v.rate_type === "daily" ? v.rate_value / 100 : v.rate_value / 100 / 30,
                disbursement_channel_id: v.channel_id,
                approved_at: new Date().toISOString(),
                approved_by: user!.id,
                disbursed_at: new Date().toISOString(),
              }})}
              onReject={() => updateLoan.mutate({ id: l.id, patch: { status: "rechazado" } })}
            />
          ))}
        </section>
      )}

      {pagosPend.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-primary">Abonos por confirmar ({pagosPend.length})</h3>
          {pagosPend.map((p) => (
            <ConfirmarPagoCard key={p.id} payment={p} name={nameOf(p.user_id)} channels={channels} chName={chName}
              onConfirm={(channel_id) => confirmPay.mutate({ id: p.id, channel_id })} />
          ))}
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Activos ({activos.length})</h3>
        {activos.map((l) => {
          const paid = (data?.pays ?? []).filter((p) => p.loan_id === l.id && p.status === "confirmado");
          const paidCap = paid.reduce((a, p) => a + Number(p.amount_capital), 0);
          const paidInt = paid.reduce((a, p) => a + Number(p.amount_interest), 0);
          const d = projectDebt({
            principal: Number(l.principal), rateType: l.rate_type as RateType, rateValue: Number(l.rate_value),
            startDate: l.disbursed_at ?? l.approved_at ?? l.created_at, paidCapital: paidCap, paidInterest: paidInt,
          });
          return (
            <Card key={l.id} className="p-3 space-y-1">
              <div className="flex justify-between">
                <p className="font-medium">{nameOf(l.user_id)}</p>
                <p className="font-bold">{formatUSD(Number(l.principal))}</p>
              </div>
              <div className="text-xs text-muted-foreground">
                Cap pend: {formatUSD(d.capital)} · Int: {formatUSD(d.interes)} · {d.days}d · {rateLabel(l.rate_type as RateType, Number(l.rate_value))}
              </div>
              <div className="text-xs text-muted-foreground">Canal: {chName(l.disbursement_channel_id)}</div>
              {d.capital === 0 && d.interes === 0 && (
                <Button size="sm" variant="outline" onClick={() => updateLoan.mutate({ id: l.id, patch: { status: "pagado" } })}>Marcar pagado</Button>
              )}
            </Card>
          );
        })}
      </section>
    </div>
  );
}

function SolicitudCard({ loan, name, channels, onApprove, onReject }: { loan: any; name: string; channels: any[]; onApprove: (v: { rate_type: RateType; rate_value: number; channel_id: string | null }) => void; onReject: () => void }) {
  const [open, setOpen] = useState(false);
  const [rateType, setRateType] = useState<RateType>("daily");
  const [rateValue, setRateValue] = useState("1");
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
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
                <Label>Tipo de tasa</Label>
                <Select value={rateType} onValueChange={(v) => setRateType(v as RateType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Diaria</SelectItem>
                    <SelectItem value="monthly">Mensual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Valor (%) {rateType === "daily" ? "diario" : "mensual"}</Label>
                <Input type="number" step="0.01" value={rateValue} onChange={(e) => setRateValue(e.target.value)} />
                <p className="text-xs text-muted-foreground">Ej: 1 diario, 10/20/30 mensual.</p>
              </div>
              <div className="space-y-1">
                <Label>Canal de desembolso</Label>
                <Select value={channelId} onValueChange={setChannelId}>
                  <SelectTrigger><SelectValue placeholder="Elegir" /></SelectTrigger>
                  <SelectContent>{channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={() => { onApprove({ rate_type: rateType, rate_value: Number(rateValue), channel_id: channelId || null }); setOpen(false); }}>Confirmar</Button>
            </div>
          </DialogContent>
        </Dialog>
        <Button size="sm" variant="outline" onClick={onReject}>Rechazar</Button>
      </div>
    </Card>
  );
}

function ConfirmarPagoCard({ payment, name, channels, chName, onConfirm }: { payment: any; name: string; channels: any[]; chName: (id?: string | null) => string; onConfirm: (channel_id: string | null) => void }) {
  const [channelId, setChannelId] = useState<string>(payment.channel_id ?? channels[0]?.id ?? "");
  return (
    <Card className="p-3 space-y-2">
      <div className="flex justify-between">
        <div>
          <p className="text-sm font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">Cap {formatUSD(Number(payment.amount_capital))} · Int {formatUSD(Number(payment.amount_interest))}</p>
          <p className="text-xs text-muted-foreground">Canal reportado: {chName(payment.channel_id)}</p>
          {payment.note && <p className="text-xs mt-1">{payment.note}</p>}
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Confirmar en canal</Label>
        <Select value={channelId} onValueChange={setChannelId}>
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>{channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <Button size="sm" onClick={() => onConfirm(channelId || null)}>Confirmar abono</Button>
    </Card>
  );
}
