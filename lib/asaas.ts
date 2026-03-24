import { encrypt, decrypt } from "./crypto";

// Tipos para a API do Asaas
export interface AsaasConfig {
  apiKey: string;
  environment: "sandbox" | "production";
  baseUrl: string;
}

export interface AsaasCustomer {
  id?: string;
  name: string;
  email: string;
  cpfCnpj: string;
  phone?: string;
  mobilePhone?: string;
  postalCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  city?: string;
  state?: string;
  country?: string;
}

interface AsaasListResponse<T> {
  data: T[];
  hasMore?: boolean;
  totalCount?: number;
}

export type AsaasPaymentStatus =
  | "PENDING"
  | "PROCESSING"
  | "CONFIRMED"
  | "RECEIVED"
  | "RECEIVED_IN_CASH"
  | "OVERDUE"
  | "REFUNDED"
  | "CHARGED_BACK"
  | "FAILED"
  | "CANCELED"
  | "CANCELLED"
  | string;

export interface AsaasPayment {
  id?: string;
  subscription?: string;
  customer: string;
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED";
  value: number;
  dueDate: string;
  originalDueDate?: string | null;
  description?: string;
  externalReference?: string;
  installmentCount?: number;
  installmentValue?: number;
  totalValue?: number;
  status?: AsaasPaymentStatus;
  statusDescription?: string | null;
  paymentDate?: string | null;
  confirmedDate?: string | null;
  identificationField?: string | null;
  digitableLine?: string | null;
  bankSlipUrl?: string | null;
  boletoUrl?: string | null;
  invoiceUrl?: string | null;
  transactionReceiptUrl?: string | null;
  creditCard?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  creditCardHolderInfo?: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode?: string;
    addressNumber?: string;
    addressComplement?: string;
    phone?: string;
    mobilePhone?: string;
  };
  discount?: {
    value: number;
    dueDateLimitDays: number;
    type: "FIXED" | "PERCENTAGE";
  };
  fine?: {
    value: number;
    type: "FIXED" | "PERCENTAGE";
  };
  interest?: {
    value: number;
    type: "FIXED" | "PERCENTAGE";
  };
  pixTransaction?: {
    qrCode?: string;
    qrCodeUrl?: string;
    payload?: string;
    encodedImage?: string;
    expirationDate?: string;
  };
}

export interface AsaasSubscription {
  id?: string;
  customer: string;
  billingType: "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED";
  value: number;
  nextDueDate: string;
  cycle:
    | "WEEKLY"
    | "BIWEEKLY"
    | "MONTHLY"
    | "QUARTERLY"
    | "SEMIANNUALLY"
    | "YEARLY";
  description?: string;
  externalReference?: string;
  maxPayments?: number;
  endDate?: string;
}

export interface AsaasWebhook {
  event: string;
  payment?: AsaasPayment;
  subscription?: AsaasSubscription;
  customer?: AsaasCustomer;
}

export function normalizeAsaasApiKey(
  apiKey: string | null | undefined,
): string {
  if (!apiKey) {
    return "";
  }

  let normalized = apiKey.trim();
  if (
    (normalized.startsWith("'") && normalized.endsWith("'")) ||
    (normalized.startsWith('"') && normalized.endsWith('"'))
  ) {
    normalized = normalized.slice(1, -1).trim();
  }

  if (normalized.startsWith("\\$")) {
    normalized = normalized.slice(1);
  }

  return normalized;
}

export function resolveAsaasEnvironment(
  environment: string | null | undefined,
): "sandbox" | "production" {
  return environment?.trim().toLowerCase() === "production"
    ? "production"
    : "sandbox";
}

export class AsaasClient {
  private config: AsaasConfig;

  constructor(
    apiKey: string,
    environment: "sandbox" | "production" = "sandbox",
  ) {
    const normalizedApiKey = normalizeAsaasApiKey(apiKey);
    this.config = {
      apiKey: normalizedApiKey,
      environment,
      baseUrl:
        environment === "production"
          ? "https://www.asaas.com/api/v3"
          : "https://sandbox.asaas.com/api/v3",
    };
  }

  private async makeRequest<T>(
    endpoint: string,
    method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
    data?: any,
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;

    const options: RequestInit = {
      method,
      headers: {
        "Content-Type": "application/json",
        access_token: this.config.apiKey,
      },
    };

    if (data && method !== "GET") {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const errorText = await response.text();
        let errorData: any = {};

        try {
          errorData = errorText ? JSON.parse(errorText) : {};
        } catch {
          errorData = { raw: errorText };
        }

        console.error(
          "Detalhes do erro Asaas",
          JSON.stringify(
            {
              endpoint,
              method,
              status: response.status,
              error: errorData,
            },
            null,
            2,
          ),
        );

        throw new Error(
          `Asaas API Error: ${response.status} - ${
            errorData?.message || response.statusText
          }`,
        );
      }

      return await response.json();
    } catch (error) {
      console.error("Erro na requisição Asaas:", error);
      throw error;
    }
  }

  // ============================================
  // CUSTOMERS
  // ============================================

  async createCustomer(customer: AsaasCustomer): Promise<AsaasCustomer> {
    return this.makeRequest<AsaasCustomer>("/customers", "POST", customer);
  }

  async getCustomer(customerId: string): Promise<AsaasCustomer> {
    return this.makeRequest<AsaasCustomer>(`/customers/${customerId}`);
  }

  async findCustomerByCpfCnpj(cpfCnpj: string): Promise<AsaasCustomer | null> {
    const sanitized = formatCpfCnpjForAsaas(cpfCnpj);
    const response = await this.makeRequest<AsaasListResponse<AsaasCustomer>>(
      `/customers?cpfCnpj=${encodeURIComponent(sanitized)}&limit=1`,
    );

    return response.data?.[0] ?? null;
  }

  async updateCustomer(
    customerId: string,
    customer: Partial<AsaasCustomer>,
  ): Promise<AsaasCustomer> {
    return this.makeRequest<AsaasCustomer>(
      `/customers/${customerId}`,
      "PUT",
      customer,
    );
  }

  async deleteCustomer(customerId: string): Promise<void> {
    await this.makeRequest(`/customers/${customerId}`, "DELETE");
  }

  // ============================================
  // PAYMENTS
  // ============================================

  async createPayment(payment: AsaasPayment): Promise<AsaasPayment> {
    return this.makeRequest<AsaasPayment>("/payments", "POST", payment);
  }

  async getPayment(paymentId: string): Promise<AsaasPayment> {
    return this.makeRequest<AsaasPayment>(`/payments/${paymentId}`);
  }

  async listPayments(params: {
    customer?: string;
    subscription?: string;
    status?: string;
    offset?: number;
    limit?: number;
  } = {}): Promise<AsaasListResponse<AsaasPayment>> {
    const searchParams = new URLSearchParams();

    if (params.customer) searchParams.set("customer", params.customer);
    if (params.subscription)
      searchParams.set("subscription", params.subscription);
    if (params.status) searchParams.set("status", params.status);
    searchParams.set("offset", String(params.offset ?? 0));
    searchParams.set("limit", String(params.limit ?? 100));

    return this.makeRequest<AsaasListResponse<AsaasPayment>>(
      `/payments?${searchParams.toString()}`,
    );
  }

  async updatePayment(
    paymentId: string,
    payment: Partial<AsaasPayment>,
  ): Promise<AsaasPayment> {
    return this.makeRequest<AsaasPayment>(
      `/payments/${paymentId}`,
      "PUT",
      payment,
    );
  }

  async deletePayment(paymentId: string): Promise<void> {
    await this.makeRequest(`/payments/${paymentId}`, "DELETE");
  }

  // ============================================
  // SUBSCRIPTIONS
  // ============================================

  async createSubscription(
    subscription: AsaasSubscription,
  ): Promise<AsaasSubscription> {
    return this.makeRequest<AsaasSubscription>(
      "/subscriptions",
      "POST",
      subscription,
    );
  }

  async getSubscription(subscriptionId: string): Promise<AsaasSubscription> {
    return this.makeRequest<AsaasSubscription>(
      `/subscriptions/${subscriptionId}`,
    );
  }

  async updateSubscription(
    subscriptionId: string,
    subscription: Partial<AsaasSubscription>,
  ): Promise<AsaasSubscription> {
    return this.makeRequest<AsaasSubscription>(
      `/subscriptions/${subscriptionId}`,
      "PUT",
      subscription,
    );
  }

  async deleteSubscription(subscriptionId: string): Promise<void> {
    await this.makeRequest(`/subscriptions/${subscriptionId}`, "DELETE");
  }

  // ============================================
  // PIX
  // ============================================

  async generatePixQrCode(paymentId: string): Promise<{
    qrCode?: string;
    qrCodeUrl?: string;
    payload?: string;
    encodedImage?: string;
    success?: boolean;
    expirationDate?: string;
  }> {
    return this.makeRequest(`/payments/${paymentId}/pixQrCode`);
  }

  // ============================================
  // UTILITIES
  // ============================================

  async testConnection(): Promise<boolean> {
    try {
      await this.makeRequest("/customers?limit=1");

      return true;
    } catch (error) {
      console.error("Teste de conexão Asaas falhou:", error);

      return false;
    }
  }

  async getAccountInfo(): Promise<any> {
    return this.makeRequest("/myAccount");
  }
}

// ============================================
// FUNÇÕES UTILITÁRIAS
// ============================================

/**
 * Cria um cliente Asaas com credenciais criptografadas
 */
export function createAsaasClientFromEncrypted(
  encryptedApiKey: string,
  environment: "sandbox" | "production" = "sandbox",
): AsaasClient {
  try {
    const decryptedApiKey = decrypt(encryptedApiKey);

    return new AsaasClient(decryptedApiKey, environment);
  } catch (error) {
    console.error("Erro ao descriptografar API key do Asaas:", error);
    throw new Error("Credenciais Asaas inválidas");
  }
}

/**
 * Criptografa e armazena credenciais Asaas
 */
export function encryptAsaasCredentials(apiKey: string): string {
  return encrypt(apiKey);
}

/**
 * Valida formato da API key do Asaas
 */
export function validateAsaasApiKey(apiKey: string): boolean {
  const normalizedApiKey = normalizeAsaasApiKey(apiKey);
  // Asaas API keys geralmente começam com $aact_
  return normalizedApiKey.startsWith("$aact_") && normalizedApiKey.length > 20;
}

/**
 * Formata CPF/CNPJ para o Asaas (apenas números)
 */
export function formatCpfCnpjForAsaas(cpfCnpj: string): string {
  return cpfCnpj.replace(/\D/g, "");
}

/**
 * Formata valor para o Asaas (em centavos)
 */
export function formatValueForAsaas(value: number): number {
  return Math.round(value * 100);
}

/**
 * Converte valor do Asaas para reais
 */
export function formatValueFromAsaas(value: number): number {
  return value / 100;
}

/**
 * Formata data para o Asaas (YYYY-MM-DD)
 */
export function formatDateForAsaas(date: Date): string {
  return date.toISOString().split("T")[0];
}
