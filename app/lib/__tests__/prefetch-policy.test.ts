import {
  getAuthenticatedNavPrefetchStrategy,
  normalizeNavigationHref,
} from "../navigation/prefetch-policy";

describe("prefetch policy", () => {
  it("normaliza href com query string, fragmento e barra final", () => {
    expect(normalizeNavigationHref("/dashboard/?tab=geral#top")).toBe(
      "/dashboard",
    );
    expect(normalizeNavigationHref("clientes")).toBe("/clientes");
  });

  it("forca prefetch de viewport apenas para dashboards", () => {
    expect(getAuthenticatedNavPrefetchStrategy("/dashboard")).toBe("viewport");
    expect(getAuthenticatedNavPrefetchStrategy("/admin/dashboard")).toBe(
      "viewport",
    );
  });

  it("desabilita prefetch automatico para rotas caras do shell autenticado", () => {
    expect(getAuthenticatedNavPrefetchStrategy("/inpi")).toBe("none");
    expect(getAuthenticatedNavPrefetchStrategy("/portal-advogado")).toBe(
      "none",
    );
    expect(getAuthenticatedNavPrefetchStrategy("/admin/suporte/chat/123")).toBe(
      "none",
    );
    expect(getAuthenticatedNavPrefetchStrategy("/documentos")).toBe("none");
  });

  it("usa prefetch por intencao para rotas operacionais comuns", () => {
    expect(getAuthenticatedNavPrefetchStrategy("/processos")).toBe("intent");
    expect(getAuthenticatedNavPrefetchStrategy("/clientes")).toBe("intent");
    expect(getAuthenticatedNavPrefetchStrategy("/agenda")).toBe("intent");
  });
});
