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
import { formatUSD, daysBetween } from "@/lib/format";
import { useState } from "react";
import { toast } from "sonner";

export function SocioPrestamos() {
  const { user, profile } = useAuth();
  const uid = user!.id;
  const qc = useQueryClient();
  const [openReq, setOpenReq] = useState(false);
  const maxLoan = (profile?.num_acciones ?? 1) * 10 * 10;

  const { data } = useQuery({
    queryKey: ["mis-prestamos", uid],
    queryFn: async () => {
      const [{ data: loans }, { data: payments }] = await Promise.all([
        supabase.from("loans").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
        supabase.from("loan_payments").select("*").eq("user_id", uid),
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
    const mine = payments.filter((p) => p.loan_id === l.id && p.status === "confirmado");
    const paidCap = mine.reduce((a, p) => a + Number(p.amount_capital), 0);
    const paidInt = mine.reduce((a, p) => a + Number(p.amount_interest), 0);
    const cap = Math.max(0, Number(l.principal) - paidCap);
    const dias = daysBetween(l.disbursed_at ?? l.approved_at ?? l.created_at);
    const intGen = Math.max(0, Number(l.principal) * Number(l.daily_rate) * dias - paidInt);
    totalDeuda += cap + intGen;
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
        <p className="text-xs text-muted-foreground">Deuda total actual ({activos.length} préstamo{activos.length === 1 ? "" : "s"} activo{activos.length === 1 ? "" : "s"})</p>
        <p className="text-2xl font-bold">{formatUSD(totalDeuda)}</p>
      </Card>

      <Card className="p-3 text-xs text-muted-foreground">
        Máximo autorizado: <strong>{formatUSD(maxLoan)}</strong> (10× tu aporte mensual)
      </Card>

      {loans.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">Aún no tienes préstamos.</Card>
      )}

      {loans.map((l) => (
        <LoanCard key={l.id} loan={l} payments={payments} userId={uid} onChanged={() => qc.invalidateQueries({ queryKey: ["mis-prestamos", uid] })} />
      ))}
    </div>
  );
}

function LoanCard({ loan, payments, userId, onChanged }: { loan: any; payments: any[]; userId: string; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const mine = payments.filter((p) => p.loan_id === loan.id);
  const paidCap = mine.filter((p) => p.status === "confirmado").reduce((a, p) => a + Number(p.amount_capital), 0);
  const paidInt = mine.filter((p) => p.status === "confirmado").reduce((a, p) => a + Number(p.amount_interest), 0);
  const capActual = Math.max(0, Number(loan.principal) - paidCap);
  const dias = loan.disbursed_at || loan.approved_at ? daysBetween(loan.disbursed_at ?? loan.approved_at) : 0;
  const interesGen = Math.max(0, Number(loan.principal) * Number(loan.daily_rate) * dias - paidInt);

  const reportar = async (v: { capital: number; interes: number; note: string }) => {
    const { error } = await supabase.from("loan_payments").insert({
      loan_id: loan.id,
      user_id: userId,
      amount_capital: v.capital,
      amount_interest: v.interes,
      status: "reportado",
      note: v.note,
    });
    if (error) return toast.error(error.message);
    toast.success("Pago reportado.");
    setOpen(false);
    onChanged();
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-bold text-lg">{formatUSD(Number(loan.principal))}</p>
          <p className="text-xs text-muted-foreground">Tasa: {(Number(loan.daily_rate) * 100).toFixed(2)}% diario · {dias} días</p>
        </div>
        <StatusBadge status={loan.status} />
      </div>

      {loan.status === "activo" && (
        <>
          <div className="grid grid-cols-3 gap-2 text-sm border-t border-border pt-2">
            <div><p className="text-muted-foreground text-xs">Capital pendiente</p><p className="font-semibold">{formatUSD(capActual)}</p></div>
            <div><p className="text-muted-foreground text-xs">Intereses acumulados</p><p className="font-semibold text-primary">{formatUSD(interesGen)}</p></div>
            <div><p className="text-muted-foreground text-xs">Deuda actual</p><p className="font-bold">{formatUSD(capActual + interesGen)}</p></div>
          </div>
          <div className="text-xs text-muted-foreground">
            Abonado: capital {formatUSD(paidCap)} · intereses {formatUSD(paidInt)}
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm" variant="outline" className="w-full">Reportar abono</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Reportar abono</DialogTitle></DialogHeader>
              <AbonoForm defaultInt={interesGen} onSubmit={reportar} />
            </DialogContent>
          </Dialog>
        </>
      )}
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pendiente_aprobacion: { label: "Pendiente", cls: "bg-muted text-muted-foreground" },
    activo: { label: "Activo", cls: "bg-primary/20 text-primary" },
    pagado: { label: "Pagado", cls: "bg-emerald-500/20 text-emerald-600" },
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
        <Label>Monto solicitado (USD)</Label>
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

function AbonoForm({ defaultInt, onSubmit }: { defaultInt: number; onSubmit: (v: { capital: number; interes: number; note: string }) => void }) {
  const [cap, setCap] = useState("0");
  const [intr, setIntr] = useState(defaultInt.toFixed(2));
  const [note, setNote] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ capital: Number(cap), interes: Number(intr), note }); }} className="space-y-3">
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
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Referencia de pago" />
      </div>
      <Button type="submit" className="w-full">Reportar abono</Button>
    </form>
  );
}
