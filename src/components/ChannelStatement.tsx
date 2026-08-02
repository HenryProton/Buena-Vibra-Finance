import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatUSD, MONTHS_ES } from "@/lib/format";
import { Download, FileText, Share2 } from "lucide-react";

type Row = {
  fecha: string;
  socio: string;
  concepto: string;
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
        if (cap > 0) out.push({ fecha, socio: nameOf(p.user_id), concepto: "Abono a capital", tipo: "entrada", monto: cap });
        if (int > 0) out.push({ fecha, socio: nameOf(p.user_id), concepto: "Pago de interés", tipo: "entrada", monto: int });
      });
    loans
      .filter((l) => l.disbursement_channel_id === channel.id && ["activo", "pagado"].includes(l.status))
      .forEach((l) =>
        out.push({
          fecha: (l.disbursed_at ?? l.approved_at ?? l.created_at ?? "").slice(0, 10),
          socio: nameOf(l.user_id),
          concepto: `Desembolso de préstamo${l.status === "pagado" ? " (pagado)" : ""}`,
          tipo: "salida",
          monto: Number(l.principal) || 0,
        }),
      );
    return out.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  }, [channel.id, profiles, contribs, loans, payments]);

  const entradas = rows.filter((r) => r.tipo === "entrada");
  const salidas = rows.filter((r) => r.tipo === "salida");
  const totalEntradas = entradas.reduce((a, r) => a + r.monto, 0);
  const totalSalidas = salidas.reduce((a, r) => a + r.monto, 0);
  const saldo = totalEntradas - totalSalidas;

  const fmtDate = (d: string) => (d ? new Date(d + "T00:00:00").toLocaleDateString("es-VE") : "—");

  const buildText = () => {
    const l: string[] = [`ESTADO DE CUENTA — ${channel.nombre}`, ""];
    l.push("RECIBIÓ (entradas):");
    entradas.forEach((r) => l.push(`  ${fmtDate(r.fecha)} · ${r.socio} · ${r.concepto} · ${formatUSD(r.monto)}`));
    l.push(`  TOTAL RECIBIDO: ${formatUSD(totalEntradas)}`, "");
    l.push("ENTREGÓ (salidas):");
    salidas.forEach((r) => l.push(`  ${fmtDate(r.fecha)} · ${r.socio} · ${r.concepto} · ${formatUSD(r.monto)}`));
    l.push(`  TOTAL ENTREGADO: ${formatUSD(totalSalidas)}`, "");
    l.push(`SALDO QUE DEBE TENER: ${formatUSD(saldo)}`);
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
        <div key={i} className="flex items-start justify-between gap-2 rounded-md bg-muted/40 p-2 text-xs">
          <div className="min-w-0">
            <p className="font-medium truncate">{r.socio}</p>
            <p className="text-muted-foreground truncate">{r.concepto} · {fmtDate(r.fecha)}</p>
          </div>
          <span className={`font-semibold whitespace-nowrap ${color}`}>{formatUSD(r.monto)}</span>
        </div>
      ))}
      <div className="flex justify-between text-xs pt-1 border-t border-border">
        <span className="text-muted-foreground">Total {title.toLowerCase()}</span>
        <span className={`font-bold ${color}`}>{formatUSD(total)}</span>
      </div>
    </div>
  );
}
