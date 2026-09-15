import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/**
 * CSP pragmática, no basada en nonce: la app sirve un `<script>` inline
 * estático (THEME_INIT_SCRIPT en src/app/layout.tsx, vía
 * dangerouslySetInnerHTML — contenido fijo, no de usuario) y Next/Tailwind
 * pueden inyectar `<style>` inline en build — ambos necesitan
 * 'unsafe-inline'. Una CSP con nonce por request es más fuerte pero requiere
 * generar el nonce en middleware (src/proxy.ts) por cada respuesta y no se
 * puede expresar en `next.config.ts` (sus valores de cabecera son estáticos,
 * no por-request) — queda como mejora futura, no bloquea este endurecimiento.
 *
 * Aun con 'unsafe-inline' en script/style, el resto de directivas sigue
 * cerrando superficie real: nada de plugins/objetos embebidos, nada de
 * conexiones ni imágenes de orígenes ajenos, y la página no puede embeberse
 * en un iframe de otro sitio (clickjacking).
 */
const CSP_DIRECTIVES = [
  "default-src 'self'",
  // 'unsafe-eval' solo en dev: el HMR/Fast Refresh de `next dev` lo necesita
  // (source maps, runtime de recarga en caliente); un build de producción
  // real (`next build && next start`) nunca lo usa.
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: CSP_DIRECTIVES },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Redundante con frame-ancestors 'none' de la CSP de arriba, pero algunos
  // navegadores/escáneres de seguridad todavía solo miran esta cabecera.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // HSTS solo tiene sentido (y solo lo honran los navegadores) sobre HTTPS
  // real — en dev local (http) mandarlo no hace nada, pero se omite para no
  // confundir. `process.env.NODE_ENV` se lee al arrancar el server, no por
  // request, así que esto no puede variar dinámicamente por request.
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  experimental: {
    // Los adjuntos de una respuesta viajan como base64 dentro del server
    // action `approveDraft`. El límite por defecto (1 MB) es demasiado bajo;
    // lo subimos a 15 MB — el tope real de adjuntos lo impone
    // `MAX_OUTGOING_ATTACHMENTS_BYTES` en src/lib/gmail/send.ts.
    serverActions: {
      bodySizeLimit: "15mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
