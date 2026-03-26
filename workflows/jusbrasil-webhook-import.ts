import {
  processJusbrasilWebhookImportStep,
  type JusbrasilWebhookImportJobInput,
} from "@/app/lib/juridical/jusbrasil-webhook-import-step";

export async function jusbrasilWebhookImportWorkflow(
  input: JusbrasilWebhookImportJobInput,
) {
  "use workflow";

  await processJusbrasilWebhookImportStep(input);
}
