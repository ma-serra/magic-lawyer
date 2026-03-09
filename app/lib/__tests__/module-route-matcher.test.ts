import {
  isModuleRouteMatch,
  moduleRequiredForPath,
  normalizeModulePath,
} from "../module-route-matcher";

describe("module route matcher", () => {
  it("normaliza barra final, query string e fragmento", () => {
    expect(normalizeModulePath("/processos/?tab=1#top")).toBe("/processos");
    expect(normalizeModulePath("clientes")).toBe("/clientes");
  });

  it("faz match apenas por fronteira de rota", () => {
    expect(isModuleRouteMatch("/processos", "/processo")).toBe(false);
    expect(isModuleRouteMatch("/processos/123", "/processos")).toBe(true);
    expect(isModuleRouteMatch("/processos", "/processos")).toBe(true);
  });

  it("escolhe a rota mais específica quando há prefixos concorrentes", () => {
    const moduleMap = {
      processo: ["/processo"],
      processos: ["/processos"],
      clientes: ["/clientes"],
    };

    expect(moduleRequiredForPath(moduleMap, "/processos")).toBe("processos");
    expect(moduleRequiredForPath(moduleMap, "/processos/novo")).toBe(
      "processos",
    );
    expect(moduleRequiredForPath(moduleMap, "/processo/123")).toBe("processo");
    expect(moduleRequiredForPath(moduleMap, "/clientes")).toBe("clientes");
  });
});
