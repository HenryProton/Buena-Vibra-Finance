import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { formatUSD, daysBetween, MONTHS_ES } from "@/lib/format";
import { Wallet, HandCoins, AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function SocioInicio() {
  const { user, profile } = useAuth();
  const uid = user!.id;

  const { data } = useQuery({
    queryKey: ["socio-summary", uid],
    queryFn: async () => {
      const [{ data: contribs }, { data: loans }, { data: payments }] = await Promise.all([
        supabase.from("monthly_contributions").select("*").eq("user_id", uid).eq("status", "confirmado"),
        supabase.from("loans").select("*").eq("user_id", uid).in("status", ["activo"]),
        supabase.from("loan_payments").select("*").eq("user_id", uid).eq("status", "confirmado"),
      ]);
      return { contribs: contribs ?? [], loans: loans ?? [], payments: payments ?? [] };
    },
  });

  const totalAhorrado = (data?.contribs ?? []).reduce((a, c) => a + Number(c.amount), 0);
  let capitalActivo = 0;
  let interesActivo = 0;
  (data?.loans ?? []).forEach((l) => {
    const paidCap = (data?.payments ?? [])
      .filter((p) => p.loan_id === l.id)
      .reduce((a, p) => a + Number(p.amount_capital), 0);
    const paidInt = (data?.payments ?? [])
      .filter((p) => p.loan_id === l.id)
      .reduce((a, p) => a + Number(p.amount_interest), 0);
    const cap = Number(l.principal) - paidCap;
    const dias = daysBetween(l.disbursed_at ?? l.approved_at ?? l.created_at);
    const intGen = Number(l.principal) * Number(l.daily_rate) * dias - paidInt;
    capitalActivo += Math.max(0, cap);
    interesActivo += Math.max(0, intGen);
  });

  const now = new Date();
  const yr = now.getFullYear();
  const mo = now.getMonth() + 1;
  const currentMonthPaid = (data?.contribs ?? []).some((c) => c.year === yr && c.month === mo);
  const showAlert = now.getDate() > 5 && !currentMonthPaid;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Wallet className="h-4 w-4" /> Ahorrado
          </div>
          <p className="text-xl font-bold">{formatUSD(totalAhorrado)}</p>
          <p className="text-xs text-muted-foreground">{profile?.num_acciones} acción(es) · $10 c/u</p>
        </Card>
        <Card className="p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <HandCoins className="h-4 w-4" /> Deuda actual
          </div>
          <p className="text-xl font-bold">{formatUSD(capitalActivo + interesActivo)}</p>
          <p className="text-xs text-muted-foreground">
            Cap {formatUSD(capitalActivo)} · Int {formatUSD(interesActivo)}
          </p>
        </Card>
      </div>

      {showAlert && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Aporte del mes pendiente</AlertTitle>
          <AlertDescription>
            El aporte de {MONTHS_ES[mo - 1]} debía pagarse en los primeros 5 días del mes.
          </AlertDescription>
        </Alert>
      )}

      <Card className="p-4 space-y-2">
        <h3 className="font-semibold">Recordatorio</h3>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
          <li>Cada acción = $10 mensuales, pagar en los primeros 5 días del mes.</li>
          <li>Tasa de préstamo: 1% diario (ajustable por el admin).</li>
          <li>Máximo por préstamo: 10× tu aporte mensual.</li>
          <li>2 meses sin pagar → retiro automático.</li>
        </ul>
      </Card>
    </div>
  );
}
