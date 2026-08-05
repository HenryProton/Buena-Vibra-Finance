import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, Trophy, CalendarClock } from "lucide-react";

type RowAporte = {
  posicion: number;
  es_yo: boolean;
  nombre: string | null;
  meses_pagados: number;
  meses_esperados: number;
  cumplimiento: number;
  estrellas: number;
};

type RowPrestamo = {
  posicion: number;
  es_yo: boolean;
  nombre: string | null;
  dias_sin_abono: number;
  prestamos_activos: number;
  al_dia: boolean;
  estrellas: number;
};

function Stars({ n }: { n: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${n} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`h-3 w-3 ${i <= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
      ))}
    </span>
  );
}

function medal(pos: number) {
  return pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : `${pos}º`;
}

function RowShell({
  pos,
  esYo,
  nombre,
  estrellas,
  right,
  sub,
}: {
  pos: number;
  esYo: boolean;
  nombre: string | null;
  estrellas: number;
  right: React.ReactNode;
  sub: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg p-2 transition-colors ${
        esYo ? "bg-primary/10 border border-primary/40" : "bg-muted/30"
      }`}
    >
      <span className="w-8 shrink-0 text-center font-bold text-sm">{medal(pos)}</span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm truncate ${esYo ? "font-bold text-primary" : "font-medium"}`}>
          {nombre ?? "Socio"}
          {esYo && <span className="ml-1 text-[10px] uppercase tracking-wide">(tú)</span>}
        </p>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
      <div className="shrink-0 text-right space-y-1">
        <Stars n={estrellas} />
        <div className="text-[11px]">{right}</div>
      </div>
    </div>
  );
}

export function RankingAportes({ admin }: { admin: boolean }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["ranking-aportes"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("ranking_aportes");
      if (error) throw error;
      return (data ?? []) as RowAporte[];
    },
  });

  if (isLoading || data.length === 0) return null;

  return (
    <Card className="p-4 space-y-3 animate-fade-in">
      <div className="flex items-center gap-2">
        <Trophy className="h-4 w-4 text-amber-500" />
        <h3 className="font-semibold">Ranking de puntualidad en aportes</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        {admin
          ? "Lista completa de socios según los meses que llevan pagados."
          : "Ves tu posición; por privacidad los nombres de los demás socios no se muestran."}
      </p>
      <div className="space-y-1.5">
        {data.map((r) => (
          <RowShell
            key={r.posicion}
            pos={r.posicion}
            esYo={r.es_yo}
            nombre={r.nombre}
            estrellas={r.estrellas}
            sub={`${r.meses_pagados} de ${r.meses_esperados} mes(es) al día`}
            right={<span className="font-semibold">{Number(r.cumplimiento)}%</span>}
          />
        ))}
      </div>
    </Card>
  );
}

export function RankingPrestamos({ admin }: { admin: boolean }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["ranking-prestamos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("ranking_prestamos");
      if (error) throw error;
      return (data ?? []) as RowPrestamo[];
    },
  });

  if (isLoading || data.length === 0) return null;

  return (
    <Card className="p-4 space-y-3 animate-fade-in">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Ranking de pago de intereses</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        {admin
          ? "Socios con préstamos activos, ordenados por qué tan reciente fue su último abono."
          : "Ves tu posición; los nombres de los demás socios se mantienen privados."}
      </p>
      <div className="space-y-1.5">
        {data.map((r) => (
          <RowShell
            key={r.posicion}
            pos={r.posicion}
            esYo={r.es_yo}
            nombre={r.nombre}
            estrellas={r.estrellas}
            sub={`${r.prestamos_activos} préstamo(s) · ${r.dias_sin_abono} día(s) sin abonar`}
            right={
              <Badge
                className={
                  r.al_dia
                    ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400"
                    : "bg-amber-500/20 text-amber-700 dark:text-amber-400"
                }
              >
                {r.al_dia ? "Al día" : "Atrasado"}
              </Badge>
            }
          />
        ))}
      </div>
    </Card>
  );
}
