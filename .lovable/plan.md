# Plan de mejoras Buena Vibra Finance

Voy a implementar todo en 3 tandas para poder revisar entre cada una si algo se ve raro.

## Tanda 1 — Base de datos y ajustes

**Nuevas tablas / campos:**
- `caja_settings` (singleton): `fecha_inicio`, `fecha_fin`, `normas` (texto largo), `aporte_mensual` (default 10 USD).
- `channels`: `id`, `nombre`, `activo`, `orden`. Seed con Junior, Eradys, Binance, MercadoPago.
- `monthly_contributions.channel_id` (nullable para históricos).
- `loan_payments.channel_id` (nullable).
- `loans.disbursement_channel_id` (nullable) — desde qué canal se entregó el préstamo.
- `loans.rate_type` enum `daily | monthly`, `loans.rate_value` numeric — reemplaza el `daily_rate` fijo. Migración convierte lo existente a `daily` con el valor actual.
- Vista/función `channel_balance(channel_id)` que suma aportes + intereses cobrados - préstamos desembolsados + capital devuelto.

**RLS:** admin todo; socios lectura de `caja_settings` y `channels` activos.

## Tanda 2 — Vistas admin

1. **Ajustes de caja** (nueva pestaña o dentro de Perfil admin):
   - Editor de fechas inicio/fin.
   - Editor de normas (textarea markdown ligero).
   - CRUD de canales.
   - Muestra saldo actual por canal.
2. **Socios → matriz de aportes**: tabla con socios en filas y meses en columnas, celdas pintadas verde/rojo, filtro "al día / atrasados", click en celda para editar/registrar pago (con canal).
3. **Cambiar rol**: en la tarjeta de cada socio, toggle "Es administrador" (inserta/borra fila en `user_roles`). Nunca permite quitarse el rol a uno mismo.
4. **Préstamos**:
   - Al aprobar: selector tipo tasa (diario/mensual) + valor + canal de desembolso.
   - Confirmar abono: obliga elegir canal.
   - Edición de registros (monto, fecha, notas) para admin.

## Tanda 3 — Vistas socio

1. **Inicio**: desplegable "Normas de la caja" (accordion) con el texto de settings.
2. **Aportes**:
   - Barra de progreso visual (12 meses del ciclo) con totales: "Aportado $X de $Y — faltan $Z".
   - Lista de meses pagados con total al pie.
   - Lista de meses pendientes con total al pie.
3. **Préstamos**:
   - Card clickeable → expande con: historial de abonos (fecha, capital, interés, canal), deuda actual detallada.
   - **Simulador**: input "¿En cuántos días vas a pagar?" → calcula interés proyectado, capital pendiente, total. Funciona para pago total o parcial.
4. Al reportar abono: selector de canal.

## Tanda 4 — Detalles

- Eliminar badge "Edit with Lovable" del preview (agregar CSS que oculte el iframe injectado o el elemento `#lovable-badge` / `[data-lovable-badge]`).

## Notas técnicas

- Migración de `daily_rate` → `rate_type/rate_value`: `UPDATE loans SET rate_type='daily', rate_value = daily_rate * 100`. Mantengo `daily_rate` como columna computada o la elimino tras verificar código.
- Fórmula préstamo: `interes = principal * rate_diaria_equivalente * dias`. Si `rate_type='monthly'`, `rate_diaria = rate_value/100/30`.
- Simulador reutiliza la misma fórmula proyectando `dias + N`.
- Saldos de canal: query on-demand, no cacheado.

## Qué NO toco

- Flujo de auth, estructura de rutas, tema visual.
- Lógica de aprobación de socios (ya funciona).

¿Le doy o cambias algo antes?