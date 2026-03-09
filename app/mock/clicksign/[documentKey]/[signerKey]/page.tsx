import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  completeMockClicksignSignature,
  getMockClicksignSigningSession,
} from "@/app/lib/clicksign";

export const dynamic = "force-dynamic";

interface MockClicksignPageProps {
  params: Promise<{
    documentKey: string;
    signerKey: string;
  }>;
}

function getStatusBadgeClasses(status: string) {
  switch (status) {
    case "signed":
      return "border-emerald-500/30 bg-emerald-500/15 text-emerald-200";
    case "rejected":
      return "border-rose-500/30 bg-rose-500/15 text-rose-200";
    case "cancelled":
      return "border-amber-500/30 bg-amber-500/15 text-amber-200";
    default:
      return "border-sky-500/30 bg-sky-500/15 text-sky-200";
  }
}

export default async function MockClicksignPage({
  params,
}: MockClicksignPageProps) {
  const { documentKey, signerKey } = await params;
  const session = getMockClicksignSigningSession(documentKey, signerKey);

  if (!session) {
    notFound();
  }

  async function signDocumentAction() {
    "use server";

    completeMockClicksignSignature(documentKey, signerKey, "signed");
    redirect(`/mock/clicksign/${documentKey}/${signerKey}`);
  }

  async function rejectDocumentAction() {
    "use server";

    completeMockClicksignSignature(documentKey, signerKey, "rejected");
    redirect(`/mock/clicksign/${documentKey}/${signerKey}`);
  }

  const { document, signer } = session;
  const isPending = document.status === "pending";

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.20),_transparent_40%),linear-gradient(180deg,_#0f172a_0%,_#111827_100%)] px-4 py-10 text-slate-100">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <section className="overflow-hidden rounded-[28px] border border-white/10 bg-white/5 shadow-2xl shadow-slate-950/30 backdrop-blur">
          <div className="border-b border-white/10 px-6 py-5 sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-200/80">
              ClickSign Mock
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-white sm:text-3xl">
                  Assinatura local simulada
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-300">
                  Esta tela existe apenas para desenvolvimento. Ela conclui o fluxo
                  local sem chamar a API real do ClickSign.
                </p>
              </div>
              <span
                className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${getStatusBadgeClasses(document.status)}`}
              >
                {document.status}
              </span>
            </div>
          </div>

          <div className="grid gap-6 px-6 py-6 sm:px-8 lg:grid-cols-[1.3fr_0.9fr]">
            <div className="space-y-5">
              <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Documento
                </p>
                <p className="mt-2 text-lg font-medium text-white">
                  {document.filename}
                </p>
                <p className="mt-2 text-sm text-slate-300">
                  Chave: <span className="font-mono text-xs">{document.key}</span>
                </p>
                <div className="mt-4 flex flex-wrap gap-3 text-sm">
                  <Link
                    className="rounded-full border border-sky-400/30 px-4 py-2 text-sky-100 transition hover:border-sky-300/60 hover:bg-sky-400/10"
                    href={document.downloads.original_file_url}
                    target="_blank"
                  >
                    Baixar original
                  </Link>
                  {document.downloads.signed_file_url ? (
                    <Link
                      className="rounded-full border border-emerald-400/30 px-4 py-2 text-emerald-100 transition hover:border-emerald-300/60 hover:bg-emerald-400/10"
                      href={document.downloads.signed_file_url}
                      target="_blank"
                    >
                      Baixar assinado
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Signatário
                </p>
                <p className="mt-2 text-lg font-medium text-white">{signer.name}</p>
                <div className="mt-3 space-y-1 text-sm text-slate-300">
                  <p>{signer.email}</p>
                  <p>Documento: {signer.documentation || "Não informado"}</p>
                  <p>Status atual: {signer.status}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Ações
              </p>
              <div className="mt-4 space-y-3">
                <form action={signDocumentAction}>
                  <button
                    className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                    disabled={!isPending}
                    type="submit"
                  >
                    Assinar documento
                  </button>
                </form>
                <form action={rejectDocumentAction}>
                  <button
                    className="w-full rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:border-slate-700 disabled:bg-slate-800 disabled:text-slate-500"
                    disabled={!isPending}
                    type="submit"
                  >
                    Rejeitar documento
                  </button>
                </form>
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                <p className="font-medium text-white">Como usar</p>
                <div className="mt-2 space-y-1">
                  <p>1. Gere o link de assinatura pelo fluxo normal do sistema.</p>
                  <p>2. Abra a URL mock recebida pelo cliente.</p>
                  <p>3. Assine ou rejeite para refletir o novo status no app.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
