const DEFAULT_JUSBRASIL_API_BASE_URL = "https://op.digesto.com.br/api";

function parseHeaderInt(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function stripWrappingQuotes(value: string) {
  return value.replace(/^['"]+|['"]+$/g, "");
}

export function normalizeJusbrasilApiKey(value?: string | null) {
  if (!value) return "";
  return stripWrappingQuotes(value).trim();
}

export function resolveJusbrasilApiBaseUrl(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) return DEFAULT_JUSBRASIL_API_BASE_URL;
  return normalized.replace(/\/+$/, "");
}

export class JusbrasilApiError extends Error {
  status: number;
  body: string;

  constructor(message: string, status: number, body = "") {
    super(message);
    this.name = "JusbrasilApiError";
    this.status = status;
    this.body = body;
  }
}

export type JusbrasilPaginatedResult<T> = {
  items: T[];
  totalCount: number | null;
};

export type JusbrasilUser = {
  email?: string | null;
  name?: string | null;
  roles?: string[];
  user_company_id?: number | null;
};

export type JusbrasilWebhookConfig = {
  url?: string | null;
  is_global_active?: boolean;
  api_version?: number;
  dest_emails?: string[] | null;
  email_config?: Record<string, unknown> | null;
};

export type JusbrasilWebhookConfigInput = {
  url?: string;
  is_global_active?: boolean;
  api_version?: number;
  dest_emails?: string[];
  email_config?: Record<string, unknown>;
};

export type JusbrasilOabMonitor = {
  id: number;
  name: string;
  number: number;
  region: string;
  supplementary_letter?: string | null;
  is_active: boolean;
  correlation_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  archived_at?: string | null;
};

export type JusbrasilOabMonitorCreateInput = {
  name: string;
  number: number;
  region: string;
  supplementary_letter?: string | null;
  is_active?: boolean;
};

export type JusbrasilOabMonitorUpdateInput = {
  name?: string;
  is_active?: boolean;
  supplementary_letter?: string | null;
};

export type JusbrasilOabProcessLink = {
  id: number;
  oab_id: number;
  cnj: string;
  cnj_id?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
  archived_at?: string | null;
};

export type JusbrasilProcessMonitor = {
  $uri?: string;
  numero?: string | null;
  numero_normalizado?: string | null;
  is_monitored_diario?: boolean | null;
  is_monitored_tribunal?: boolean | null;
  is_monitored_children?: boolean | null;
  user_custom?: string | null;
  instancia?: number | null;
  tribunal?: number | null;
  created_at?: unknown;
  updated_at?: unknown;
  archived_at?: unknown;
};

export type JusbrasilProcessMonitorCreateInput = {
  numero: string;
  is_monitored_diario?: boolean;
  is_monitored_tribunal?: boolean;
  is_monitored_children?: boolean;
  user_custom?: string | null;
  instancia?: number;
  tribunal?: number | null;
};

export type JusbrasilProcessMonitorUpdateInput = {
  numero?: string;
  is_monitored_diario?: boolean;
  is_monitored_tribunal?: boolean;
  is_monitored_children?: boolean;
  user_custom?: string | null;
  instancia?: number;
  tribunal?: number | null;
};

export type JusbrasilWhereFilter = Record<string, unknown>;
export type JusbrasilSortInput = Record<string, boolean>;

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  searchParams?: Record<string, unknown>;
  body?: unknown;
  timeoutMs?: number;
};

export class JusbrasilClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl = DEFAULT_JUSBRASIL_API_BASE_URL) {
    this.apiKey = normalizeJusbrasilApiKey(apiKey);
    this.baseUrl = resolveJusbrasilApiBaseUrl(baseUrl);

    if (!this.apiKey) {
      throw new Error("JUSBRASIL_API_KEY nao configurada");
    }
  }

  private encodeSearchParamValue(value: unknown) {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  }

  private buildUrl(
    path: string,
    searchParams?: RequestOptions["searchParams"],
  ) {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${normalizedPath}`);

    if (searchParams) {
      for (const [key, value] of Object.entries(searchParams)) {
        const encoded = this.encodeSearchParamValue(value);
        if (!encoded) continue;
        url.searchParams.set(key, encoded);
      }
    }

    return url;
  }

  private async request<T>(path: string, options: RequestOptions = {}) {
    let response: Response;

    try {
      response = await fetch(this.buildUrl(path, options.searchParams), {
        method: options.method ?? "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
      });
    } catch (error) {
      const description =
        error instanceof Error ? error.message : "falha de rede desconhecida";
      throw new Error(`Falha ao consultar Jusbrasil em ${path}: ${description}`);
    }

    const rawBody = await response.text();
    let data = null as T;

    if (rawBody) {
      try {
        data = JSON.parse(rawBody) as T;
      } catch {
        if (response.ok) {
          throw new Error(`Resposta JSON invalida do Jusbrasil em ${path}`);
        }
      }
    }

    if (!response.ok) {
      throw new JusbrasilApiError(
        `Jusbrasil respondeu ${response.status} em ${path}`,
        response.status,
        rawBody,
      );
    }

    return {
      data,
      headers: response.headers,
    };
  }

  async listUsers(
    page = 1,
    perPage = 1,
  ): Promise<JusbrasilPaginatedResult<JusbrasilUser>> {
    const { data, headers } = await this.request<JusbrasilUser[]>("/admin/user", {
      searchParams: {
        page,
        per_page: perPage,
      },
    });

    return {
      items: Array.isArray(data) ? data : [],
      totalCount: parseHeaderInt(headers.get("x-total-count")),
    };
  }

  async getCurrentUser() {
    const result = await this.listUsers(1, 1);
    const currentUser = result.items[0];

    if (!currentUser) {
      throw new Error("Jusbrasil nao retornou usuario autenticado");
    }

    return currentUser;
  }

  async getCurrentWebhookConfig() {
    const { data } = await this.request<JusbrasilWebhookConfig>(
      "/admin/user_company/current_webhook_config",
    );

    return data;
  }

  async updateCurrentWebhookConfig(input: JusbrasilWebhookConfigInput) {
    const { data } = await this.request<JusbrasilWebhookConfig>(
      "/admin/user_company/current_webhook_config",
      {
        method: "POST",
        body: input,
      },
    );

    return data;
  }

  async listOabMonitors(
    page = 1,
    perPage = 10,
  ): Promise<JusbrasilPaginatedResult<JusbrasilOabMonitor>> {
    const { data, headers } = await this.request<JusbrasilOabMonitor[]>(
      "/monitoramento/oab/acompanhamento/",
      {
        searchParams: {
          page,
          per_page: perPage,
        },
      },
    );

    return {
      items: Array.isArray(data) ? data : [],
      totalCount: parseHeaderInt(headers.get("x-total-count")),
    };
  }

  async createOabMonitors(input: JusbrasilOabMonitorCreateInput[]) {
    const { data } = await this.request<JusbrasilOabMonitor[]>(
      "/monitoramento/oab/acompanhamento/",
      {
        method: "POST",
        body: input,
      },
    );

    return Array.isArray(data) ? data : [];
  }

  async getOabMonitorByCorrelationId(correlationId: string) {
    const { data } = await this.request<JusbrasilOabMonitor>(
      `/monitoramento/oab/acompanhamento/${encodeURIComponent(correlationId)}`,
    );

    return data;
  }

  async getOabMonitorByNumberAndRegion(region: string, number: number) {
    const normalizedRegion = region.trim().toUpperCase();
    const { data } = await this.request<JusbrasilOabMonitor>(
      `/monitoramento/oab/acompanhamento/${encodeURIComponent(normalizedRegion)}/${encodeURIComponent(String(number))}`,
    );

    return data;
  }

  async updateOabMonitor(id: number, input: JusbrasilOabMonitorUpdateInput) {
    const { data } = await this.request<JusbrasilOabMonitor>(
      `/monitoramento/oab/acompanhamento/${encodeURIComponent(String(id))}`,
      {
        method: "PATCH",
        body: input,
      },
    );

    return data;
  }

  async listOabProcessLinks(
    page = 1,
    perPage = 10,
  ): Promise<JusbrasilPaginatedResult<JusbrasilOabProcessLink>> {
    const { data, headers } = await this.request<JusbrasilOabProcessLink[]>(
      "/monitoramento/oab/vinculos/processos/",
      {
        searchParams: {
          page,
          per_page: perPage,
        },
      },
    );

    return {
      items: Array.isArray(data) ? data : [],
      totalCount: parseHeaderInt(headers.get("x-total-count")),
    };
  }

  async listOabProcessLinksByMonitor(params: {
    correlationId?: string;
    oabId?: number;
    page?: number;
    perPage?: number;
  }): Promise<JusbrasilPaginatedResult<JusbrasilOabProcessLink>> {
    const { data, headers } = await this.request<JusbrasilOabProcessLink[]>(
      "/monitoramento/oab/vinculos/processos/oab",
      {
        searchParams: {
          correlation_id: params.correlationId,
          oab_id: params.oabId,
          page: params.page ?? 1,
          per_page: params.perPage ?? 100,
        },
      },
    );

    return {
      items: Array.isArray(data) ? data : [],
      totalCount: parseHeaderInt(headers.get("x-total-count")),
    };
  }

  async getProcessByCnj(
    numeroCnj: string,
    options?: {
      refreshFromTribunal?: boolean;
      includeAttachments?: boolean;
      updateCallbackId?: string | null;
      timeoutMs?: number;
    },
  ) {
    return this.request<unknown>(
      `/base-judicial/tribproc/${encodeURIComponent(numeroCnj)}`,
      {
        searchParams: {
          tipo_numero: 5,
          ...(options?.refreshFromTribunal
            ? { atualiza_tribunal: true }
            : {}),
          ...(options?.includeAttachments
            ? { atualiza_tribunal_anexos: true }
            : {}),
          ...(options?.updateCallbackId
            ? { id_update_callback: options.updateCallbackId }
            : {}),
        },
        timeoutMs: options?.timeoutMs,
      },
    );
  }

  async listProcessMonitors(params?: {
    page?: number;
    perPage?: number;
    where?: JusbrasilWhereFilter;
    sort?: JusbrasilSortInput;
  }): Promise<JusbrasilPaginatedResult<JusbrasilProcessMonitor>> {
    const { data, headers } = await this.request<JusbrasilProcessMonitor[]>(
      "/monitoramento/proc",
      {
        searchParams: {
          page: params?.page ?? 1,
          per_page: params?.perPage ?? 30,
          where: params?.where,
          sort: params?.sort,
        },
      },
    );

    return {
      items: Array.isArray(data) ? data : [],
      totalCount: parseHeaderInt(headers.get("x-total-count")),
    };
  }

  async createProcessMonitor(input: JusbrasilProcessMonitorCreateInput) {
    const { data } = await this.request<JusbrasilProcessMonitor>(
      "/monitoramento/proc",
      {
        method: "POST",
        body: input,
      },
    );

    return data;
  }

  async updateProcessMonitor(
    monitorId: number | string,
    input: JusbrasilProcessMonitorUpdateInput,
  ) {
    const { data } = await this.request<JusbrasilProcessMonitor>(
      `/monitoramento/proc/${encodeURIComponent(String(monitorId))}`,
      {
        method: "PATCH",
        body: input,
      },
    );

    return data;
  }
}
