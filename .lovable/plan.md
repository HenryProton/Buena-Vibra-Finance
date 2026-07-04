# Buena Vibra Finance - Plan de construcción

App móvil-first para caja de ahorros con dos roles (admin y socio), tema claro/oscuro (automático según sistema + selector manual), y logo BV dorado/negro.

## Diseño visual

- **Paleta**: negro (#0a0a0a) + dorado (#F5B800) + blanco, inspirada en el logo. Modo claro: fondo blanco cálido, acentos dorados, texto negro. Modo oscuro: fondo negro, dorado más brillante.
- **Tipografía**: Inter para UI, con títulos en peso 700.
- **Idioma**: Español (Venezuela), moneda USD.
- **Logo**: subido por el usuario, se usará en splash, login y header.

## Autenticación (Lovable Cloud)

- Email + contraseña (auto-registro con aprobación del admin).
- Tabla `profiles` (nombre, teléfono, cédula, estado: pendiente/activo/retirado).
- Tabla `user_roles` (admin / socio) con función `has_role` security definer.
- Trigger auto-crea profile al registro con estado "pendiente".
- El primer usuario que se registre queda como admin automáticamente; el resto entra como "socio pendiente" hasta aprobación.

## Modelo de datos

- **profiles**: id, full_name, phone, cedula, status ('pendiente'|'activo'|'retirado'), joined_at.
- **shares**: cuántas acciones ($10 c/u) tiene cada socio (histórico con fecha de alta/baja).
- **monthly_contributions**: aportes mensuales. Campos: socio, año, mes, num_acciones, monto, status ('reportado'|'confirmado'|'pendiente'), reported_at, confirmed_at, note.
- **loans**: préstamo. Campos: socio, principal, tasa_diaria (default 1%, editable por admin), fecha_entrega, status ('pendiente_aprobacion'|'activo'|'pagado'|'rechazado'), aprobado_por.
- **loan_payments**: abonos a préstamos. Campos: loan_id, fecha, monto_capital, monto_interes, status ('reportado'|'confirmado'), reported_at, confirmed_at.
- **annual_periods**: períodos anuales para cierre y reparto de ganancias.
- **payouts**: distribución de intereses al cierre por socio.

Todas las tablas con RLS: socio ve solo lo suyo; admin ve todo vía `has_role`.

## Vista Socio

Bottom nav con 4 tabs:

1. **Inicio**: saldo total ahorrado, deuda actual (capital + interés desglosado), próximo vencimiento de mensualidad, alerta si tiene meses pendientes.
2. **Aportes**: lista mensual con estado (pagado/pendiente/reportado). Botón "Reportar pago" que abre form (mes, monto, nota opcional, adjunto opcional).
3. **Préstamos**: préstamos activos con desglose capital/interés calculado en tiempo real (1% diario × días transcurridos). Botón "Solicitar préstamo" (monto máx = 10× aporte mensual). Historial de préstamos pagados. Botón "Reportar abono" en cada préstamo activo.
4. **Perfil**: datos personales, selector de tema (Sistema / Claro / Oscuro), cerrar sesión, solicitar retiro.

## Vista Admin

Bottom nav:

1. **Dashboard**: total caja, total prestado, socios activos, aportes pendientes de confirmar, abonos pendientes, solicitudes de préstamo pendientes.
2. **Socios**: lista, aprobar registros pendientes, editar acciones, marcar retiro (manual o por 2 meses de mora), ver estado de cuenta detallado.
3. **Aportes**: matriz mensual por socio; confirmar/rechazar pagos reportados; registrar pagos manuales.
4. **Préstamos**: aprobar solicitudes (fijar tasa individual y fecha de entrega), ver activos con capital+interés al día, confirmar abonos reportados.
5. **Cierre anual**: crear período, verificar que no queden préstamos/deudas, calcular y distribuir ganancias proporcional al ahorro de cada socio, generar payouts.

## Reglas de negocio implementadas

- Cálculo diario de interés: `principal × 0.01 × días_desde_entrega − intereses_ya_pagados`.
- Límite préstamo: `10 × (num_acciones × 10)`; validado en la solicitud.
- Aviso automático al socio si es día 1-5 del mes y no ha pagado.
- Auto-retiro: cron/función que detecta 2 meses consecutivos sin pago y marca "retirado" con fecha de devolución (día 5 del mes siguiente).
- Reparto anual: `(intereses_totales_del_período × ahorro_del_socio) / suma_ahorros`.

## Tema claro/oscuro

- Provider React que lee `prefers-color-scheme` del sistema por defecto.
- Selector en Perfil: Sistema / Claro / Oscuro, persistido en localStorage y en `profiles.theme_preference`.
- Todos los tokens de color definidos en `src/styles.css` (semantic tokens oklch), zero hex hardcoded.

## Detalles técnicos

- TanStack Start + Lovable Cloud (Supabase gestionado).
- Server functions con `requireSupabaseAuth` para toda operación autenticada; rutas protegidas bajo `_authenticated/`.
- Cálculos de interés en server functions para no exponer lógica y garantizar consistencia.
- Validación con Zod en cliente y servidor.
- Migración con: enum `app_role`, tablas + GRANTs + RLS + policies, función `has_role`, trigger de auto-perfil y auto-admin del primer usuario.
- Favicon actualizado con el logo BV.

## Fuera de alcance de esta primera versión

- Notificaciones push (solo alertas in-app).
- Rifas e inversiones (solo estructura para intereses de préstamos).
- Exportación PDF de estado de cuenta (se puede agregar después).
- Pasarelas de pago reales — el flujo es "socio reporta, admin confirma" manual.

¿Confirmas que proceda con esta base?
