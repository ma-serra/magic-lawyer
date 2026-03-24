"use client";

import { useEffect, useState } from "react";
import { extractTenantHintFromHost } from "@/lib/tenant-host";

/**
 * Hook para detectar o tenant baseado no domínio atual
 * Funciona tanto no cliente quanto no servidor
 */
export function useTenantFromDomain() {
  const [tenant, setTenant] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const host = window.location.hostname;
    const detectedTenant = extractTenantFromDomain(host);

    setTenant(detectedTenant);
  }, []);

  return tenant;
}

/**
 * Função para extrair tenant do domínio (mesma lógica do middleware)
 */
function extractTenantFromDomain(host: string): string | null {
  return extractTenantHintFromHost(host);
}

/**
 * Função utilitária para obter tenant do domínio no servidor
 */
export function getTenantFromDomainServer(host: string): string | null {
  return extractTenantFromDomain(host);
}
