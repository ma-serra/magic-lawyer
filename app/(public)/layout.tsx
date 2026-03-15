import { Link } from "@heroui/link";

import { PublicNavbar } from "@/components/public-navbar";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <PublicNavbar />
      <main className="mx-auto flex w-full max-w-7xl flex-1 px-6 pt-10 md:pt-12">
        {children}
      </main>
      <footer className="border-t border-slate-200/70 bg-background/80 dark:border-white/10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-8 text-sm text-default-500 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <p className="font-semibold text-foreground">Magic Lawyer</p>
            <p className="mt-1 text-sm text-default-500">
              Infraestrutura white-label para escritórios que querem operar com
              governança, presença premium e execução previsível.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <Link className="text-default-500 hover:text-primary" href="/">
              Início
            </Link>
            <Link
              className="text-default-500 hover:text-primary"
              href="/precos"
            >
              Planos
            </Link>
            <Link className="text-default-500 hover:text-primary" href="/docs">
              Políticas
            </Link>
            <Link className="text-default-500 hover:text-primary" href="/about">
              Sobre
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
