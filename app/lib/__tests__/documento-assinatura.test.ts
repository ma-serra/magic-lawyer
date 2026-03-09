import { createDocumentoAssinatura } from "../documento-assinatura";
import prisma from "../prisma";

jest.mock("../prisma", () => ({
  __esModule: true,
  default: {
    documento: {
      findUnique: jest.fn(),
    },
    cliente: {
      findUnique: jest.fn(),
    },
    processo: {
      findUnique: jest.fn(),
    },
    advogado: {
      findUnique: jest.fn(),
    },
    usuario: {
      findUnique: jest.fn(),
    },
    documentoAssinatura: {
      create: jest.fn(),
    },
  },
}));

jest.mock("../clicksign", () => ({
  sendDocumentForSigning: jest.fn(),
  checkDocumentStatus: jest.fn(),
}));

jest.mock("@/app/lib/email-service", () => ({
  emailService: {
    sendEmailPerTenant: jest.fn(),
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

describe("createDocumentoAssinatura", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("usa o tenant do documento e herda processo vinculado quando não informado", async () => {
    (prisma.documento.findUnique as jest.Mock).mockResolvedValue({
      id: "doc-1",
      tenantId: "tenant-a",
      processoId: "proc-1",
      clienteId: "cliente-1",
    });
    (prisma.cliente.findUnique as jest.Mock).mockResolvedValue({
      id: "cliente-1",
      tenantId: "tenant-a",
    });
    (prisma.processo.findUnique as jest.Mock).mockResolvedValue({
      id: "proc-1",
      tenantId: "tenant-a",
    });
    (prisma.usuario.findUnique as jest.Mock).mockResolvedValue({
      id: "user-1",
      tenantId: "tenant-a",
    });
    (prisma.documentoAssinatura.create as jest.Mock).mockResolvedValue({
      id: "sig-1",
      tenantId: "tenant-a",
    });

    const result = await createDocumentoAssinatura({
      documentoId: "doc-1",
      clienteId: "cliente-1",
      titulo: "Contrato de honorários",
      urlDocumento: "https://example.com/doc.pdf",
      criadoPorId: "user-1",
    });

    expect(result.success).toBe(true);
    expect(prisma.documentoAssinatura.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-a",
          processoId: "proc-1",
          clienteId: "cliente-1",
          criadoPorId: "user-1",
        }),
      }),
    );
  });

  it("bloqueia criação quando cliente pertence a outro tenant", async () => {
    (prisma.documento.findUnique as jest.Mock).mockResolvedValue({
      id: "doc-1",
      tenantId: "tenant-a",
      processoId: null,
      clienteId: null,
    });
    (prisma.cliente.findUnique as jest.Mock).mockResolvedValue({
      id: "cliente-2",
      tenantId: "tenant-b",
    });

    const result = await createDocumentoAssinatura({
      documentoId: "doc-1",
      clienteId: "cliente-2",
      titulo: "Procuração",
      urlDocumento: "https://example.com/doc.pdf",
      criadoPorId: "user-1",
    });

    expect(result).toEqual({
      success: false,
      error: "Documento e cliente pertencem a tenants diferentes",
    });
    expect(prisma.documentoAssinatura.create).not.toHaveBeenCalled();
  });

  it("bloqueia criação quando usuário criador pertence a outro tenant", async () => {
    (prisma.documento.findUnique as jest.Mock).mockResolvedValue({
      id: "doc-1",
      tenantId: "tenant-a",
      processoId: null,
      clienteId: "cliente-1",
    });
    (prisma.cliente.findUnique as jest.Mock).mockResolvedValue({
      id: "cliente-1",
      tenantId: "tenant-a",
    });
    (prisma.usuario.findUnique as jest.Mock).mockResolvedValue({
      id: "user-x",
      tenantId: "tenant-b",
    });

    const result = await createDocumentoAssinatura({
      documentoId: "doc-1",
      clienteId: "cliente-1",
      titulo: "Aditivo",
      urlDocumento: "https://example.com/doc.pdf",
      criadoPorId: "user-x",
    });

    expect(result).toEqual({
      success: false,
      error: "Usuário criador pertence a outro tenant",
    });
    expect(prisma.documentoAssinatura.create).not.toHaveBeenCalled();
  });
});
