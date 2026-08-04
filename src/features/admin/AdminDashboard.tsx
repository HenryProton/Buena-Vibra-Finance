import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { formatUSD } from "@/lib/format";
import { projectDebt, type RateType } from "@/lib/loan-math";
import { useChannels } from "@/lib/queries";
import { useCajaPauses } from "@/lib/queries";
import { ChannelStatement } from "@/components/ChannelStatement";
import { Users, Wallet, HandCoins, Clock, Landmark, TrendingUp, TrendingDown } from "lucide-react";

export function AdminDashboard() {
  const { data: channels = [] } = useChannels(false);
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

  const profiles = data?.profiles ?? [];
  const contribs = data?.contribs ?? [];
  const loans = data?.loans ?? [];
  const payments = data?.payments ?? [];
  const confirmedPayments = payments.filter((p) => p.status === "confirmado");
  const confirmedContribs = contribs.filter((c) => c.status === "confirmado");

  const socios = profiles.filter((p) => p.status === "activo").length;
  const pendientesReg = profiles.filter((p) => p.status === "pendiente").length;
  const activeLoans = loans.filter((l) => l.status === "activo");

  // Global loan totals (with proper interest projection)
  let capitalPendiente = 0;
  let interesPendiente = 0;
  activeLoans.forEach((l) => {
    const mine = confirmedPayments.filter((p) => p.loan_id === l.id);
    const d = projectDebt({
      principal: Number(l.principal),
      rateType: l.rate_type as RateType,
      rateValue: Number(l.rate_value),
      startDate: l.disbursed_at ?? l.approved_at ?? l.created_at,
      payments: mine,
    });
    capitalPendiente += d.capital;
    interesPendiente += d.interes;
  });
  const totalPrestado = activeLoans.reduce((a, l) => a + Number(l.principal), 0);
  const totalCaja = confirmedContribs.reduce((a, c) => a + Number(c.amount), 0);

  const aportesPend = contribs.filter((c) => c.status === "reportado").length;
  const pagosPend = payments.filter((p) => p.status === "reportado").length;
  const solPrest = loans.filter((l) => l.status === "pendiente_aprobacion").length;

  // Per-channel breakdown
  const perChannel = channels.map((ch) => {
    const capRecaudado = confirmedPayments.filter((p) => p.channel_id === ch.id).reduce((a, p) => a + Number(p.amount_capital), 0);
    const intRecaudado = confirmedPayments.filter((p) => p.channel_id === ch.id).reduce((a, p) => a + Number(p.amount_interest), 0);
    const aportesCanal = confirmedContribs.filter((c) => c.channel_id === ch.id).reduce((a, c) => a + Number(c.amount), 0);
    const desembolsado = loans.filter((l) => l.disbursement_channel_id === ch.id && ["activo", "pagado"].includes(l.status)).reduce((a, l) => a + Number(l.principal), 0);
    const saldo = aportesCanal + capRecaudado + intRecaudado - desembolsado;

    let capPorCobrar = 0;
    let intPorCobrar = 0;
    activeLoans
      .filter((l) => l.disbursement_channel_id === ch.id)
      .forEach((l) => {
        const mine = confirmedPayments.filter((p) => p.loan_id === l.id);
        const d = projectDebt({
          principal: Number(l.principal),
          rateType: l.rate_type as RateType,
          rateValue: Number(l.rate_value),
          startDate: l.disbursed_at ?? l.approved_at ?? l.created_at,
          payments: mine,
        });
        capPorCobrar += d.capital;
        intPorCobrar += d.interes;
      });

    return { ch, saldo, capRecaudado, intRecaudado, capPorCobrar, intPorCobrar };
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={<Wallet className="h-4 w-4" />} label="Total en caja" value={formatUSD(totalCaja)} />
        <StatCard icon={<HandCoins className="h-4 w-4" />} label="Total prestado" value={formatUSD(totalPrestado)} />
        <StatCard icon={<TrendingDown className="h-4 w-4" />} label="Capital por cobrar" value={formatUSD(capitalPendiente)} />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Interés por cobrar" value={formatUSD(interesPendiente)} highlight />
        <StatCard icon={<Users className="h-4 w-4" />} label="Socios activos" value={socios.toString()} />
        <StatCard icon={<Users className="h-4 w-4" />} label="Registros pendientes" value={pendientesReg.toString()} highlight={pendientesReg > 0} />
      </div>

      <Card className="p-4 space-y-3">
        <h3 className="font-semibold flex items-center gap-2"><Landmark className="h-4 w-4" />Pasarelas de pago</h3>
        {perChannel.length === 0 && <p className="text-xs text-muted-foreground">No hay canales configurados.</p>}
        <div className="space-y-3">
          {perChannel.map(({ ch, saldo, capRecaudado, intRecaudado, capPorCobrar, intPorCobrar }) => (
            <div key={ch.id} className="rounded-lg border border-border p-3 space-y-3 animate-fade-in">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <p className="font-bold truncate min-w-0">{ch.nombre}</p>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-muted-foreground uppercase leading-tight">Saldo disponible</p>
                  <p className={`font-bold text-sm whitespace-nowrap ${saldo < 0 ? "text-destructive" : "text-primary"}`}>{formatUSD(saldo)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <MiniStat label="Capital recaudado" value={capRecaudado} tone="ok" />
                <MiniStat label="Interés recaudado" value={intRecaudado} tone="ok" />
                <MiniStat label="Capital por cobrar" value={capPorCobrar} tone="warn" />
                <MiniStat label="Interés por cobrar" value={intPorCobrar} tone="warn" />
              </div>
              <ChannelStatement
                channel={ch}
                profiles={profiles}
                contribs={contribs}
                loans={loans}
                payments={payments}
              />
            </div>
          ))}
        </div>
      </Card>

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
    <Card className={`p-3 space-y-1 animate-fade-in min-w-0 ${highlight ? "border-primary" : ""}`}>
      <div className="flex items-center gap-1.5 text-muted-foreground text-[11px] leading-tight">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <p className="text-lg font-bold break-words leading-tight">{value}</p>
    </Card>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" }) {
  return (
    <div className="rounded-md bg-muted/40 p-2 min-w-0">
      <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
      <p className={`font-semibold break-words ${tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"}`}>{formatUSD(value)}</p>
    </div>
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
