import {
  buildPricingChatLeadMetadata,
  getPricingChatFaqItemsByIds,
  parsePricingChatLeadMetadata,
} from "../pricing-chat";

describe("pricing chat helpers", () => {
  it("monta metadata estruturada para handoff humano com FAQs válidas", () => {
    const metadata = buildPricingChatLeadMetadata({
      requestedHumanHandoff: true,
      preferredContactChannel: "WhatsApp",
      responsePriority: "Hoje",
      faqTopicIds: ["growth-path", "human-support", "growth-path", "invalid"],
      stepReached: "contact",
      completedAnswers: 2,
      answersComplete: false,
    });

    expect(metadata).toEqual({
      version: 2,
      requestedHumanHandoff: true,
      preferredContactChannel: "WhatsApp",
      responsePriority: "Hoje",
      faqTopicIds: ["growth-path", "human-support"],
      qualificationPath: "HANDOFF",
      stepReached: "contact",
      completedAnswers: 2,
      answersComplete: false,
    });
  });

  it("faz parse seguro de metadata persistida", () => {
    const parsed = parsePricingChatLeadMetadata({
      version: 2,
      requestedHumanHandoff: false,
      preferredContactChannel: "E-mail",
      responsePriority: "Esta semana",
      faqTopicIds: ["implementation-time"],
      qualificationPath: "GUIDED",
      stepReached: "done",
      completedAnswers: 4,
      answersComplete: true,
    });

    expect(parsed).toEqual({
      version: 2,
      requestedHumanHandoff: false,
      preferredContactChannel: "E-mail",
      responsePriority: "Esta semana",
      faqTopicIds: ["implementation-time"],
      qualificationPath: "GUIDED",
      stepReached: "done",
      completedAnswers: 4,
      answersComplete: true,
    });
  });

  it("retorna apenas FAQs existentes para exibição no admin", () => {
    const items = getPricingChatFaqItemsByIds([
      "plans-difference",
      "human-support",
    ]);

    expect(items.map((item) => item.id)).toEqual([
      "plans-difference",
      "human-support",
    ]);
  });
});
