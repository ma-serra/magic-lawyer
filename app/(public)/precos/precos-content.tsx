"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { motion } from "framer-motion";
import NextLink from "next/link";
import { Avatar } from "@heroui/avatar";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Divider } from "@heroui/divider";
import { Input, Textarea } from "@heroui/input";
import { addToast } from "@heroui/toast";

import { createLeadFromPricingChat } from "@/app/actions/leads";
import {
  CONTACT_PREFERENCE_OPTIONS,
  PRICING_CHAT_FAQS,
  RESPONSE_PRIORITY_OPTIONS,
  type ContactPreferenceValue,
  type PricingChatFaqId,
  type PublicChatMessage,
  type ResponsePriorityValue,
} from "@/app/lib/pricing-chat";
import { CheckoutModal } from "@/components/checkout-modal";
import { subtitle, title } from "@/components/primitives";

interface Plano {
  id: string;
  nome: string;
  slug: string;
  valorMensal: number;
  valorAnual?: number;
  periodoTeste: number;
  limiteUsuarios: number;
  limiteProcessos: number;
  recursos: {
    features?: string[];
  } | null;
  descricao: string;
}

interface PlanoMatrix {
  planos: Array<{
    id: string;
    nome: string;
    slug: string;
  }>;
  modulos: Array<{
    id: string;
    nome: string;
    slug: string;
    categoria: string | null;
    habilitadoPlanoIds: string[];
  }>;
}

interface PrecosContentProps {
  planos: Plano[];
  matrix: PlanoMatrix;
}

type BotMessage = PublicChatMessage & {
  id: string;
};

type ScheduledBotMessage = {
  text: string;
  delayMs?: number;
  nextStep?: ChatStep;
};

type ChatStep =
  | "objective"
  | "teamSize"
  | "timeline"
  | "plan"
  | "contact"
  | "done";

const SALES_BOT_NAME = "Lia";
const INITIAL_MESSAGE_DELAY_MS = 360;
const MIN_BOT_TYPING_DELAY_MS = 700;
const MAX_BOT_TYPING_DELAY_MS = 1800;
const BOT_TYPING_CHAR_DELAY_MS = 16;
const BOT_RESPONSE_PAUSE_MS = 220;

const objectiveOptions = [
  "Organizar processos e prazos",
  "Padronizar operação da equipe",
  "Controlar financeiro jurídico",
  "Centralizar tudo em um único sistema",
];

const teamSizeOptions = [
  "Solo (1 pessoa)",
  "Pequeno (2 a 5 pessoas)",
  "Médio (6 a 15 pessoas)",
  "Grande (16+ pessoas)",
];

const timelineOptions = [
  "Implantar ainda esta semana",
  "Implantar no próximo mês",
  "Somente pesquisa por enquanto",
];

const planIcons: Record<string, string> = {
  basico: "🏢",
  pro: "🚀",
  enterprise: "🏛️",
  ultra: "👑",
};

const planChipTone = ["default", "primary", "secondary", "success"] as const;

function getDisplayFirstName(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return "";
  }

  return normalized.split(/\s+/)[0] ?? "";
}

function getAvatarName(name: string, fallback: string) {
  return name.trim() || fallback;
}

function getBotTypingDelayMs(text: string, overrideDelayMs?: number) {
  if (overrideDelayMs !== undefined) {
    return overrideDelayMs;
  }

  const delay = 520 + text.length * BOT_TYPING_CHAR_DELAY_MS;

  return Math.min(
    MAX_BOT_TYPING_DELAY_MS,
    Math.max(MIN_BOT_TYPING_DELAY_MS, delay),
  );
}

function countCompletedAnswers(answers: {
  objective: string;
  teamSize: string;
  timeline: string;
  plan: string;
}) {
  return Object.values(answers).filter((value) => value.trim().length > 0)
    .length;
}

function buildLeadFollowUpMessage(params: {
  maskedEmail: string;
  preferredContactChannel: ContactPreferenceValue | null;
  responsePriority: ResponsePriorityValue | null;
  hasPhone: boolean;
}) {
  const priorityText = params.responsePriority
    ? ` com prioridade de retorno ${params.responsePriority.toLowerCase()}`
    : "";

  if (params.preferredContactChannel === "WhatsApp" && params.hasPhone) {
    return `Nosso time comercial vai seguir pelo WhatsApp informado${priorityText} e também deixar registro no e-mail ${params.maskedEmail}.`;
  }

  if (params.preferredContactChannel === "Ligação") {
    return `Nosso time comercial vai organizar o retorno por ligação${priorityText} e confirmar os detalhes pelo e-mail ${params.maskedEmail}.`;
  }

  if (params.preferredContactChannel === "E-mail") {
    return `Nosso time comercial vai responder por e-mail${priorityText} usando ${params.maskedEmail}, com o contexto já estruturado pela conversa.`;
  }

  return `Nosso time comercial vai te responder em breve pelo e-mail ${params.maskedEmail} e seguir a conversa pelo canal mais adequado.`;
}

function formatCurrency(value?: number) {
  if (!value || Number.isNaN(value)) {
    return "R$ 0,00";
  }

  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getMostPopularPlan(planos: Plano[]) {
  if (planos.length === 0) {
    return null;
  }

  if (planos.length >= 2) {
    return planos[1];
  }

  return planos[0];
}

export function PrecosContent({ planos, matrix }: PrecosContentProps) {
  const [selectedPlano, setSelectedPlano] = useState<Plano | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<BotMessage[]>([]);
  const [chatStep, setChatStep] = useState<ChatStep>("objective");
  const [chatAnswers, setChatAnswers] = useState({
    objective: "",
    teamSize: "",
    timeline: "",
    plan: "",
  });
  const [leadForm, setLeadForm] = useState({
    nome: "",
    email: "",
    telefone: "",
    empresa: "",
    cargo: "",
    mensagem: "",
  });
  const [preferredContactChannel, setPreferredContactChannel] =
    useState<ContactPreferenceValue | null>(null);
  const [responsePriority, setResponsePriority] =
    useState<ResponsePriorityValue | null>(null);
  const [requestedHumanHandoff, setRequestedHumanHandoff] = useState(false);
  const [faqTopicIds, setFaqTopicIds] = useState<PricingChatFaqId[]>([]);
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [isSubmittingLead, startLeadSubmit] = useTransition();
  const chatViewportRef = useRef<HTMLDivElement | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);
  const messageIdRef = useRef(0);
  const pendingTimeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const popularPlan = getMostPopularPlan(planos);

  const modulesByPlan = useMemo(() => {
    const map = new Map<string, number>();

    matrix.modulos.forEach((modulo) => {
      modulo.habilitadoPlanoIds.forEach((planoId) => {
        map.set(planoId, (map.get(planoId) ?? 0) + 1);
      });
    });

    return map;
  }, [matrix.modulos]);

  const matrixRows = useMemo(() => {
    return matrix.modulos.map((modulo) => ({
      ...modulo,
      plans: matrix.planos.map((plano) => ({
        planoId: plano.id,
        enabled: modulo.habilitadoPlanoIds.includes(plano.id),
      })),
    }));
  }, [matrix.modulos, matrix.planos]);
  const completedAnswerCount = useMemo(
    () => countCompletedAnswers(chatAnswers),
    [chatAnswers],
  );

  const clearPendingBotTimeouts = useCallback(() => {
    pendingTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    pendingTimeoutsRef.current = [];
  }, []);

  const enqueueTimeout = useCallback(
    (callback: () => void, delayMs: number) => {
      const timeoutId = setTimeout(() => {
        pendingTimeoutsRef.current = pendingTimeoutsRef.current.filter(
          (currentId) => currentId !== timeoutId,
        );
        callback();
      }, delayMs);

      pendingTimeoutsRef.current.push(timeoutId);
    },
    [],
  );

  const createChatMessage = useCallback(
    (author: BotMessage["author"], text: string) => {
      messageIdRef.current += 1;

      return {
        id: `${author}-${messageIdRef.current}`,
        author,
        text,
        createdAt: new Date().toISOString(),
      };
    },
    [],
  );

  const appendBotMessage = useCallback(
    (text: string) => {
      setChatMessages((current) => [
        ...current,
        createChatMessage("bot", text),
      ]);
    },
    [createChatMessage],
  );

  const appendUserMessage = useCallback(
    (text: string) => {
      setChatMessages((current) => [
        ...current,
        createChatMessage("user", text),
      ]);
    },
    [createChatMessage],
  );

  const queueBotSequence = useCallback(
    (sequence: ScheduledBotMessage[]) => {
      if (sequence.length === 0) {
        setIsBotTyping(false);
        return;
      }

      const runNext = (index: number) => {
        const currentItem = sequence[index];

        if (!currentItem) {
          setIsBotTyping(false);
          return;
        }

        setIsBotTyping(true);
        enqueueTimeout(
          () => {
            appendBotMessage(currentItem.text);

            if (currentItem.nextStep) {
              setChatStep(currentItem.nextStep);
            }

            if (index === sequence.length - 1) {
              setIsBotTyping(false);
              return;
            }

            enqueueTimeout(() => runNext(index + 1), BOT_RESPONSE_PAUSE_MS);
          },
          getBotTypingDelayMs(currentItem.text, currentItem.delayMs),
        );
      };

      runNext(0);
    },
    [appendBotMessage, enqueueTimeout],
  );

  const startChatConversation = useCallback(() => {
    clearPendingBotTimeouts();
    messageIdRef.current = 0;
    setChatMessages([]);
    setChatStep("objective");
    setIsBotTyping(false);
    queueBotSequence([
      {
        text: `Olá, eu sou a ${SALES_BOT_NAME}. Vou te ajudar a entender qual proposta faz mais sentido para o momento do seu escritório.`,
        delayMs: INITIAL_MESSAGE_DELAY_MS,
      },
      {
        text: "1/4 • Hoje, qual é o principal objetivo que você quer resolver primeiro?",
      },
    ]);
  }, [clearPendingBotTimeouts, queueBotSequence]);

  useEffect(() => {
    startChatConversation();

    return () => {
      clearPendingBotTimeouts();
    };
  }, [clearPendingBotTimeouts, startChatConversation]);

  useEffect(() => {
    const viewport = chatViewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTo({
      top: viewport.scrollHeight,
      behavior: chatMessages.length > 0 ? "smooth" : "auto",
    });
    chatBottomRef.current?.scrollIntoView({
      block: "end",
      behavior: chatMessages.length > 0 ? "smooth" : "auto",
    });
  }, [chatMessages, isBotTyping]);

  const selectChatOption = (step: ChatStep, value: string) => {
    appendUserMessage(value);

    if (step === "objective") {
      setChatAnswers((prev) => ({ ...prev, objective: value }));
      queueBotSequence([
        {
          text: "Perfeito, esse costuma ser um ótimo ponto de partida.",
        },
        {
          text: "2/4 • Quantas pessoas devem usar a plataforma no dia a dia?",
          nextStep: "teamSize",
        },
      ]);

      return;
    }

    if (step === "teamSize") {
      setChatAnswers((prev) => ({ ...prev, teamSize: value }));
      queueBotSequence([
        {
          text: "Entendi. Isso já ajuda a calibrar implantação e suporte inicial.",
        },
        {
          text: "3/4 • Em que prazo vocês querem colocar isso para rodar?",
          nextStep: "timeline",
        },
      ]);

      return;
    }

    if (step === "timeline") {
      setChatAnswers((prev) => ({ ...prev, timeline: value }));
      queueBotSequence([
        {
          text: "Ótimo. Com esse timing eu já consigo contextualizar a proposta.",
        },
        {
          text: "4/4 • Qual plano você quer priorizar na proposta?",
          nextStep: "plan",
        },
      ]);

      return;
    }

    if (step === "plan") {
      setChatAnswers((prev) => ({ ...prev, plan: value }));
      queueBotSequence([
        {
          text: "Fechado. Agora me passa seus dados e, se quiser, deixe uma observação sobre operação, urgência ou volume.",
        },
        {
          text: "Assim o time comercial responde com uma proposta bem mais assertiva.",
          nextStep: "contact",
        },
      ]);
    }
  };

  const answerFaq = (faqId: PricingChatFaqId) => {
    const faq = PRICING_CHAT_FAQS.find((item) => item.id === faqId);

    if (!faq) {
      return;
    }

    setFaqTopicIds((current) =>
      current.includes(faqId) ? current : [...current, faqId],
    );
    appendUserMessage(faq.question);
    queueBotSequence(
      chatStep === "contact" || chatStep === "done"
        ? [{ text: faq.answer }]
        : [
            { text: faq.answer },
            {
              text: "Se fizer sentido, seguimos da etapa atual e eu monto a proposta com mais contexto.",
            },
          ],
    );
  };

  const requestHumanHandoff = () => {
    if (requestedHumanHandoff) {
      return;
    }

    setRequestedHumanHandoff(true);
    appendUserMessage("Quero falar com um especialista humano.");
    queueBotSequence(
      chatStep === "contact"
        ? [
            {
              text: "Perfeito. Já deixei o atendimento sinalizado para o time comercial humano.",
            },
          ]
        : [
            {
              text: "Sem problema. Eu continuo organizando o contexto e já deixo claro que você prefere atendimento humano.",
            },
            {
              text: "Pode preencher seus dados ao lado e marcar canal e prioridade de retorno para o time assumir daqui.",
              nextStep: "contact",
            },
          ],
    );
  };

  const resetChat = () => {
    setChatAnswers({
      objective: "",
      teamSize: "",
      timeline: "",
      plan: "",
    });
    setLeadForm({
      nome: "",
      email: "",
      telefone: "",
      empresa: "",
      cargo: "",
      mensagem: "",
    });
    setPreferredContactChannel(null);
    setResponsePriority(null);
    setRequestedHumanHandoff(false);
    setFaqTopicIds([]);
    startChatConversation();
  };

  const submitLead = () => {
    startLeadSubmit(async () => {
      const firstName = getDisplayFirstName(leadForm.nome);
      const response = await createLeadFromPricingChat({
        nome: leadForm.nome,
        email: leadForm.email,
        telefone: leadForm.telefone,
        empresa: leadForm.empresa,
        cargo: leadForm.cargo,
        interessePlano: chatAnswers.plan,
        tamanhoEquipe: chatAnswers.teamSize,
        horizonteContratacao: chatAnswers.timeline,
        objetivoPrincipal: chatAnswers.objective,
        mensagem: leadForm.mensagem,
        transcript: chatMessages,
        preferredContactChannel,
        responsePriority,
        requestedHumanHandoff,
        faqTopicIds,
        stepReached: chatStep,
        completedAnswers: completedAnswerCount,
        answersComplete: completedAnswerCount === 4,
      });

      if (!response.success) {
        addToast({
          title: "Não foi possível enviar agora",
          description: response.error,
          color: "danger",
        });

        return;
      }

      setChatStep("done");
      appendUserMessage(
        `Contato enviado: ${leadForm.nome} • ${leadForm.email}`,
      );
      queueBotSequence([
        {
          text: requestedHumanHandoff
            ? firstName
              ? `Perfeito, ${firstName}. Já deixei tudo registrado e sinalizei que você prefere atendimento humano.`
              : "Perfeito. Já deixei tudo registrado e sinalizei que você prefere atendimento humano."
            : firstName
              ? `Perfeito, ${firstName}. Já deixei tudo registrado aqui.`
              : "Perfeito. Já deixei tudo registrado aqui.",
          delayMs: 760,
        },
        {
          text: buildLeadFollowUpMessage({
            maskedEmail: response.data.maskedEmail,
            preferredContactChannel,
            responsePriority,
            hasPhone: Boolean(leadForm.telefone.trim()),
          }),
          delayMs: 900,
        },
      ]);
      addToast({
        title: "Lead enviado",
        description: "Nosso time comercial vai entrar em contato em breve.",
        color: "success",
      });
    });
  };

  const openCheckout = (plano: Plano) => {
    setSelectedPlano(plano);
    setIsCheckoutOpen(true);
  };

  const currentStepOptions =
    chatStep === "objective"
      ? objectiveOptions
      : chatStep === "teamSize"
        ? teamSizeOptions
        : chatStep === "timeline"
          ? timelineOptions
          : chatStep === "plan"
            ? planos.map((plano) => plano.nome)
            : [];
  const userAvatarName = getAvatarName(leadForm.nome, "Você");
  const selectedChannelHelper =
    CONTACT_PREFERENCE_OPTIONS.find(
      (option) => option.value === preferredContactChannel,
    )?.helper ?? "Opcional: ajuda o comercial a começar pelo canal certo.";
  const selectedPriorityHelper =
    RESPONSE_PRIORITY_OPTIONS.find(
      (option) => option.value === responsePriority,
    )?.helper ??
    "Opcional: define a urgência esperada para o primeiro retorno.";

  return (
    <>
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 py-10 sm:py-12">
        <motion.header
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4 text-center"
          initial={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.4 }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
            Comercial
          </p>
          <h1 className={title({ size: "lg", color: "blue" })}>
            Planos do Magic Lawyer
          </h1>
          <p className={subtitle({ fullWidth: true })}>
            Matriz completa de módulos por plano, contratação guiada e captação
            assistida para seu escritório entrar em produção sem ruído.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Chip color="primary" variant="flat">
              Transparência de módulos
            </Chip>
            <Chip color="success" variant="flat">
              Onboarding com especialista
            </Chip>
            <Chip color="secondary" variant="flat">
              Captação comercial em chat
            </Chip>
          </div>
        </motion.header>

        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="grid gap-5 lg:grid-cols-4"
          initial={{ opacity: 0, y: 24 }}
          transition={{ delay: 0.08, duration: 0.4 }}
        >
          {planos.map((plano, index) => {
            const isPopular = popularPlan?.id === plano.id;
            const enabledModules = modulesByPlan.get(plano.id) ?? 0;

            return (
              <Card
                key={plano.id}
                className={`relative border bg-background/80 ${
                  isPopular
                    ? "border-primary/50 shadow-lg shadow-primary/20"
                    : "border-default-200/40"
                }`}
              >
                {isPopular ? (
                  <Chip
                    className="absolute left-4 top-4"
                    color="primary"
                    size="sm"
                    variant="solid"
                  >
                    Mais escolhido
                  </Chip>
                ) : null}
                <CardHeader className="flex flex-col items-start gap-3 pb-2 pt-6">
                  <span className="text-3xl">
                    {planIcons[plano.slug] ?? "📁"}
                  </span>
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-foreground">
                      {plano.nome}
                    </h2>
                    <p className="text-sm text-default-500">
                      {plano.descricao}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-3xl font-semibold text-foreground">
                      {formatCurrency(plano.valorMensal)}
                      <span className="text-sm font-normal text-default-500">
                        {" "}
                        / mês
                      </span>
                    </p>
                    <p className="text-xs text-default-500">
                      {formatCurrency(plano.valorAnual)} / ano (quando
                      aplicável)
                    </p>
                  </div>
                </CardHeader>
                <Divider />
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Chip color="secondary" size="sm" variant="flat">
                      {enabledModules} módulo(s) habilitado(s)
                    </Chip>
                    <Chip color="default" size="sm" variant="flat">
                      {plano.periodoTeste} dias de teste
                    </Chip>
                  </div>
                  <ul className="space-y-2 text-sm text-default-600">
                    <li>• Até {plano.limiteUsuarios} usuários</li>
                    <li>• Até {plano.limiteProcessos} processos</li>
                    {(plano.recursos?.features ?? [])
                      .slice(0, 3)
                      .map((feature) => (
                        <li key={feature}>• {feature}</li>
                      ))}
                  </ul>
                  <Button
                    className="mt-2 w-full"
                    color={planChipTone[index % planChipTone.length]}
                    onPress={() => openCheckout(plano)}
                  >
                    Iniciar contratação
                  </Button>
                </CardBody>
              </Card>
            );
          })}
        </motion.div>

        <motion.div
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 24 }}
          transition={{ delay: 0.16, duration: 0.4 }}
        >
          <Card className="border border-default-200/40 bg-background/80">
            <CardHeader className="flex flex-col items-start gap-2">
              <h2 className="text-xl font-semibold text-foreground">
                Matriz Plano x Módulo
              </h2>
              <p className="text-sm text-default-500">
                Comparativo objetivo para compra: cada módulo listado abaixo
                mostra exatamente em quais planos está liberado.
              </p>
            </CardHeader>
            <Divider />
            <CardBody>
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-2">
                  <thead>
                    <tr>
                      <th className="w-[340px] px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.14em] text-default-500">
                        Módulo
                      </th>
                      {matrix.planos.map((plano) => (
                        <th
                          key={plano.id}
                          className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-default-500"
                        >
                          {plano.nome}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrixRows.map((modulo) => (
                      <tr
                        key={modulo.id}
                        className="rounded-xl bg-default-100/30"
                      >
                        <td className="rounded-l-xl px-3 py-3 align-middle">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-foreground">
                              {modulo.nome}
                            </p>
                            <p className="text-xs text-default-500">
                              {modulo.categoria ?? "Outros módulos"}
                            </p>
                          </div>
                        </td>
                        {modulo.plans.map((planStatus) => (
                          <td
                            key={`${modulo.id}-${planStatus.planoId}`}
                            className="px-3 py-3 text-center align-middle"
                          >
                            <Chip
                              color={planStatus.enabled ? "success" : "default"}
                              size="sm"
                              variant={planStatus.enabled ? "flat" : "bordered"}
                            >
                              {planStatus.enabled ? "Incluído" : "—"}
                            </Chip>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="pt-3 text-xs text-default-500">
                Esta matriz é a referência oficial da contratação no momento da
                compra. Em caso de upgrade/downgrade, os módulos seguem esta
                configuração vigente.
              </p>
            </CardBody>
          </Card>
        </motion.div>

        <motion.div
          id="lead-chat"
          animate={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 24 }}
          transition={{ delay: 0.24, duration: 0.4 }}
        >
          <Card className="border border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background">
            <CardHeader className="flex flex-col items-start gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                {SALES_BOT_NAME} • assistente comercial
              </p>
              <h2 className="text-xl font-semibold text-foreground">
                Chat de qualificação de lead
              </h2>
              <p className="text-sm text-default-500">
                Responda opções rápidas. O robô registra contexto e já envia
                para o time de vendas trabalhar seu caso.
              </p>
            </CardHeader>
            <Divider />
            <CardBody className="grid gap-4 lg:min-h-[42rem] lg:grid-cols-[1.15fr_0.85fr] lg:items-stretch">
              <div className="flex min-h-[30rem] flex-col gap-3 lg:h-full">
                <div
                  ref={chatViewportRef}
                  className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-default-200/40 bg-default-50/40 p-3 sm:p-4"
                >
                  {chatMessages.map((message) => (
                    <div
                      key={message.id}
                      className={
                        message.author === "bot"
                          ? "flex justify-start"
                          : "flex justify-end"
                      }
                    >
                      <div
                        className={`flex max-w-[94%] items-end gap-2.5 sm:max-w-[88%] ${
                          message.author === "bot" ? "" : "flex-row-reverse"
                        }`}
                      >
                        <Avatar
                          classNames={{
                            base:
                              message.author === "bot"
                                ? "h-9 w-9 shrink-0 border border-primary/25 bg-gradient-to-br from-amber-200 via-orange-200 to-rose-200 text-slate-900"
                                : "h-9 w-9 shrink-0 border border-secondary/25 bg-gradient-to-br from-sky-200 via-cyan-200 to-emerald-200 text-slate-900",
                            name: "text-[11px] font-semibold",
                          }}
                          name={
                            message.author === "bot"
                              ? SALES_BOT_NAME
                              : userAvatarName
                          }
                          size="sm"
                        />
                        <div
                          className={`rounded-2xl px-3 py-2.5 text-sm shadow-sm ${
                            message.author === "bot"
                              ? "rounded-bl-md border border-primary/20 bg-slate-50 text-slate-800"
                              : "rounded-br-md border border-secondary/15 bg-secondary/15 text-foreground"
                          }`}
                        >
                          <p
                            className={
                              message.author === "bot"
                                ? "text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500"
                                : "text-[11px] font-semibold uppercase tracking-[0.14em] text-default-500"
                            }
                          >
                            {message.author === "bot"
                              ? SALES_BOT_NAME
                              : userAvatarName}
                          </p>
                          <p
                            className={
                              message.author === "bot"
                                ? "leading-relaxed text-slate-800"
                                : "leading-relaxed"
                            }
                          >
                            {message.text}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {isBotTyping ? (
                    <div className="flex justify-start">
                      <div className="flex max-w-[88%] items-end gap-2.5">
                        <Avatar
                          classNames={{
                            base: "h-9 w-9 shrink-0 border border-primary/25 bg-gradient-to-br from-amber-200 via-orange-200 to-rose-200 text-slate-900",
                            name: "text-[11px] font-semibold",
                          }}
                          name={SALES_BOT_NAME}
                          size="sm"
                        />
                        <div className="rounded-2xl rounded-bl-md border border-primary/20 bg-slate-50 px-3 py-3 text-sm text-slate-800 shadow-sm">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            {SALES_BOT_NAME}
                          </p>
                          <div className="flex items-center gap-1.5">
                            {[0, 1, 2].map((dot) => (
                              <span
                                key={`typing-dot-${dot}`}
                                className="inline-flex h-2.5 w-2.5 rounded-full bg-primary/55"
                                style={{
                                  animation:
                                    "ml-typing-pulse 1.1s ease-in-out infinite",
                                  animationDelay: `${dot * 0.16}s`,
                                }}
                              />
                            ))}
                            <span className="pl-2 text-xs text-slate-500">
                              digitando...
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <div ref={chatBottomRef} />
                </div>

                <div className="space-y-3">
                  {chatStep !== "contact" &&
                  chatStep !== "done" &&
                  !isBotTyping ? (
                    <div className="flex flex-wrap gap-2">
                      {currentStepOptions.map((option) => (
                        <Button
                          key={`${chatStep}-${option}`}
                          size="sm"
                          variant="flat"
                          onPress={() => selectChatOption(chatStep, option)}
                        >
                          {option}
                        </Button>
                      ))}
                    </div>
                  ) : null}

                  {chatStep !== "done" ? (
                    <div className="rounded-2xl border border-default-200/40 bg-background/70 p-3">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-default-500">
                          Perguntas rápidas
                        </p>
                        <p className="text-sm text-default-500">
                          A Lia também responde dúvidas comerciais comuns sem te
                          tirar da conversa.
                        </p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {PRICING_CHAT_FAQS.map((faq) => (
                          <Button
                            key={faq.id}
                            color={
                              faqTopicIds.includes(faq.id)
                                ? "secondary"
                                : "default"
                            }
                            isDisabled={isBotTyping}
                            size="sm"
                            variant={
                              faqTopicIds.includes(faq.id) ? "flat" : "bordered"
                            }
                            onPress={() => answerFaq(faq.id)}
                          >
                            {faq.shortLabel}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {chatStep !== "done" ? (
                    <div className="rounded-2xl border border-secondary/20 bg-secondary/5 p-3">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm font-semibold text-foreground">
                            Atendimento humano quando fizer sentido
                          </p>
                          <p className="text-sm text-default-500">
                            Se você preferir, a Lia para de insistir no roteiro
                            e deixa o time comercial assumir daqui.
                          </p>
                        </div>
                        <Button
                          className="max-w-full whitespace-normal px-4 py-3 text-center md:w-auto"
                          color="secondary"
                          isDisabled={isBotTyping}
                          variant={requestedHumanHandoff ? "solid" : "flat"}
                          onPress={requestHumanHandoff}
                        >
                          {requestedHumanHandoff
                            ? "Handoff humano solicitado"
                            : "Quero falar com especialista"}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex h-full flex-col gap-4 rounded-2xl border border-default-200/40 bg-background/80 p-4 pt-5">
                <h3 className="text-sm font-semibold text-foreground">
                  Dados para retorno comercial
                </h3>
                {requestedHumanHandoff ? (
                  <div className="rounded-2xl border border-secondary/20 bg-secondary/10 p-3 text-sm text-default-600">
                    Handoff humano solicitado. Preencha os dados abaixo que o
                    time comercial assume a conversa com prioridade mais clara.
                  </div>
                ) : null}
                <Input
                  classNames={{
                    base: "pt-2",
                    label: "pb-1 text-sm font-medium text-default-700",
                  }}
                  isRequired
                  label="Nome"
                  labelPlacement="outside"
                  placeholder="Seu nome completo"
                  value={leadForm.nome}
                  onValueChange={(value) =>
                    setLeadForm((prev) => ({ ...prev, nome: value }))
                  }
                />
                <Input
                  classNames={{
                    base: "pt-2",
                    label: "pb-1 text-sm font-medium text-default-700",
                  }}
                  isRequired
                  label="E-mail"
                  labelPlacement="outside"
                  placeholder="voce@escritorio.com.br"
                  type="email"
                  value={leadForm.email}
                  onValueChange={(value) =>
                    setLeadForm((prev) => ({ ...prev, email: value }))
                  }
                />
                <Input
                  classNames={{
                    base: "pt-2",
                    label: "pb-1 text-sm font-medium text-default-700",
                  }}
                  label="Telefone/WhatsApp"
                  labelPlacement="outside"
                  placeholder="(71) 99999-9999"
                  value={leadForm.telefone}
                  onValueChange={(value) =>
                    setLeadForm((prev) => ({ ...prev, telefone: value }))
                  }
                />
                <Input
                  classNames={{
                    base: "pt-2",
                    label: "pb-1 text-sm font-medium text-default-700",
                  }}
                  label="Escritório/Empresa"
                  labelPlacement="outside"
                  placeholder="Nome do escritório"
                  value={leadForm.empresa}
                  onValueChange={(value) =>
                    setLeadForm((prev) => ({ ...prev, empresa: value }))
                  }
                />
                <Input
                  classNames={{
                    base: "pt-2",
                    label: "pb-1 text-sm font-medium text-default-700",
                  }}
                  label="Cargo"
                  labelPlacement="outside"
                  placeholder="Ex.: Sócio, Coordenador, Administrativo"
                  value={leadForm.cargo}
                  onValueChange={(value) =>
                    setLeadForm((prev) => ({ ...prev, cargo: value }))
                  }
                />
                <div className="space-y-2">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-default-700">
                      Canal preferido para retorno
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {CONTACT_PREFERENCE_OPTIONS.map((option) => (
                        <Button
                          key={option.value}
                          color={
                            preferredContactChannel === option.value
                              ? "primary"
                              : "default"
                          }
                          size="sm"
                          variant={
                            preferredContactChannel === option.value
                              ? "flat"
                              : "bordered"
                          }
                          onPress={() =>
                            setPreferredContactChannel((current) =>
                              current === option.value ? null : option.value,
                            )
                          }
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-default-500">
                      {selectedChannelHelper}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-sm font-medium text-default-700">
                      Prioridade do primeiro retorno
                    </p>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {RESPONSE_PRIORITY_OPTIONS.map((option) => (
                        <Button
                          key={option.value}
                          color={
                            responsePriority === option.value
                              ? "secondary"
                              : "default"
                          }
                          size="sm"
                          variant={
                            responsePriority === option.value
                              ? "flat"
                              : "bordered"
                          }
                          onPress={() =>
                            setResponsePriority((current) =>
                              current === option.value ? null : option.value,
                            )
                          }
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-default-500">
                      {selectedPriorityHelper}
                    </p>
                  </div>
                </div>
                <Textarea
                  classNames={{
                    base: "pt-2",
                    label: "pb-1 text-sm font-medium text-default-700",
                  }}
                  label="Mensagem complementar"
                  labelPlacement="outside"
                  minRows={3}
                  placeholder="Contexto comercial, urgência, volume de operação..."
                  value={leadForm.mensagem}
                  onValueChange={(value) =>
                    setLeadForm((prev) => ({ ...prev, mensagem: value }))
                  }
                />

                <div className="mt-auto flex flex-col gap-2 pt-2">
                  <Button
                    color="primary"
                    isDisabled={chatStep !== "contact" || isSubmittingLead}
                    isLoading={isSubmittingLead}
                    onPress={submitLead}
                  >
                    Enviar para vendas
                  </Button>
                  <Button variant="light" onPress={resetChat}>
                    Reiniciar conversa
                  </Button>
                </div>

                {chatStep === "done" ? (
                  <p className="text-xs text-success">
                    Lead registrado. Nossa equipe comercial continuará o
                    atendimento pelo canal mais aderente ao seu contexto.
                  </p>
                ) : (
                  <p className="text-xs text-default-500">
                    O envio é liberado após concluir as 4 perguntas guiadas ou
                    após pedir handoff humano.
                  </p>
                )}
              </div>
            </CardBody>
          </Card>
        </motion.div>

        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="grid gap-4 md:grid-cols-3"
          initial={{ opacity: 0, y: 24 }}
          transition={{ delay: 0.32, duration: 0.4 }}
        >
          <Card className="border border-default-200/40 bg-background/80">
            <CardBody className="space-y-2">
              <h3 className="text-base font-semibold text-foreground">
                Implantação assistida
              </h3>
              <p className="text-sm text-default-500">
                Time comercial e onboarding alinham módulo a módulo antes de
                ativar produção.
              </p>
            </CardBody>
          </Card>
          <Card className="border border-default-200/40 bg-background/80">
            <CardBody className="space-y-2">
              <h3 className="text-base font-semibold text-foreground">
                Contratação segura
              </h3>
              <p className="text-sm text-default-500">
                Escopo explícito de plano, teste inicial e trilha de upgrade sem
                perda de dados.
              </p>
            </CardBody>
          </Card>
          <Card className="border border-default-200/40 bg-background/80">
            <CardBody className="space-y-2">
              <h3 className="text-base font-semibold text-foreground">
                Suporte de evolução
              </h3>
              <p className="text-sm text-default-500">
                Mudou de fase operacional? O time orienta expansão para o plano
                correto sem retrabalho.
              </p>
            </CardBody>
          </Card>
        </motion.div>

        <div className="flex flex-wrap justify-center gap-3 pb-2">
          <Button
            color="primary"
            radius="full"
            size="lg"
            onPress={() => {
              if (popularPlan) {
                openCheckout(popularPlan);
              }
            }}
          >
            Começar teste agora
          </Button>
          <Button
            as={NextLink}
            href="/docs"
            radius="full"
            size="lg"
            variant="bordered"
          >
            Ver documentação
          </Button>
        </div>
      </section>

      <CheckoutModal
        isOpen={isCheckoutOpen}
        plano={selectedPlano}
        onOpenChange={setIsCheckoutOpen}
      />
      <style jsx global>{`
        @keyframes ml-typing-pulse {
          0%,
          80%,
          100% {
            opacity: 0.35;
            transform: translateY(0);
          }
          40% {
            opacity: 1;
            transform: translateY(-3px);
          }
        }
      `}</style>
    </>
  );
}
