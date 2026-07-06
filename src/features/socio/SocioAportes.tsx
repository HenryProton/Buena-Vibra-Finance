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
import { Check, Clock, AlertCircle } from "lucide-react";
import { useCajaSettings, useChannels } from "@/lib/queries";

export function SocioAportes() {
  const { user, profile } = useAuth();
  const uid = user!.id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: settings } = useCajaSettings();
  const { data: channels = [] } = useChannels(true);

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

  // Build cycle months from settings.fecha_inicio → fecha_fin
  const cycle = buildCycle(settings?.fecha_inicio, settings?.fecha_fin);
  const confirmadosSet = new Set(
    aportes.filter((a) => a.status === "confirmado").map((a) => `${a.year}-${a.month}`)
  );
  const reportadosSet = new Set(
    aportes.filter((a) => a.status === "reportado").map((a) => `${a.year}-${a.month}`)
  );
  const now = new Date();
  const isPast = (y: number, m: number) => y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth() + 1);

  const pagados = cycle.filter((c) => confirmadosSet.has(`${c.year}-${c.month}`));
  const pendientes = cycle.filter((c) => !confirmadosSet.has(`${c.year}-${c.month}`) && !reportadosSet.has(`${c.year}-${c.month}`) && isPast(c.year, c.month));
  const futuros = cycle.filter((c) => !confirmadosSet.has(`${c.year}-${c.month}`) && !reportadosSet.has(`${c.year}-${c.month}`) && !isPast(c.year, c.month));

  const totalPagado = pagados.length * aporteMes;
  const totalPendiente = pendientes.length * aporteMes;
  const totalFuturo = futuros.length * aporteMes;
  const totalCiclo = cycle.length * aporteMes;
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

      <Card className="p-4 space-y-3">
        <h3 className="font-semibold text-sm">Calendario</h3>
        <div className="grid grid-cols-4 gap-2">
          {cycle.map((c) => {
            const key = `${c.year}-${c.month}`;
            const status = confirmadosSet.has(key)
              ? "confirmado"
              : reportadosSet.has(key)
              ? "reportado"
              : isPast(c.year, c.month)
              ? "pendiente"
              : "futuro";
            return (
              <div
                key={key}
                className={`rounded-md border p-2 text-center text-[11px] ${
                  status === "confirmado" ? "border-primary/40 bg-primary/10"
                  : status === "reportado" ? "border-amber-500/40 bg-amber-500/10"
                  : status === "pendiente" ? "border-destructive/40 bg-destructive/10"
                  : "border-border bg-muted/30 text-muted-foreground"
                }`}
              >
                <p className="font-semibold">{MONTHS_ES[c.month - 1].slice(0, 3)}</p>
                <p>{c.year}</p>
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
              <p className="font-medium text-sm">{MONTHS_ES[a.month - 1]} {a.year}</p>
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

function buildCycle(inicio?: string | null, fin?: string | null): { year: number; month: number }[] {
  if (!inicio || !fin) {
    const y = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, i) => ({ year: y, month: i + 1 }));
  }
  const start = new Date(inicio);
  const end = new Date(fin);
  const out: { year: number; month: number }[] = [];
  let y = start.getUTCFullYear(), m = start.getUTCMonth() + 1;
  const endY = end.getUTCFullYear(), endM = end.getUTCMonth() + 1;
  while (y < endY || (y === endY && m <= endM)) {
    out.push({ year: y, month: m });
    m++;
    if (m > 12) { m = 1; y++; }
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
