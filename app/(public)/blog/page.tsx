import { Card, CardBody, CardHeader } from "@heroui/card";
import { Divider } from "@heroui/divider";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";

const blogPosts = [
  {
    id: 1,
    title: "Como automatizar o controle de prazos no seu escritório",
    excerpt:
      "Aprenda estratégias práticas para nunca mais perder um prazo importante e aumentar a eficiência da sua equipe jurídica.",
    category: "Automação",
    readTime: "5 min",
    date: "15 Jan 2025",
    color: "primary" as const,
  },
  {
    id: 2,
    title: "Inteligência artificial na advocacia: o futuro é agora",
    excerpt:
      "Descubra como a IA está revolucionando o trabalho jurídico e como você pode aproveitar essas tecnologias.",
    category: "Tecnologia",
    readTime: "8 min",
    date: "12 Jan 2025",
    color: "secondary" as const,
  },
  {
    id: 3,
    title: "Gestão de clientes: como criar uma experiência excepcional",
    excerpt:
      "Estratégias para melhorar o relacionamento com clientes e aumentar a satisfação e retenção.",
    category: "Gestão",
    readTime: "6 min",
    date: "10 Jan 2025",
    color: "success" as const,
  },
  {
    id: 4,
    title: "LGPD na advocacia: guia completo de conformidade",
    excerpt:
      "Tudo que você precisa saber sobre a Lei Geral de Proteção de Dados e como aplicá-la no seu escritório.",
    category: "Compliance",
    readTime: "12 min",
    date: "8 Jan 2025",
    color: "warning" as const,
  },
];

export default function BlogPage() {
  return (
    <section className="mx-auto flex w-full max-w-6xl flex-col gap-8 py-12">
      <header className="space-y-4 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-primary">
          Blog
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Insights e tendências do mundo jurídico
        </h1>
        <p className="mx-auto max-w-3xl text-sm text-default-400 sm:text-base">
          Artigos, dicas e análises sobre tecnologia jurídica, automação, gestão
          de escritórios e as últimas tendências do mercado.
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
        {blogPosts.map((post) => (
          <Card
            key={post.id}
            className="border border-white/10 bg-background/70 backdrop-blur-xl"
          >
            <CardHeader className="flex flex-col gap-2 pb-2">
              <div className="flex items-center justify-between">
                <Chip color={post.color} size="sm" variant="flat">
                  {post.category}
                </Chip>
                <span className="text-xs text-default-500">{post.date}</span>
              </div>
              <h2 className="text-lg font-semibold text-foreground line-clamp-2">
                {post.title}
              </h2>
              <p className="text-sm text-default-400">
                {post.readTime} de leitura
              </p>
            </CardHeader>
            <Divider className="border-white/10" />
            <CardBody className="pt-4">
              <p className="text-sm text-default-400 mb-4 line-clamp-3">
                {post.excerpt}
              </p>
              <Button
                as="a"
                color={post.color}
                href="#"
                radius="full"
                size="sm"
                variant="bordered"
              >
                Ler mais
              </Button>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card className="border border-white/10 bg-white/5">
        <CardBody className="text-center">
          <h3 className="mb-4 text-xl font-semibold text-foreground">
            Quer receber nossos artigos por email?
          </h3>
          <p className="mb-6 text-default-400">
            Inscreva-se na nossa newsletter e receba os melhores insights sobre
            tecnologia jurídica diretamente na sua caixa de entrada.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button color="primary" radius="full" size="lg">
              Inscrever-se
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
