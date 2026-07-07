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
import { adminCreateSocio } from "@/lib/admin-users.functions";
import { UserPlus } from "lucide-react";

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
    mutationFn: async ({ id, patch }: { id: string; patch: { status?: "pendiente" | "activo" | "retirado"; num_acciones?: number } }) => {
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
                <p className="font-semibold">{p.full_name || "(Sin nombre)"} {admin && <Badge className="ml-1 bg-primary/20 text-primary">Admin</Badge>}</p>
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
