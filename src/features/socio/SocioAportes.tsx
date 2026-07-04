import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatUSD, MONTHS_ES } from "@/lib/format";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Clock, AlertCircle } from "lucide-react";

export function SocioAportes() {
  const { user, profile } = useAuth();
  const uid = user!.id;
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: aportes = [] } = useQuery({
    queryKey: ["mis-aportes", uid],
    queryFn: async () => {
      const { data } = await supabase.from("monthly_contributions").select("*").eq("user_id", uid).order("year", { ascending: false }).order("month", { ascending: false });
      return data ?? [];
    },
  });

  const reportar = useMutation({
    mutationFn: async (input: { year: number; month: number; amount: number; note: string }) => {
      const { error } = await supabase.from("monthly_contributions").insert({
        user_id: uid,
        year: input.year,
        month: input.month,
        num_acciones: profile?.num_acciones ?? 1,
        amount: input.amount,
        status: "reportado",
        note: input.note,
        reported_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Aporte reportado. Pendiente de confirmación del admin.");
      qc.invalidateQueries({ queryKey: ["mis-aportes", uid] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Mis aportes</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">Reportar pago</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Reportar aporte mensual</DialogTitle></DialogHeader>
            <ReportarForm defaultAmount={(profile?.num_acciones ?? 1) * 10} onSubmit={(v) => reportar.mutate(v)} loading={reportar.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      {aportes.length === 0 && (
        <Card className="p-6 text-center text-sm text-muted-foreground">Aún no hay aportes registrados.</Card>
      )}

      <div className="space-y-2">
        {aportes.map((a) => (
          <Card key={a.id} className="p-4 flex items-center justify-between">
            <div>
              <p className="font-medium">{MONTHS_ES[a.month - 1]} {a.year}</p>
              <p className="text-xs text-muted-foreground">{a.num_acciones} acción(es)</p>
            </div>
            <div className="text-right">
              <p className="font-bold">{formatUSD(Number(a.amount))}</p>
              <StatusBadge status={a.status} />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "confirmado") return <Badge className="bg-primary/20 text-primary hover:bg-primary/20"><Check className="h-3 w-3 mr-1" />Confirmado</Badge>;
  if (status === "reportado") return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Reportado</Badge>;
  return <Badge variant="outline"><AlertCircle className="h-3 w-3 mr-1" />Pendiente</Badge>;
}

function ReportarForm({ defaultAmount, onSubmit, loading }: { defaultAmount: number; onSubmit: (v: { year: number; month: number; amount: number; note: string }) => void; loading: boolean }) {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [amount, setAmount] = useState(String(defaultAmount));
  const [note, setNote] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ year: Number(year), month: Number(month), amount: Number(amount), note });
      }}
      className="space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Mes</Label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS_ES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Año</Label>
          <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Monto (USD)</Label>
        <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </div>
      <div className="space-y-1">
        <Label>Nota (referencia de pago)</Label>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: Transferencia #1234" />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>{loading ? "Enviando..." : "Reportar"}</Button>
    </form>
  );
}
