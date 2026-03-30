import { after, NextRequest, NextResponse } from "next/server";

import {
  enqueueJusbrasilOabTribprocBackfill,
  failJusbrasilOabTribprocBackfill,
  isValidInternalBackfillAuthHeader,
  processJusbrasilOabTribprocBackfill,
  type JusbrasilOabTribprocBackfillRequest,
} from "@/app/lib/juridical/jusbrasil-oab-tribproc-backfill";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  if (!isValidInternalBackfillAuthHeader(request.headers.get("authorization"))) {
    return NextResponse.json({ ok: false, error: "Nao autorizado." }, { status: 401 });
  }

  let payload: JusbrasilOabTribprocBackfillRequest;

  try {
    payload = (await request.json()) as JusbrasilOabTribprocBackfillRequest;
  } catch {
    return NextResponse.json({ ok: false, error: "Payload invalido." }, { status: 400 });
  }

  if (!payload?.job?.tenantId || !payload.job.correlationId || !payload.job.oab) {
    return NextResponse.json(
      { ok: false, error: "Payload do backfill incompleto." },
      { status: 400 },
    );
  }

  after(async () => {
    try {
      const result = await processJusbrasilOabTribprocBackfill(payload);

      if (!result.done && result.nextPage) {
        await enqueueJusbrasilOabTribprocBackfill({
          job: payload.job,
          page: result.nextPage,
          progress: result.progress,
        });
      }
    } catch (error) {
      logger.error(
        {
          tenantId: payload.job.tenantId,
          correlationId: payload.job.correlationId,
          page: payload.page ?? 1,
          error,
        },
        "Falha ao processar backfill interno do Jusbrasil via tribproc.",
      );

      await failJusbrasilOabTribprocBackfill(
        payload.job,
        error,
        payload.progress,
      ).catch((auditError) => {
        logger.error(
          {
            tenantId: payload.job.tenantId,
            correlationId: payload.job.correlationId,
            error: auditError,
          },
          "Falha adicional ao registrar erro do backfill Jusbrasil.",
        );
      });
    }
  });

  return NextResponse.json({
    ok: true,
    queued: true,
    page: payload.page ?? 1,
  });
}

