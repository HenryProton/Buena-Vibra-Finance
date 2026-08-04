import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { formatUSD, MONTHS_ES } from "@/lib/format";
import { projectDebt, type RateType } from "@/lib/loan-math";
import { Wallet, HandCoins, AlertCircle, BookOpen } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useCajaSettings } from "@/lib/queries";
import { useCajaPauses } from "@/lib/queries";

export function SocioInicio() {
  const { user, profile } = useAuth();
  const uid = user!.id;
  const { data: settings } = useCajaSettings();

  const { data } = useQuery({
    queryKey: ["socio-summary", uid],
    queryFn: async () => {
      const [{ data: contribs }, { data: loans }, { data: payments }] = await Promise.all([
        supabase.from("monthly_contributions").select("*").eq("user_id", uid).eq("status", "confirmado"),
        supabase.from("loans").select("*").eq("user_id", uid).eq("status", "activo"),
        supabase.from("loan_payments").select("*").eq("user_id", uid).eq("status", "confirmado"),
      ]);
      return { contribs: contribs ?? [], loans: loans ?? [], payments: payments ?? [] };
    },
  });

  const totalAhorrado = (data?.contribs ?? []).reduce((a, c) => a + Number(c.amount), 0);
  let capitalActivo = 0;
  let interesActivo = 0;
  (data?.loans ?? []).forEach((l) => {
    const mine = (data?.payments ?? []).filter((p) => p.loan_id === l.id);
    const paidCap = mine.reduce((a, p) => a + Number(p.amount_capital), 0);
    const paidInt = mine.reduce((a, p) => a + Number(p.amount_interest), 0);
    const d = projectDebt({
      principal: Number(l.principal),
      rateType: l.rate_type as RateType,
      rateValue: Number(l.rate_value),
      startDate: l.disbursed_at ?? l.approved_at ?? l.created_at,
      paidCapital: paidCap,
      paidInterest: paidInt,
    });
    capitalActivo += d.capital;
    interesActivo += d.interes;
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
          <p className="text-xs text-muted-foreground">{profile?.num_acciones} acción(es) · {formatUSD(Number(settings?.aporte_mensual ?? 10))} c/u</p>
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

      {settings?.normas && (
        <Card className="p-2">
          <Accordion type="single" collapsible>
            <AccordionItem value="normas" className="border-0">
              <AccordionTrigger className="px-2 py-2 hover:no-underline">
                <span className="flex items-center gap-2 font-semibold text-sm">
                  <BookOpen className="h-4 w-4" /> Normas de la caja
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-2 pb-2">
                <div className="text-sm whitespace-pre-wrap text-muted-foreground">{settings.normas}</div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </Card>
      )}
    </div>
  );
}
