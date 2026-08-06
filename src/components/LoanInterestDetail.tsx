import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatUSD, formatDateVE } from "@/lib/format";
import { projectDebt, dailyRate, rateLabel, type RateType, type LoanPayment } from "@/lib/loan-math";
import { Calculator, PauseCircle } from "lucide-react";

/**
 * Detalle de intereses de un préstamo: fórmula usada, rango de fechas,
 * días cobrados y hasta qué fecha se cobraron los intereses.
 */
export function LoanInterestDetail({
  loan,
  payments = [],
  pausedMonths,
}: {
  loan: {
    principal: number | string;
    rate_type: string;
    rate_value: number | string;
    disbursed_at?: string | null;
    approved_at?: string | null;
    created_at?: string | null;
  };
  payments?: LoanPayment[];
  pausedMonths?: string[];
}) {
  const start = loan.disbursed_at ?? loan.approved_at ?? loan.created_at ?? new Date().toISOString();
  const rateType = (loan.rate_type as RateType) ?? "daily";
  const rateValue = Number(loan.rate_value);
  const principal = Number(loan.principal);

  const debt = useMemo(
    () => projectDebt({ principal, rateType, rateValue, startDate: start, payments, pausedMonths }),
    [principal, rateType, rateValue, start, payments, pausedMonths],
  );

  const dr = dailyRate(rateType, rateValue);
  const interesPorDia = principal * dr;
  const confirmados = payments.filter((p) => (p.status ?? "confirmado") === "confirmado");
  const pagadoInteres = confirmados.reduce((a, p) => a + (Number(p.amount_interest) || 0), 0);
  const pagadoCapital = confirmados.reduce((a, p) => a + (Number(p.amount_capital) || 0), 0);

  return (
    <Card className="p-3 space-y-3 bg-muted/30">
      <div className="flex items-center gap-2">
        <Calculator className="h-4 w-4 text-primary" />
        <h4 className="font-semibold text-sm">Detalle de intereses</h4>
        {debt.isPausedNow && (
          <Badge variant="outline" className="text-[10px] border-blue-500/40 bg-blue-500/10 text-blue-600">
            <PauseCircle className="h-3 w-3 mr-1" />Caja en pausa
          </Badge>
        )}
      </div>

      <div className="rounded-md border border-border bg-background p-2 text-[11px] font-mono leading-relaxed">
        interés = saldo de capital × tasa diaria × días cobrables
        <br />
        tasa diaria = {rateLabel(rateType, rateValue)} → {(dr * 100).toFixed(4)}% por día
        <br />
        interés de hoy sobre {formatUSD(principal)} = {formatUSD(interesPorDia)} / día
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Item label="Fecha del préstamo" value={formatDateVE(start)} />
        <Item label="Intereses cobrados hasta" value={formatDateVE(debt.interestThrough)} />
        <Item label="Días calendario" value={`${debt.calendarDays} día(s)`} />
        <Item label="Días que generan interés" value={`${debt.days} día(s)`} />
        {debt.pausedDays > 0 && (
          <Item label="Días congelados (pausa)" value={`${debt.pausedDays} día(s)`} className="text-blue-600" />
        )}
        <Item label="Abonos registrados" value={`${confirmados.length}`} />
      </div>

      {confirmados.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-muted-foreground">Abonos aplicados (primero a interés, luego a capital)</p>
          {[...confirmados]
            .sort((a, b) => String(a.payment_date ?? a.reported_at).localeCompare(String(b.payment_date ?? b.reported_at)))
            .map((p, i) => (
              <div key={i} className="flex justify-between text-[11px] border-b border-border/60 last:border-0 py-1">
                <span>{formatDateVE(p.payment_date ?? p.reported_at)}</span>
                <span className="text-muted-foreground">
                  Int {formatUSD(Number(p.amount_interest) || 0)} · Cap {formatUSD(Number(p.amount_capital) || 0)}
                </span>
              </div>
            ))}
          <div className="flex justify-between text-[11px] font-semibold pt-1">
            <span>Total abonado</span>
            <span>Int {formatUSD(pagadoInteres)} · Cap {formatUSD(pagadoCapital)}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border text-xs">
        <Item label="Capital pendiente" value={formatUSD(debt.capital)} />
        <Item label="Interés acumulado" value={formatUSD(debt.interes)} className="text-amber-600" />
        <Item label="Total a hoy" value={formatUSD(debt.total)} className="text-primary font-bold" />
      </div>
    </Card>
  );
}

function Item({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-[11px]">{label}</p>
      <p className={`font-semibold ${className}`}>{value}</p>
    </div>
  );
}
