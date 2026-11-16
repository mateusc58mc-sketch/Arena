import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
    // Marcado pelo processo de upgrade de segurança do Next (16.4.0 → 16.4.3).
    agentUpgrade: "security",
  },
  cacheComponents: true,
  partialPrefetching: true,
  // Permite testar em outros dispositivos da rede (celular accessing
  // http://IP-DO-PC:3000). Sem isso o dev server bloqueia os recursos de
  // dev (HMR e chunks do next/dynamic) e a arena 3D não sobe.
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*", "10.*.*.*"],
};

export default nextConfig;
