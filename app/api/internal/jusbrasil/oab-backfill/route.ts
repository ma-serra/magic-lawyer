import { after, NextRequest, NextResponse } from "next/server";

import {
  enqueueJusbrasilOabTribprocBackfill,
  failJusbrasilOabTribprocBackfill,
  isValidInternalBackfillAuthHeader,
  processJusbrasilOabTribprocBackfill,
  type JusbrasilOabTribprocBackfillProgress,
  type JusbrasilOabTribprocBackfillRequest,
} from "@/app/lib/juridical/jusbrasil-oab-tribproc-backfill";
import logger from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_CHUNK_DURATION_MS = 240_000;
const MIN_TIME_LEFT_FOR_NEXT_PAGE_MS = 15_000;

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
    let currentPage = payload.page ?? 1;
    let currentProgress: JusbrasilOabTribprocBackfillProgress | undefined =
      payload.progress;
    const startedAt = Date.now();

    try {
      while (true) {
        const result = await processJusbrasilOabTribprocBackfill({
          job: payload.job,
          page: currentPage,
          progress: currentProgress,
        });

        currentProgress = result.progress;

        if (result.done || !result.nextPage) {
          break;
        }

        currentPage = result.nextPage;

        if (
          Date.now() - startedAt >=
          MAX_CHUNK_DURATION_MS - MIN_TIME_LEFT_FOR_NEXT_PAGE_MS
        ) {
          await enqueueJusbrasilOabTribprocBackfill({
            job: payload.job,
            page: currentPage,
            progress: currentProgress,
          });
          break;
        }
      }
    } catch (error) {
      logger.error(
        {
          tenantId: payload.job.tenantId,
          correlationId: payload.job.correlationId,
          page: currentPage,
          error,
        },
        "Falha ao processar backfill interno do Jusbrasil via tribproc.",
      );

      await failJusbrasilOabTribprocBackfill(
        payload.job,
        error,
        currentProgress,
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
