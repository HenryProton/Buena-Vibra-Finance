import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatUSD, MONTHS_ES } from "@/lib/format";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { useState } from "react";
import { useCajaSettings, useChannels } from "@/lib/queries";
import { Check, X } from "lucide-react";

export function AdminAportes() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: settings } = useCajaSettings();
  const { data: channels = [] } = useChannels();

  const { data } = useQuery({
    queryKey: ["admin-aportes"],
    queryFn: async () => {
      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.from("monthly_contributions").select("*").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name, status, num_acciones, fecha_inicio, fecha_fin"),
      ]);
      return { contribs: c ?? [], profiles: p ?? [] };
    },
  });

  const confirm = useMutation({
    mutationFn: async ({ id, status, channel_id }: { id: string; status: "confirmado" | "pendiente"; channel_id?: string | null }) => {
      const patch: any = { status };
      if (status === "confirmado") { patch.confirmed_at = new Date().toISOString(); patch.confirmed_by = user!.id; if (channel_id) patch.channel_id = channel_id; }
      const { error } = await supabase.from("monthly_contributions").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Actualizado"); qc.invalidateQueries({ queryKey: ["admin-aportes"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const upsertPago = useMutation({
    mutationFn: async (v: { user_id: string; year: number; month: number; amount: number; channel_id: string | null; num_acciones: number }) => {
      const existing = (data?.contribs ?? []).find((c) => c.user_id === v.user_id && c.year === v.year && c.month === v.month);
      if (existing) {
        const { error } = await supabase.from("monthly_contributions").update({
          amount: v.amount, channel_id: v.channel_id, status: "confirmado",
          confirmed_at: new Date().toISOString(), confirmed_by: user!.id,
        }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("monthly_contributions").insert({
          user_id: v.user_id, year: v.year, month: v.month, num_acciones: v.num_acciones,
          amount: v.amount, status: "confirmado", channel_id: v.channel_id,
          confirmed_at: new Date().toISOString(), confirmed_by: user!.id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Guardado"); qc.invalidateQueries({ queryKey: ["admin-aportes"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const nameOf = (uid: string) => data?.profiles.find((p) => p.id === uid)?.full_name ?? "?";
  const chName = (id?: string | null) => channels.find((c) => c.id === id)?.nombre ?? "—";
  const reportados = (data?.contribs ?? []).filter((c) => c.status === "reportado");
  const activos = (data?.profiles ?? []).filter((p) => p.status === "activo");
  const cycle = buildCycle(settings?.fecha_inicio, settings?.fecha_fin);
  const aporteMes = Number(settings?.aporte_mensual ?? 10);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Aportes</h2>

      <Tabs defaultValue="matriz">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="matriz">Matriz</TabsTrigger>
          <TabsTrigger value="pendientes">Por confirmar {reportados.length > 0 && `(${reportados.length})`}</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="matriz" className="mt-3">
          <Card className="p-2 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-1 sticky left-0 bg-card">Socio</th>
                  {cycle.map((c) => (
                    <th key={`${c.year}-${c.month}`} className="p-1 min-w-[36px]">{MONTHS_ES[c.month - 1].slice(0, 3)}<br /><span className="text-muted-foreground text-[10px]">{String(c.year).slice(2)}</span></th>
                  ))}
                  <th className="p-1">Al día</th>
                </tr>
              </thead>
              <tbody>
                {activos.map((p) => {
                  const mine = (data?.contribs ?? []).filter((c) => c.user_id === p.id);
                  const now = new Date();
                  const cy = now.getFullYear(); const cm = now.getMonth() + 1;
                  const inWin = (y: number, m: number) => monthInSocioWindow(y, m, (p as any).fecha_inicio, (p as any).fecha_fin);
                  const pastMissing = cycle.some((c) =>
                    inWin(c.year, c.month) &&
                    (c.year < cy || (c.year === cy && c.month <= cm)) &&
                    !mine.some((m) => m.year === c.year && m.month === c.month && m.status === "confirmado")
                  );
                  return (
                    <tr key={p.id} className="border-b border-border hover:bg-muted/30">
                      <td className="p-1 sticky left-0 bg-card font-medium max-w-[100px] truncate">{p.full_name}</td>
                      {cycle.map((c) => {
                        const outOfWindow = !inWin(c.year, c.month);
                        if (outOfWindow) {
                          return (
                            <td key={`${c.year}-${c.month}`} className="p-0.5">
                              <div className="w-full h-7 rounded bg-muted/10 text-[11px] text-muted-foreground/50 flex items-center justify-center" title="Fuera del periodo del socio">–</div>
                            </td>
                          );
                        }
                        const found = mine.find((m) => m.year === c.year && m.month === c.month);
                        const st = found?.status;
                        const bg = st === "confirmado" ? "bg-emerald-500/40" : st === "reportado" ? "bg-amber-500/40" : "bg-destructive/20";
                        const isPastOrCurrent = c.year < cy || (c.year === cy && c.month <= cm);
                        return (
                          <td key={`${c.year}-${c.month}`} className="p-0.5">
                            <CeldaAporte
                              profile={p}
                              year={c.year}
                              month={c.month}
                              existing={found}
                              aporteMes={aporteMes * (p.num_acciones || 1)}
                              channels={channels}
                              chName={chName}
                              cls={isPastOrCurrent ? bg : "bg-muted/20"}
                              onSave={(vals: { amount: number; channel_id: string | null }) => upsertPago.mutate({ user_id: p.id, year: c.year, month: c.month, num_acciones: p.num_acciones || 1, ...vals })}
                            />
                          </td>
                        );
                      })}
                      <td className="p-1 text-center">
                        {pastMissing ? <Badge variant="destructive" className="text-[10px]">Debe</Badge> : <Badge className="bg-emerald-500/20 text-emerald-700 text-[10px]">OK</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-[10px] text-muted-foreground mt-2 px-1">Verde = confirmado · ámbar = reportado · rojo = pendiente. Haz clic en una celda para registrar/editar.</p>
          </Card>
        </TabsContent>

        <TabsContent value="pendientes" className="mt-3 space-y-2">
          {reportados.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">No hay aportes por confirmar.</p>}
          {reportados.map((a) => (
            <Card key={a.id} className="p-4 space-y-2">
              <div className="flex justify-between">
                <div>
                  <p className="font-medium">{nameOf(a.user_id)}</p>
                  <p className="text-xs text-muted-foreground">{MONTHS_ES[a.month - 1]} {a.year} · Canal: {chName(a.channel_id)}</p>
                  {a.note && <p className="text-xs mt-1">{a.note}</p>}
                </div>
                <p className="font-bold">{formatUSD(Number(a.amount))}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => confirm.mutate({ id: a.id, status: "confirmado", channel_id: a.channel_id })}><Check className="h-3 w-3 mr-1" />Confirmar</Button>
                <Button size="sm" variant="outline" onClick={() => confirm.mutate({ id: a.id, status: "pendiente" })}><X className="h-3 w-3 mr-1" />Rechazar</Button>
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="historial" className="mt-3 space-y-2">
          {(data?.contribs ?? []).filter((a) => a.status !== "reportado").map((a) => (
            <Card key={a.id} className="p-3 flex justify-between items-center">
              <div>
                <p className="text-sm font-medium">{nameOf(a.user_id)}</p>
                <p className="text-xs text-muted-foreground">{MONTHS_ES[a.month - 1]} {a.year} · {chName(a.channel_id)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold">{formatUSD(Number(a.amount))}</p>
                <Badge variant={a.status === "confirmado" ? "default" : "secondary"}>{a.status}</Badge>
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CeldaAporte({ profile, year, month, existing, aporteMes, channels, chName, cls, onSave }: any) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(existing?.amount ?? aporteMes));
  const [channelId, setChannelId] = useState(existing?.channel_id ?? channels[0]?.id ?? "");
  const label = existing?.status === "confirmado" ? "✓" : existing?.status === "reportado" ? "!" : "·";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className={`w-full h-7 rounded ${cls} text-[11px] font-bold hover:ring-2 hover:ring-primary`}>{label}</button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{profile.full_name} — {MONTHS_ES[month - 1]} {year}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Canal</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{channels.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Monto</Label>
            <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          {existing && <p className="text-xs text-muted-foreground">Estado actual: {existing.status} · Canal: {chName(existing.channel_id)}</p>}
          <Button className="w-full" onClick={() => { onSave({ amount: Number(amount), channel_id: channelId || null }); setOpen(false); }}>
            {existing ? "Actualizar y confirmar" : "Registrar y confirmar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function buildCycle(inicio?: string | null, fin?: string | null): { year: number; month: number }[] {
  if (!inicio || !fin) {
    const y = new Date().getFullYear();
    return Array.from({ length: 12 }, (_, i) => ({ year: y, month: i + 1 }));
  }
  const s = new Date(inicio), e = new Date(fin);
  const out: { year: number; month: number }[] = [];
  let y = s.getUTCFullYear(), m = s.getUTCMonth() + 1;
  const ey = e.getUTCFullYear(), em = e.getUTCMonth() + 1;
  while (y < ey || (y === ey && m <= em)) {
    out.push({ year: y, month: m });
    m++; if (m > 12) { m = 1; y++; }
    if (out.length > 60) break;
  }
  return out;
}
