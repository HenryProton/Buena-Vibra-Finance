import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { adminListRecoveryRequests } from "@/lib/recovery.functions";
import { LifeBuoy, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";

export function RecoveryRequestsPanel() {
  const list = useServerFn(adminListRecoveryRequests);
  const { data } = useQuery({
    queryKey: ["admin-recovery-requests"],
    queryFn: () => list({ data: undefined as never }),
    refetchInterval: 60_000,
  });

  const rows = data ?? [];
  if (rows.length === 0) return null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <LifeBuoy className="h-4 w-4 text-primary" />
        <h3 className="font-bold">Solicitudes de recuperación</h3>
        <Badge variant="secondary">{rows.length}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Códigos activos (20 min). Si el socio no tiene correo real, envíaselo por WhatsApp.
      </p>
      {rows.map((r) => {
        const msg = `Buena Vibra Finance: tu código de recuperación es ${r.code}. Vence en pocos minutos. Ábrelo en la app en "¿Olvidaste tu contraseña?".`;
        const phone = (r.destination ?? "").replace(/\D/g, "");
        return (
          <div key={r.id} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold truncate">{r.full_name ?? r.identifier}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {r.identifier} · {r.channel} {r.delivered ? "· enviado" : "· pendiente de envío"}
                </p>
              </div>
              <span className="font-mono text-lg font-bold tracking-widest">{r.code}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(r.code);
                  toast.success("Código copiado");
                }}
              >
                <Copy className="mr-1 h-3 w-3" /> Copiar
              </Button>
              {phone.length >= 7 && (
                <Button size="sm" asChild>
                  <a
                    href={`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Share2 className="mr-1 h-3 w-3" /> Enviar por WhatsApp
                  </a>
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </Card>
  );
}
