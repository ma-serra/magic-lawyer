"use client";

import { useState, useEffect, useMemo, useRef, type KeyboardEvent } from "react";
import { Input } from "@heroui/input";
import { Button } from "@heroui/button";
import { Kbd } from "@heroui/kbd";
import { Spinner } from "@heroui/spinner";
import { Avatar } from "@heroui/avatar";
import { Chip } from "@heroui/chip";

import useSWR from "swr";
import { useSession } from "next-auth/react";
import { Search, X, AlertCircle } from "lucide-react";

import { Modal } from "@/components/ui/modal";
import { SearchableSelect } from "@/components/searchable-select";
import { useSearchResults } from "@/components/searchbar/use-search-results";
import { getTenantOptions, type TenantOption } from "@/app/actions/tenant-options";
import { getSearchStats, type SearchStatsPayload } from "@/app/actions/search-stats";

interface CentralizedSearchBarProps {
  className?: string;
}

export function CentralizedSearchBar({ className = "" }: CentralizedSearchBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isMac, setIsMac] = useState(false);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const { data: session } = useSession();
  const inputRef = useRef<HTMLInputElement>(null);
  const headerInputRef = useRef<HTMLInputElement>(null);

  const userRole = (session?.user as any)?.role;
  const isSuperAdmin = userRole === "SUPER_ADMIN";

  const {
    data: tenantOptions,
    isLoading: isLoadingTenants,
    error: tenantError,
  } = useSWR<TenantOption[]>(
    isSuperAdmin ? "super-admin-tenant-options" : null,
    async () => {
      const response = await getTenantOptions();

      if (!response.success || !response.data) {
        throw new Error(response.error ?? "Não foi possível carregar os tenants");
      }

      return response.data;
    },
    {
      revalidateOnFocus: false,
    }
  );

  // Para super admin: quando "ALL", passa null para buscar todos
  // Para usuários normais: usa tenantId da sessão
  const tenantContext = isSuperAdmin ? (selectedTenantId === "ALL" ? null : selectedTenantId || null) : (((session?.user as any)?.tenantId as string | undefined) ?? null);

  // Para super admin: precisa ter selecionado algo (ALL ou tenant específico)
  // Para usuários normais: precisa ter tenantId na sessão
  const hasTenantContext = isSuperAdmin
    ? Boolean(selectedTenantId && selectedTenantId !== "") // Super admin precisa selecionar
    : Boolean(tenantContext); // Usuário normal precisa ter tenantId
  const tenantSearchOptions = useMemo(
    () => [
      {
        key: "ALL",
        label: "Todos os tenants",
        textValue: "Todos os tenants estatisticas gerais",
        description: "Estatisticas agregadas (sem dados sensiveis)",
      },
      ...((tenantOptions ?? []).map((tenant) => ({
        key: tenant.id,
        label: tenant.name,
        textValue: [tenant.name, tenant.domain || "", tenant.slug || ""]
          .filter(Boolean)
          .join(" "),
        description: tenant.domain ?? tenant.slug,
      })) as Array<{
        key: string;
        label: string;
        textValue: string;
        description?: string;
      }>),
    ],
    [tenantOptions],
  );

  const searchEnabled = hasTenantContext;

  const {
    data: results,
    isLoading,
    error,
    mutate,
  } = useSearchResults(query, isOpen && searchEnabled, tenantContext, {
    allowEmptyQuery: isSuperAdmin,
  });

  const {
    data: stats,
    isLoading: isLoadingStats,
    error: statsError,
  } = useSWR<SearchStatsPayload | null>(
    hasTenantContext ? ["search-stats", tenantContext ?? "self"] : null,
    async () => {
      const response = await getSearchStats({
        tenantId: tenantContext ?? null,
      });

      if (!response.success || !response.data) {
        throw new Error(response.error ?? "Não foi possível carregar métricas");
      }

      return response.data;
    },
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    // Detectar se é Mac
    setIsMac(navigator.platform.toUpperCase().indexOf("MAC") >= 0);
  }, []);

  useEffect(() => {
    if (!isSuperAdmin) {
      const userTenantId = (session?.user as any)?.tenantId;
      if (userTenantId && userTenantId !== selectedTenantId) {
        setSelectedTenantId(userTenantId);
      }
    } else {
      // Super admin: inicializar com "ALL" se não tiver selecionado nada
      if (!selectedTenantId) {
        setSelectedTenantId("ALL");
      }
    }
  }, [isSuperAdmin, session?.user]);

  useEffect(() => {
    const handleKeyDown = (event: Event) => {
      const keyboardEvent = event as unknown as KeyboardEvent;

      // Ctrl+K ou Cmd+K para abrir
      if ((isMac ? keyboardEvent.metaKey : keyboardEvent.ctrlKey) && keyboardEvent.key === "k") {
        event.preventDefault();
        setIsOpen(true);
      }

      // Escape para fechar
      if (keyboardEvent.key === "Escape" && isOpen) {
        setIsOpen(false);
        setQuery("");
        setSelectedIndex(0);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    const handleOpen = () => setIsOpen(true);

    window.addEventListener("open-search", handleOpen as EventListener);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("open-search", handleOpen as EventListener);
    };
  }, [isMac, isOpen]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleHeaderInputClick = () => {
    setIsOpen(true);
  };

  const handleInputChange = (value: string) => {
    setQuery(value);
    setSelectedIndex(0);
    // Para super admin, permitir busca mesmo com query vazia
    // Para usuários normais, precisa ter pelo menos 2 caracteres
    const minLength = isSuperAdmin ? 0 : 2;
    if (value.length >= minLength && hasTenantContext && searchEnabled) {
      mutate();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!results || results.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % results.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
        break;
      case "Enter":
        e.preventDefault();
        if (results[selectedIndex]) {
          window.location.href = results[selectedIndex].href;
          setIsOpen(false);
          setQuery("");
        }
        break;
    }
  };

  const getResultIcon = (type: string) => {
    switch (type) {
      case "processo":
        return "⚖️";
      case "cliente":
        return "👤";
      case "documento":
        return "📄";
      case "usuario":
        return "👥";
      case "juiz":
        return "👨‍⚖️";
      case "tenant":
        return "🏢";
      default:
        return "🔍";
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "processo":
        return "Processo";
      case "cliente":
        return "Cliente";
      case "documento":
        return "Documento";
      case "usuario":
        return "Usuário";
      case "juiz":
        return "Juiz";
      case "tenant":
        return "Tenant";
      default:
        return "Resultado";
    }
  };

  const handleSearch = () => {
    setIsOpen(true);
    setSelectedIndex(0);

    const minLength = isSuperAdmin ? 0 : 2;
    if (query.trim().length >= minLength && hasTenantContext && searchEnabled) {
      mutate();
    }
  };

  return (
    <div className={`relative w-full ${className}`}>
      {/* Search Bar Principal */}
      <div className="relative">
        <Input
          ref={headerInputRef}
          readOnly
          className="w-full h-10 text-sm"
          classNames={{
            input: "text-sm cursor-pointer",
            inputWrapper: "h-10 bg-background/70 backdrop-blur-xl border border-default-200 hover:border-primary/50 focus-within:border-primary shadow-sm transition-all duration-200",
          }}
          endContent={
            <div className="flex items-center gap-2">
              <Kbd className="hidden sm:flex" keys={[isMac ? "command" : "ctrl"]}>
                K
              </Kbd>
              <Button isIconOnly className="text-default-400 hover:text-default-600 min-w-6 w-6 h-6" size="sm" variant="light" onPress={handleSearch}>
                <Search className="w-3 h-3" />
              </Button>
            </div>
          }
          placeholder="Buscar processos, clientes, documentos, juízes..."
          startContent={<Search className="w-4 h-4 text-default-400" />}
          onClick={handleHeaderInputClick}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleSearch();
            }
          }}
        />
      </div>

      {/* Modal de Busca Avançada com Blur */}
      <Modal
        backdrop="blur"
        className="p-0"
        closeOnEscape={true}
        closeOnOverlayClick={true}
        isOpen={isOpen}
        showCloseButton={false}
        size="2xl"
        onClose={() => {
          setIsOpen(false);
          setQuery("");
          setSelectedIndex(0);
        }}
      >
        <div className="flex flex-col">
          {/* Search Input - Estilo HeroUI */}
          <div className="p-6 pb-4 space-y-3">
            {isSuperAdmin ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-default-400">Escopo de estatísticas</p>
                  {tenantError ? <span className="text-[11px] text-danger-500">{tenantError instanceof Error ? tenantError.message : "Erro ao carregar tenants"}</span> : null}
                </div>
                <SearchableSelect
                  aria-label="Selecionar tenant para buscar"
                  className="max-w-xl"
                  emptyContent="Nenhum tenant encontrado"
                  isClearable={false}
                  isLoading={isLoadingTenants}
                  items={tenantSearchOptions}
                  placeholder="Selecione um tenant para habilitar a busca"
                  selectedKey={selectedTenantId || "ALL"}
                  size="sm"
                  onSelectionChange={(selectedKey) => {
                    setSelectedTenantId(selectedKey || "ALL");
                  }}
                />
                <p className="text-[11px] text-default-500">Para Super Admin, a busca mostra apenas agregados por tenant (sem dados sensíveis). Use &quot;Todos&quot; para ver estatísticas gerais.</p>
              </div>
            ) : null}
            <Input
              ref={inputRef}
              className="flex-1"
              classNames={{
                base: "w-full",
                input: "text-base",
                inputWrapper: "bg-default-100/50 border-none shadow-none hover:bg-default-100/70 focus-within:bg-default-100/70",
              }}
              description={
                !hasTenantContext && isSuperAdmin
                  ? "Selecione um tenant ou 'Todos' para habilitar as estatísticas"
                  : isSuperAdmin
                    ? "Super Admin vê apenas agregados de tenants (sem dados sensíveis)"
                    : undefined
              }
              endContent={
                <div className="flex items-center gap-2">
                  {query && (
                    <Button
                      isIconOnly
                      className="h-6 w-6 min-w-6"
                      color="default"
                      size="sm"
                      variant="light"
                      onPress={() => {
                        setQuery("");
                        setSelectedIndex(0);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                  <Kbd className="text-xs" keys={["escape"]}>
                    ESC
                  </Kbd>
                </div>
              }
              isDisabled={!hasTenantContext && !isLoadingTenants}
              placeholder="Buscar processos, clientes, documentos..."
              size="lg"
              startContent={<Search className="h-4 w-4 text-default-400" />}
              value={query}
              variant="flat"
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          {/* Search Results - Estilo HeroUI */}
          <div className="max-h-96 overflow-y-auto px-6 pb-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Spinner color="primary" size="sm" />
                <span className="ml-3 text-sm text-default-500">Buscando...</span>
              </div>
            ) : error ? (
              <div className="flex items-center gap-3 rounded-lg border border-danger-200 bg-danger-50/70 px-4 py-3 text-danger-700">
                <AlertCircle className="h-4 w-4" />
                <div>
                  <p className="text-sm font-semibold">Erro ao buscar</p>
                  <p className="text-xs">{error}</p>
                </div>
              </div>
            ) : isSuperAdmin && !hasTenantContext ? (
              <div className="rounded-lg border border-default-200 bg-default-50/70 px-4 py-6 text-center">
                <p className="text-sm font-semibold text-default-700">Selecione um tenant para buscar como Super Admin</p>
                <p className="text-xs text-default-500">Escolha na caixa acima para garantir isolamento de dados.</p>
              </div>
            ) : !searchEnabled ? (
              <div className="rounded-lg border border-warning-200 bg-warning-50/70 px-4 py-6 text-center text-warning-700">
                <p className="text-sm font-semibold">Busca desabilitada: selecione um tenant válido</p>
                <p className="text-xs">Escolha um tenant ou &quot;Todos&quot; para ver estatísticas agregadas.</p>
              </div>
            ) : query.length === 0 ? (
              <div className="py-6">
                {/* Quick Filters - Estilo HeroUI */}
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-foreground mb-4">Filtros Rápidos</h4>
                  {statsError ? (
                    <div className="mb-3 rounded-md border border-danger-200 bg-danger-50/70 px-3 py-2 text-xs text-danger-600">
                      {statsError instanceof Error ? statsError.message : "Não foi possível carregar as métricas"}
                    </div>
                  ) : null}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {
                        label: "Processos",
                        icon: "⚖️",
                        count: stats?.processos != null ? String(stats.processos) : "–",
                        helper: stats?.meusProcessos != null ? `Você tem ${stats.meusProcessos} processos` : null,
                      },
                      {
                        label: "Clientes",
                        icon: "👤",
                        count: stats?.clientes != null ? String(stats.clientes) : "–",
                      },
                      {
                        label: "Documentos",
                        icon: "📄",
                        count: stats?.documentos != null ? String(stats.documentos) : "–",
                      },
                      {
                        label: "Equipe",
                        icon: "👥",
                        count: statsError ? "!" : "–",
                        helper: "Use buscar por usuários para filtrar",
                      },
                    ].map((filter) => (
                      <button
                        key={filter.label}
                        className="flex items-center gap-3 p-3 rounded-lg bg-default-50/70 hover:bg-default-100/70 backdrop-blur-sm transition-colors group"
                        onClick={() => handleInputChange(filter.label)}
                      >
                        <span className="text-lg group-hover:scale-110 transition-transform">{filter.icon}</span>
                        <div className="flex-1 text-left">
                          <div className="font-medium text-sm text-foreground">{filter.label}</div>
                          <div className="text-xs text-default-500">
                            {isLoadingStats ? (
                              "Carregando..."
                            ) : (
                              <>
                                {filter.count} {filter.count === "1" ? "item" : "itens"}
                              </>
                            )}
                          </div>
                          {filter.helper ? <div className="text-[11px] text-default-400">{filter.helper}</div> : null}
                        </div>
                        <div className="h-4 w-4 rounded-full border border-default-300 group-hover:border-primary-300 transition-colors" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Keyboard Shortcuts */}
                <div className="pt-4 border-t border-default-200">
                  <h4 className="text-sm font-medium text-foreground mb-3">Atalhos de Teclado</h4>
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1">
                        <Kbd keys={["up"]} />
                        <Kbd keys={["down"]} />
                      </div>
                      <span className="text-default-500">navegar</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Kbd keys={["enter"]} />
                      <span className="text-default-500">selecionar</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Kbd keys={["escape"]} />
                      <span className="text-default-500">fechar</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : results && results.length > 0 ? (
              <div>
                <div className="text-sm text-default-500 mb-4 px-1">
                  {results.length} resultado{results.length !== 1 ? "s" : ""} encontrado{results.length !== 1 ? "s" : ""}
                </div>
                <div className="space-y-1">
                  {results.map((result, index) => (
                    <button
                      key={result.id}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all duration-200 ${
                        index === selectedIndex ? "bg-primary-100 border border-primary-200 shadow-sm" : "hover:bg-default-100 border border-transparent"
                      }`}
                      onClick={() => {
                        window.location.href = result.href;
                        setIsOpen(false);
                        setQuery("");
                      }}
                    >
                      <div className="flex-shrink-0">
                        {result.avatar ? (
                          <Avatar className="flex-shrink-0" size="sm" src={result.avatar} />
                        ) : (
                          <div className="h-8 w-8 rounded-full bg-default-100 flex items-center justify-center text-lg">{getResultIcon(result.type)}</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium truncate text-foreground">{result.title}</span>
                          <Chip className="text-xs" color={result.statusColor || "default"} size="sm" variant="flat">
                            {getTypeLabel(result.type)}
                          </Chip>
                        </div>
                        {result.description && <p className="text-sm text-default-500 truncate">{result.description}</p>}
                        {result.status && (
                          <div className="mt-1">
                            <Chip className="text-xs" color={result.statusColor || "default"} size="sm" variant="flat">
                              {result.status}
                            </Chip>
                          </div>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        <div className={`h-4 w-4 rounded-full border transition-colors ${index === selectedIndex ? "border-primary-300 bg-primary-200" : "border-default-300"}`} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center">
                <div className="h-12 w-12 rounded-full bg-default-100 flex items-center justify-center mx-auto mb-4">
                  <Search className="h-6 w-6 text-default-400" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">Nenhum resultado encontrado</h3>
                <p className="text-sm text-default-500 mb-6">Tente usar termos diferentes ou verifique a ortografia</p>
                <div className="flex items-center justify-center gap-2 text-xs text-default-400">
                  <Kbd keys={["escape"]} />
                  <span>para fechar</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
