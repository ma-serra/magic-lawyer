"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";

import { getAuthenticatedNavPrefetchStrategy } from "@/app/lib/navigation/prefetch-policy";
import { AppSidebar, type SidebarNavItem } from "@/components/app-sidebar";
import { Navbar } from "@/components/navbar";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { TenantFloatingChatDock } from "@/components/support/tenant-floating-chat-dock";
import { useProfileNavigation } from "@/app/hooks/use-profile-navigation";

export type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const { data: session } = useSession();
  const tenantName = session?.user?.tenantName || "Magic Lawyer";
  const tenantLogoUrl = session?.user?.tenantLogoUrl || undefined;

  const { navigationItems, secondaryNavigationItems } = useProfileNavigation();

  const [collapsed, setCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Converter NavigationItem para SidebarNavItem
  const primaryNavItems = useMemo<SidebarNavItem[]>(() => {
    return navigationItems.map((item) => ({
      label: item.label,
      href: item.href,
      description: item.description,
      compactChildrenCount: item.compactChildrenCount,
      prefetchStrategy:
        item.prefetchStrategy ?? getAuthenticatedNavPrefetchStrategy(item.href),
      children: item.children?.map((child) => ({
        label: child.label,
        href: child.href,
        description: child.description,
        prefetchStrategy:
          child.prefetchStrategy ?? getAuthenticatedNavPrefetchStrategy(child.href),
      })),
      isAccordion: item.isAccordion,
      section: item.section, // ✨ Adicionar seção
    }));
  }, [navigationItems]);

  const secondaryNavItemsFormatted = useMemo<SidebarNavItem[]>(() => {
    return secondaryNavigationItems.map((item) => ({
      label: item.label,
      href: item.href,
      description: item.description,
      compactChildrenCount: item.compactChildrenCount,
      prefetchStrategy:
        item.prefetchStrategy ?? getAuthenticatedNavPrefetchStrategy(item.href),
      section: item.section, // ✨ Adicionar seção
    }));
  }, [secondaryNavigationItems]);

  const openSidebarMobile = () => setIsMobileOpen(true);
  const closeSidebarMobile = () => setIsMobileOpen(false);
  const toggleCollapse = () => setCollapsed((current) => !current);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <AppSidebar
        collapsed={collapsed}
        isMobileOpen={isMobileOpen}
        navItems={primaryNavItems}
        secondaryItems={secondaryNavItemsFormatted}
        tenantLogoUrl={tenantLogoUrl}
        tenantName={tenantName}
        onCloseMobile={closeSidebarMobile}
        onToggleCollapse={toggleCollapse}
      />

      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <Navbar
          showAuthenticatedSecondaryNav={false}
          onOpenSidebar={openSidebarMobile}
        />
        <BreadcrumbNav />
        <main className="flex-1 overflow-y-auto overflow-x-hidden px-3 pb-10 pt-3 sm:px-5 sm:pt-6 md:px-8 md:pt-8">
          <div className="mx-auto w-full max-w-[1600px] space-y-6">
            {children}
          </div>
        </main>
        <TenantFloatingChatDock />
      </div>
    </div>
  );
}
