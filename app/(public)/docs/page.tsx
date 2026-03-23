import { Card, CardBody, CardHeader } from "@heroui/card";
import { Divider } from "@heroui/divider";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";

const docSections = [
  {
    id: 1,
    title: "Primeiros Passos",
    description: "Guia completo para começar a usar a plataforma",
    items: [
      "Configuração inicial",
      "Criando seu primeiro processo",
      "Convidando membros da equipe",
      "Personalizando sua conta",
    ],
    color: "primary" as const,
  },
  {
    id: 2,
    title: "Gestão de Processos",
    description: "Como organizar e acompanhar seus processos jurídicos",
    items: [
      "Criando e editando processos",
      "Controle de prazos",
      "Documentos e anexos",
      "Relatórios e dashboards",
    ],
    color: "secondary" as const,
  },
  {
    id: 3,
    title: "Automação",
    description: "Configure automações para otimizar seu fluxo de trabalho",
    items: [
      "Notificações automáticas",
      "Templates de documentos",
      "Integrações externas",
      "Workflows personalizados",
    ],
    color: "success" as const,
  },
  {
    id: 4,
    title: "API e Integrações",
    description: "Conecte com outras ferramentas do seu escritório",
    items: [
      "Documentação da API",
      "Webhooks",
      "Integração com ERPs",
      "Sincronização de dados",
    ],
    color: "warning" as const,
  },
];

const quickStart = [
  {
    title: "Configuração em 5 minutos",
    description: "Tenha sua conta configurada e funcionando rapidamente",
    time: "5 min",
  },
  {
    title: "Importar dados existentes",
    description: "Migre seus processos e clientes facilmente",
    time: "15 min",
  },
  {
    title: "Treinamento da equipe",
    description: "Capacite sua equipe com nossos tutoriais",
    time: "30 min",
  },
];

export default function DocsPage() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 py-12">
      <header className="space-y-4 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
          Documentação
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Centro de ajuda e documentação
        </h1>
        <p className="mx-auto max-w-3xl text-sm text-default-400 sm:text-base">
          Tudo que você precisa para dominar a plataforma Magic Lawyer. Guias,
          tutoriais, API docs e muito mais.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        {docSections.map((section) => (
          <Card
            key={section.id}
            className="border border-white/10 bg-background/70 backdrop-blur-xl"
          >
            <CardHeader className="flex flex-col gap-2 pb-2">
              <div className="flex items-center gap-2">
                <Chip color={section.color} size="sm" variant="flat">
                  {section.title}
                </Chip>
              </div>
              <h2 className="text-lg font-semibold text-foreground">
                {section.title}
              </h2>
              <p className="text-sm text-default-400">{section.description}</p>
            </CardHeader>
            <Divider className="border-white/10" />
            <CardBody className="pt-4">
              <ul className="space-y-2 text-sm text-default-400">
                {section.items.map((item, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <span className="h-1 w-1 rounded-full bg-primary" />
                    {item}
                  </li>
                ))}
              </ul>
              <Button
                as="a"
                className="mt-4"
                color={section.color}
                href="#"
                radius="full"
                size="sm"
                variant="bordered"
              >
                Ver documentação
              </Button>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card className="border border-white/10 bg-white/5">
        <CardHeader className="flex flex-col gap-2 pb-2">
          <h2 className="text-xl font-semibold text-foreground text-center">
            Guia de Início Rápido
          </h2>
          <p className="text-sm text-default-400 text-center">
            Comece a usar a plataforma em poucos passos
          </p>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody className="pt-4">
          <div className="grid gap-4 md:grid-cols-3">
            {quickStart.map((item, index) => (
              <div
                key={index}
                className="rounded-xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                    {index + 1}
                  </span>
                  <Chip size="sm" variant="flat">
                    {item.time}
                  </Chip>
                </div>
                <h3 className="font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-default-400">{item.description}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <Button
              as="a"
              color="primary"
              href="/login"
              radius="full"
              size="lg"
            >
              Começar agora
            </Button>
          </div>
        </CardBody>
      </Card>
    </section>
  );
}
