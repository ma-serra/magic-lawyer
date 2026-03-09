jest.mock("../prisma", () => ({
  __esModule: true,
  default: {
    clicksignTenantConfig: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock("@/lib/logger", () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

describe("clicksign mock mode", () => {
  const originalMockMode = process.env.CLICKSIGN_MOCK_MODE;
  const originalApiBase = process.env.CLICKSIGN_API_BASE;
  const originalAccessToken = process.env.CLICKSIGN_ACCESS_TOKEN;

  beforeEach(async () => {
    jest.resetModules();
    process.env.CLICKSIGN_MOCK_MODE = "true";
    delete process.env.CLICKSIGN_API_BASE;
    delete process.env.CLICKSIGN_ACCESS_TOKEN;
  });

  afterEach(async () => {
    process.env.CLICKSIGN_MOCK_MODE = originalMockMode;
    process.env.CLICKSIGN_API_BASE = originalApiBase;
    process.env.CLICKSIGN_ACCESS_TOKEN = originalAccessToken;
  });

  it("expõe fallback mock quando não há chave real", async () => {
    const { getGlobalClicksignFallbackSummary } = await import("../clicksign");

    expect(getGlobalClicksignFallbackSummary()).toEqual(
      expect.objectContaining({
        available: true,
        source: "MOCK",
        mockMode: true,
        apiBase: "mock://clicksign/api/v1",
        ambiente: "SANDBOX",
      }),
    );
  });

  it("permite enviar, consultar e cancelar documento em modo mock", async () => {
    const {
      checkDocumentStatus,
      cancelDocument,
      completeMockClicksignSignature,
      getMockClicksignDownload,
      getMockClicksignSigningSession,
      resetMockClicksignState,
      sendDocumentForSigning,
      testClicksignConnection,
      updateMockClicksignDocumentStatus,
    } = await import("../clicksign");

    resetMockClicksignState();

    const connection = await testClicksignConnection();
    expect(connection).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          source: "MOCK",
          ambiente: "SANDBOX",
        }),
      }),
    );

    const sendResult = await sendDocumentForSigning({
      filename: "contrato-mock.pdf",
      fileContent: Buffer.from("arquivo-mock"),
      signer: {
        email: "cliente@example.com",
        name: "Cliente Mock",
        document: "12345678900",
        birthday: "1990-01-01",
      },
      message: "Assine no mock",
    });

    expect(sendResult.success).toBe(true);
    expect(sendResult.data?.document.key).toMatch(/^mock-doc-/);
    expect(sendResult.data?.signer.key).toMatch(/^mock-signer-/);
    expect(sendResult.data?.signingUrl).toContain("/mock/clicksign/");
    expect(sendResult.data?.document.downloads.original_file_url).toContain(
      "/api/mock/clicksign/downloads/",
    );

    const session = getMockClicksignSigningSession(
      sendResult.data!.document.key,
      sendResult.data!.signer.key,
    );
    expect(session).toEqual(
      expect.objectContaining({
        document: expect.objectContaining({
          key: sendResult.data!.document.key,
        }),
        signer: expect.objectContaining({
          key: sendResult.data!.signer.key,
        }),
      }),
    );

    const pendingStatus = await checkDocumentStatus(sendResult.data!.document.key);
    expect(pendingStatus).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          status: "pending",
        }),
      }),
    );

    expect(
      completeMockClicksignSignature(
        sendResult.data!.document.key,
        sendResult.data!.signer.key,
      ),
    ).toBe(true);

    const signedStatus = await checkDocumentStatus(sendResult.data!.document.key);
    expect(signedStatus).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          status: "signed",
        }),
      }),
    );
    expect(signedStatus.data?.downloadUrl).toContain("/downloads/");
    expect(
      getMockClicksignDownload(sendResult.data!.document.key, "original"),
    ).toEqual(
      expect.objectContaining({
        filename: "contrato-mock.pdf",
        contentType: "application/pdf",
      }),
    );
    expect(
      getMockClicksignDownload(sendResult.data!.document.key, "signed"),
    ).toEqual(
      expect.objectContaining({
        filename: "contrato-mock.pdf",
        contentType: "application/pdf",
      }),
    );

    expect(
      updateMockClicksignDocumentStatus(sendResult.data!.document.key, "pending"),
    ).toBe(true);

    const cancelResult = await cancelDocument(sendResult.data!.document.key);
    expect(cancelResult.success).toBe(true);

    const cancelledStatus = await checkDocumentStatus(sendResult.data!.document.key);
    expect(cancelledStatus).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          status: "cancelled",
        }),
      }),
    );
  });
});
