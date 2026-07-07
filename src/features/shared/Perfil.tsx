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
import { AdminAjustes } from "@/features/admin/AdminAjustes";

export function Perfil() {
  const { user, profile, refresh, isAdmin } = useAuth();
  const { theme, setTheme } = useTheme();
  const [name, setName] = useState(profile?.full_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [cedula, setCedula] = useState(profile?.cedula ?? "");
  const [saving, setSaving] = useState(false);

  const isPlaceholderEmail = !!user?.email?.endsWith("@buenavibra.local");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingCreds, setSavingCreds] = useState(false);

  async function save() {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ full_name: name, phone, cedula }).eq("id", profile.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Datos actualizados");
    refresh();
  }

  async function updateCreds() {
    const patch: { email?: string; password?: string } = {};
    if (newEmail.trim()) patch.email = newEmail.trim();
    if (newPassword) {
      if (newPassword.length < 6) return toast.error("La contraseña debe tener al menos 6 caracteres");
      patch.password = newPassword;
    }
    if (!patch.email && !patch.password) return toast.error("Nada que actualizar");
    setSavingCreds(true);
    const { error } = await supabase.auth.updateUser(patch);
    setSavingCreds(false);
    if (error) return toast.error(error.message);
    toast.success(patch.email ? "Revisa tu correo para confirmar el cambio de email" : "Contraseña actualizada");
    setNewEmail(""); setNewPassword("");
  }

  async function logout() {
    await supabase.auth.signOut();
    location.href = "/auth";
  }

  return (
    <div className="space-y-4">
      {isPlaceholderEmail && (
        <Card className="p-4 space-y-3 border-primary bg-primary/5">
          <div>
            <h3 className="font-semibold">Configura tu correo y contraseña</h3>
            <p className="text-xs text-muted-foreground">Tu cuenta fue creada por el administrador. Añade tu correo real y cambia la contraseña.</p>
          </div>
          <div className="space-y-1"><Label>Tu correo real</Label><Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="tucorreo@ejemplo.com" /></div>
          <div className="space-y-1"><Label>Nueva contraseña (opcional, mín 6)</Label><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
          <Button onClick={updateCreds} disabled={savingCreds} className="w-full">{savingCreds ? "Guardando..." : "Actualizar"}</Button>
        </Card>
      )}

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

      {isAdmin && (
        <>
          <AdminAjustes />
          <Card className="p-4 space-y-3">
            <div>
              <h3 className="font-semibold">Mi actividad como socio</h3>
              <p className="text-xs text-muted-foreground">Tus propios aportes y préstamos.</p>
            </div>
            <Tabs defaultValue="aportes">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="aportes">Mis aportes</TabsTrigger>
                <TabsTrigger value="prestamos">Mis préstamos</TabsTrigger>
              </TabsList>
              <TabsContent value="aportes" className="mt-3"><SocioAportes /></TabsContent>
              <TabsContent value="prestamos" className="mt-3"><SocioPrestamos /></TabsContent>
            </Tabs>
          </Card>
        </>
      )}
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
