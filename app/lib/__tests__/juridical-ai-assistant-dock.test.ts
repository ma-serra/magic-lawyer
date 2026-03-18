import {
  buildJuridicalAiWorkspaceHref,
  getJuridicalAiDockActions,
  resolveJuridicalAiDockContext,
} from "../juridical-ai/assistant-dock";

describe("juridical ai assistant dock", () => {
  it("prioriza ações de peça e resumo em contexto de processos", () => {
    const context = resolveJuridicalAiDockContext("/processos/abc", "tenant");
    const actions = getJuridicalAiDockActions("/processos/abc", "tenant");

    expect(context.id).toBe("processos");
    expect(actions[0]?.id).toBe("nova-peca");
    expect(actions[1]?.id).toBe("resumir-processo");
  });

  it("reconhece documentos como contexto próprio", () => {
    const context = resolveJuridicalAiDockContext("/documentos", "tenant");
    const actions = getJuridicalAiDockActions("/documentos", "tenant");

    expect(context.id).toBe("documentos");
    expect(actions[0]?.id).toBe("analisar-documento");
  });

  it("prioriza governança no admin de auditoria", () => {
    const context = resolveJuridicalAiDockContext("/admin/auditoria", "admin");
    const actions = getJuridicalAiDockActions("/admin/auditoria", "admin");

    expect(context.id).toBe("governanca");
    expect(actions[0]?.id).toBe("governanca-ia");
    expect(actions.some((action) => action.id === "auditar-uso")).toBe(true);
  });

  it("monta href contextual com processo para o workspace do tenant", () => {
    const href = buildJuridicalAiWorkspaceHref({
      pathname: "/processos/abc123",
      scope: "tenant",
      actionId: "nova-peca",
    });

    expect(href).toContain("/magic-ai?");
    expect(href).toContain("action=nova-peca");
    expect(href).toContain("tab=peca");
    expect(href).toContain("processId=abc123");
  });

  it("monta href do cockpit admin com tab de rollout", () => {
    const href = buildJuridicalAiWorkspaceHref({
      pathname: "/admin/auditoria",
      scope: "admin",
      actionId: "governanca-ia",
    });

    expect(href).toBe(
      "/admin/magic-ai?action=governanca-ia&returnTo=%2Fadmin%2Fauditoria&tab=rollout",
    );
  });
});
