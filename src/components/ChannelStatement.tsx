import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatUSD, MONTHS_ES, formatDateVE } from "@/lib/format";
import { Download, FileText, Share2, AlertTriangle, CheckCircle2, ArrowUpDown } from "lucide-react";

type SortKey = "fecha_desc" | "fecha_asc" | "monto_desc" | "monto_asc" | "socio";
const SORT_LABELS: Record<SortKey, string> = {
  fecha_desc: "Fecha (más reciente)",
  fecha_asc: "Fecha (más antigua)",
  monto_desc: "Monto (mayor a menor)",
  monto_asc: "Monto (menor a mayor)",
  socio: "Socio (A-Z)",
};

const CONCEPTS = {
  aporte: "Aportes mensuales",
  capital: "Abonos a capital",
  interes: "Intereses de préstamos",
  desembolso: "Desembolsos de préstamos",
} as const;
type ConceptKey = keyof typeof CONCEPTS;

type Row = {
  fecha: string;
  socio: string;
  concepto: string;
  key: ConceptKey;
  tipo: "entrada" | "salida";
  monto: number;
};

export function ChannelStatement({
  channel,
  profiles,
  contribs,
  loans,
  payments,
}: {
  channel: { id: string; nombre: string };
  profiles: any[];
  contribs: any[];
  loans: any[];
  payments: any[];
}) {
  const [open, setOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("fecha_desc");
  const nameOf = (uid: string) => profiles.find((p) => p.id === uid)?.full_name ?? "—";

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    contribs
      .filter((c) => c.channel_id === channel.id && c.status === "confirmado")
      .forEach((c) =>
        out.push({
          fecha: (c.confirmed_at ?? c.reported_at ?? c.created_at ?? "").slice(0, 10),
          socio: nameOf(c.user_id),
          concepto: `Aporte mensual ${MONTHS_ES[(c.month ?? 1) - 1] ?? ""} ${c.year ?? ""}`.trim(),
          key: "aporte",
          tipo: "entrada",
          monto: Number(c.amount) || 0,
        }),
      );
    payments
      .filter((p) => p.channel_id === channel.id && p.status === "confirmado")
      .forEach((p) => {
        const cap = Number(p.amount_capital) || 0;
        const int = Number(p.amount_interest) || 0;
        const fecha = (p.payment_date ?? p.confirmed_at ?? p.reported_at ?? "").slice(0, 10);
        if (cap > 0) out.push({ fecha, socio: nameOf(p.user_id), concepto: "Pago de préstamo — abono a capital", key: "capital", tipo: "entrada", monto: cap });
        if (int > 0) out.push({ fecha, socio: nameOf(p.user_id), concepto: "Pago de préstamo — intereses", key: "interes", tipo: "entrada", monto: int });
      });
    loans
      .filter((l) => l.disbursement_channel_id === channel.id && ["activo", "pagado"].includes(l.status))
      .forEach((l) =>
        out.push({
          fecha: (l.disbursed_at ?? l.approved_at ?? l.created_at ?? "").slice(0, 10),
          socio: nameOf(l.user_id),
          concepto: `Desembolso de préstamo${l.status === "pagado" ? " (pagado)" : ""}`,
          key: "desembolso",
          tipo: "salida",
          monto: Number(l.principal) || 0,
        }),
      );
    return out;
  }, [channel.id, profiles, contribs, loans, payments]);

  const sortRows = (list: Row[]) =>
    [...list].sort((a, b) => {
      switch (sort) {
        case "fecha_asc":
          return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0;
        case "monto_desc":
          return b.monto - a.monto;
        case "monto_asc":
          return a.monto - b.monto;
        case "socio":
          return a.socio.localeCompare(b.socio);
        default:
          return a.fecha > b.fecha ? -1 : a.fecha < b.fecha ? 1 : 0;
      }
    });

  const entradas = sortRows(rows.filter((r) => r.tipo === "entrada"));
  const salidas = sortRows(rows.filter((r) => r.tipo === "salida"));
  const totalEntradas = entradas.reduce((a, r) => a + r.monto, 0);
  const totalSalidas = salidas.reduce((a, r) => a + r.monto, 0);
  const saldo = totalEntradas - totalSalidas;

  const byConcept = useMemo(() => {
    const map = new Map<ConceptKey, { total: number; count: number; tipo: "entrada" | "salida" }>();
    rows.forEach((r) => {
      const prev = map.get(r.key) ?? { total: 0, count: 0, tipo: r.tipo };
      map.set(r.key, { total: prev.total + r.monto, count: prev.count + 1, tipo: r.tipo });
    });
    return map;
  }, [rows]);

  // Saldo oficial calculado en el servidor (fuente de verdad)
  const { data: serverBalance, isLoading: balanceLoading } = useQuery({
    queryKey: ["channel-balance", channel.id, open],
    enabled: open,
    queryFn: async () => {
      const { getChannelBalance } = await import("@/lib/channels.functions");
      return await getChannelBalance({ data: { channelId: channel.id } });
    },
  });

  // Conciliación automática
  const alerts = useMemo(() => {
    const a: string[] = [];
    const sumConcepts =
      Array.from(byConcept.entries()).reduce((acc, [, v]) => acc + (v.tipo === "entrada" ? v.total : -v.total), 0);
    if (Math.abs(sumConcepts - saldo) > 0.01) {
      a.push(`Los totales por concepto (${formatUSD(sumConcepts)}) no coinciden con el saldo calculado (${formatUSD(saldo)}).`);
    }
    if (typeof serverBalance === "number" && Math.abs(serverBalance - saldo) > 0.01) {
      a.push(`El saldo del desglose (${formatUSD(saldo)}) no cuadra con el saldo del sistema (${formatUSD(serverBalance)}). Diferencia: ${formatUSD(saldo - serverBalance)}.`);
    }
    if (saldo < -0.01) a.push(`Esta pasarela tiene saldo negativo: entregó más de lo que recibió.`);
    const sinFecha = rows.filter((r) => !r.fecha).length;
    if (sinFecha > 0) a.push(`${sinFecha} movimiento(s) sin fecha registrada.`);
    const sinSocio = rows.filter((r) => r.socio === "—").length;
    if (sinSocio > 0) a.push(`${sinSocio} movimiento(s) sin socio identificado.`);
    const montoCero = rows.filter((r) => !(r.monto > 0)).length;
    if (montoCero > 0) a.push(`${montoCero} movimiento(s) con monto en cero o inválido.`);
    return a;
  }, [byConcept, saldo, serverBalance, rows]);

  const fmtDate = (d: string) => formatDateVE(d);

  const conceptLines = (tipo: "entrada" | "salida") =>
    (Object.keys(CONCEPTS) as ConceptKey[])
      .filter((k) => byConcept.get(k)?.tipo === tipo)
      .map((k) => `  - ${CONCEPTS[k]}: ${formatUSD(byConcept.get(k)!.total)} (${byConcept.get(k)!.count} mov.)`);

  const buildText = () => {
    const l: string[] = [`*ESTADO DE CUENTA — ${channel.nombre}*`, `Generado: ${new Date().toLocaleDateString("es-VE")}`, ""];
    l.push(`*RESUMEN POR CONCEPTO*`);
    l.push(`Recibido:`);
    l.push(...(conceptLines("entrada").length ? conceptLines("entrada") : ["  - Sin movimientos"]));
    l.push(`  TOTAL RECIBIDO: ${formatUSD(totalEntradas)}`, "");
    l.push(`Entregado:`);
    l.push(...(conceptLines("salida").length ? conceptLines("salida") : ["  - Sin movimientos"]));
    l.push(`  TOTAL ENTREGADO: ${formatUSD(totalSalidas)}`, "");
    l.push(`*SALDO QUE DEBE TENER: ${formatUSD(saldo)}*`, "");
    l.push(`*DETALLE — RECIBIÓ*`);
    entradas.forEach((r) => l.push(`  • ${formatUSD(r.monto)} — ${fmtDate(r.fecha)} — de ${r.socio} — ${r.concepto}`));
    if (!entradas.length) l.push("  Sin movimientos.");
    l.push("", `*DETALLE — ENTREGÓ*`);
    salidas.forEach((r) => l.push(`  • ${formatUSD(r.monto)} — ${fmtDate(r.fecha)} — a ${r.socio} — ${r.concepto}`));
    if (!salidas.length) l.push("  Sin movimientos.");
    if (alerts.length) {
      l.push("", `*ALERTAS DE CONCILIACIÓN*`);
      alerts.forEach((x) => l.push(`  ⚠️ ${x}`));
    } else {
      l.push("", "✅ Conciliación correcta: los totales cuadran.");
    }
    return l.join("\n");
  };


  const downloadCsv = () => {
    const head = "Fecha,Socio,Concepto,Tipo,Monto USD";
    const body = rows.map((r) => `${r.fecha},"${r.socio}","${r.concepto}",${r.tipo === "entrada" ? "Recibió" : "Entregó"},${r.monto.toFixed(2)}`);
    body.push(`,,Total recibido,,${totalEntradas.toFixed(2)}`);
    body.push(`,,Total entregado,,${totalSalidas.toFixed(2)}`);
    body.push(`,,Saldo,,${saldo.toFixed(2)}`);
    const blob = new Blob([[head, ...body].join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `estado-cuenta-${channel.nombre.toLowerCase().replace(/\s+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const shareWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(buildText())}`, "_blank");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="w-full">
          <FileText className="h-3 w-3 mr-1" />Ver desglose
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Estado de cuenta · {channel.nombre}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Card className="p-3 space-y-2">
            <h4 className="font-semibold text-sm">Resumen por concepto</h4>
            {(Object.keys(CONCEPTS) as ConceptKey[]).map((k) => {
              const v = byConcept.get(k);
              if (!v) return null;
              return (
                <div key={k} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-muted-foreground min-w-0 break-words">
                    {CONCEPTS[k]} <span className="opacity-60">({v.count})</span>
                  </span>
                  <span className={`font-bold whitespace-nowrap ${v.tipo === "entrada" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                    {v.tipo === "entrada" ? "+" : "−"}{formatUSD(v.total)}
                  </span>
                </div>
              );
            })}
            {byConcept.size === 0 && <p className="text-xs text-muted-foreground">Sin movimientos.</p>}
          </Card>

          <Card className={`p-3 space-y-1 ${alerts.length ? "border-destructive" : "border-emerald-500/50"}`}>
            <div className="flex items-center gap-2 text-sm font-semibold">
              {alerts.length ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />}
              <span>Conciliación automática</span>
            </div>
            {balanceLoading && <p className="text-xs text-muted-foreground">Verificando saldo del sistema…</p>}
            {!balanceLoading && typeof serverBalance === "number" && (
              <p className="text-xs text-muted-foreground">Saldo del sistema: <span className="font-semibold">{formatUSD(serverBalance)}</span></p>
            )}
            {alerts.length === 0 ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">Todo cuadra: los totales por concepto y el saldo coinciden.</p>
            ) : (
              <ul className="space-y-1">
                {alerts.map((a, i) => (
                  <li key={i} className="text-xs text-destructive break-words">⚠️ {a}</li>
                ))}
              </ul>
            )}
          </Card>

          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-3 w-3 text-muted-foreground shrink-0" />
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                  <SelectItem key={k} value={k} className="text-xs">{SORT_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Section title="Recibió" rows={entradas} total={totalEntradas} tone="ok" fmtDate={fmtDate} />
          <Section title="Entregó" rows={salidas} total={totalSalidas} tone="warn" fmtDate={fmtDate} />

          <Card className="p-3 flex items-center justify-between">
            <span className="font-semibold text-sm">Saldo que debe tener</span>
            <span className={`font-bold ${saldo < 0 ? "text-destructive" : "text-primary"}`}>{formatUSD(saldo)}</span>
          </Card>


          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={downloadCsv}>
              <Download className="h-3 w-3 mr-1" />Descargar CSV
            </Button>
            <Button size="sm" onClick={shareWhatsApp}>
              <Share2 className="h-3 w-3 mr-1" />Enviar por WhatsApp
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  rows,
  total,
  tone,
  fmtDate,
}: {
  title: string;
  rows: Row[];
  total: number;
  tone: "ok" | "warn";
  fmtDate: (d: string) => string;
}) {
  const color = tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400";
  return (
    <div className="space-y-1">
      <h4 className="font-semibold text-sm">{title}</h4>
      {rows.length === 0 && <p className="text-xs text-muted-foreground">Sin movimientos.</p>}
      {rows.map((r, i) => (
        <div key={i} className="rounded-md bg-muted/40 p-2 text-xs space-y-1">
          <div className="flex items-start justify-between gap-2">
            <span className="text-muted-foreground">Monto</span>
            <span className={`font-bold whitespace-nowrap ${color}`}>{formatUSD(r.monto)}</span>
          </div>
          <div className="flex items-start justify-between gap-2">
            <span className="text-muted-foreground shrink-0">Fecha</span>
            <span className="font-medium text-right">{fmtDate(r.fecha)}</span>
          </div>
          <div className="flex items-start justify-between gap-2">
            <span className="text-muted-foreground shrink-0">Socio</span>
            <span className="font-medium text-right min-w-0 break-words">{r.socio}</span>
          </div>
          <div className="flex items-start justify-between gap-2">
            <span className="text-muted-foreground shrink-0">Concepto</span>
            <span className="text-right min-w-0 break-words">{r.concepto}</span>
          </div>
        </div>
      ))}
      <div className="flex justify-between text-xs pt-1 border-t border-border">
        <span className="text-muted-foreground">Total {title.toLowerCase()}</span>
        <span className={`font-bold ${color}`}>{formatUSD(total)}</span>
      </div>
    </div>
  );
}
