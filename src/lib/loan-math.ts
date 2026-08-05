import { parseLocalDate } from "@/lib/format";

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

/** Clave "YYYY-MM" de una fecha. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function isPausedDate(d: Date, paused?: Set<string> | string[]): boolean {
  if (!paused) return false;
  const set = paused instanceof Set ? paused : new Set(paused);
  return set.has(monthKey(d));
}

/** Días que sí generan interés entre dos fechas (excluye los meses pausados). */
export function chargeableDays(from: Date, to: Date, paused?: Set<string>): number {
  const total = daysBetween(from, to);
  if (!paused || paused.size === 0 || total === 0) return total;
  let count = 0;
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let i = 0; i < total; i++) {
    if (!paused.has(monthKey(cursor))) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/** Última fecha (<= asOf) hasta la cual se cobraron intereses. */
export function interestThroughDate(asOf: Date, paused?: Set<string>): Date {
  if (!paused || paused.size === 0) return asOf;
  const d = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  let guard = 0;
  while (paused.has(monthKey(d)) && guard < 240) {
    // retroceder al último día del mes anterior
    d.setDate(0);
    guard++;
  }
  return d;
}

/**
 * Meses pausados por defecto (se sincronizan una vez desde la caja) para los
 * cálculos que no reciben `pausedMonths` explícitamente.
 */
let defaultPausedMonths: string[] = [];
export function setDefaultPausedMonths(months: string[]) {
  defaultPausedMonths = months;
}
export function getDefaultPausedMonths(): string[] {
  return defaultPausedMonths;
}

/**
 * Calcula la deuda actual (y proyectada) tomando en cuenta las fechas reales de cada abono.
 * Los intereses se acumulan sobre el saldo pendiente entre eventos.
 * Cada abono aplica primero a intereses acumulados y luego a capital.
 * Durante los meses pausados (`pausedMonths`) no se acumulan intereses.
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
  /** Meses pausados en formato "YYYY-MM": no generan intereses. */
  pausedMonths?: string[];
}) {
  const start = parseLocalDate(opts.startDate) ?? new Date();
  const asOf = new Date((opts.asOf ?? new Date()).getTime() + (opts.extraDays ?? 0) * 86400000);
  const dr = dailyRate(opts.rateType, opts.rateValue);
  const paused = new Set(opts.pausedMonths ?? defaultPausedMonths);
  const span = (a: Date, b: Date) => chargeableDays(a, b, paused);

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
      accrued += balance * dr * span(cursor, when);
      // Aplicar abonos
      accrued = Math.max(0, accrued - e.int);
      balance = Math.max(0, balance - e.cap);
      cursor = when;
    }
    if (asOf > cursor) {
      accrued += balance * dr * span(cursor, asOf);
    }
    const days = span(start, asOf);
    return {
      capital: balance,
      interes: accrued,
      total: balance + accrued,
      days,
      calendarDays: daysBetween(start, asOf),
      pausedDays: daysBetween(start, asOf) - days,
      interestThrough: interestThroughDate(asOf, paused),
      isPausedNow: paused.has(monthKey(asOf)),
    };
  }

  // Fallback simple (compat)
  const days = span(start, asOf);
  const capital = Math.max(0, Number(opts.principal) - Number(opts.paidCapital ?? 0));
  const interesTotal = Number(opts.principal) * dr * days;
  const interes = Math.max(0, interesTotal - Number(opts.paidInterest ?? 0));
  return {
    capital,
    interes,
    total: capital + interes,
    days,
    calendarDays: daysBetween(start, asOf),
    pausedDays: daysBetween(start, asOf) - days,
    interestThrough: interestThroughDate(asOf, paused),
    isPausedNow: paused.has(monthKey(asOf)),
  };
}

export function isFullyPaid(debt: { capital: number; interes: number }): boolean {
  return debt.capital < 0.01 && debt.interes < 0.01;
}
