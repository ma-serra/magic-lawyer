"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";

import { getAuthenticatedNavPrefetchStrategy } from "@/app/lib/navigation/prefetch-policy";
import { AppSidebar, type SidebarNavItem } from "@/components/app-sidebar";
import { Navbar } from "@/components/navbar";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { FloatingAssistantDock } from "@/components/juridical-ai/floating-assistant-dock";
import { AdminFloatingChatDock } from "@/components/support/admin-floating-chat-dock";
import { useAdminNavigation } from "@/app/hooks/use-admin-navigation";

export type AdminAppShellProps = {
  children: ReactNode;
};

export function AdminAppShell({ children }: AdminAppShellProps) {
  const { data: session } = useSession();
  const tenantName = "Magic Lawyer Admin";
  const tenantLogoUrl = undefined; // Logo administrativo

  const { navigationItems, secondaryNavigationItems } = useAdminNavigation();

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
        ...child,
        prefetchStrategy:
          child.prefetchStrategy ?? getAuthenticatedNavPrefetchStrategy(child.href),
      })),
      isAccordion: item.isAccordion,
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
      children: item.children?.map((child) => ({
        ...child,
        prefetchStrategy:
          child.prefetchStrategy ?? getAuthenticatedNavPrefetchStrategy(child.href),
      })),
      isAccordion: item.isAccordion,
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
        <FloatingAssistantDock scope="admin" />
        <AdminFloatingChatDock />
      </div>
    </div>
  );
}
