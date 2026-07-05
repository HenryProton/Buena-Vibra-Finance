import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useState } from "react";
import { Sun, Moon, MonitorSmartphone, LogOut } from "lucide-react";
import { SocioAportes } from "@/features/socio/SocioAportes";
import { SocioPrestamos } from "@/features/socio/SocioPrestamos";

export function Perfil() {
  const { profile, refresh, isAdmin } = useAuth();
  const { theme, setTheme } = useTheme();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [cedula, setCedula] = useState(profile?.cedula ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: name, phone, cedula }).eq("id", profile.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Datos actualizados");
    refresh();
  }

  async function logout() {
    await supabase.auth.signOut();
    location.href = "/auth";
  }

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <h3 className="font-semibold">Mis datos</h3>
        <div className="space-y-1"><Label>Nombre completo</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-1"><Label>Teléfono</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div className="space-y-1"><Label>Cédula</Label><Input value={cedula} onChange={(e) => setCedula(e.target.value)} /></div>
        <Button onClick={save} disabled={saving} className="w-full">{saving ? "Guardando..." : "Guardar"}</Button>
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="font-semibold">Apariencia</h3>
        <div className="grid grid-cols-3 gap-2">
          <ThemeBtn active={theme === "system"} onClick={() => setTheme("system")} icon={<MonitorSmartphone className="h-4 w-4" />} label="Sistema" />
          <ThemeBtn active={theme === "light"} onClick={() => setTheme("light")} icon={<Sun className="h-4 w-4" />} label="Claro" />
          <ThemeBtn active={theme === "dark"} onClick={() => setTheme("dark")} icon={<Moon className="h-4 w-4" />} label="Oscuro" />
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <h3 className="font-semibold">Cuenta</h3>
        <p className="text-xs text-muted-foreground">Rol: {isAdmin ? "Administrador" : "Socio"} · {profile?.num_acciones} acción(es)</p>
        <Button variant="outline" className="w-full" onClick={logout}><LogOut className="h-4 w-4 mr-2" />Cerrar sesión</Button>
      </Card>
    </div>
  );
}

function ThemeBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 py-3 rounded-md border transition-colors ${
        active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
      }`}
    >
      {icon}
      <span className="text-xs">{label}</span>
    </button>
  );
}
