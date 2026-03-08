"use client";

import { type Key, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Tabs, Tab } from "@heroui/tabs";
import { Card, CardBody } from "@heroui/card";
import { Calendar, Clock3 } from "lucide-react";

import { RegimesPrazoContent } from "./regimes-prazo-content";

const FeriadosContent = dynamic(
  () => import("./feriados-content"),
  {
    ssr: false,
    loading: () => (
      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardBody className="py-10 text-center text-sm text-default-400">
          Carregando feriados...
        </CardBody>
      </Card>
    ),
  },
);

const WORKSPACE_TABS = ["regimes", "feriados"] as const;
type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

function isWorkspaceTab(value: string | null): value is WorkspaceTab {
  if (!value) return false;
  return (WORKSPACE_TABS as readonly string[]).includes(value);
}

export function RegimesPrazoWorkspace() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabFromUrl = searchParams.get("tab");
  const normalizedTab = isWorkspaceTab(tabFromUrl)
    ? tabFromUrl
    : ("regimes" as WorkspaceTab);
  const [selectedTab, setSelectedTab] = useState<WorkspaceTab>(normalizedTab);

  useEffect(() => {
    setSelectedTab(normalizedTab);
  }, [normalizedTab]);

  const handleTabChange = (key: Key) => {
    const nextTab = String(key);
    if (!isWorkspaceTab(nextTab)) return;

    setSelectedTab(nextTab);

    const params = new URLSearchParams(searchParams.toString());
    if (nextTab === "regimes") {
      params.delete("tab");
    } else {
      params.set("tab", nextTab);
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  return (
    <Tabs
      aria-label="Regimes e feriados"
      className="w-full"
      color="primary"
      selectedKey={selectedTab}
      variant="underlined"
      onSelectionChange={handleTabChange}
      classNames={{
        base: "w-full",
        tabList:
          "w-full justify-center gap-2 overflow-x-auto flex-nowrap [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
        tab: "max-w-fit px-3 sm:px-4 py-2 text-sm whitespace-nowrap flex-shrink-0",
        tabContent: "text-sm font-medium whitespace-nowrap",
        panel: "w-full",
      }}
    >
      <Tab
        key="regimes"
        title={
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4" />
            <span>Regimes de prazo</span>
          </div>
        }
      >
        <div className="mt-4">
          <RegimesPrazoContent />
        </div>
      </Tab>

      <Tab
        key="feriados"
        title={
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span>Feriados</span>
          </div>
        }
      >
        <div className="mt-4">
          <FeriadosContent />
        </div>
      </Tab>
    </Tabs>
  );
}
