export type RateType = "daily" | "monthly";

/** Convierte tasa a fracción diaria. rate_value viene en % (ej 1 = 1%, 30 = 30%). */
export function dailyRate(rateType: RateType, rateValue: number): number {
  const pct = Number(rateValue) / 100;
  return rateType === "monthly" ? pct / 30 : pct;
}

export function rateLabel(rateType: RateType, rateValue: number): string {
  return `${Number(rateValue).toFixed(2)}% ${rateType === "monthly" ? "mensual" : "diario"}`;
}

/** Devuelve deuda proyectada al día `extraDays` después de hoy. */
export function projectDebt(opts: {
  principal: number;
  rateType: RateType;
  rateValue: number;
  startDate: string | Date;
  paidCapital: number;
  paidInterest: number;
  extraDays?: number;
}) {
  const start = typeof opts.startDate === "string" ? new Date(opts.startDate) : opts.startDate;
  const today = new Date();
  const daysNow = Math.max(0, Math.floor((today.getTime() - start.getTime()) / 86400000));
  const days = daysNow + (opts.extraDays ?? 0);
  const dr = dailyRate(opts.rateType, opts.rateValue);
  const capital = Math.max(0, Number(opts.principal) - Number(opts.paidCapital));
  const interesTotal = Number(opts.principal) * dr * days;
  const interes = Math.max(0, interesTotal - Number(opts.paidInterest));
  return { capital, interes, total: capital + interes, days };
}
