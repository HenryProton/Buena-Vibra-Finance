export const formatUSD = (n: number) =>
  new Intl.NumberFormat("es-VE", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n || 0);

export const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/**
 * Interpreta una fecha respetando la zona horaria local.
 * "2026-03-20" se convierte en el 20 de marzo local (no en UTC),
 * para que en Venezuela (UTC−4) no se muestre un día antes.
 */
export function parseLocalDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const s = String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Fecha en formato venezolano, sin desfase de un día. */
export function formatDateVE(value: string | Date | null | undefined, fallback = "—"): string {
  const d = parseLocalDate(value);
  return d ? d.toLocaleDateString("es-VE") : fallback;
}

/** Convierte un input type="date" en un timestamp ISO al mediodía local (evita el −1 día). */
export function localDateToIso(value: string): string {
  const d = parseLocalDate(value) ?? new Date();
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

/** "YYYY-MM-DD" de hoy en hora local. */
export function todayLocalISODate(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function daysBetween(from: Date | string, to: Date = new Date()) {
  const a = parseLocalDate(from) ?? new Date();
  const ms = to.getTime() - a.getTime();
  return Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
}
