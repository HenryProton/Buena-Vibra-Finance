# Buena Vibra Finance

Aplicación independiente para gestionar ahorros, aportes y préstamos.

## Arquitectura

- Frontend: React + TypeScript + Vite/TanStack.
- Backend: Supabase Auth + PostgreSQL + RLS.
- PWA: Service Worker + Workbox.
- Código fuente: GitHub.
- Lovable: no es necesario para ejecutar, compilar ni editar el proyecto.

## Seguridad

Nunca guardes `.env`, claves `service_role`, tokens privados ni contraseñas en Git. El proyecto usa variables `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` proporcionadas por el entorno de despliegue.

## Desarrollo local

```bash
npm install
npm run dev
```

Crea un `.env.local` fuera de Git:

```text
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICABLE
```

## Producción

El frontend debe desplegarse en un hosting estático/PWA independiente. No se debe poner una clave `service_role` en el navegador.

## Roles planificados

- Administrador Principal: control total.
- Administrador Adjunto: solo información autorizada por el Principal.
- Socio: su información y No Socios que haya avalado.
- No Socio: únicamente sus préstamos.

## Offline-first

Los datos previamente autorizados se conservan localmente para lectura offline. Las operaciones offline se identifican de forma única y se sincronizan al recuperar conexión para evitar duplicados. El servidor Supabase sigue siendo la autoridad final.
