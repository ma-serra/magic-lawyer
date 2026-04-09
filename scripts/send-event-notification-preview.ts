import "dotenv/config";

import {
  EventNotificationPreviewService,
  type EventNotificationPreviewInput,
} from "../app/lib/notifications/services/event-notification-preview-service";

function readArg(flag: string) {
  const index = process.argv.indexOf(flag);

  if (index === -1) {
    return null;
  }

  return process.argv[index + 1] ?? null;
}

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function parseList(value: string | null) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function printUsage() {
  console.log(`
Uso:
  npx tsx scripts/send-event-notification-preview.ts [opcoes]

Opcoes:
  --mode preview|send              Modo de execucao. Default: preview
  --tenant <slug>                  Slug do tenant. Default: dayane-assis-advocacia
  --tenant-id <id>                 Id do tenant (sobrescreve o slug)
  --type <evento.*>                Tipo do evento. Default: evento.reminder_1h
  --payload-json <json>            Payload manual em JSON
  --base-url <url>                 Base URL manual para CTA dos canais
  --test-note <texto>              Prefixa a mensagem com um aviso explicito de teste
  --emails <a,b,c>                 Emails manuais para envio sem persistencia
  --telegram-chat-ids <1,2,3>      Chat IDs manuais do Telegram
  --help                           Exibe esta ajuda

Exemplos:
  npx tsx scripts/send-event-notification-preview.ts --mode preview
  npx tsx scripts/send-event-notification-preview.ts --mode send --base-url https://magiclawyer.vercel.app --test-note "Esta notificacao e apenas um teste interno." --emails assisdayane@hotmail.com --telegram-chat-ids 8621247112
  npx tsx scripts/send-event-notification-preview.ts --type evento.created --payload-json "{\\"titulo\\":\\"Audiencia de conciliacao\\"}"
`);
}

async function main() {
  if (hasFlag("--help")) {
    printUsage();
    return;
  }

  const modeArg = (readArg("--mode") || "preview").trim().toLowerCase();
  if (modeArg !== "preview" && modeArg !== "send") {
    throw new Error("Modo invalido. Use --mode preview ou --mode send.");
  }

  const mode = modeArg as "preview" | "send";
  const eventType =
    readArg("--type") || EventNotificationPreviewService.getDefaultEventType();
  const payloadJson = readArg("--payload-json");
  const payload = payloadJson
    ? (JSON.parse(payloadJson) as Record<string, unknown>)
    : EventNotificationPreviewService.createSamplePayload(eventType);

  const input: EventNotificationPreviewInput = {
    mode,
    tenantSlug: readArg("--tenant") || "dayane-assis-advocacia",
    tenantId: readArg("--tenant-id") || undefined,
    eventType,
    payload,
    baseUrl: readArg("--base-url") || undefined,
    testNotice: readArg("--test-note") || undefined,
    recipients: {
      emails: parseList(readArg("--emails")),
      telegramChatIds: parseList(readArg("--telegram-chat-ids")),
    },
  };

  const result = await EventNotificationPreviewService.execute(input);
  console.log(JSON.stringify(result, null, 2));

  if (mode === "send" && result.deliveries.some((delivery) => !delivery.success)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Falha ao executar preview de evento.",
  );
  process.exit(1);
});
