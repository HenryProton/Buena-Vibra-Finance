# Buena Vibra Finance

Aplicación independiente para gestionar ahorros, aportes y préstamos.

## Arquitectura
- Frontend: React + TypeScript + Vite/TanStack.
- Backend: Supabase Auth + PostgreSQL + RLS.
- PWA: Service Worker + Workbox.
- Código fuente: GitHub.
- Dependencia de Lovable: ninguna para ejecutar, compilar o editar el proyecto.

## Seguridad
- Nunca guardar `.env`, claves `service_role`, tokens privados ni contraseñas en Git.
- El navegador solo recibe la publishable key.
- La `service_role` se usa exclusivamente en código server-only.
- La autorización real debe estar en PostgreSQL/RLS; ocultar botones no es seguridad.
- Las invitaciones deben ser de un solo uso y tener expiración.
- Los datos financieros deben registrarse de forma auditable y no borrarse físicamente sin una política explícita.

## Roles
- **Administrador Principal:** acceso total.
- **Administrador Adjunto:** perfil propio y solamente la información autorizada por el Principal.
- **Socio:** perfil propio y No Socios que haya avalado para préstamos.
- **No Socio:** únicamente sus propios préstamos.

## Offline-first
Los datos previamente autorizados se conservan localmente para lectura offline. Las operaciones offline usan identificadores únicos/idempotencia y se sincronizan al recuperar conexión. El servidor Supabase es la autoridad final. Un dispositivo nuevo necesita Internet una primera vez para autenticarse y descargar los datos autorizados.

## Invitaciones
Las invitaciones deben abrirse desde un enlace compartido por WhatsApp. Los datos provisionales pueden precargarse, pero el correo electrónico y teléfono deben ser confirmados/actualizados obligatoriamente antes de entrar al resto de la aplicación. Nunca se debe enviar una contraseña real dentro del enlace.

## Variables locales
Crea `.env.local` (fuera de Git):

```text
VITE_SUPABASE_URL=https://TU_PROYECTO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICABLE
SUPABASE_URL=https://TU_PROYECTO.supabase.co
SUPABASE_PUBLISHABLE_KEY=TU_CLAVE_PUBLICABLE
SUPABASE_SERVICE_ROLE_KEY=TU_CLAVE_SECRETA_SOLO_SERVIDOR
```

## Desarrollo
```bash
npm install
npm run dev
npm run build
```

## Marca
El nombre oficial del producto es **Buena Vibra Finance**. No usar el nombre anterior en la interfaz, manifest, metadatos, documentación ni mensajes nuevos.
