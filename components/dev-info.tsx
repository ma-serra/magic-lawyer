"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import {
  ExternalLink,
  Copy,
  Globe,
  Users,
  Server,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { toast } from "@/lib/toast";

import { getDevInfo } from "@/app/actions/dev-info";

interface TenantInfo {
  slug: string;
  name: string;
  domain: string | null;
}

interface DevInfo {
  ngrok: string;
  tenants: TenantInfo[];
  dashboard: string;
  timestamp: string;
}

interface DevInfoProps {
  buttonClassName?: string;
  buttonContainerClassName?: string;
  mode?: "floating" | "inline";
}

export function DevInfo({
  buttonClassName,
  buttonContainerClassName,
  mode = "floating",
}: DevInfoProps = {}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  // SWR para buscar dados com Server Action
  const {
    data: devInfo,
    error,
    isLoading,
  } = useSWR(
    process.env.NODE_ENV === "development" ? "dev-info" : null,
    getDevInfo,
    {
      refreshInterval: 0, // Sem polling automático
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      onSuccess: () => setIsVisible(true),
    },
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateScreenSize = () => {
      setIsLargeScreen(window.innerWidth >= 1024);
    };

    updateScreenSize();
    window.addEventListener("resize", updateScreenSize);

    return () => {
      window.removeEventListener("resize", updateScreenSize);
    };
  }, []);

  // Painel sempre inicia fechado - removido auto-open
  // useEffect(() => {
  //   if (!hasAutoOpened && isVisible && isLargeScreen) {
  //     setIsPanelOpen(true);
  //     setHasAutoOpened(true);
  //   }
  // }, [hasAutoOpened, isLargeScreen, isVisible]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  if (!isVisible || !devInfo || isLoading || error) return null;

  const isInlineMode = mode === "inline";

  const defaultButtonPosition = isLargeScreen
    ? "bottom-6 right-6"
    : "bottom-6 right-6";

  return (
    <>
      {!isInlineMode && !isLargeScreen && isPanelOpen && (
        <div
          className="fixed inset-0 z-[55] bg-black/40 backdrop-blur-sm transition-opacity"
          onClick={() => setIsPanelOpen(false)}
        />
      )}

      {buttonContainerClassName ? (
        <div className={buttonContainerClassName}>
          <Button
            className={buttonClassName || "shadow-lg"}
            color="default"
            size="sm"
            startContent={<Server className="h-4 w-4" />}
            variant="flat"
            onPress={() => setIsPanelOpen((prev) => !prev)}
          >
            {isPanelOpen ? "Fechar painel dev" : "Painel dev"}
          </Button>
        </div>
      ) : (
        <Button
          className={`fixed z-[60] shadow-lg ${defaultButtonPosition} ${buttonClassName || ""}`}
          color="default"
          size="sm"
          startContent={<Server className="h-4 w-4" />}
          variant="flat"
          onPress={() => setIsPanelOpen((prev) => !prev)}
        >
          {isPanelOpen ? "Fechar painel dev" : "Painel dev"}
        </Button>
      )}

      <aside
        className={
          isInlineMode
            ? `w-full transition-all duration-300 ${
                isPanelOpen
                  ? "mt-2 max-h-[65vh] opacity-100 pointer-events-auto"
                  : "max-h-0 overflow-hidden opacity-0 pointer-events-none"
              }`
            : `fixed z-[60] transition-all duration-300 ${
                isLargeScreen
                  ? "top-24 right-6 w-[320px]"
                  : "top-24 left-1/2 w-[min(420px,calc(100vw-2.5rem))] -translate-x-1/2"
              } ${
                isPanelOpen
                  ? "opacity-100 pointer-events-auto translate-y-0"
                  : isLargeScreen
                    ? "opacity-0 pointer-events-none translate-x-6"
                    : "opacity-0 pointer-events-none -translate-y-4"
              }`
        }
      >
        <Card
          className={`border border-primary/20 shadow-2xl backdrop-blur bg-black/90 text-white flex flex-col ${
            isInlineMode ? "h-full max-h-[60vh] w-full" : "h-full max-h-[75vh]"
          }`}
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <Server className="h-4 w-4 text-green-400" />
              <div className="min-w-0">
                <h3 className="text-sm font-medium text-white">
                  Desenvolvimento
                </h3>
                {!isExpanded && (
                  <p className="text-xs text-white/60">
                    ngrok: {devInfo.ngrok ? "Ativo" : "Inativo"} •{" "}
                    {devInfo.tenants.length} tenants
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Chip color="success" size="sm" variant="flat">
                DEV
              </Chip>
              <Button
                isIconOnly
                aria-label="Alternar detalhes"
                size="sm"
                variant="light"
                onPress={() => setIsExpanded((prev) => !prev)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronUp className="h-3 w-3" />
                )}
              </Button>
              <Button
                isIconOnly
                aria-label="Fechar painel de desenvolvimento"
                size="sm"
                variant="light"
                onPress={() => setIsPanelOpen(false)}
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </Button>
            </div>
          </CardHeader>
          {isExpanded && (
            <CardBody className="space-y-4 overflow-y-auto pr-1 text-white">
              {/* ngrok URL */}
              {devInfo.ngrok && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Globe className="h-3 w-3 text-blue-400" />
                    <span className="text-xs text-white/70">ngrok</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-white/10 px-2 py-1 rounded text-green-400 flex-1 truncate">
                      {devInfo.ngrok}
                    </code>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      onClick={() =>
                        copyToClipboard(devInfo.ngrok, "URL ngrok")
                      }
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Dashboard ngrok */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ExternalLink className="h-3 w-3 text-purple-400" />
                  <span className="text-xs text-white/70">Dashboard</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-white/10 px-2 py-1 rounded text-purple-300 flex-1 truncate">
                    http://localhost:4040
                  </code>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    onClick={() =>
                      window.open("http://localhost:4040", "_blank")
                    }
                  >
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Tenants */}
              {devInfo.tenants.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Users className="h-3 w-3 text-orange-400" />
                    <span className="text-xs text-white/70">
                      Tenants ativos
                    </span>
                  </div>
                  <div className="space-y-1">
                    {devInfo.tenants.map((tenant) => (
                      <div
                        key={tenant.slug}
                        className="flex items-center gap-2"
                      >
                        <code className="text-xs bg-white/10 px-2 py-1 rounded text-orange-300 flex-1 truncate">
                          {tenant.slug}.localhost:9192
                        </code>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          onClick={() =>
                            copyToClipboard(
                              `${tenant.slug}.localhost:9192`,
                              "URL tenant",
                            )
                          }
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Webhook URL */}
              {devInfo.ngrok && (
                <div className="space-y-1">
                  <span className="text-xs text-white/70">Webhook</span>
                  <div className="flex items-center gap-2">
                    <code className="text-xs bg-white/10 px-2 py-1 rounded text-red-300 flex-1 truncate">
                      {devInfo.ngrok}/api/webhooks/asaas
                    </code>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      onClick={() =>
                        copyToClipboard(
                          `${devInfo.ngrok}/api/webhooks/asaas`,
                          "Webhook URL",
                        )
                      }
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </CardBody>
          )}
          {!isExpanded && (
            <div className="px-4 pb-3 text-xs text-white/60">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                <span>ngrok: {devInfo.ngrok ? "Ativo" : "Inativo"}</span>
                <span className="text-white/40">•</span>
                <span>{devInfo.tenants.length} tenants</span>
              </div>
            </div>
          )}
        </Card>
      </aside>
    </>
  );
}
