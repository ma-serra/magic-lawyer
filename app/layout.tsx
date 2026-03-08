import "@/styles/globals.css";
import { headers } from "next/headers";
import { Metadata, Viewport } from "next";
import clsx from "clsx";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next";

import { Providers } from "./providers";

import { siteConfig } from "@/config/site";
import { fontSans } from "@/config/fonts";
import { getTenantBrandingByHost } from "@/lib/tenant-branding";
import { buildIconList } from "@/lib/branding-icons";
import { buildTenantThemeCss } from "@/lib/tenant-theme";

export const dynamic = "force-dynamic";

const baseMetadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s - ${siteConfig.name}`,
  },
  description: siteConfig.description,
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", type: "image/x-icon" },
    ],
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const branding = await getTenantBrandingByHost(host);

  const faviconUrl = branding?.faviconUrl?.trim() || null;
  const tenantName = branding?.name?.trim() || null;

  const title = tenantName
    ? {
        default: `${tenantName} | ${siteConfig.name}`,
        template: `%s - ${tenantName}`,
      }
    : baseMetadata.title;

  return {
    ...baseMetadata,
    title,
    icons: {
      icon: buildIconList(faviconUrl),
    },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "white" },
    { media: "(prefers-color-scheme: dark)", color: "black" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const host = headersList.get("host") ?? "";
  const branding = await getTenantBrandingByHost(host);
  const tenantThemeCss = buildTenantThemeCss({
    primaryColor: branding?.primaryColor,
    secondaryColor: branding?.secondaryColor,
    accentColor: branding?.accentColor,
  });

  return (
    <html suppressHydrationWarning lang="pt-br">
      <head>
        {tenantThemeCss ? (
          <style
            dangerouslySetInnerHTML={{ __html: tenantThemeCss }}
            id="tenant-theme-css-vars"
          />
        ) : null}
      </head>
      <body
        suppressHydrationWarning
        className={clsx(
          "min-h-screen text-foreground bg-background font-sans antialiased",
          fontSans.variable,
        )}
      >
        <Providers themeProps={{ attribute: "class", defaultTheme: "dark" }}>
          {children}
          <Toaster richColors position="top-right" />
          <Analytics />
        </Providers>
      </body>
    </html>
  );
}
