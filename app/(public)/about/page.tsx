import { Card, CardBody, CardHeader } from "@heroui/card";
import { Divider } from "@heroui/divider";
import { Button } from "@heroui/button";

export default function AboutPage() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-8 py-12">
      <header className="space-y-4 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
          Sobre nós
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Transformando escritórios de advocacia com tecnologia
        </h1>
        <p className="mx-auto max-w-3xl text-sm text-default-400 sm:text-base">
          Somos uma empresa especializada em desenvolver soluções tecnológicas
          que revolucionam o trabalho jurídico, oferecendo automação,
          inteligência e eficiência para escritórios de advocacia de todos os
          portes.
        </p>
      </header>

      <div className="grid gap-8 md:grid-cols-2">
        <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
          <CardHeader className="flex flex-col gap-2 pb-2">
            <h2 className="text-lg font-semibold text-foreground">Nossa Missão</h2>
            <p className="text-sm text-default-400">
              Democratizar o acesso à tecnologia jurídica de ponta.
            </p>
          </CardHeader>
          <Divider className="border-white/10" />
          <CardBody className="text-sm text-default-400">
            <p>
              Acreditamos que todos os advogados merecem ter acesso às melhores
              ferramentas tecnológicas para otimizar seu trabalho, reduzir
              tarefas manuais e focar no que realmente importa: a advocacia de
              excelência.
            </p>
          </CardBody>
        </Card>

        <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
          <CardHeader className="flex flex-col gap-2 pb-2">
            <h2 className="text-lg font-semibold text-foreground">Nossa Visão</h2>
            <p className="text-sm text-default-400">
              Ser a referência em automação jurídica no Brasil.
            </p>
          </CardHeader>
          <Divider className="border-white/10" />
          <CardBody className="text-sm text-default-400">
            <p>
              Queremos ser reconhecidos como a plataforma que transformou a
              forma como os advogados trabalham, proporcionando maior
              produtividade, satisfação dos clientes e resultados excepcionais.
            </p>
          </CardBody>
        </Card>
      </div>

      <Card className="border border-white/10 bg-white/5">
        <CardBody className="text-center">
          <h3 className="mb-4 text-xl font-semibold text-foreground">
            Quer conhecer nossa história?
          </h3>
          <p className="mb-6 text-default-400">
            Agende uma demonstração personalizada e veja como podemos
            transformar seu escritório de advocacia.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button
              as="a"
              color="primary"
              href="/precos"
              radius="full"
              size="lg"
            >
              Ver planos
            </Button>
            <Button
              as="a"
              className="border-white/20 text-foreground"
              href="/login"
              radius="full"
              size="lg"
              variant="bordered"
            >
              Fazer login
            </Button>
          </div>
        </CardBody>
      </Card>
    </section>
  );
}
