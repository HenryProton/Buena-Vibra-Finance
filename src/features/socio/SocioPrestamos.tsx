import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatUSD, formatDateVE } from "@/lib/format";
import { projectDebt, rateLabel, daysSinceLastPayment, type RateType } from "@/lib/loan-math";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, Calculator } from "lucide-react";
import { useCajaSettings, useChannels } from "@/lib/queries";
import { LoanSimulator } from "@/components/LoanSimulator";

export function SocioPrestamos() {
  const { user, profile } = useAuth();
  const uid = user!.id;
  const qc = useQueryClient();
  const [openReq, setOpenReq] = useState(false);
  const { data: settings } = useCajaSettings();
  const { data: channels = [] } = useChannels(true);
  const aporteMes = (profile?.num_acciones ?? 1) * Number(settings?.aporte_mensual ?? 10);
  const maxLoan = aporteMes * 10;

  const { data } = useQuery({
    queryKey: ["mis-prestamos", uid],
    queryFn: async () => {
      const [{ data: loans }, { data: payments }] = await Promise.all([
        supabase.from("loans").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
        supabase.from("loan_payments").select("*").eq("user_id", uid).order("payment_date", { ascending: false }),
      ]);
      return { loans: loans ?? [], payments: payments ?? [] };
    },
  });

  const solicitar = useMutation({
    mutationFn: async (input: { principal: number; note: string }) => {
      if (input.principal > maxLoan) throw new Error(`Máximo permitido: ${formatUSD(maxLoan)}`);
      const { error } = await supabase.from("loans").insert({
        user_id: uid,
        principal: input.principal,
        daily_rate: 0.01,
        rate_type: "daily",
        rate_value: 1,
        status: "pendiente_aprobacion",
        note: input.note,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Solicitud enviada. Espera aprobación del admin.");
      qc.invalidateQueries({ queryKey: ["mis-prestamos", uid] });
      setOpenReq(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const loans = data?.loans ?? [];
  const payments = data?.payments ?? [];
  const activos = loans.filter((l) => l.status === "activo");
  let totalDeuda = 0;
  activos.forEach((l) => {
    const mine = payments.filter((p) => p.loan_id === l.id);
    const d = projectDebt({
      principal: Number(l.principal),
      rateType: l.rate_type as RateType,
      rateValue: Number(l.rate_value),
      startDate: l.disbursed_at ?? l.approved_at ?? l.created_at,
      payments: mine,
    });
    totalDeuda += d.total;
  });


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Mis préstamos</h2>
        <Dialog open={openReq} onOpenChange={setOpenReq}>
          <DialogTrigger asChild><Button size="sm">Solicitar</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Solicitar préstamo</DialogTitle></DialogHeader>
            <SolicitudForm max={maxLoan} onSubmit={(v) => solicitar.mutate(v)} loading={solicitar.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4 space-y-1">
        <p className="text-xs text-muted-foreground">Deuda total actual ({activos.length} préstamo{activos.length === 1 ? "" : "s"})</p>
        <p className="text-2xl font-bold">{formatUSD(totalDeuda)}</p>
      </Card>

      <LoanSimulator scope="mine" userId={uid} />

      <Card className="p-3 text-xs text-muted-foreground">

        Máximo autorizado: <strong>{formatUSD(maxLoan)}</strong> (10× tu aporte mensual)
      </Card>

      {loans.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">Aún no tienes préstamos.</Card>
      )}

      {loans.map((l) => (
        <LoanCard key={l.id} loan={l} payments={payments.filter((p) => p.loan_id === l.id)} channels={channels} userId={uid} onChanged={() => qc.invalidateQueries({ queryKey: ["mis-prestamos", uid] })} />
      ))}
    </div>
  );
}

function LoanCard({ loan, payments, channels, userId, onChanged }: { loan: any; payments: any[]; channels: any[]; userId: string; onChanged: () => void }) {
  const [openPay, setOpenPay] = useState(false);
  const [openSim, setOpenSim] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const confirmed = payments.filter((p) => p.status === "confirmado");
  const paidCap = confirmed.reduce((a, p) => a + Number(p.amount_capital), 0);
  const paidInt = confirmed.reduce((a, p) => a + Number(p.amount_interest), 0);
  const start = loan.disbursed_at ?? loan.approved_at ?? loan.created_at;
  const d = loan.status === "activo"
    ? projectDebt({ principal: Number(loan.principal), rateType: loan.rate_type as RateType, rateValue: Number(loan.rate_value), startDate: start, payments: confirmed })
    : { capital: 0, interes: 0, total: 0, days: 0 };

  const chName = (id?: string | null) => channels.find((c) => c.id === id)?.nombre ?? "—";

  const reportar = async (v: { capital: number; interes: number; note: string; channel_id: string | null; payment_date: string }) => {
    const { error } = await supabase.from("loan_payments").insert({
      loan_id: loan.id,
      user_id: userId,
      amount_capital: v.capital,
      amount_interest: v.interes,
      status: "reportado",
      note: v.note,
      channel_id: v.channel_id,
      payment_date: v.payment_date,
    });
    if (error) return toast.error(error.message);
    toast.success("Pago reportado.");
    setOpenPay(false);
    onChanged();
  };


  return (
    <Card className="p-4 space-y-3">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-start justify-between text-left">
        <div>
          <p className="font-bold text-lg">{formatUSD(Number(loan.principal))}</p>
          <p className="text-xs text-muted-foreground">{rateLabel(loan.rate_type as RateType, Number(loan.rate_value))} · {d.days} días</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={loan.status} />
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {loan.status === "activo" && (
        <div className="grid grid-cols-3 gap-2 text-sm border-t border-border pt-2">
          <div><p className="text-muted-foreground text-xs">Capital</p><p className="font-semibold">{formatUSD(d.capital)}</p></div>
          <div><p className="text-muted-foreground text-xs">Interés</p><p className="font-semibold text-primary">{formatUSD(d.interes)}</p></div>
          <div><p className="text-muted-foreground text-xs">Deuda</p><p className="font-bold">{formatUSD(d.total)}</p></div>
        </div>
      )}

      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleContent className="space-y-3 pt-2 border-t border-border">
          <div className="text-xs text-muted-foreground space-y-1">
            <p>Fecha de desembolso: {start ? formatDateVE(start) : "—"}</p>
            {loan.disbursement_channel_id && <p>Canal de desembolso: {chName(loan.disbursement_channel_id)}</p>}
            {loan.note && <p>Nota: {loan.note}</p>}
          </div>

          <div>
            <p className="text-xs font-semibold mb-2">Abonos ({payments.length})</p>
            {payments.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sin abonos aún.</p>
            ) : (
              <div className="space-y-1">
                {payments.map((p) => (
                  <div key={p.id} className="flex justify-between text-xs py-1 border-b border-border last:border-0">
                    <div>
                      <p className="font-medium">{formatDateVE(p.payment_date || p.reported_at)}</p>
                      <p className="text-muted-foreground">{chName(p.channel_id)} · {p.status}</p>
                    </div>
                    <div className="text-right">
                      <p>Cap {formatUSD(Number(p.amount_capital))}</p>
                      <p className="text-primary">Int {formatUSD(Number(p.amount_interest))}</p>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between text-xs font-bold pt-2">
                  <span>Total abonado</span>
                  <span>{formatUSD(paidCap + paidInt)}</span>
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {loan.status === "activo" && (
        <div className="flex gap-2">
          <Dialog open={openSim} onOpenChange={setOpenSim}>
            <DialogTrigger asChild><Button size="sm" variant="outline" className="flex-1"><Calculator className="h-3 w-3 mr-1" />Simular</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Simulador de pago</DialogTitle></DialogHeader>
              <Simulator loan={loan} paidCap={paidCap} paidInt={paidInt} />
            </DialogContent>
          </Dialog>
          <Dialog open={openPay} onOpenChange={setOpenPay}>
            <DialogTrigger asChild><Button size="sm" className="flex-1">Reportar abono</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Reportar abono</DialogTitle></DialogHeader>
              <AbonoForm defaultInt={d.interes} channels={channels} onSubmit={reportar} />
            </DialogContent>
          </Dialog>
        </div>
      )}
    </Card>
  );
}

function Simulator({ loan, paidCap, paidInt }: { loan: any; paidCap: number; paidInt: number }) {
  const [dias, setDias] = useState("0");
  const start = loan.disbursed_at ?? loan.approved_at ?? loan.created_at;
  const d = projectDebt({
    principal: Number(loan.principal),
    rateType: loan.rate_type as RateType,
    rateValue: Number(loan.rate_value),
    startDate: start,
    paidCapital: paidCap,
    paidInterest: paidInt,
    extraDays: Number(dias) || 0,
  });
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label>¿En cuántos días vas a pagar?</Label>
        <Input type="number" min={0} value={dias} onChange={(e) => setDias(e.target.value)} />
        <p className="text-xs text-muted-foreground">Tasa: {rateLabel(loan.rate_type as RateType, Number(loan.rate_value))}</p>
      </div>
      <Card className="p-4 space-y-2 bg-muted/30">
        <div className="flex justify-between text-sm"><span>Capital pendiente</span><span className="font-semibold">{formatUSD(d.capital)}</span></div>
        <div className="flex justify-between text-sm"><span>Intereses proyectados</span><span className="font-semibold text-primary">{formatUSD(d.interes)}</span></div>
        <div className="flex justify-between text-base pt-2 border-t border-border"><span className="font-semibold">Total a pagar</span><span className="font-bold">{formatUSD(d.total)}</span></div>
        <p className="text-[11px] text-muted-foreground pt-1">En {d.days} días desde el desembolso.</p>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pendiente_aprobacion: { label: "Pendiente", cls: "bg-muted text-muted-foreground" },
    activo: { label: "Activo", cls: "bg-primary/20 text-primary" },
    pagado: { label: "PAGADO ✅", cls: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-bold" },
    consolidado: { label: "Consolidado", cls: "bg-blue-500/20 text-blue-700" },
    rechazado: { label: "Rechazado", cls: "bg-destructive/20 text-destructive" },
  };
  const s = map[status] ?? { label: status, cls: "" };
  return <Badge className={s.cls}>{s.label}</Badge>;
}


function SolicitudForm({ max, onSubmit, loading }: { max: number; onSubmit: (v: { principal: number; note: string }) => void; loading: boolean }) {
  const [principal, setPrincipal] = useState("");
  const [note, setNote] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ principal: Number(principal), note }); }} className="space-y-3">
      <div className="space-y-1">
        <Label>Monto (USD)</Label>
        <Input type="number" step="0.01" max={max} value={principal} onChange={(e) => setPrincipal(e.target.value)} required />
        <p className="text-xs text-muted-foreground">Máx: {formatUSD(max)}</p>
      </div>
      <div className="space-y-1">
        <Label>Motivo (opcional)</Label>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Enviando..." : "Solicitar"}</Button>
    </form>
  );
}

function AbonoForm({ defaultInt, channels, onSubmit }: { defaultInt: number; channels: any[]; onSubmit: (v: { capital: number; interes: number; note: string; channel_id: string | null; payment_date: string }) => void }) {
  const [cap, setCap] = useState("0");
  const [intr, setIntr] = useState(defaultInt.toFixed(2));
  const [note, setNote] = useState("");
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ capital: Number(cap), interes: Number(intr), note, channel_id: channelId || null, payment_date: date }); }} className="space-y-3">
      <div className="space-y-1">
        <Label>Fecha del pago</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label>Canal</Label>
        <Select value={channelId} onValueChange={setChannelId}>
          <SelectTrigger><SelectValue placeholder="Elegir canal" /></SelectTrigger>
          <SelectContent>{channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Abono a intereses</Label>
        <Input type="number" step="0.01" value={intr} onChange={(e) => setIntr(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label>Abono a capital</Label>
        <Input type="number" step="0.01" value={cap} onChange={(e) => setCap(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label>Nota</Label>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Referencia" />
      </div>
      <Button type="submit" className="w-full">Reportar</Button>
    </form>
  );

}
