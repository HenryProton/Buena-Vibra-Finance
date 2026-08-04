import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { formatUSD } from "@/lib/format";
import { useCajaSettings, useChannels, useCajaPauses } from "@/lib/queries";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MONTHS_ES } from "@/lib/format";
import { Plus, Trash2, PauseCircle } from "lucide-react";

export function AdminAjustes() {
  const qc = useQueryClient();
  const { data: settings } = useCajaSettings();
  const { data: channels = [] } = useChannels();

  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [aporte, setAporte] = useState("");
  const [normas, setNormas] = useState("");

  useEffect(() => {
    if (settings) {
      setInicio(settings.fecha_inicio);
      setFin(settings.fecha_fin);
      setAporte(String(settings.aporte_mensual));
      setNormas(settings.normas);
    }
  }, [settings]);

  const saveSettings = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("caja_settings").update({
        fecha_inicio: inicio, fecha_fin: fin, aporte_mensual: Number(aporte), normas, updated_at: new Date().toISOString(),
      }).eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Guardado"); qc.invalidateQueries({ queryKey: ["caja-settings"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const upsertChannel = useMutation({
    mutationFn: async (c: { id?: string; nombre: string; activo: boolean; orden: number }) => {
      if (c.id) {
        const { error } = await supabase.from("channels").update({ nombre: c.nombre, activo: c.activo, orden: c.orden }).eq("id", c.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("channels").insert({ nombre: c.nombre, activo: c.activo, orden: c.orden });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Canal guardado"); qc.invalidateQueries({ queryKey: ["channels"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const delChannel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("channels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Canal eliminado"); qc.invalidateQueries({ queryKey: ["channels"] }); },
    onError: (e: Error) => toast.error("No se pudo eliminar (¿hay movimientos vinculados? márcalo como inactivo)."),
  });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold">Ajustes de la caja</h2>

      <Card className="p-4 space-y-3">
        <h3 className="font-semibold text-sm">Ciclo</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><Label>Inicio</Label><Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
          <div className="space-y-1"><Label>Fin</Label><Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} /></div>
        </div>
        <div className="space-y-1">
          <Label>Aporte mensual por acción (USD)</Label>
          <Input type="number" step="0.01" value={aporte} onChange={(e) => setAporte(e.target.value)} />
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="font-semibold text-sm">Normas</h3>
        <Textarea rows={8} value={normas} onChange={(e) => setNormas(e.target.value)} placeholder="Escribe aquí las reglas de la caja..." />
        <p className="text-xs text-muted-foreground">Los socios lo verán en un desplegable en la pantalla de inicio.</p>
      </Card>

      <PausasCard />



      <Button className="w-full" onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
        {saveSettings.isPending ? "Guardando..." : "Guardar ajustes"}
      </Button>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Canales de dinero</h3>
          <NuevoCanal onCreate={(v) => upsertChannel.mutate(v)} nextOrden={(channels.at(-1)?.orden ?? 0) + 1} />
        </div>
        {channels.map((c) => (
          <ChannelRow key={c.id} channel={c} onUpdate={(patch) => upsertChannel.mutate({ id: c.id, nombre: patch.nombre ?? c.nombre, activo: patch.activo ?? c.activo, orden: patch.orden ?? c.orden })} onDelete={() => delChannel.mutate(c.id)} />
        ))}
      </Card>
    </div>
  );
}

function ChannelRow({ channel, onUpdate, onDelete }: { channel: any; onUpdate: (p: Partial<{ nombre: string; activo: boolean; orden: number }>) => void; onDelete: () => void }) {
  const [nombre, setNombre] = useState(channel.nombre);
  const { data: saldo } = useQuery({
    queryKey: ["channel-balance", channel.id],
    queryFn: async () => {
      const { getChannelBalance } = await import("@/lib/channels.functions");
      return await getChannelBalance({ data: { channelId: channel.id } });
    },
  });

  return (
    <div className="flex items-center gap-2 py-2 border-b border-border last:border-0">
      <Input value={nombre} onChange={(e) => setNombre(e.target.value)} onBlur={() => nombre !== channel.nombre && onUpdate({ nombre })} className="h-8 text-sm flex-1" />
      <Badge variant="outline" className="text-xs">{formatUSD(saldo ?? 0)}</Badge>
      <Switch checked={channel.activo} onCheckedChange={(v) => onUpdate({ activo: v })} />
      <Button size="icon" variant="ghost" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
}

function NuevoCanal({ onCreate, nextOrden }: { onCreate: (v: { nombre: string; activo: boolean; orden: number }) => void; nextOrden: number }) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="h-3 w-3 mr-1" />Nuevo</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Nuevo canal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Nombre</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Zelle" /></div>
          <Button className="w-full" onClick={() => { if (nombre.trim()) { onCreate({ nombre: nombre.trim(), activo: true, orden: nextOrden }); setNombre(""); setOpen(false); } }}>Crear</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PausasCard() {
  const qc = useQueryClient();
  const { rows } = useCajaPauses();
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [note, setNote] = useState("");

  const addPause = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("caja_pauses")
        .insert({ year: Number(year), month: Number(month), note: note.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mes pausado");
      setNote("");
      qc.invalidateQueries({ queryKey: ["caja-pauses"] });
    },
    onError: (e: Error) =>
      toast.error(e.message.includes("duplicate") ? "Ese mes ya está pausado" : e.message),
  });

  const delPause = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("caja_pauses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mes reactivado");
      qc.invalidateQueries({ queryKey: ["caja-pauses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <PauseCircle className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-sm">Meses en pausa</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        En los meses pausados los préstamos <strong>no generan intereses</strong> y las mensualidades{" "}
        <strong>no son obligatorias</strong>. Si un socio aporta o abona igual, queda registrado como{" "}
        <strong>aporte especial</strong>.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Mes</Label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS_ES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Año</Label>
          <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Motivo (opcional)</Label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: Vacaciones colectivas" />
      </div>
      <Button className="w-full" variant="outline" onClick={() => addPause.mutate()} disabled={addPause.isPending}>
        <Plus className="h-3 w-3 mr-1" />
        {addPause.isPending ? "Guardando..." : "Pausar este mes"}
      </Button>

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No hay meses pausados.</p>
      ) : (
        <div className="space-y-1">
          {rows.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 py-2 border-b border-border last:border-0">
              <div className="min-w-0">
                <p className="text-sm font-medium">{MONTHS_ES[p.month - 1]} {p.year}</p>
                {p.note && <p className="text-xs text-muted-foreground truncate">{p.note}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[10px]">Sin intereses</Badge>
                <Button size="icon" variant="ghost" onClick={() => delPause.mutate(p.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
