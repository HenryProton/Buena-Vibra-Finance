export type RateType = "daily" | "monthly";

export type LoanPayment = {
  payment_date?: string | null;
  reported_at?: string | null;
  amount_capital: number | string;
  amount_interest: number | string;
  status?: string;
};

/** Convierte tasa a fracción diaria. rate_value viene en % (1 = 1%). */
export function dailyRate(rateType: RateType, rateValue: number): number {
  const pct = Number(rateValue) / 100;
  return rateType === "monthly" ? pct / 30 : pct;
}

export function rateLabel(rateType: RateType, rateValue: number): string {
  return `${Number(rateValue).toFixed(2)}% ${rateType === "monthly" ? "mensual" : "diario"}`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 86400000));
}

/**
 * Calcula la deuda actual (y proyectada) tomando en cuenta las fechas reales de cada abono.
 * Los intereses se acumulan sobre el saldo pendiente entre eventos.
 * Cada abono aplica primero a intereses acumulados y luego a capital.
 */
export function projectDebt(opts: {
  principal: number;
  rateType: RateType;
  rateValue: number;
  startDate: string | Date;
  payments?: LoanPayment[];
  /** Fallback para compatibilidad si no se pasan `payments`. */
  paidCapital?: number;
  paidInterest?: number;
  extraDays?: number;
  asOf?: Date;
}) {
  const start = typeof opts.startDate === "string" ? new Date(opts.startDate) : opts.startDate;
  const asOf = new Date((opts.asOf ?? new Date()).getTime() + (opts.extraDays ?? 0) * 86400000);
  const dr = dailyRate(opts.rateType, opts.rateValue);

  if (opts.payments && opts.payments.length > 0) {
    // Ordenar cronológicamente por fecha efectiva
    const evs = opts.payments
      .filter((p) => (p.status ?? "confirmado") === "confirmado")
      .map((p) => ({
        date: new Date(p.payment_date || p.reported_at || start),
        cap: Number(p.amount_capital) || 0,
        int: Number(p.amount_interest) || 0,
      }))
      .filter((e) => !isNaN(e.date.getTime()))
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    let balance = Number(opts.principal);
    let accrued = 0;
    let cursor = start;
    for (const e of evs) {
      const when = e.date < start ? start : e.date;
      const d = daysBetween(cursor, when);
      accrued += balance * dr * d;
      // Aplicar abonos
      accrued = Math.max(0, accrued - e.int);
      balance = Math.max(0, balance - e.cap);
      cursor = when;
    }
    if (asOf > cursor) {
      const d = daysBetween(cursor, asOf);
      accrued += balance * dr * d;
    }
    const days = daysBetween(start, asOf);
    return { capital: balance, interes: accrued, total: balance + accrued, days };
  }

  // Fallback simple (compat)
  const days = daysBetween(start, asOf);
  const capital = Math.max(0, Number(opts.principal) - Number(opts.paidCapital ?? 0));
  const interesTotal = Number(opts.principal) * dr * days;
  const interes = Math.max(0, interesTotal - Number(opts.paidInterest ?? 0));
  return { capital, interes, total: capital + interes, days };
}

export function isFullyPaid(debt: { capital: number; interes: number }): boolean {
  return debt.capital < 0.01 && debt.interes < 0.01;
}
