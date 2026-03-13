import { createHook } from "workflow";

import { executePortalProcessSyncWorkflowStep } from "@/app/lib/juridical/process-sync-workflow-step";
import {
  buildPortalProcessSyncHookToken,
  type PortalProcessSyncWorkflowInput,
  type PortalProcessSyncWorkflowOutcome,
  type PortalProcessSyncWorkflowResumePayload,
} from "@/app/lib/juridical/process-sync-workflow-shared";

export async function portalProcessSyncWorkflow(
  input: PortalProcessSyncWorkflowInput,
) {
  "use workflow";

  const hook = createHook<PortalProcessSyncWorkflowResumePayload>({
    token: buildPortalProcessSyncHookToken(input.syncId),
  });

  try {
    let outcome: PortalProcessSyncWorkflowOutcome =
      await executePortalProcessSyncWorkflowStep({
        ...input,
        mode: "INITIAL",
      });

    const iterator = hook[Symbol.asyncIterator]();

    while (outcome.kind === "WAITING_CAPTCHA") {
      const nextPayload = await iterator.next();
      if (nextPayload.done) {
        return outcome;
      }

      const payload = nextPayload.value;

      outcome = await executePortalProcessSyncWorkflowStep({
        ...input,
        mode: payload.action === "REFRESH" ? "INITIAL" : "CAPTCHA",
        captchaId: payload.action === "SOLVE" ? outcome.captchaId : undefined,
        captchaText:
          payload.action === "SOLVE" ? payload.captchaText.trim() : undefined,
      });
    }

    return outcome;
  } finally {
    hook.dispose();
  }
}
