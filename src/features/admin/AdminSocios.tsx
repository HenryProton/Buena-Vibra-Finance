import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useState } from "react";
import { formatUSD } from "@/lib/format";
import { useAuth } from "@/lib/auth-context";
import { adminCreateInvitation, adminCancelInvitation } from "@/lib/invitations.functions";
import { Mail, Copy, X } from "lucide-react";
import { adminCreateSocio, adminGetSocioLogin } from "@/lib/admin-users.functions";
import { UserPlus, Share2 } from "lucide-react";

export function AdminSocios() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const { data } = useQuery({
    queryKey: ["admin-profiles-roles"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("*"),
      ]);
      return { profiles: profiles ?? [], roles: roles ?? [] };
    },
  });

  const upd = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: { status?: "pendiente" | "activo" | "retirado"; num_acciones?: number; fecha_inicio?: string | null; fecha_fin?: string | null } }) => {
      const { error } = await supabase.from("profiles").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Actualizado"); qc.invalidateQueries({ queryKey: ["admin-profiles-roles"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleAdmin = useMutation({
    mutationFn: async ({ userId, makeAdmin }: { userId: string; makeAdmin: boolean }) => {
      if (makeAdmin) {
        const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
        if (error && !String(error.message).includes("duplicate")) throw error;
      } else {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "admin");
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Rol actualizado"); qc.invalidateQueries({ queryKey: ["admin-profiles-roles"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const isAdminOf = (uid: string) => data?.roles.some((r) => r.user_id === uid && r.role === "admin") ?? false;

  return (
    <div className="space-y-4">
      <InvitationsPanel />
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Socios</h2>
        <CrearSocioDialog onCreated={() => qc.invalidateQueries({ queryKey: ["admin-profiles-roles"] })} />
      </div>
      {(data?.profiles ?? []).map((p) => {
        const admin = isAdminOf(p.id);
        const isMe = p.id === user?.id;
        return (
          <Card key={p.id} className="p-4 space-y-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">
                  {p.full_name || "(Sin nombre)"}{" "}
                  <Badge className={admin ? "ml-1 bg-primary/20 text-primary" : "ml-1 bg-muted text-muted-foreground"}>
                    {admin ? "Admin" : "Socio"}
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">{p.num_acciones} acción(es) · {formatUSD(Number(p.num_acciones) * 10)}/mes</p>
              </div>
              <StatusBadge status={p.status} />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <Switch checked={admin} disabled={isMe} onCheckedChange={(v) => toggleAdmin.mutate({ userId: p.id, makeAdmin: v })} />
                <Label className="text-sm">Es administrador</Label>
              </div>
              {isMe && <p className="text-[10px] text-muted-foreground">(tú)</p>}
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {p.status === "pendiente" && (
                <Button size="sm" onClick={() => upd.mutate({ id: p.id, patch: { status: "activo" } })}>Aprobar</Button>
              )}
              {p.status !== "retirado" && (
                <Button size="sm" variant="outline" onClick={() => upd.mutate({ id: p.id, patch: { status: "retirado" } })}>Retirar</Button>
              )}
              {p.status === "retirado" && (
                <Button size="sm" variant="outline" onClick={() => upd.mutate({ id: p.id, patch: { status: "activo" } })}>Reactivar</Button>
              )}
              <EditAcciones profile={p} onSave={(n) => upd.mutate({ id: p.id, patch: { num_acciones: n } })} />
              <EditPeriodo profile={p} onSave={(v: { fecha_inicio: string | null; fecha_fin: string | null }) => upd.mutate({ id: p.id, patch: v })} />
              <CompartirWhatsapp profile={p} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pendiente: "bg-muted text-muted-foreground",
    activo: "bg-primary/20 text-primary",
    retirado: "bg-destructive/20 text-destructive",
  };
  return <Badge className={map[status]}>{status}</Badge>;
}

function EditAcciones({ profile, onSave }: { profile: any; onSave: (n: number) => void }) {
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(String(profile.num_acciones));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="ghost">Acciones</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Número de acciones</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Label>Acciones ($10 c/u)</Label>
          <Input type="number" min={0} value={n} onChange={(e) => setN(e.target.value)} />
          <Button className="w-full" onClick={() => { onSave(Number(n)); setOpen(false); }}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditPeriodo({ profile, onSave }: { profile: any; onSave: (v: { fecha_inicio: string | null; fecha_fin: string | null }) => void }) {
  const [open, setOpen] = useState(false);
  const [inicio, setInicio] = useState(profile.fecha_inicio ?? "");
  const [fin, setFin] = useState(profile.fecha_fin ?? "");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="ghost">Periodo</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Periodo de participación</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Solo se contarán aportes desde/hasta este rango. Si están vacíos, se usa el rango general de la caja.</p>
          <div className="space-y-1">
            <Label>Desde (primer mes)</Label>
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Hasta (último mes)</Label>
            <Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => { onSave({ fecha_inicio: inicio || null, fecha_fin: fin || null }); setOpen(false); }}>Guardar</Button>
            <Button variant="outline" onClick={() => { setInicio(""); setFin(""); onSave({ fecha_inicio: null, fecha_fin: null }); setOpen(false); }}>Usar rango caja</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CrearSocioDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [acciones, setAcciones] = useState("1");
  const [loading, setLoading] = useState(false);
  const [creds, setCreds] = useState<{ login_email: string; password: string } | null>(null);
  const create = useServerFn(adminCreateSocio);

  const submit = async () => {
    setLoading(true);
    try {
      const res = await create({ data: { full_name: fullName, username, num_acciones: Number(acciones) } });
      toast.success("Socio creado");
      setCreds({ login_email: res.login_email, password: res.password });
      onCreated();
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    } finally { setLoading(false); }
  };

  const reset = () => {
    setFullName(""); setUsername(""); setAcciones("1"); setCreds(null); setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); else setOpen(true); }}>
      <DialogTrigger asChild><Button size="sm"><UserPlus className="h-4 w-4 mr-1" />Crear socio</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Crear socio</DialogTitle></DialogHeader>
        {creds ? (
          <div className="space-y-3">
            <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 p-3 space-y-2 text-sm">
              <p className="font-semibold text-emerald-700 dark:text-emerald-400">Socio creado. Comparte estos datos:</p>
              <div><p className="text-xs text-muted-foreground">Usuario para ingresar</p><p className="font-mono font-bold">{creds.login_email}</p></div>
              <div><p className="text-xs text-muted-foreground">Contraseña</p><p className="font-mono font-bold">{creds.password}</p></div>
              <p className="text-[11px] text-muted-foreground">Al ingresar por primera vez, el socio podrá poner su correo real y cambiar la contraseña desde Perfil.</p>
            </div>
            <Button className="w-full" onClick={reset}>Listo</Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1"><Label>Nombre completo</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
            <div className="space-y-1">
              <Label>Usuario (opcional)</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Ej: maria (se genera del nombre si lo dejas vacío)" />
              <p className="text-[11px] text-muted-foreground">Se creará el ingreso <strong>usuario@buenavibra.local</strong> con contraseña <strong>123456</strong>.</p>
            </div>
            <div className="space-y-1"><Label>Acciones ($10 c/u)</Label><Input type="number" min={1} value={acciones} onChange={(e) => setAcciones(e.target.value)} /></div>
            <Button className="w-full" onClick={submit} disabled={loading || !fullName.trim()}>{loading ? "Creando..." : "Crear y activar"}</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CompartirWhatsapp({ profile }: { profile: any }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<{ login_email: string; is_placeholder: boolean; default_password: string } | null>(null);
  const [phone, setPhone] = useState(profile.phone ?? "");
  const getLogin = useServerFn(adminGetSocioLogin);

  const openDialog = async () => {
    setOpen(true);
    if (info) return;
    setLoading(true);
    try {
      const res = await getLogin({ data: { user_id: profile.id } });
      setInfo(res);
    } catch (e: any) {
      toast.error(e.message ?? "Error");
    } finally { setLoading(false); }
  };

  const publishedUrl = "https://buena-vibra-cajita.lovable.app";
  const message = info
    ? `Hola ${profile.full_name}, te comparto el acceso a la caja Buena Vibra:\n\n🔗 App: ${publishedUrl}\n👤 Usuario: ${info.login_email}\n🔑 Contraseña: ${info.default_password}\n\nAl entrar por primera vez, en Perfil podrás poner tu correo real y cambiar la contraseña.`
    : "";

  const openWa = () => {
    const digits = String(phone).replace(/[^0-9]/g, "");
    const url = digits
      ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
      : `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(url, "_blank");
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(message); toast.success("Mensaje copiado"); }
    catch { toast.error("No se pudo copiar"); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" onClick={openDialog}>
          <Share2 className="h-4 w-4 mr-1" />WhatsApp
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Compartir acceso por WhatsApp</DialogTitle></DialogHeader>
        {loading || !info ? (
          <p className="text-sm text-muted-foreground">Cargando datos...</p>
        ) : (
          <div className="space-y-3">
            {!info.is_placeholder && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Este socio ya cambió su correo de ingreso. La contraseña <strong>{info.default_password}</strong> solo aplica si no la ha cambiado.
              </p>
            )}
            <div className="rounded-md bg-muted/40 p-3 text-sm whitespace-pre-wrap font-mono">{message}</div>
            <div className="space-y-1">
              <Label>Teléfono con código de país (opcional)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ej: 573001234567" />
              <p className="text-[11px] text-muted-foreground">Si lo dejas vacío, se abrirá WhatsApp para que elijas el contacto.</p>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={openWa}>Abrir WhatsApp</Button>
              <Button variant="outline" onClick={copy}>Copiar</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InvitationsPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [acciones, setAcciones] = useState("1");
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [days, setDays] = useState("30");
  const [created, setCreated] = useState<any>(null);
  const create = useServerFn(adminCreateInvitation);
  const cancel = useServerFn(adminCancelInvitation);

  const { data: invites } = useQuery({
    queryKey: ["admin-invitations"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("invitations").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const publishedUrl = "https://buena-vibra-cajita.lovable.app";
  const linkFor = (code: string) => `${publishedUrl}/auth?invite=${code}`;

  const submit = async () => {
    try {
      const res: any = await create({ data: {
        full_name: fullName,
        num_acciones: Number(acciones),
        fecha_inicio: inicio || null,
        fecha_fin: fin || null,
        expires_in_days: Number(days),
      }});
      setCreated(res);
      qc.invalidateQueries({ queryKey: ["admin-invitations"] });
      toast.success("Invitación creada");
    } catch (e: any) { toast.error(e.message ?? "Error"); }
  };

  const reset = () => {
    setFullName(""); setAcciones("1"); setInicio(""); setFin(""); setDays("30"); setCreated(null); setOpen(false);
  };

  const copyLink = async (code: string) => {
    try { await navigator.clipboard.writeText(linkFor(code)); toast.success("Link copiado"); }
    catch { toast.error("No se pudo copiar"); }
  };

  const shareWa = (code: string, name: string) => {
    const msg = `Hola ${name}, te invito a unirte a la caja Buena Vibra Finance.\n\nAbre este link y crea tu cuenta:\n${linkFor(code)}\n\nCódigo: ${code}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const doCancel = async (id: string) => {
    try { await cancel({ data: { id } }); toast.success("Anulada"); qc.invalidateQueries({ queryKey: ["admin-invitations"] }); }
    catch (e: any) { toast.error(e.message ?? "Error"); }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2"><Mail className="h-4 w-4" />Invitaciones</h3>
          <p className="text-xs text-muted-foreground">Envía un link para que el socio cree su cuenta.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); else setOpen(true); }}>
          <DialogTrigger asChild><Button size="sm">Nueva</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Crear invitación</DialogTitle></DialogHeader>
            {created ? (
              <div className="space-y-3">
                <div className="rounded-md bg-emerald-500/10 border border-emerald-500/30 p-3 space-y-2 text-sm">
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">Invitación creada</p>
                  <div><p className="text-xs text-muted-foreground">Código</p><p className="font-mono font-bold text-lg">{created.code}</p></div>
                  <div><p className="text-xs text-muted-foreground">Link</p><p className="font-mono text-xs break-all">{linkFor(created.code)}</p></div>
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => copyLink(created.code)}><Copy className="h-4 w-4 mr-1" />Copiar link</Button>
                  <Button variant="outline" onClick={() => shareWa(created.code, created.full_name)}>WhatsApp</Button>
                </div>
                <Button variant="ghost" className="w-full" onClick={reset}>Listo</Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1"><Label>Nombre del invitado</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
                <div className="space-y-1"><Label>Acciones ($10 c/u)</Label><Input type="number" min={1} value={acciones} onChange={(e) => setAcciones(e.target.value)} /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1"><Label>Inicio (opc.)</Label><Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
                  <div className="space-y-1"><Label>Fin (opc.)</Label><Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} /></div>
                </div>
                <div className="space-y-1"><Label>Expira en (días)</Label><Input type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} /></div>
                <Button className="w-full" onClick={submit} disabled={!fullName.trim()}>Crear invitación</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {(invites ?? []).length === 0 && (
        <p className="text-xs text-muted-foreground">Aún no hay invitaciones.</p>
      )}
      {(invites ?? []).map((inv: any) => (
        <div key={inv.id} className="rounded-md border border-border p-2 text-sm space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold truncate">{inv.full_name}</p>
              <p className="text-xs text-muted-foreground">{inv.num_acciones} acción(es) · <span className="font-mono">{inv.code}</span></p>
            </div>
            <Badge className={
              inv.status === "pendiente" ? "bg-primary/20 text-primary" :
              inv.status === "usada" ? "bg-emerald-500/20 text-emerald-600" :
              "bg-muted text-muted-foreground"
            }>{inv.status}</Badge>
          </div>
          {inv.status === "pendiente" && (
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" onClick={() => copyLink(inv.code)}><Copy className="h-3 w-3 mr-1" />Link</Button>
              <Button size="sm" variant="outline" onClick={() => shareWa(inv.code, inv.full_name)}>WhatsApp</Button>
              <Button size="sm" variant="ghost" onClick={() => doCancel(inv.id)}><X className="h-3 w-3 mr-1" />Anular</Button>
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}
