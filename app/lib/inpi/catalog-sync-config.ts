function isTruthyEnv(value?: string | null) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  );
}

function isVercelRuntime() {
  return isTruthyEnv(process.env.VERCEL) || Boolean(process.env.VERCEL_URL);
}

export function shouldBootstrapAppRuntimeWorkers() {
  const explicit = process.env.APP_RUNTIME_WORKERS_ENABLED;
  if (explicit && explicit.trim()) {
    return isTruthyEnv(explicit);
  }

  return !isVercelRuntime() && process.env.NODE_ENV !== "test";
}

export function isInpiOfficialBackgroundSearchEnabled() {
  const explicit = process.env.INPI_OFFICIAL_BACKGROUND_SEARCH_ENABLED;
  if (explicit && explicit.trim()) {
    return isTruthyEnv(explicit);
  }

  return !isVercelRuntime();
}

export function getInpiOfficialBackgroundSearchDisabledReason() {
  if (isInpiOfficialBackgroundSearchEnabled()) {
    return undefined;
  }

  return "A varredura oficial completa em background está desabilitada neste ambiente para evitar consumo contínuo de recursos. A pesquisa local continua disponível.";
}
