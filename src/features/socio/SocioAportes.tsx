import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatUSD, MONTHS_ES } from "@/lib/format";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Clock, AlertCircle, BarChart3, PauseCircle, Sparkles } from "lucide-react";
import { useCajaSettings, useChannels, useCajaPauses } from "@/lib/queries";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

export function SocioAportes() {
  const { user, profile } = useAuth();
  const uid = user!.id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selectedBar, setSelectedBar] = useState<string | null>(null);
  const { data: settings } = useCajaSettings();
  const { data: channels = [] } = useChannels(true);
  const { rows: pauses, isPausedMonth } = useCajaPauses();

  const aporteMes = (profile?.num_acciones ?? 1) * Number(settings?.aporte_mensual ?? 10);

  const { data: aportes = [] } = useQuery({
    queryKey: ["mis-aportes", uid],
    queryFn: async () => {
      const { data } = await supabase.from("monthly_contributions").select("*").eq("user_id", uid).order("year", { ascending: false }).order("month", { ascending: false });
      return data ?? [];
    },
  });

  const reportar = useMutation({
    mutationFn: async (input: { year: number; month: number; amount: number; note: string; channel_id: string | null }) => {
      const { error } = await supabase.from("monthly_contributions").insert({
        user_id: uid,
        year: input.year,
        month: input.month,
        num_acciones: profile?.num_acciones ?? 1,
        amount: input.amount,
        status: "reportado",
        note: input.note,
        channel_id: input.channel_id,
        reported_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Aporte reportado. Pendiente de confirmación.");
      qc.invalidateQueries({ queryKey: ["mis-aportes", uid] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Build cycle months intersected with the socio's own participation window.
  const socioInicio = (profile as any)?.fecha_inicio ?? null;
  const socioFin = (profile as any)?.fecha_fin ?? null;
  const cycle = buildCycle(settings?.fecha_inicio, settings?.fecha_fin, socioInicio, socioFin);
  const confirmadosSet = new Set(
    aportes.filter((a) => a.status === "confirmado").map((a) => `${a.year}-${a.month}`)
  );
  const reportadosSet = new Set(
    aportes.filter((a) => a.status === "reportado").map((a) => `${a.year}-${a.month}`)
  );
  const now = new Date();
  const isPast = (y: number, m: number) => y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1);

  const pausados = cycle.filter((c) => isPausedMonth(c.year, c.month));
  const pagados = cycle.filter((c) => confirmadosSet.has(`${c.year}-${c.month}`));
  const pendientes = cycle.filter((c) => !confirmadosSet.has(`${c.year}-${c.month}`) && !reportadosSet.has(`${c.year}-${c.month}`) && isPast(c.year, c.month) && !isPausedMonth(c.year, c.month));
  const futuros = cycle.filter((c) => !confirmadosSet.has(`${c.year}-${c.month}`) && !reportadosSet.has(`${c.year}-${c.month}`) && !isPast(c.year, c.month) && !isPausedMonth(c.year, c.month));

  const especiales = aportes.filter((a) => isPausedMonth(a.year, a.month));
  const totalEspecial = especiales
    .filter((a) => a.status !== "pendiente")
    .reduce((s, a) => s + Number(a.amount), 0);
  const totalPagado = pagados.length * aporteMes;
  const totalPendiente = pendientes.length * aporteMes;
  const totalFuturo = futuros.length * aporteMes;
  const totalCiclo = (cycle.length - pausados.length) * aporteMes;
  const pct = totalCiclo === 0 ? 0 : Math.round((totalPagado / totalCiclo) * 100);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Mis aportes</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm">Reportar pago</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Reportar aporte mensual</DialogTitle></DialogHeader>
            <ReportarForm defaultAmount={aporteMes} channels={channels} onSubmit={(v) => reportar.mutate(v)} loading={reportar.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex justify-between items-baseline">
          <p className="text-sm font-semibold">Progreso del ciclo</p>
          <p className="text-xs text-muted-foreground">{pct}%</p>
        </div>
        <Progress value={pct} />
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div><p className="text-muted-foreground">Aportado</p><p className="font-bold text-primary">{formatUSD(totalPagado)}</p></div>
          <div><p className="text-muted-foreground">Pendiente</p><p className="font-bold text-destructive">{formatUSD(totalPendiente)}</p></div>
          <div><p className="text-muted-foreground">Por venir</p><p className="font-bold">{formatUSD(totalFuturo)}</p></div>
        </div>
        <p className="text-[11px] text-muted-foreground pt-2 border-t border-border">
          Ciclo: {cycle[0] ? `${MONTHS_ES[cycle[0].month - 1]} ${cycle[0].year}` : "—"} → {cycle.at(-1) ? `${MONTHS_ES[cycle.at(-1)!.month - 1]} ${cycle.at(-1)!.year}` : "—"} · Total {formatUSD(totalCiclo)}
        </p>
      </Card>

      {pausados.length > 0 && (
        <Card className="p-4 space-y-2 border-blue-500/40 bg-blue-500/5">
          <h3 className="font-semibold text-sm flex items-center gap-2 text-blue-600">
            <PauseCircle className="h-4 w-4" />Meses en pausa ({pausados.length})
          </h3>
          <p className="text-xs text-muted-foreground">
            En estos meses no estás obligado a aportar y tus préstamos no generan intereses. Si aportas igual, queda
            registrado como <strong>aporte especial</strong>.
          </p>
          <div className="flex flex-wrap gap-1">
            {pausados.map((c) => (
              <Badge key={`${c.year}-${c.month}`} variant="outline" className="text-[11px] border-blue-500/40 text-blue-600">
                {MONTHS_ES[c.month - 1]} {c.year}
              </Badge>
            ))}
          </div>
          {especiales.length > 0 && (
            <p className="text-xs">
              Aportes especiales registrados: <strong>{especiales.length}</strong> · Total{" "}
              <strong className="text-primary">{formatUSD(totalEspecial)}</strong>
            </p>
          )}
          {pauses.some((p) => p.note) && (
            <p className="text-[11px] text-muted-foreground">
              {pauses.filter((p) => p.note).map((p) => `${MONTHS_ES[p.month - 1]} ${p.year}: ${p.note}`).join(" · ")}
            </p>
          )}
        </Card>
      )}

      {(() => {
        const chartData = cycle.map((c) => {
          const key = `${c.year}-${c.month}`;
          const paid = confirmadosSet.has(key);
          const reported = reportadosSet.has(key);
          const past = isPast(c.year, c.month);
          const pausedM = isPausedMonth(c.year, c.month);
          const status: "pagado" | "reportado" | "pendiente" | "futuro" | "pausa" = paid ? "pagado" : reported ? "reportado" : pausedM ? "pausa" : past ? "pendiente" : "futuro";
          const aporte = aportes.find((a) => a.year === c.year && a.month === c.month);
          return {
            key,
            label: `${MONTHS_ES[c.month - 1].slice(0, 3)} ${String(c.year).slice(2)}`,
            fullLabel: `${MONTHS_ES[c.month - 1]} ${c.year}`,
            monto: pausedM && !paid && !reported ? aporteMes : aporteMes,
            paused: pausedM,
            status,
            amountRegistered: aporte?.amount ?? null,
            note: aporte?.note ?? null,
            reportedAt: aporte?.reported_at ?? null,
          };
        });
        const statusMeta: Record<string, { label: string; color: string; badge: string }> = {
          pagado: { label: "Pagado ✅", color: "var(--primary)", badge: "bg-primary/15 text-primary border-primary/40" },
          reportado: { label: "Reportado ⏳", color: "oklch(0.75 0.17 75)", badge: "bg-amber-500/15 text-amber-600 border-amber-500/40" },
          pendiente: { label: "Pendiente ⚠️", color: "var(--destructive)", badge: "bg-destructive/15 text-destructive border-destructive/40" },
          futuro: { label: "Por venir", color: "color-mix(in oklab, var(--muted-foreground) 40%, transparent)", badge: "bg-muted text-muted-foreground border-border" },
          pausa: { label: "Caja en pausa ⏸", color: "oklch(0.65 0.12 250)", badge: "bg-blue-500/15 text-blue-600 border-blue-500/40" },
        };
        const CustomTooltip = ({ active, payload }: any) => {
          if (!active || !payload?.length) return null;
          const p = payload[0].payload;
          const meta = statusMeta[p.status];
          return (
            <div className="rounded-lg border bg-background p-2 shadow-md text-xs space-y-1 min-w-[140px]">
              <p className="font-semibold">{p.fullLabel}</p>
              <p><span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] ${meta.badge}`}>{meta.label}</span></p>
              <p className="text-muted-foreground">Aporte: <span className="font-semibold text-foreground">{formatUSD(p.monto)}</span></p>
              <p className="text-[10px] text-muted-foreground">100% capital · sin interés</p>
              {p.paused && <p className="text-[10px] text-blue-600">Mes pausado: aporte opcional (especial)</p>}
            </div>
          );
        };
        const selected = chartData.find((d) => d.key === selectedBar) ?? null;
        return (
          <Card className="p-4 space-y-3 animate-fade-in">
            <h3 className="font-semibold text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" />Aportes mes a mes</h3>
            <p className="text-[11px] text-muted-foreground">Toca una barra para ver el detalle.</p>
            <div className="w-full h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} interval={0} axisLine={{ stroke: "var(--border)" }} tickLine={{ stroke: "var(--border)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `$${v}`} width={40} axisLine={{ stroke: "var(--border)" }} tickLine={{ stroke: "var(--border)" }} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "color-mix(in oklab, var(--muted-foreground) 15%, transparent)" }} />
                  <Bar dataKey="monto" radius={[4, 4, 0, 0]} onClick={(d: any) => setSelectedBar(d.key)} cursor="pointer">
                    {chartData.map((d) => (
                      <Cell
                        key={d.key}
                        fill={statusMeta[d.status].color}
                        stroke={selectedBar === d.key ? "var(--foreground)" : "none"}
                        strokeWidth={selectedBar === d.key ? 2 : 0}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-primary" />Pagado</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: "oklch(0.75 0.17 75)" }} />Reportado</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-destructive" />Pendiente</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-muted-foreground/40" />Por venir</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm" style={{ background: "oklch(0.65 0.12 250)" }} />En pausa</span>
            </div>
            {selected && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2 animate-fade-in">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm">{selected.fullLabel}</p>
                  <Badge variant="outline" className={statusMeta[selected.status].badge}>{statusMeta[selected.status].label}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><p className="text-muted-foreground">Monto del mes</p><p className="font-bold">{formatUSD(selected.monto)}</p></div>
                  <div><p className="text-muted-foreground">Registrado</p><p className="font-bold">{selected.amountRegistered != null ? formatUSD(Number(selected.amountRegistered)) : "—"}</p></div>
                  <div><p className="text-muted-foreground">Capital</p><p className="font-bold text-primary">{formatUSD(selected.monto)}</p></div>
                  <div><p className="text-muted-foreground">Interés</p><p className="font-bold">{formatUSD(0)}</p></div>
                </div>
                {selected.reportedAt && (
                  <p className="text-[11px] text-muted-foreground">Reportado el {formatDateVE(selected.reportedAt)}</p>
                )}
                {selected.note && <p className="text-[11px] text-muted-foreground italic">"{selected.note}"</p>}
                <p className="text-[10px] text-muted-foreground pt-1 border-t border-border">Los aportes mensuales son 100% capital para la caja; no generan interés.</p>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setSelectedBar(null)}>Cerrar detalle</Button>
              </div>
            )}
          </Card>
        );
      })()}

      <Card className="p-4 space-y-3">
        <h3 className="font-semibold text-sm">Calendario</h3>
        <div className="grid grid-cols-4 gap-2">
          {cycle.map((c) => {
            const key = `${c.year}-${c.month}`;
            const pausedM = isPausedMonth(c.year, c.month);
            const status = confirmadosSet.has(key)
              ? "confirmado"
              : reportadosSet.has(key)
              ? "reportado"
              : pausedM
              ? "pausa"
              : isPast(c.year, c.month)
              ? "pendiente"
              : "futuro";
            return (
              <div
                key={key}
                className={`rounded-md border p-2 text-center text-[11px] ${
                  status === "confirmado" ? "border-primary/40 bg-primary/10"
                  : status === "reportado" ? "border-amber-500/40 bg-amber-500/10"
                  : status === "pausa" ? "border-blue-500/40 bg-blue-500/10 text-blue-600"
                  : status === "pendiente" ? "border-destructive/40 bg-destructive/10"
                  : "border-border bg-muted/30 text-muted-foreground"
                }`}
              >
                <p className="font-semibold">{MONTHS_ES[c.month - 1].slice(0, 3)}</p>
                <p>{c.year}</p>
                {pausedM && <p className="text-[9px]">⏸ pausa</p>}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <h3 className="font-semibold text-sm text-primary">Meses pagados ({pagados.length})</h3>
        {pagados.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aún no hay meses confirmados.</p>
        ) : (
          <>
            {pagados.map((c) => (
              <div key={`${c.year}-${c.month}`} className="flex justify-between text-sm py-1 border-b border-border last:border-0">
                <span>{MONTHS_ES[c.month - 1]} {c.year}</span>
                <span className="font-medium">{formatUSD(aporteMes)}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold pt-2 border-t border-border">
              <span>Total pagado</span><span className="text-primary">{formatUSD(totalPagado)}</span>
            </div>
          </>
        )}
      </Card>

      <Card className="p-4 space-y-2">
        <h3 className="font-semibold text-sm text-destructive">Meses pendientes ({pendientes.length})</h3>
        {pendientes.length === 0 ? (
          <p className="text-xs text-muted-foreground">Estás al día 🎉</p>
        ) : (
          <>
            {pendientes.map((c) => (
              <div key={`${c.year}-${c.month}`} className="flex justify-between text-sm py-1 border-b border-border last:border-0">
                <span>{MONTHS_ES[c.month - 1]} {c.year}</span>
                <span className="font-medium">{formatUSD(aporteMes)}</span>
              </div>
            ))}
            <div className="flex justify-between font-bold pt-2 border-t border-border">
              <span>Total pendiente</span><span className="text-destructive">{formatUSD(totalPendiente)}</span>
            </div>
          </>
        )}
      </Card>

      <div className="space-y-2">
        <h3 className="font-semibold text-sm">Historial de reportes</h3>
        {aportes.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">Aún no hay aportes registrados.</Card>
        )}
        {aportes.map((a) => (
          <Card key={a.id} className="p-3 flex items-center justify-between">
            <div>
              <p className="font-medium text-sm flex items-center gap-1">
                {MONTHS_ES[a.month - 1]} {a.year}
                {isPausedMonth(a.year, a.month) && (
                  <Badge variant="outline" className="text-[10px] border-blue-500/40 bg-blue-500/10 text-blue-600">
                    <Sparkles className="h-3 w-3 mr-1" />Aporte especial
                  </Badge>
                )}
              </p>
              <p className="text-xs text-muted-foreground">{a.num_acciones} acción(es)</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-sm">{formatUSD(Number(a.amount))}</p>
              <StatusBadge status={a.status} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function buildCycle(inicio?: string | null, fin?: string | null, socioInicio?: string | null, socioFin?: string | null): { year: number; month: number }[] {
  const now = new Date();
  const defaultInicio = `${now.getFullYear()}-01-01`;
  const defaultFin = `${now.getFullYear()}-12-31`;
  const parseYm = (s: string) => {
    const d = new Date(s);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
  };
  const cajaS = parseYm(inicio || defaultInicio);
  const cajaE = parseYm(fin || defaultFin);
  const socS = socioInicio ? parseYm(socioInicio) : cajaS;
  const socE = socioFin ? parseYm(socioFin) : cajaE;
  const cmp = (a: { y: number; m: number }, b: { y: number; m: number }) => a.y !== b.y ? a.y - b.y : a.m - b.m;
  const start = cmp(cajaS, socS) >= 0 ? cajaS : socS;
  const end = cmp(cajaE, socE) <= 0 ? cajaE : socE;
  const out: { year: number; month: number }[] = [];
  let y = start.y, m = start.m;
  while (y < end.y || (y === end.y && m <= end.m)) {
    out.push({ year: y, month: m });
    m++; if (m > 12) { m = 1; y++; }
    if (out.length > 60) break;
  }
  return out;
}

function StatusBadge({ status }: { status: string }) {
  if (status === "confirmado") return <Badge className="bg-primary/20 text-primary hover:bg-primary/20"><Check className="h-3 w-3 mr-1" />Confirmado</Badge>;
  if (status === "reportado") return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Reportado</Badge>;
  return <Badge variant="outline"><AlertCircle className="h-3 w-3 mr-1" />Pendiente</Badge>;
}

function ReportarForm({ defaultAmount, channels, onSubmit, loading }: { defaultAmount: number; channels: any[]; onSubmit: (v: { year: number; month: number; amount: number; note: string; channel_id: string | null }) => void; loading: boolean }) {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [amount, setAmount] = useState(String(defaultAmount));
  const [note, setNote] = useState("");
  const [channelId, setChannelId] = useState<string>(channels[0]?.id ?? "");

  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ year: Number(year), month: Number(month), amount: Number(amount), note, channel_id: channelId || null }); }} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Mes</Label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS_ES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Año</Label>
          <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Canal</Label>
        <Select value={channelId} onValueChange={setChannelId}>
          <SelectTrigger><SelectValue placeholder="Elegir canal" /></SelectTrigger>
          <SelectContent>{channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Monto (USD)</Label>
        <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label>Nota (referencia)</Label>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: Transferencia #1234" />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Enviando..." : "Reportar"}</Button>
    </form>
  );
}
