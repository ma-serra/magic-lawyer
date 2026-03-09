"use client";

import type { SVGProps } from "react";

import {
  Navbar as HeroUINavbar,
  NavbarBrand,
  NavbarContent,
  NavbarMenu,
  NavbarMenuItem,
  NavbarMenuToggle,
} from "@heroui/navbar";
import { Button } from "@heroui/button";
import { link as linkStyles } from "@heroui/theme";
import clsx from "clsx";
import NextLink from "next/link";

import { siteConfig } from "@/config/site";
import { ThemeSwitch } from "@/components/theme-switch";
import { Logo } from "@/components/icons";

const MenuIcon = ({ className, ...props }: SVGProps<SVGSVGElement>) => (
  <svg
    aria-hidden
    className={clsx("h-5 w-5", className)}
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={2}
    viewBox="0 0 24 24"
    {...props}
  >
    <line x1="3" x2="21" y1="6" y2="6" />
    <line x1="3" x2="21" y1="12" y2="12" />
    <line x1="3" x2="21" y1="18" y2="18" />
  </svg>
);

export function PublicNavbar() {
  const renderNavLink = (label: string, href: string) => {
    return (
      <NextLink
        key={label}
        className={clsx(
          linkStyles({ color: "foreground" }),
          "relative px-4 py-2 text-sm font-medium transition-colors",
          "text-default-500 hover:text-primary",
        )}
        href={href}
      >
        {label}
      </NextLink>
    );
  };

  return (
    <div className="sticky top-0 z-50">
      <HeroUINavbar
        className="border-b border-divider bg-background/95 backdrop-blur-xl py-3"
        isBordered={false}
        maxWidth="xl"
      >
        <NavbarContent className="flex-1" justify="start">
          <NavbarBrand>
            <NextLink className="flex items-center gap-2" href="/">
              <div className="rounded-xl bg-primary/15 p-2 text-primary">
                <Logo className="h-6 w-6" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-primary uppercase tracking-[0.3em]">
                  {siteConfig.name}
                </span>
                <span className="text-[11px] text-default-500">
                  SaaS jurídico white label
                </span>
              </div>
            </NextLink>
          </NavbarBrand>
        </NavbarContent>

        <NavbarContent className="hidden lg:flex" justify="center">
          {siteConfig.navItemsPublic.map((item) =>
            renderNavLink(item.label, item.href),
          )}
        </NavbarContent>

        <NavbarContent className="flex-shrink-0" justify="end">
          <ThemeSwitch />
          <Button
            as={NextLink}
            className="hidden sm:inline-flex"
            color="primary"
            href="/precos#lead-chat"
            radius="full"
            size="sm"
          >
            Falar com especialista
          </Button>
          <NavbarMenuToggle
            aria-label="Abrir menu"
            className="hidden sm:inline-flex lg:hidden"
          />
        </NavbarContent>

        <NavbarContent
          className="flex items-center gap-2 sm:hidden"
          justify="end"
        >
          <ThemeSwitch />
          <NavbarMenuToggle aria-label="Abrir menu" />
        </NavbarContent>

        <NavbarMenu className="backdrop-blur-xl">
          <div className="mx-2 mt-4 flex flex-col gap-4">
            {siteConfig.navItemsPublic.map((item) => (
              <NavbarMenuItem key={item.href}>
                <NextLink
                  className="text-base font-medium text-default-500"
                  href={item.href}
                >
                  {item.label}
                </NextLink>
              </NavbarMenuItem>
            ))}
          </div>
          <div className="mx-2 mt-6 flex flex-col gap-3 border-t pt-4">
            <div className="flex items-center justify-between border px-4 py-3">
              <div className="flex flex-col text-xs">
                <span>Quer receber uma proposta?</span>
                <span className="font-semibold">Converse com vendas agora</span>
              </div>
              <Button
                as={NextLink}
                color="primary"
                href="/precos#lead-chat"
                radius="none"
                size="sm"
              >
                Iniciar chat
              </Button>
            </div>
          </div>
        </NavbarMenu>
      </HeroUINavbar>
    </div>
  );
}
