CREATE OR REPLACE FUNCTION public.ranking_aportes()
RETURNS TABLE(posicion int, es_yo boolean, nombre text, meses_pagados int, meses_esperados int, cumplimiento numeric, estrellas int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _admin boolean;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  _admin := public.has_role(_uid, 'admin');

  RETURN QUERY
  WITH s AS (SELECT fecha_inicio, fecha_fin FROM public.caja_settings LIMIT 1),
  base AS (
    SELECT p.id,
           p.full_name,
           GREATEST(COALESCE(p.fecha_inicio, (SELECT fecha_inicio FROM s)), (SELECT fecha_inicio FROM s)) AS ini,
           LEAST(COALESCE(p.fecha_fin, (SELECT fecha_fin FROM s)), (SELECT fecha_fin FROM s), CURRENT_DATE) AS fin
    FROM public.profiles p
    WHERE p.status = 'activo'
  ),
  meses AS (
    SELECT b.id, b.full_name,
      (SELECT COUNT(*) FROM generate_series(date_trunc('month', b.ini::timestamp), date_trunc('month', b.fin::timestamp), interval '1 month') g
        WHERE NOT EXISTS (
          SELECT 1 FROM public.caja_pauses cp
          WHERE cp.year = EXTRACT(YEAR FROM g)::int AND cp.month = EXTRACT(MONTH FROM g)::int
        ))::int AS esperados
    FROM base b
    WHERE b.fin >= b.ini
  ),
  pagados AS (
    SELECT mc.user_id, COUNT(*)::int AS c
    FROM public.monthly_contributions mc
    WHERE mc.status = 'confirmado'
    GROUP BY mc.user_id
  ),
  calc AS (
    SELECT m.id, m.full_name,
      LEAST(COALESCE(p.c, 0), m.esperados)::int AS pag,
      m.esperados,
      CASE WHEN m.esperados = 0 THEN 1::numeric
           ELSE LEAST(1::numeric, COALESCE(p.c, 0)::numeric / m.esperados) END AS pct
    FROM meses m
    LEFT JOIN pagados p ON p.user_id = m.id
  ),
  ranked AS (
    SELECT c.*, ROW_NUMBER() OVER (ORDER BY c.pct DESC, c.pag DESC, c.full_name ASC) AS pos
    FROM calc c
  )
  SELECT r.pos::int,
         (r.id = _uid),
         CASE WHEN _admin OR r.id = _uid THEN r.full_name ELSE NULL END,
         r.pag,
         r.esperados,
         ROUND(r.pct * 100, 0),
         GREATEST(1, CEIL(r.pct * 5))::int
  FROM ranked r
  ORDER BY r.pos;
END;
$$;

CREATE OR REPLACE FUNCTION public.ranking_prestamos()
RETURNS TABLE(posicion int, es_yo boolean, nombre text, dias_sin_abono int, prestamos_activos int, al_dia boolean, estrellas int)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _admin boolean;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  _admin := public.has_role(_uid, 'admin');

  RETURN QUERY
  WITH act AS (
    SELECT l.id, l.user_id, COALESCE(l.disbursed_at, l.approved_at, l.created_at)::date AS ini
    FROM public.loans l
    WHERE l.status = 'activo'
  ),
  ult AS (
    SELECT a.user_id,
           COUNT(DISTINCT a.id)::int AS activos,
           GREATEST(
             MAX(a.ini),
             COALESCE(MAX((SELECT MAX(lp.payment_date) FROM public.loan_payments lp
                           WHERE lp.loan_id = a.id AND lp.status = 'confirmado')), MAX(a.ini))
           ) AS ultima
    FROM act a
    GROUP BY a.user_id
  ),
  calc AS (
    SELECT u.user_id,
           p.full_name,
           u.activos,
           GREATEST(0, (CURRENT_DATE - u.ultima))::int AS dias
    FROM ult u
    JOIN public.profiles p ON p.id = u.user_id
  ),
  ranked AS (
    SELECT c.*, ROW_NUMBER() OVER (ORDER BY c.dias ASC, c.full_name ASC) AS pos
    FROM calc c
  )
  SELECT r.pos::int,
         (r.user_id = _uid),
         CASE WHEN _admin OR r.user_id = _uid THEN r.full_name ELSE NULL END,
         r.dias,
         r.activos,
         (r.dias <= 30),
         CASE WHEN r.dias <= 15 THEN 5 WHEN r.dias <= 30 THEN 4 WHEN r.dias <= 45 THEN 3 WHEN r.dias <= 60 THEN 2 ELSE 1 END
  FROM ranked r
  ORDER BY r.pos;
END;
$$;

REVOKE ALL ON FUNCTION public.ranking_aportes() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ranking_prestamos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ranking_aportes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ranking_prestamos() TO authenticated;