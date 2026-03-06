import { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Divider } from "@heroui/divider";
import { Button } from "@heroui/button";

import { title, subtitle } from "@/components/primitives";
import { PermissionGuard } from "@/components/permission-guard";

export const metadata: Metadata = {
  title: "Procurações",
  description: "Gestão de procurações e poderes jurídicos.",
};

export default function ProcuracoesPage() {
  return (
    <PermissionGuard permission="canViewAllProcesses">
      <section className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 py-12">
        <header className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
            Poderes jurídicos
          </p>
          <h1 className={title({ size: "lg", color: "blue" })}>
            Gestão de Procurações
          </h1>
          <p className={subtitle({ fullWidth: true })}>
            Controle todas as procurações do escritório, gerencie poderes
            específicos e mantenha o controle de validade e escopo de atuação.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
            <CardHeader className="flex flex-col gap-2 pb-2">
              <h2 className="text-lg font-semibold text-white">
                Controle de Procurações
              </h2>
              <p className="text-sm text-default-400">
                Gestão completa de poderes.
              </p>
            </CardHeader>
            <Divider className="border-white/10" />
            <CardBody className="space-y-4 text-sm text-default-400">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <p className="font-semibold text-primary">
                  Tipos de procuração
                </p>
                <p className="mt-2 text-primary/80">
                  Adjudicatória, para receber, para atos específicos e outras
                  modalidades.
                </p>
              </div>
              <div className="rounded-2xl border border-warning/20 bg-warning/5 p-4">
                <p className="font-semibold text-warning">
                  Controle de validade
                </p>
                <p className="mt-2 text-warning/80">
                  Alertas automáticos para vencimento e renovação de
                  procurações.
                </p>
              </div>
              <div className="rounded-2xl border border-success/20 bg-success/5 p-4">
                <p className="font-semibold text-success">Escopo de atuação</p>
                <p className="mt-2 text-success/80">
                  Defina claramente os limites e poderes de cada procuração.
                </p>
              </div>
            </CardBody>
          </Card>

          <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
            <CardHeader className="flex flex-col gap-2 pb-2">
              <h2 className="text-lg font-semibold text-white">
                Automação e Controle
              </h2>
              <p className="text-sm text-default-400">
                Ferramentas para eficiência.
              </p>
            </CardHeader>
            <Divider className="border-white/10" />
            <CardBody className="space-y-4 text-sm text-default-400">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                <p className="font-semibold text-primary">
                  Modelos padronizados
                </p>
                <p className="mt-2 text-primary/80">
                  Templates para diferentes tipos de procuração e situações.
                </p>
              </div>
              <div className="rounded-2xl border border-warning/20 bg-warning/5 p-4">
                <p className="font-semibold text-warning">
                  Integração com processos
                </p>
                <p className="mt-2 text-warning/80">
                  Vincule procurações aos processos específicos automaticamente.
                </p>
              </div>
              <div className="rounded-2xl border border-success/20 bg-success/5 p-4">
                <p className="font-semibold text-success">Assinatura digital</p>
                <p className="mt-2 text-success/80">
                  Geração e assinatura eletrônica de procurações.
                </p>
              </div>
            </CardBody>
          </Card>
        </div>

        <Card className="border border-white/10 bg-white/5">
          <CardBody className="flex flex-wrap items-center justify-between gap-3 text-sm text-default-400">
            <div>
              <p className="text-white">Precisa de integração com cartórios?</p>
              <p>Conecte com sistemas de registro e reconhecimento de firma.</p>
            </div>
            <Button as="a" color="primary" href="/suporte" radius="full">
              Solicitar integração
            </Button>
          </CardBody>
        </Card>
      </section>
    </PermissionGuard>
  );
}
