import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Home, Wallet, HandCoins, User, LayoutDashboard, Users, ClipboardList } from "lucide-react";
import logo from "@/assets/logo.jpg";
import { SocioInicio } from "@/features/socio/SocioInicio";
import { SocioAportes } from "@/features/socio/SocioAportes";
import { SocioPrestamos } from "@/features/socio/SocioPrestamos";
import { Perfil } from "@/features/shared/Perfil";
import { AdminDashboard } from "@/features/admin/AdminDashboard";
import { AdminSocios } from "@/features/admin/AdminSocios";
import { AdminAportes } from "@/features/admin/AdminAportes";
import { AdminPrestamos } from "@/features/admin/AdminPrestamos";

export const Route = createFileRoute("/app")({
  component: AppShell,
});

type SocioTab = "inicio" | "aportes" | "prestamos" | "perfil";
type AdminTab = "dashboard" | "socios" | "aportes" | "prestamos" | "perfil";

const SOCIO_TABS: SocioTab[] = ["inicio", "aportes", "prestamos", "perfil"];
const ADMIN_TABS: AdminTab[] = ["dashboard", "socios", "aportes", "prestamos", "perfil"];

function AppShell() {
  const { user, profile, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const [socioTab, setSocioTab] = useState<SocioTab>("inicio");
  const [adminTab, setAdminTab] = useState<AdminTab>("dashboard");

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", replace: true });
  }, [loading, user, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <img src={logo} alt="cargando" className="h-16 w-16 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="p-6 max-w-md w-full text-center space-y-3">
          <p>Preparando tu cuenta…</p>
        </Card>
      </div>
    );
  }

  if (!isAdmin && profile.status === "pendiente") {
    return <PendingAccount />;
  }

  if (!isAdmin && profile.status === "retirado") {
    return <RetiredAccount />;
  }

  const isAdminView = isAdmin;

  return (
    <div className="min-h-screen bg-background pb-4">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-md mx-auto px-4 h-14 flex items-center gap-3">
          <img src={logo} alt="logo" className="h-9 w-9 rounded-lg object-cover" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">Buena Vibra Finance</p>
            <p className="text-xs text-muted-foreground truncate">
              {isAdminView ? "Administrador" : "Socio"} · {profile.full_name}
            </p>
          </div>
        </div>
        <nav className="border-t border-border">
          <div className="max-w-md mx-auto flex gap-2 overflow-x-auto px-3 py-2 no-scrollbar">
            {isAdminView ? (
              <>
                <NavBtn active={adminTab === "dashboard"} onClick={() => setAdminTab("dashboard")} icon={<LayoutDashboard className="h-4 w-4" />} label="Panel" />
                <NavBtn active={adminTab === "socios"} onClick={() => setAdminTab("socios")} icon={<Users className="h-4 w-4" />} label="Socios" />
                <NavBtn active={adminTab === "aportes"} onClick={() => setAdminTab("aportes")} icon={<Wallet className="h-4 w-4" />} label="Aportes" />
                <NavBtn active={adminTab === "prestamos"} onClick={() => setAdminTab("prestamos")} icon={<HandCoins className="h-4 w-4" />} label="Préstamos" />
                <NavBtn active={adminTab === "perfil"} onClick={() => setAdminTab("perfil")} icon={<User className="h-4 w-4" />} label="Perfil" />
              </>
            ) : (
              <>
                <NavBtn active={socioTab === "inicio"} onClick={() => setSocioTab("inicio")} icon={<Home className="h-4 w-4" />} label="Inicio" />
                <NavBtn active={socioTab === "aportes"} onClick={() => setSocioTab("aportes")} icon={<Wallet className="h-4 w-4" />} label="Aportes" />
                <NavBtn active={socioTab === "prestamos"} onClick={() => setSocioTab("prestamos")} icon={<HandCoins className="h-4 w-4" />} label="Préstamos" />
                <NavBtn active={socioTab === "perfil"} onClick={() => setSocioTab("perfil")} icon={<User className="h-4 w-4" />} label="Perfil" />
              </>
            )}
          </div>
        </nav>

      </header>

      <SwipeMain
        tabs={isAdminView ? ADMIN_TABS : SOCIO_TABS}
        active={isAdminView ? adminTab : socioTab}
        onChange={(t) => (isAdminView ? setAdminTab(t as AdminTab) : setSocioTab(t as SocioTab))}
      >
        {isAdminView ? (
          <>
            {adminTab === "dashboard" && <AdminDashboard />}
            {adminTab === "socios" && <AdminSocios />}
            {adminTab === "aportes" && <AdminAportes />}
            {adminTab === "prestamos" && <AdminPrestamos />}
            {adminTab === "perfil" && <Perfil />}
          </>
        ) : (
          <>
            {socioTab === "inicio" && <SocioInicio />}
            {socioTab === "aportes" && <SocioAportes />}
            {socioTab === "prestamos" && <SocioPrestamos />}
            {socioTab === "perfil" && <Perfil />}
          </>
        )}
      </SwipeMain>
    </div>
  );
}


function NavBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "bg-muted/60 text-muted-foreground hover:bg-muted"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function SwipeMain<T extends string>({
  tabs,
  active,
  onChange,
  children,
}: {
  tabs: T[];
  active: T;
  onChange: (t: T) => void;
  children: React.ReactNode;
}) {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const [dx, setDx] = useState(0);
  const [animating, setAnimating] = useState(false);

  const idx = tabs.indexOf(active);

  const onTouchStart = (e: React.TouchEvent) => {
    if (animating) return;
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startX.current == null || startY.current == null) return;
    const cx = e.touches[0].clientX - startX.current;
    const cy = e.touches[0].clientY - startY.current;
    if (Math.abs(cy) > Math.abs(cx)) return;
    setDx(cx);
  };
  const onTouchEnd = () => {
    if (startX.current == null) return;
    const threshold = 60;
    if (dx <= -threshold && idx < tabs.length - 1) {
      setAnimating(true);
      setDx(-window.innerWidth);
      setTimeout(() => {
        onChange(tabs[idx + 1]);
        setDx(0);
        setAnimating(false);
      }, 180);
    } else if (dx >= threshold && idx > 0) {
      setAnimating(true);
      setDx(window.innerWidth);
      setTimeout(() => {
        onChange(tabs[idx - 1]);
        setDx(0);
        setAnimating(false);
      }, 180);
    } else {
      setDx(0);
    }
    startX.current = null;
    startY.current = null;
  };

  return (
    <main
      className="max-w-md mx-auto px-4 py-4 touch-pan-y overflow-hidden"
      onTouchStartCapture={onTouchStart}
      onTouchMoveCapture={onTouchMove}
      onTouchEndCapture={onTouchEnd}
      onTouchCancelCapture={onTouchEnd}
    >
      <div
        style={{
          transform: `translateX(${dx}px)`,
          transition: animating ? "transform 180ms ease-out" : dx === 0 ? "transform 160ms ease-out" : "none",
          opacity: animating ? 0 : 1,
        }}
      >
        {children}
      </div>
    </main>
  );
}


function PendingAccount() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="p-6 max-w-md w-full text-center space-y-4">
        <img src={logo} alt="logo" className="h-16 w-16 rounded-xl mx-auto" />
        <h2 className="text-xl font-bold">Cuenta pendiente</h2>
        <p className="text-sm text-muted-foreground">
          Tu registro ha sido recibido. El administrador debe aprobar tu cuenta antes de que puedas acceder a la caja de ahorros.
        </p>
        <Button variant="outline" className="w-full" onClick={async () => { await supabase.auth.signOut(); location.href = "/auth"; }}>
          Cerrar sesión
        </Button>
      </Card>
    </div>
  );
}

function RetiredAccount() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="p-6 max-w-md w-full text-center space-y-4">
        <img src={logo} alt="logo" className="h-16 w-16 rounded-xl mx-auto" />
        <h2 className="text-xl font-bold">Cuenta retirada</h2>
        <p className="text-sm text-muted-foreground">
          Tu cuenta ha sido marcada como retirada. Contacta al administrador para más información.
        </p>
        <Button variant="outline" className="w-full" onClick={async () => { await supabase.auth.signOut(); location.href = "/auth"; }}>
          Cerrar sesión
        </Button>
      </Card>
    </div>
  );
}
