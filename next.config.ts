import type { NextConfig } from "next";

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
};

export default nextConfig;
