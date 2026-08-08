import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Star, Trophy, CalendarClock, ChevronLeft, ChevronRight, TrendingUp, TrendingDown } from "lucide-react";

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

const PAGE_SIZE = 8;

function useRanking<T>(name: "ranking_aportes" | "ranking_prestamos") {
  return useQuery({
    queryKey: [name],
    queryFn: async () => {
      const { data, error } = await (supabase as never as { rpc: (n: string) => Promise<{ data: T[] | null; error: Error | null }> }).rpc(name);
      if (error) throw error;
      return (data ?? []) as T[];
    },
  });
}

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

/** Paginación que siempre deja visible la fila del socio. */
function Paginated<T extends { posicion: number; es_yo: boolean }>({
  rows,
  render,
}: {
  rows: T[];
  render: (r: T) => React.ReactNode;
}) {
  const myIndex = rows.findIndex((r) => r.es_yo);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const [page, setPage] = useState(() => (myIndex >= 0 ? Math.floor(myIndex / PAGE_SIZE) : 0));
  const safePage = Math.min(page, totalPages - 1);
  const slice = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const me = myIndex >= 0 ? rows[myIndex] : null;
  const meVisible = me ? slice.some((r) => r.es_yo) : true;

  return (
    <div className="space-y-1.5">
      {!meVisible && me && (
        <>
          {render(me)}
          <p className="text-[10px] text-muted-foreground text-center">— tu posición —</p>
        </>
      )}
      {slice.map((r) => render(r))}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" size="sm" className="h-8" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-[11px] text-muted-foreground">
            Página {safePage + 1} de {totalPages} · {rows.length} socio(s)
          </span>
          <Button variant="outline" size="sm" className="h-8" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function RankingAportes({ admin }: { admin: boolean }) {
  const { data = [], isLoading } = useRanking<RowAporte>("ranking_aportes");
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
      <Paginated
        rows={data}
        render={(r) => (
          <RowShell
            key={r.posicion}
            pos={r.posicion}
            esYo={r.es_yo}
            nombre={r.nombre}
            estrellas={r.estrellas}
            sub={`${r.meses_pagados} de ${r.meses_esperados} mes(es) al día`}
            right={<span className="font-semibold">{Number(r.cumplimiento)}%</span>}
          />
        )}
      />
    </Card>
  );
}

export function RankingPrestamos({ admin }: { admin: boolean }) {
  const { data = [], isLoading } = useRanking<RowPrestamo>("ranking_prestamos");
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
      <Paginated
        rows={data}
        render={(r) => (
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
        )}
      />
    </Card>
  );
}

type Notif = {
  id: string;
  kind: string;
  prev_pos: number | null;
  new_pos: number;
  message: string;
  read_at: string | null;
  created_at: string;
};

const KIND_LABEL: Record<string, string> = {
  aportes: "puntualidad en aportes",
  prestamos: "pago de intereses",
};

/**
 * Detecta cambios de posición del socio, los guarda como aviso en su historial
 * y muestra los avisos no leídos en el panel de inicio.
 */
export function RankingAlerts({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data: aportes = [] } = useRanking<RowAporte>("ranking_aportes");
  const { data: prestamos = [] } = useRanking<RowPrestamo>("ranking_prestamos");
  const [showHistory, setShowHistory] = useState(false);

  const { data: notifs = [] } = useQuery({
    queryKey: ["ranking-notifs", userId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ranking_notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as Notif[];
    },
  });

  const mine = useMemo(
    () => ({
      aportes: aportes.find((r) => r.es_yo)?.posicion ?? null,
      prestamos: prestamos.find((r) => r.es_yo)?.posicion ?? null,
    }),
    [aportes, prestamos],
  );

  useEffect(() => {
    if (!notifs) return;
    const run = async () => {
      const inserts: Array<Record<string, unknown>> = [];
      (["aportes", "prestamos"] as const).forEach((kind) => {
        const pos = mine[kind];
        if (pos == null) return;
        const last = notifs.find((n) => n.kind === kind);
        const storageKey = `bv-rank-${kind}-${userId}`;
        const prev = last ? last.new_pos : (() => {
          const raw = localStorage.getItem(storageKey);
          return raw == null || Number.isNaN(Number(raw)) ? null : Number(raw);
        })();
        localStorage.setItem(storageKey, String(pos));
        if (prev == null || prev === pos) return;
        const mejoro = pos < prev;
        inserts.push({
          user_id: userId,
          kind,
          prev_pos: prev,
          new_pos: pos,
          message: `${mejoro ? "Subiste" : "Bajaste"} en ${KIND_LABEL[kind]}: del puesto ${prev}º al ${pos}º.`,
        });
      });
      if (!inserts.length) return;
      await (supabase as any).from("ranking_notifications").insert(inserts);
      qc.invalidateQueries({ queryKey: ["ranking-notifs", userId] });
    };
    void run();
  }, [mine.aportes, mine.prestamos, userId, notifs, qc]);

  const unread = notifs.filter((n) => !n.read_at);

  const markRead = async () => {
    await (supabase as any)
      .from("ranking_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("read_at", null);
    qc.invalidateQueries({ queryKey: ["ranking-notifs", userId] });
  };

  if (notifs.length === 0) return null;

  return (
    <div className="space-y-2">
      {unread.map((n) => {
        const mejoro = n.prev_pos != null && n.new_pos < n.prev_pos;
        return (
          <Alert key={n.id} className={mejoro ? "border-emerald-500/40 bg-emerald-500/10" : "border-amber-500/40 bg-amber-500/10"}>
            {mejoro ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            <AlertTitle>{mejoro ? "¡Subiste en el ranking!" : "Bajaste en el ranking"}</AlertTitle>
            <AlertDescription>{n.message}</AlertDescription>
          </Alert>
        );
      })}
      <div className="flex gap-2">
        {unread.length > 0 && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markRead}>
            Entendido
          </Button>
        )}
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? "Ocultar historial" : `Ver historial (${notifs.length})`}
        </Button>
      </div>
      {showHistory && (
        <Card className="p-3 space-y-2">
          <p className="text-sm font-semibold">Historial de cambios de posición</p>
          {notifs.map((n) => (
            <div key={n.id} className="flex items-start justify-between gap-2 text-xs border-b border-border last:border-0 pb-1">
              <span>{n.message}</span>
              <span className="text-muted-foreground whitespace-nowrap">
                {new Date(n.created_at).toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })}
              </span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
