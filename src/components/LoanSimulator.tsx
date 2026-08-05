import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Calculator } from "lucide-react";
import { formatUSD, formatDateVE } from "@/lib/format";
import { projectDebt, rateLabel, type RateType } from "@/lib/loan-math";

type Scope = "mine" | "all";

export function LoanSimulator({ scope, userId }: { scope: Scope; userId?: string }) {
  return (
    <Card className="p-4 space-y-3 border-primary/30">
      <div className="flex items-center gap-2">
        <Calculator className="h-4 w-4 text-primary" />
        <h3 className="font-bold text-sm">Simulador de préstamos</h3>
      </div>
      <Tabs defaultValue="nuevo">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="nuevo">Nuevo</TabsTrigger>
          <TabsTrigger value="activo">Activo</TabsTrigger>
        </TabsList>
        <TabsContent value="nuevo" className="pt-3">
          <SimNuevo />
        </TabsContent>
        <TabsContent value="activo" className="pt-3">
          <SimActivo scope={scope} userId={userId} />
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function SimNuevo() {
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const [monto, setMonto] = useState("100");
  const [rateType, setRateType] = useState<RateType>("monthly");
  const [rateValue, setRateValue] = useState("20");
  const [fechaInicio, setFechaInicio] = useState(today);
  const [fechaFin, setFechaFin] = useState(in30);

  const invalid = useMemo(() => {
    const s = new Date(fechaInicio).getTime();
    const e = new Date(fechaFin).getTime();
    if (isNaN(s) || isNaN(e)) return "Selecciona ambas fechas.";
    if (e <= s) return "La fecha de pago debe ser posterior a la fecha del préstamo.";
    return null;
  }, [fechaInicio, fechaFin]);

  const d = useMemo(() => {
    const principal = Number(monto) || 0;
    const rv = Number(rateValue) || 0;
    const start = new Date(fechaInicio);
    const end = new Date(fechaFin);
    const totalDays = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
    // Anchor startDate so (now - startDate) equals totalDays; extraDays=0.
    const anchoredStart = new Date(Date.now() - totalDays * 86400000);
    return projectDebt({
      principal,
      rateType,
      rateValue: rv,
      startDate: anchoredStart,
      extraDays: 0,
    });
  }, [monto, rateType, rateValue, fechaInicio, fechaFin]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Monto (USD)</Label>
          <Input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tasa (%)</Label>
          <Input type="number" step="0.01" value={rateValue} onChange={(e) => setRateValue(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Tipo de tasa</Label>
          <Select value={rateType} onValueChange={(v) => setRateType(v as RateType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Mensual</SelectItem>
              <SelectItem value="daily">Diaria</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Fecha del préstamo</Label>
          <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
        </div>
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Fecha de pago</Label>
          <Input type="date" min={fechaInicio} value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
        </div>
      </div>
      {invalid ? (
        <p className="text-xs text-destructive font-medium text-center py-2">{invalid}</p>
      ) : (
        <ResultBox
          capital={d.capital}
          interes={d.interes}
          total={d.total}
          note={`${rateLabel(rateType, Number(rateValue) || 0)} · ${d.days} días (${formatDateVE(fechaInicio)} → ${formatDateVE(fechaFin)})`}
        />
      )}
    </div>
  );
}

function SimActivo({ scope, userId }: { scope: Scope; userId?: string }) {
  const { data } = useQuery({
    queryKey: ["sim-loans", scope, userId ?? ""],
    queryFn: async () => {
      let q = supabase.from("loans").select("*").eq("status", "activo");
      if (scope === "mine" && userId) q = q.eq("user_id", userId);
      const { data: loans } = await q.order("created_at", { ascending: false });
      const ids = (loans ?? []).map((l) => l.id);
      const [{ data: pays }, { data: profiles }] = await Promise.all([
        ids.length
          ? supabase.from("loan_payments").select("*").in("loan_id", ids).eq("status", "confirmado")
          : Promise.resolve({ data: [] as any[] }),
        scope === "all"
          ? supabase.from("profiles").select("id, full_name")
          : Promise.resolve({ data: [] as any[] }),
      ]);
      return { loans: loans ?? [], pays: pays ?? [], profiles: profiles ?? [] };
    },
  });

  const loans = data?.loans ?? [];
  const [selected, setSelected] = useState<string>("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));

  const loan = loans.find((l) => l.id === selected) ?? loans[0];
  const nameOf = (uid: string) => data?.profiles.find((p) => p.id === uid)?.full_name ?? "";

  const d = useMemo(() => {
    if (!loan) return null;
    const start = loan.disbursed_at ?? loan.approved_at ?? loan.created_at;
    const target = new Date(fecha);
    const now = new Date();
    const extraDays = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 86400000));
    const mine = (data?.pays ?? []).filter((p) => p.loan_id === loan.id);
    return projectDebt({
      principal: Number(loan.principal),
      rateType: loan.rate_type as RateType,
      rateValue: Number(loan.rate_value),
      startDate: start,
      payments: mine,
      extraDays,
    });
  }, [loan, fecha, data?.pays]);

  const loanStart = loan ? (loan.disbursed_at ?? loan.approved_at ?? loan.created_at) : null;
  const loanStartDay = loanStart ? new Date(loanStart).toISOString().slice(0, 10) : "";
  const invalid = useMemo(() => {
    if (!loanStartDay) return null;
    const t = new Date(fecha).getTime();
    if (isNaN(t)) return "Selecciona una fecha de pago.";
    if (t <= new Date(loanStartDay).getTime())
      return "La fecha de pago debe ser posterior a la fecha del préstamo.";
    return null;
  }, [fecha, loanStartDay]);

  if (loans.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-3">No hay préstamos activos.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Préstamo</Label>
        <Select value={loan?.id ?? ""} onValueChange={setSelected}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {loans.map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {scope === "all" ? `${nameOf(l.user_id)} · ` : ""}
                {formatUSD(Number(l.principal))} · {rateLabel(l.rate_type as RateType, Number(l.rate_value))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Fecha del préstamo</Label>
          <Input type="date" value={loanStartDay} readOnly disabled />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Fecha de pago</Label>
          <Input type="date" min={loanStartDay} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
      </div>
      {invalid ? (
        <p className="text-xs text-destructive font-medium text-center py-2">{invalid}</p>
      ) : (
        d && (
          <ResultBox
            capital={d.capital}
            interes={d.interes}
            total={d.total}
            note={`Al ${formatDateVE(fecha)} · ${d.days} días desde el desembolso`}
          />
        )
      )}
    </div>
  );
}

function ResultBox({ capital, interes, total, note }: { capital: number; interes: number; total: number; note: string }) {
  return (
    <Card className="p-3 space-y-2 bg-muted/30">
      <div className="flex justify-between text-sm"><span>Capital pendiente</span><span className="font-semibold">{formatUSD(capital)}</span></div>
      <div className="flex justify-between text-sm"><span>Intereses</span><span className="font-semibold text-primary">{formatUSD(interes)}</span></div>
      <div className="flex justify-between text-base pt-2 border-t border-border"><span className="font-semibold">Total a pagar</span><span className="font-bold">{formatUSD(total)}</span></div>
      <p className="text-[11px] text-muted-foreground pt-1">{note}</p>
    </Card>
  );
}
