import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatUSD } from "@/lib/format";
import { projectDebt, rateLabel, type RateType } from "@/lib/loan-math";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useChannels } from "@/lib/queries";
import { Textarea } from "@/components/ui/textarea";
import { Plus, ChevronDown, Pencil, Trash2, Merge } from "lucide-react";

export function AdminPrestamos() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: channels = [] } = useChannels();
  const { data } = useQuery({
    queryKey: ["admin-prestamos"],
    queryFn: async () => {
      const [{ data: loans }, { data: pays }, { data: profiles }] = await Promise.all([
        supabase.from("loans").select("*").order("created_at", { ascending: false }),
        supabase.from("loan_payments").select("*").order("payment_date", { ascending: false }),
        supabase.from("profiles").select("id, full_name, status"),
      ]);
      return { loans: loans ?? [], pays: pays ?? [], profiles: profiles ?? [] };
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-prestamos"] });
  const nameOf = (uid: string) => data?.profiles.find((p) => p.id === uid)?.full_name ?? "?";
  const chName = (id?: string | null) => channels.find((c) => c.id === id)?.nombre ?? "—";

  const updateLoan = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const { error } = await supabase.from("loans").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Actualizado"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteLoan = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("loan_payments").delete().eq("loan_id", id);
      const { error } = await supabase.from("loans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Préstamo eliminado"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmPay = useMutation({
    mutationFn: async ({ id, channel_id }: { id: string; channel_id: string | null }) => {
      const { error } = await supabase.from("loan_payments").update({
        status: "confirmado", confirmed_at: new Date().toISOString(), confirmed_by: user!.id,
        ...(channel_id ? { channel_id } : {}),
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Confirmado"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendientes = (data?.loans ?? []).filter((l) => l.status === "pendiente_aprobacion");
  const activos = (data?.loans ?? []).filter((l) => l.status === "activo");
  const historicos = (data?.loans ?? []).filter((l) => l.status === "pagado" || l.status === "consolidado" || l.status === "rechazado");
  const pagosPend = (data?.pays ?? []).filter((p) => p.status === "reportado");

  const activosByUser = useMemo(() => {
    const m: Record<string, any[]> = {};
    // Orden cronológico ascendente por fecha de desembolso dentro de cada socio
    const sorted = [...activos].sort((a, b) => {
      const da = new Date(a.disbursed_at ?? a.approved_at ?? a.created_at).getTime();
      const db = new Date(b.disbursed_at ?? b.approved_at ?? b.created_at).getTime();
      return da - db;
    });
    for (const l of sorted) (m[l.user_id] ??= []).push(l);
    return m;
  }, [activos]);


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Préstamos</h2>
        <NuevoPrestamoDialog profiles={data?.profiles ?? []} channels={channels} userId={user!.id} onCreated={invalidate} />
      </div>

      {pendientes.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-primary">Solicitudes ({pendientes.length})</h3>
          {pendientes.map((l) => (
            <SolicitudCard key={l.id} loan={l} name={nameOf(l.user_id)} channels={channels}
              onApprove={(v) => updateLoan.mutate({ id: l.id, patch: {
                status: "activo", rate_type: v.rate_type, rate_value: v.rate_value,
                daily_rate: v.rate_type === "daily" ? v.rate_value / 100 : v.rate_value / 100 / 30,
                disbursement_channel_id: v.channel_id,
                approved_at: new Date().toISOString(), approved_by: user!.id, disbursed_at: new Date().toISOString(),
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

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">Activos ({activos.length})</h3>
        {Object.entries(activosByUser).map(([uid, loans]) => (
          <div key={uid} className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className="text-sm font-semibold">{nameOf(uid)} <span className="text-xs text-muted-foreground">({loans.length})</span></p>
              {loans.length > 1 && (
                <ConsolidarDialog loans={loans} pays={data?.pays ?? []} channels={channels} adminId={user!.id} onDone={invalidate} />
              )}
            </div>
            {loans.map((l) => (
              <LoanAdminCard key={l.id} loan={l} pays={(data?.pays ?? []).filter((p) => p.loan_id === l.id)} channels={channels} chName={chName}
                adminId={user!.id} onChanged={invalidate}
                onDelete={() => { if (window.confirm("¿Eliminar este préstamo y todos sus abonos?")) deleteLoan.mutate(l.id); }}
                onUpdate={(patch: any) => updateLoan.mutate({ id: l.id, patch })}
              />
            ))}
          </div>
        ))}
        {activos.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Sin préstamos activos.</p>}
      </section>

      {historicos.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Histórico ({historicos.length})</h3>
          {historicos.map((l) => (
            <LoanAdminCard key={l.id} loan={l} pays={(data?.pays ?? []).filter((p) => p.loan_id === l.id)} channels={channels} chName={chName}
              adminId={user!.id} onChanged={invalidate}
              onDelete={() => { if (window.confirm("¿Eliminar este préstamo y todos sus abonos?")) deleteLoan.mutate(l.id); }}
              onUpdate={(patch: any) => updateLoan.mutate({ id: l.id, patch })}
              nameOf={nameOf}
              consolidatedTarget={historicos.find((x) => x.id === l.consolidated_into) || (data?.loans ?? []).find((x) => x.id === l.consolidated_into)}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function LoanAdminCard({ loan, pays, channels, chName, adminId, onChanged, onDelete, onUpdate, nameOf, consolidatedTarget }: any) {
  const [open, setOpen] = useState(false);
  const confirmed = pays.filter((p: any) => p.status === "confirmado");
  const paidCap = confirmed.reduce((a: number, p: any) => a + Number(p.amount_capital), 0);
  const paidInt = confirmed.reduce((a: number, p: any) => a + Number(p.amount_interest), 0);
  const start = loan.disbursed_at ?? loan.approved_at ?? loan.created_at;
  const d = loan.status === "activo"
    ? projectDebt({ principal: Number(loan.principal), rateType: loan.rate_type as RateType, rateValue: Number(loan.rate_value), startDate: start, payments: confirmed })
    : { capital: 0, interes: 0, total: 0, days: 0 };

  const statusBadge: Record<string, string> = {
    activo: "bg-primary/20 text-primary",
    pagado: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-bold",
    consolidado: "bg-blue-500/20 text-blue-700",
    rechazado: "bg-destructive/20 text-destructive",
  };
  const statusLabel: Record<string, string> = {
    activo: "activo",
    pagado: "PAGADO ✅",
    consolidado: "consolidado",
    rechazado: "rechazado",
  };


  return (
    <Card className="p-3 space-y-2">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="w-full text-left">
          <div className="flex justify-between items-start">
            <div className="min-w-0">
              {nameOf && <p className="text-xs text-muted-foreground truncate">{nameOf(loan.user_id)}</p>}
              <p className="font-bold">{formatUSD(Number(loan.principal))}</p>
              <p className="text-[11px] text-muted-foreground">{rateLabel(loan.rate_type as RateType, Number(loan.rate_value))} · {new Date(start).toLocaleDateString("es-VE")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={statusBadge[loan.status] ?? ""}>{statusLabel[loan.status] ?? loan.status}</Badge>
              <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </div>
          </div>
          {loan.status === "activo" && (
            <div className="grid grid-cols-3 gap-2 text-xs mt-2">
              <div><span className="text-muted-foreground">Cap </span><span className="font-semibold">{formatUSD(d.capital)}</span></div>
              <div><span className="text-muted-foreground">Int </span><span className="font-semibold text-primary">{formatUSD(d.interes)}</span></div>
              <div><span className="text-muted-foreground">Deuda </span><span className="font-bold">{formatUSD(d.total)}</span></div>
            </div>
          )}
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 pt-2 border-t border-border mt-2">
          {loan.note && <p className="text-xs text-muted-foreground">Nota: {loan.note}</p>}
          {consolidatedTarget && (
            <p className="text-xs text-blue-700">Consolidado en préstamo {formatUSD(Number(consolidatedTarget.principal))} del {new Date(consolidatedTarget.created_at).toLocaleDateString("es-VE")}.</p>
          )}

          <div>
            <p className="text-xs font-semibold mb-1">Abonos ({pays.length})</p>
            {pays.length === 0 ? <p className="text-xs text-muted-foreground">Sin abonos.</p> : (
              <div className="space-y-1">
                {pays.map((p: any) => (
                  <PagoRow key={p.id} p={p} channels={channels} chName={chName} adminId={adminId} onChanged={onChanged} />
                ))}
                <div className="flex justify-between text-xs font-bold pt-1 border-t border-border">
                  <span>Total abonado</span>
                  <span>{formatUSD(paidCap + paidInt)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            {loan.status === "activo" && (
              <>
                <RegistrarAbonoDialog loan={loan} defaultInt={d.interes} channels={channels} adminId={adminId} onDone={onChanged} />
                {d.capital === 0 && d.interes === 0 && (
                  <Button size="sm" variant="outline" onClick={() => onUpdate({ status: "pagado" })}>Marcar pagado</Button>
                )}
              </>
            )}
            <EditarPrestamoDialog loan={loan} channels={channels} onSave={onUpdate} />
            <Button size="sm" variant="destructive" onClick={onDelete}><Trash2 className="h-3 w-3 mr-1" />Eliminar</Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function PagoRow({ p, channels, chName, adminId, onChanged }: any) {
  const [edit, setEdit] = useState(false);
  const [cap, setCap] = useState(String(p.amount_capital));
  const [intr, setIntr] = useState(String(p.amount_interest));
  const [chId, setChId] = useState(p.channel_id ?? "");
  const [date, setDate] = useState((p.payment_date ?? p.reported_at ?? "").slice(0, 10));

  const save = async () => {
    const { error } = await supabase.from("loan_payments").update({
      amount_capital: Number(cap), amount_interest: Number(intr),
      channel_id: chId || null, payment_date: date || null,
      status: "confirmado", confirmed_at: new Date().toISOString(), confirmed_by: adminId,
    }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Abono actualizado"); setEdit(false); onChanged();
  };
  const del = async () => {
    if (!confirm("¿Eliminar este abono?")) return;
    const { error } = await supabase.from("loan_payments").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Abono eliminado"); onChanged();
  };

  return (
    <div className="text-xs py-1 border-b border-border last:border-0">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <p className="font-medium">{new Date(p.payment_date || p.reported_at).toLocaleDateString("es-VE")} <span className="text-muted-foreground">· {chName(p.channel_id)} · {p.status}</span></p>
          <p>Cap <b>{formatUSD(Number(p.amount_capital))}</b> · Int <b className="text-primary">{formatUSD(Number(p.amount_interest))}</b></p>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button size="sm" variant="ghost" className="h-6 px-1" onClick={() => setEdit(!edit)}><Pencil className="h-3 w-3" /></Button>
          <Button size="sm" variant="ghost" className="h-6 px-1 text-destructive" onClick={del}><Trash2 className="h-3 w-3" /></Button>
        </div>
      </div>
      {edit && (
        <div className="grid grid-cols-2 gap-1 mt-2 p-2 bg-muted/30 rounded">
          <div><Label className="text-[10px]">Capital</Label><Input className="h-7" type="number" step="0.01" value={cap} onChange={(e) => setCap(e.target.value)} /></div>
          <div><Label className="text-[10px]">Interés</Label><Input className="h-7" type="number" step="0.01" value={intr} onChange={(e) => setIntr(e.target.value)} /></div>
          <div><Label className="text-[10px]">Fecha</Label><Input className="h-7" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><Label className="text-[10px]">Canal</Label>
            <Select value={chId} onValueChange={setChId}>
              <SelectTrigger className="h-7"><SelectValue /></SelectTrigger>
              <SelectContent>{channels.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button size="sm" className="col-span-2 h-7" onClick={save}>Guardar</Button>
        </div>
      )}
    </div>
  );
}

function EditarPrestamoDialog({ loan, channels, onSave }: any) {
  const [open, setOpen] = useState(false);
  const [principal, setPrincipal] = useState(String(loan.principal));
  const [rateType, setRateType] = useState<RateType>(loan.rate_type);
  const [rateValue, setRateValue] = useState(String(loan.rate_value));
  const [chId, setChId] = useState(loan.disbursement_channel_id ?? "");
  const [disbursed, setDisbursed] = useState((loan.disbursed_at ?? "").slice(0, 10));
  const [note, setNote] = useState(loan.note ?? "");

  const submit = () => {
    onSave({
      principal: Number(principal), rate_type: rateType, rate_value: Number(rateValue),
      daily_rate: rateType === "daily" ? Number(rateValue) / 100 : Number(rateValue) / 100 / 30,
      disbursement_channel_id: chId || null,
      disbursed_at: disbursed ? new Date(disbursed).toISOString() : loan.disbursed_at,
      note,
    });
    setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Pencil className="h-3 w-3 mr-1" />Editar</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Editar préstamo</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Monto</Label><Input type="number" step="0.01" value={principal} onChange={(e) => setPrincipal(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Tipo tasa</Label>
              <Select value={rateType} onValueChange={(v) => setRateType(v as RateType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="daily">Diaria</SelectItem><SelectItem value="monthly">Mensual</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Valor %</Label><Input type="number" step="0.01" value={rateValue} onChange={(e) => setRateValue(e.target.value)} /></div>
          </div>
          <div><Label>Fecha desembolso</Label><Input type="date" value={disbursed} onChange={(e) => setDisbursed(e.target.value)} /></div>
          <div><Label>Canal</Label>
            <Select value={chId} onValueChange={setChId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{channels.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Nota</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <Button className="w-full" onClick={submit}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConsolidarDialog({ loans, pays, channels, adminId, onDone }: any) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [rateType, setRateType] = useState<RateType>("monthly");
  const [rateValue, setRateValue] = useState("20");
  const [chId, setChId] = useState(channels[0]?.id ?? "");

  const debts = loans.map((l: any) => {
    const confirmed = pays.filter((p: any) => p.loan_id === l.id && p.status === "confirmado");
    const pc = confirmed.reduce((a: number, p: any) => a + Number(p.amount_capital), 0);
    const pi = confirmed.reduce((a: number, p: any) => a + Number(p.amount_interest), 0);
    return { loan: l, debt: projectDebt({ principal: Number(l.principal), rateType: l.rate_type, rateValue: Number(l.rate_value), startDate: l.disbursed_at ?? l.created_at, paidCapital: pc, paidInterest: pi }) };
  });
  const chosenIds = Object.keys(selected).filter((k) => selected[k]);
  const totalCapital = debts.filter((d: any) => selected[d.loan.id]).reduce((a: number, d: any) => a + d.debt.capital, 0);
  const totalInteres = debts.filter((d: any) => selected[d.loan.id]).reduce((a: number, d: any) => a + d.debt.interes, 0);
  const nuevoPrincipal = totalCapital + totalInteres;

  const submit = async () => {
    if (chosenIds.length < 2) return toast.error("Selecciona al menos 2 préstamos");
    const now = new Date().toISOString();
    const userId = loans[0].user_id;
    const { data: nuevo, error } = await supabase.from("loans").insert({
      user_id: userId, principal: nuevoPrincipal,
      rate_type: rateType, rate_value: Number(rateValue),
      daily_rate: rateType === "daily" ? Number(rateValue) / 100 : Number(rateValue) / 100 / 30,
      disbursement_channel_id: chId || null,
      status: "activo", note: `Consolidación de ${chosenIds.length} préstamos`,
      approved_at: now, approved_by: adminId, disbursed_at: now,
    }).select().single();
    if (error) return toast.error(error.message);
    const { error: e2 } = await supabase.from("loans").update({ status: "consolidado", consolidated_into: nuevo.id }).in("id", chosenIds);
    if (e2) return toast.error(e2.message);
    toast.success("Préstamos unificados");
    setOpen(false); setSelected({}); onDone();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="secondary"><Merge className="h-3 w-3 mr-1" />Consolidar</Button></DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Unificar préstamos</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {debts.map((d: any) => (
              <label key={d.loan.id} className="flex items-center gap-2 p-2 rounded border border-border cursor-pointer hover:bg-muted/30">
                <Checkbox checked={!!selected[d.loan.id]} onCheckedChange={(v) => setSelected({ ...selected, [d.loan.id]: !!v })} />
                <div className="flex-1 text-xs">
                  <p className="font-semibold">{formatUSD(Number(d.loan.principal))} <span className="text-muted-foreground font-normal">· {rateLabel(d.loan.rate_type, Number(d.loan.rate_value))}</span></p>
                  <p className="text-muted-foreground">Deuda actual: {formatUSD(d.debt.total)} (Cap {formatUSD(d.debt.capital)} · Int {formatUSD(d.debt.interes)})</p>
                </div>
              </label>
            ))}
          </div>
          <Card className="p-3 bg-muted/30 space-y-1 text-sm">
            <div className="flex justify-between"><span>Nuevo principal</span><b>{formatUSD(nuevoPrincipal)}</b></div>
            <p className="text-[11px] text-muted-foreground">= capital pendiente + intereses acumulados de los seleccionados</p>
          </Card>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Tipo tasa</Label>
              <Select value={rateType} onValueChange={(v) => setRateType(v as RateType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="daily">Diaria</SelectItem><SelectItem value="monthly">Mensual</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Valor %</Label><Input type="number" step="0.01" value={rateValue} onChange={(e) => setRateValue(e.target.value)} /></div>
          </div>
          <div><Label>Canal</Label>
            <Select value={chId} onValueChange={setChId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{channels.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button className="w-full" onClick={submit} disabled={chosenIds.length < 2}>Unificar {chosenIds.length} préstamos</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
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
              <div><Label>Tipo de tasa</Label>
                <Select value={rateType} onValueChange={(v) => setRateType(v as RateType)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="daily">Diaria</SelectItem><SelectItem value="monthly">Mensual</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Valor (%)</Label><Input type="number" step="0.01" value={rateValue} onChange={(e) => setRateValue(e.target.value)} /></div>
              <div><Label>Canal desembolso</Label>
                <Select value={channelId} onValueChange={setChannelId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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

function NuevoPrestamoDialog({ profiles, channels, userId, onCreated }: { profiles: any[]; channels: any[]; userId: string; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [socioId, setSocioId] = useState("");
  const [principal, setPrincipal] = useState("");
  const [rateType, setRateType] = useState<RateType>("daily");
  const [rateValue, setRateValue] = useState("1");
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [disbursedDate, setDisbursedDate] = useState(new Date().toISOString().slice(0, 10));
  const activos = profiles.filter((p) => p.status === "activo");

  const submit = async () => {
    if (!socioId) return toast.error("Elige un socio");
    const nowIso = new Date().toISOString();
    const disbursedIso = new Date(disbursedDate).toISOString();
    const dr = rateType === "daily" ? Number(rateValue) / 100 : Number(rateValue) / 100 / 30;
    const { error } = await supabase.from("loans").insert({
      user_id: socioId, principal: Number(principal),
      rate_type: rateType, rate_value: Number(rateValue), daily_rate: dr,
      disbursement_channel_id: channelId || null, status: "activo", note,
      approved_at: nowIso, approved_by: userId, disbursed_at: disbursedIso,
    });
    if (error) return toast.error(error.message);
    toast.success("Préstamo creado");
    setOpen(false); setSocioId(""); setPrincipal(""); setNote("");
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />Nuevo</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo préstamo</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Socio</Label>
            <Select value={socioId} onValueChange={setSocioId}>
              <SelectTrigger><SelectValue placeholder="Elegir socio" /></SelectTrigger>
              <SelectContent>{activos.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Monto (USD)</Label><Input type="number" step="0.01" value={principal} onChange={(e) => setPrincipal(e.target.value)} /></div>
          <div><Label>Fecha del préstamo</Label><Input type="date" value={disbursedDate} onChange={(e) => setDisbursedDate(e.target.value)} required /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Tipo tasa</Label>
              <Select value={rateType} onValueChange={(v) => setRateType(v as RateType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="daily">Diaria</SelectItem><SelectItem value="monthly">Mensual</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label>Valor %</Label><Input type="number" step="0.01" value={rateValue} onChange={(e) => setRateValue(e.target.value)} /></div>
          </div>
          <div><Label>Canal desembolso</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Nota</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <Button className="w-full" onClick={submit}>Crear préstamo activo</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


function RegistrarAbonoDialog({ loan, defaultInt, channels, adminId, onDone }: { loan: any; defaultInt: number; channels: any[]; adminId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [cap, setCap] = useState("0");
  const [intr, setIntr] = useState(defaultInt.toFixed(2));
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const submit = async () => {
    const now = new Date().toISOString();
    const { error } = await supabase.from("loan_payments").insert({
      loan_id: loan.id, user_id: loan.user_id,
      amount_capital: Number(cap), amount_interest: Number(intr),
      channel_id: channelId || null, note,
      payment_date: date,
      status: "confirmado", confirmed_at: now, confirmed_by: adminId,
    });
    if (error) return toast.error(error.message);

    // Auto-marcar pagado si queda saldado
    const { data: allPays } = await supabase.from("loan_payments").select("*").eq("loan_id", loan.id).eq("status", "confirmado");
    const d = projectDebt({
      principal: Number(loan.principal),
      rateType: loan.rate_type as RateType,
      rateValue: Number(loan.rate_value),
      startDate: loan.disbursed_at ?? loan.approved_at ?? loan.created_at,
      payments: allPays ?? [],
    });
    if (d.capital < 0.01 && d.interes < 0.01) {
      await supabase.from("loans").update({ status: "pagado" }).eq("id", loan.id);
      toast.success("Préstamo PAGADO ✅");
    } else {
      toast.success("Abono registrado");
    }
    setOpen(false); setCap("0"); setNote("");
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setIntr(defaultInt.toFixed(2)); setDate(new Date().toISOString().slice(0, 10)); } }}>
      <DialogTrigger asChild><Button size="sm">Registrar abono</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar abono (admin)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Fecha del pago</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
          <div><Label>Canal</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Intereses</Label><Input type="number" step="0.01" value={intr} onChange={(e) => setIntr(e.target.value)} /></div>
          <div><Label>Capital</Label><Input type="number" step="0.01" value={cap} onChange={(e) => setCap(e.target.value)} /></div>
          <div><Label>Nota</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <Button className="w-full" onClick={submit}>Registrar y confirmar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

