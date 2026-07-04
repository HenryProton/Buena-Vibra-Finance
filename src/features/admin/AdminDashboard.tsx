import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { formatUSD, daysBetween } from "@/lib/format";
import { Users, Wallet, HandCoins, Clock } from "lucide-react";

export function AdminDashboard() {
  const { data } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const [{ data: profiles }, { data: contribs }, { data: loans }, { data: payments }] = await Promise.all([
        supabase.from("profiles").select("*"),
        supabase.from("monthly_contributions").select("*"),
        supabase.from("loans").select("*"),
        supabase.from("loan_payments").select("*"),
      ]);
      return { profiles: profiles ?? [], contribs: contribs ?? [], loans: loans ?? [], payments: payments ?? [] };
    },
  });

  const socios = (data?.profiles ?? []).filter((p) => p.status === "activo").length;
  const pendientesReg = (data?.profiles ?? []).filter((p) => p.status === "pendiente").length;
  const totalCaja = (data?.contribs ?? []).filter((c) => c.status === "confirmado").reduce((a, c) => a + Number(c.amount), 0);
  const activeLoans = (data?.loans ?? []).filter((l) => l.status === "activo");
  const totalPrestado = activeLoans.reduce((a, l) => {
    const paid = (data?.payments ?? []).filter((p) => p.loan_id === l.id && p.status === "confirmado").reduce((s, p) => s + Number(p.amount_capital), 0);
    return a + Math.max(0, Number(l.principal) - paid);
  }, 0);
  const aportesPend = (data?.contribs ?? []).filter((c) => c.status === "reportado").length;
  const pagosPend = (data?.payments ?? []).filter((p) => p.status === "reportado").length;
  const solPrest = (data?.loans ?? []).filter((l) => l.status === "pendiente_aprobacion").length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={<Wallet className="h-4 w-4" />} label="Total en caja" value={formatUSD(totalCaja)} />
        <StatCard icon={<HandCoins className="h-4 w-4" />} label="Total prestado" value={formatUSD(totalPrestado)} />
        <StatCard icon={<Users className="h-4 w-4" />} label="Socios activos" value={socios.toString()} />
        <StatCard icon={<Users className="h-4 w-4" />} label="Registros pendientes" value={pendientesReg.toString()} highlight={pendientesReg > 0} />
      </div>

      <Card className="p-4 space-y-2">
        <h3 className="font-semibold flex items-center gap-2"><Clock className="h-4 w-4" />Por confirmar</h3>
        <div className="space-y-1 text-sm">
          <RowStat label="Aportes reportados" value={aportesPend} />
          <RowStat label="Abonos reportados" value={pagosPend} />
          <RowStat label="Solicitudes de préstamo" value={solPrest} />
        </div>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={`p-4 space-y-1 ${highlight ? "border-primary" : ""}`}>
      <div className="flex items-center gap-2 text-muted-foreground text-xs">{icon}{label}</div>
      <p className="text-xl font-bold">{value}</p>
    </Card>
  );
}

function RowStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold ${value > 0 ? "text-primary" : ""}`}>{value}</span>
    </div>
  );
}
