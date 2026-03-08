"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@heroui/button";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Chip } from "@heroui/chip";
import { Divider } from "@heroui/divider";
import { Input } from "@heroui/input";
import { Tooltip } from "@heroui/react";
import { addToast } from "@heroui/toast";
import {
  Edit2,
  Eye,
  History,
  Info,
  Mail,
  Palette,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";

import {
  rollbackTenantBrandingVersion,
  updateTenantBranding,
  type UpdateTenantBrandingInput,
} from "@/app/actions/tenant-config";
import { BRANDING_PRESETS, getBrandingPresetByKey } from "@/lib/branding/presets";
import { buildBrandingAccessibilityReport } from "@/lib/branding/accessibility";

type BrandingSnapshot = {
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  logoUrl: string | null;
  faviconUrl: string | null;
  loginBackgroundUrl: string | null;
  emailFromName: string | null;
  emailFromAddress: string | null;
};

type BrandingHistoryItem = {
  id: string;
  acao: string;
  createdAt: string;
  changedFields: string[];
  usuario: {
    id: string;
    name: string;
    email: string;
  } | null;
  snapshot: BrandingSnapshot | null;
  previousSnapshot: BrandingSnapshot | null;
  presetKey: string | null;
  mode: "draft" | "publish" | "rollback" | "unknown";
};

interface TenantBrandingFormProps {
  initialData: BrandingSnapshot & {
    activePresetKey: string | null;
    hasDraft: boolean;
    draft: (BrandingSnapshot & {
      updatedAt: string;
      updatedBy?: string | null;
      presetKey?: string | null;
    }) | null;
    lastPublishedAt: string | null;
    lastPublishedBy: string | null;
    accessibilityScore: number;
    accessibilityWarnings: string[];
    history: BrandingHistoryItem[];
  };
}

type BrandingFormState = {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string;
  faviconUrl: string;
  loginBackgroundUrl: string;
  emailFromName: string;
  emailFromAddress: string;
};

function formatDate(dateRaw: string | null): string {
  if (!dateRaw) {
    return "N/A";
  }

  const date = new Date(dateRaw);
  if (Number.isNaN(date.getTime())) {
    return "N/A";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function toFormStateFromSnapshot(snapshot: BrandingSnapshot): BrandingFormState {
  return {
    primaryColor: snapshot.primaryColor || "#2563eb",
    secondaryColor: snapshot.secondaryColor || "#1d4ed8",
    accentColor: snapshot.accentColor || "#3b82f6",
    logoUrl: snapshot.logoUrl || "",
    faviconUrl: snapshot.faviconUrl || "",
    loginBackgroundUrl: snapshot.loginBackgroundUrl || "",
    emailFromName: snapshot.emailFromName || "",
    emailFromAddress: snapshot.emailFromAddress || "",
  };
}

function getModeLabel(mode: BrandingHistoryItem["mode"]) {
  switch (mode) {
    case "draft":
      return "Rascunho";
    case "publish":
      return "Publicado";
    case "rollback":
      return "Rollback";
    default:
      return "Atualização";
  }
}

function getModeColor(mode: BrandingHistoryItem["mode"]) {
  switch (mode) {
    case "draft":
      return "warning" as const;
    case "publish":
      return "success" as const;
    case "rollback":
      return "secondary" as const;
    default:
      return "default" as const;
  }
}

export function TenantBrandingForm({ initialData }: TenantBrandingFormProps) {
  const { data: session, update } = useSession();
  const router = useRouter();
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const faviconInputRef = useRef<HTMLInputElement | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isRestoringId, setIsRestoringId] = useState<string | null>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingFavicon, setIsUploadingFavicon] = useState(false);

  const activeSnapshot: BrandingSnapshot = initialData.hasDraft && initialData.draft
    ? initialData.draft
    : initialData;
  const [formData, setFormData] = useState<BrandingFormState>(
    toFormStateFromSnapshot(activeSnapshot),
  );
  const [selectedPresetKey, setSelectedPresetKey] = useState<string | null>(
    initialData.draft?.presetKey || initialData.activePresetKey || null,
  );
  const role = ((session?.user as any)?.role as string | undefined) || null;
  const roleLabel =
    role === "SUPER_ADMIN"
      ? "Super Admin"
      : role === "ADMIN"
        ? "Administrador"
        : role === "ADVOGADO"
          ? "Advogado"
          : role === "SECRETARIA"
            ? "Secretaria"
            : "Usuário";

  useEffect(() => {
    if (!isEditing) {
      const snapshot = initialData.hasDraft && initialData.draft
        ? initialData.draft
        : initialData;
      setFormData(toFormStateFromSnapshot(snapshot));
      setSelectedPresetKey(
        initialData.draft?.presetKey || initialData.activePresetKey || null,
      );
    }
  }, [initialData, isEditing]);

  const accessibility = useMemo(
    () =>
      buildBrandingAccessibilityReport({
        primaryColor: formData.primaryColor,
        secondaryColor: formData.secondaryColor,
        accentColor: formData.accentColor,
      }),
    [formData.primaryColor, formData.secondaryColor, formData.accentColor],
  );

  const previewPreset = useMemo(
    () => getBrandingPresetByKey(selectedPresetKey),
    [selectedPresetKey],
  );

  const uploadBrandingFile = async (
    file: File,
    kind: "logo" | "favicon",
  ): Promise<string> => {
    const payload = new FormData();
    payload.append("file", file);
    payload.append("kind", kind);

    const response = await fetch("/api/tenant-branding/upload", {
      method: "POST",
      body: payload,
    });
    const data = await response.json();

    if (!response.ok || !data?.success || !data?.data?.url) {
      throw new Error(data?.error || "Falha no upload da imagem.");
    }

    return data.data.url as string;
  };

  const handleSelectBrandingFile = async (
    event: ChangeEvent<HTMLInputElement>,
    kind: "logo" | "favicon",
  ) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    if (kind === "logo") {
      setIsUploadingLogo(true);
    } else {
      setIsUploadingFavicon(true);
    }

    try {
      const uploadedUrl = await uploadBrandingFile(file, kind);

      if (kind === "logo") {
        setFormData((prev) => ({ ...prev, logoUrl: uploadedUrl }));
      } else {
        setFormData((prev) => ({ ...prev, faviconUrl: uploadedUrl }));
      }

      addToast({
        title: kind === "logo" ? "Logo enviada" : "Favicon enviado",
        description: "Arquivo otimizado. Salve para aplicar no escritório.",
        color: "success",
      });
    } catch (error) {
      addToast({
        title: "Falha no upload",
        description:
          error instanceof Error ? error.message : "Erro ao enviar arquivo.",
        color: "danger",
      });
    } finally {
      if (kind === "logo") {
        setIsUploadingLogo(false);
      } else {
        setIsUploadingFavicon(false);
      }
    }
  };

  const buildPayload = (mode: "draft" | "publish"): UpdateTenantBrandingInput => ({
    mode,
    presetKey: selectedPresetKey || null,
    primaryColor: formData.primaryColor,
    secondaryColor: formData.secondaryColor,
    accentColor: formData.accentColor,
    logoUrl: formData.logoUrl || null,
    faviconUrl: formData.faviconUrl || null,
    loginBackgroundUrl: formData.loginBackgroundUrl || null,
    emailFromName: formData.emailFromName || null,
    emailFromAddress: formData.emailFromAddress || null,
  });

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    try {
      const result = await updateTenantBranding(buildPayload("draft"));
      if (!result.success) {
        throw new Error(result.error || "Falha ao salvar rascunho.");
      }

      addToast({
        title: "Rascunho salvo",
        description:
          "As alterações de branding ficaram em rascunho e ainda não foram publicadas.",
        color: "success",
      });
      router.refresh();
    } catch (error) {
      addToast({
        title: "Erro ao salvar rascunho",
        description: error instanceof Error ? error.message : "Erro desconhecido.",
        color: "danger",
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      const result = await updateTenantBranding(buildPayload("publish"));
      if (!result.success) {
        throw new Error(result.error || "Falha ao publicar branding.");
      }

      await update({
        tenantLogoUrl: formData.logoUrl || null,
        tenantFaviconUrl: formData.faviconUrl || null,
      });

      addToast({
        title: "Branding publicado",
        description: "Identidade visual ativa em todo o escritório.",
        color: "success",
      });
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      addToast({
        title: "Erro ao publicar branding",
        description: error instanceof Error ? error.message : "Erro desconhecido.",
        color: "danger",
      });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleRollback = async (historyItem: BrandingHistoryItem) => {
    if (!historyItem.snapshot) {
      return;
    }

    setIsRestoringId(historyItem.id);
    try {
      const result = await rollbackTenantBrandingVersion(historyItem.id);
      if (!result.success) {
        throw new Error(result.error || "Falha ao restaurar versão.");
      }

      await update({
        tenantLogoUrl: historyItem.snapshot.logoUrl || null,
        tenantFaviconUrl: historyItem.snapshot.faviconUrl || null,
      });

      addToast({
        title: "Versão restaurada",
        description: "A identidade visual foi revertida com sucesso.",
        color: "success",
      });
      setIsEditing(false);
      router.refresh();
    } catch (error) {
      addToast({
        title: "Erro ao restaurar",
        description: error instanceof Error ? error.message : "Erro desconhecido.",
        color: "danger",
      });
    } finally {
      setIsRestoringId(null);
    }
  };

  const handleApplyPreset = (presetKey: string) => {
    const preset = getBrandingPresetByKey(presetKey);
    if (!preset) {
      return;
    }

    setSelectedPresetKey(preset.key);
    setFormData((prev) => ({
      ...prev,
      primaryColor: preset.primaryColor,
      secondaryColor: preset.secondaryColor,
      accentColor: preset.accentColor,
    }));
  };

  return (
    <div className="space-y-6">
      <Card className="border border-default-200/70 bg-background/80">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" />
            <h3 className="text-base font-semibold text-foreground">Tutorial rápido da aba Branding</h3>
          </div>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody className="space-y-4 text-sm text-foreground/90">
          <div className="grid gap-2 md:grid-cols-2">
            <p>
              1. Clique em <strong>Editar</strong> para entrar no modo de alteração.
            </p>
            <p>
              2. Escolha um <strong>Preset</strong> pronto ou personalize as cores.
            </p>
            <p>
              3. Envie <strong>Logo/Favicon</strong> e revise o preview da marca.
            </p>
            <p>
              4. Use <strong>Salvar rascunho</strong> para guardar sem aplicar.
            </p>
            <p>
              5. Clique em <strong>Publicar branding</strong> para ativar no sistema.
            </p>
            <p>
              6. Em <strong>Histórico de versões</strong>, você pode restaurar uma versão anterior.
            </p>
          </div>

          <div className="rounded-lg border border-default-200/70 bg-default-100/30 p-3">
            <div className="mb-2 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-success" />
              <p className="font-medium text-foreground">Quem tem acesso</p>
            </div>
            <p className="text-foreground/80">
              Edição de branding: <strong>Admin do escritório</strong> e{" "}
              <strong>Super Admin</strong>. Outros perfis podem visualizar conforme permissão da
              página.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Chip color="default" size="sm" variant="flat">
                Perfil atual: {roleLabel}
              </Chip>
              <Chip
                color={role === "ADMIN" || role === "SUPER_ADMIN" ? "success" : "warning"}
                size="sm"
                variant="flat"
              >
                {role === "ADMIN" || role === "SUPER_ADMIN"
                  ? "Pode editar branding"
                  : "Somente visualização"}
              </Chip>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardHeader className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Identidade Visual</h2>
            <p className="text-sm text-default-400">
              Presets, acessibilidade, rascunho/publicação e histórico com rollback.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Chip
              color={initialData.hasDraft ? "warning" : "success"}
              radius="sm"
              size="sm"
              variant="flat"
            >
              {initialData.hasDraft ? "Rascunho pendente" : "Sem rascunho pendente"}
            </Chip>
            <Chip
              color={initialData.accessibilityScore >= 80 ? "success" : "warning"}
              radius="sm"
              size="sm"
              variant="flat"
            >
              Acessibilidade {initialData.accessibilityScore}%
            </Chip>
            {!isEditing && (
              <Tooltip content="Editar branding">
                <Button
                  isIconOnly
                  color="primary"
                  radius="full"
                  variant="flat"
                  onPress={() => setIsEditing(true)}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
              </Tooltip>
            )}
          </div>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-[11px] uppercase tracking-wide text-default-500">Publicado em</p>
              <p className="mt-1 text-sm text-foreground">
                {formatDate(initialData.lastPublishedAt)}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-[11px] uppercase tracking-wide text-default-500">
                Preset ativo
              </p>
              <p className="mt-1 text-sm text-foreground">
                {getBrandingPresetByKey(initialData.activePresetKey)?.name || "Personalizado"}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-[11px] uppercase tracking-wide text-default-500">Saúde WCAG</p>
              <p className="mt-1 text-sm text-foreground">
                {initialData.accessibilityWarnings.length === 0
                  ? "Sem alertas críticos"
                  : `${initialData.accessibilityWarnings.length} alerta(s)`}
              </p>
            </div>
          </div>

          {isEditing ? (
            <div className="space-y-6">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="mb-3 text-sm font-medium text-foreground">Presets de identidade</p>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  {BRANDING_PRESETS.map((preset) => (
                    <Button
                      key={preset.key}
                      className="justify-start"
                      color={selectedPresetKey === preset.key ? "primary" : "default"}
                      size="sm"
                      variant={selectedPresetKey === preset.key ? "solid" : "flat"}
                      onPress={() => handleApplyPreset(preset.key)}
                    >
                      {preset.name}
                    </Button>
                  ))}
                </div>
                {previewPreset ? (
                  <p className="mt-2 text-xs text-default-400">{previewPreset.description}</p>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Input
                  description="Hexadecimal #RRGGBB"
                  label="Cor primária"
                  startContent={<Palette className="h-4 w-4 text-primary" />}
                  value={formData.primaryColor}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, primaryColor: value }))
                  }
                />
                <Input
                  description="Hexadecimal #RRGGBB"
                  label="Cor secundária"
                  startContent={<Palette className="h-4 w-4 text-secondary" />}
                  value={formData.secondaryColor}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, secondaryColor: value }))
                  }
                />
                <Input
                  description="Hexadecimal #RRGGBB"
                  label="Cor de destaque"
                  startContent={<Palette className="h-4 w-4 text-warning" />}
                  value={formData.accentColor}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, accentColor: value }))
                  }
                />
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Input
                  description="PNG/JPG/WEBP/SVG com otimização automática."
                  label="URL da logo"
                  placeholder="https://exemplo.com/logo.png"
                  value={formData.logoUrl}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, logoUrl: value }))
                  }
                />
                <div className="flex items-center gap-2">
                  <input
                    ref={logoInputRef}
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    type="file"
                    onChange={(event) => handleSelectBrandingFile(event, "logo")}
                  />
                  <Button
                    color="primary"
                    isLoading={isUploadingLogo}
                    radius="full"
                    size="sm"
                    startContent={!isUploadingLogo ? <Upload className="h-3.5 w-3.5" /> : null}
                    variant="flat"
                    onPress={() => logoInputRef.current?.click()}
                  >
                    {isUploadingLogo ? "Enviando logo..." : "Enviar logo"}
                  </Button>
                  <span className="text-xs text-default-400">Max 4MB</span>
                </div>
                <Input
                  description="ICO/PNG/SVG recomendado."
                  label="URL do favicon"
                  placeholder="https://exemplo.com/favicon.ico"
                  value={formData.faviconUrl}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, faviconUrl: value }))
                  }
                />
                <div className="flex items-center gap-2">
                  <input
                    ref={faviconInputRef}
                    accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,image/vnd.microsoft.icon"
                    className="hidden"
                    type="file"
                    onChange={(event) => handleSelectBrandingFile(event, "favicon")}
                  />
                  <Button
                    color="primary"
                    isLoading={isUploadingFavicon}
                    radius="full"
                    size="sm"
                    startContent={
                      !isUploadingFavicon ? <Upload className="h-3.5 w-3.5" /> : null
                    }
                    variant="flat"
                    onPress={() => faviconInputRef.current?.click()}
                  >
                    {isUploadingFavicon ? "Enviando favicon..." : "Enviar favicon"}
                  </Button>
                  <span className="text-xs text-default-400">Max 1MB</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Input
                  description="Opcional para personalizar a tela de login."
                  label="Fundo do login (URL)"
                  placeholder="https://exemplo.com/login-bg.png"
                  value={formData.loginBackgroundUrl}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, loginBackgroundUrl: value }))
                  }
                />
                <Input
                  description="Nome exibido no remetente."
                  label="Nome remetente de e-mail"
                  startContent={<Mail className="h-4 w-4 text-primary" />}
                  value={formData.emailFromName}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, emailFromName: value }))
                  }
                />
                <Input
                  description="Email remetente opcional."
                  label="Email remetente de e-mail"
                  placeholder="contato@seu-escritorio.com.br"
                  value={formData.emailFromAddress}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, emailFromAddress: value }))
                  }
                />
              </div>

              <Card className="border border-white/10 bg-white/5">
                <CardBody className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">Preview rápido</p>
                    <Chip
                      color={accessibility.score >= 80 ? "success" : "warning"}
                      size="sm"
                      variant="flat"
                    >
                      WCAG {accessibility.score}%
                    </Chip>
                  </div>
                  <div
                    className="rounded-xl border border-white/10 p-4"
                    style={{
                      background: `linear-gradient(135deg, ${formData.primaryColor}, ${formData.secondaryColor})`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">Magic Lawyer</p>
                      <Button
                        size="sm"
                        style={{
                          backgroundColor: formData.accentColor,
                          color: "#ffffff",
                        }}
                        variant="solid"
                      >
                        Ação principal
                      </Button>
                    </div>
                  </div>
                  {accessibility.warnings.length > 0 ? (
                    <ul className="space-y-1">
                      {accessibility.warnings.map((warning) => (
                        <li key={warning} className="text-xs text-warning-300">
                          {warning}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-success-300">
                      Contraste adequado para leitura na maior parte dos cenários.
                    </p>
                  )}
                </CardBody>
              </Card>

              <div className="flex flex-wrap justify-end gap-2 border-t border-white/10 pt-4">
                <Button
                  color="danger"
                  radius="full"
                  startContent={<X className="h-4 w-4" />}
                  variant="flat"
                  onPress={() => setIsEditing(false)}
                >
                  Cancelar
                </Button>
                <Button
                  color="secondary"
                  isLoading={isSavingDraft}
                  radius="full"
                  startContent={!isSavingDraft ? <Save className="h-4 w-4" /> : null}
                  variant="flat"
                  onPress={handleSaveDraft}
                >
                  {isSavingDraft ? "Salvando..." : "Salvar rascunho"}
                </Button>
                <Button
                  color="primary"
                  isLoading={isPublishing}
                  radius="full"
                  startContent={!isPublishing ? <Send className="h-4 w-4" /> : null}
                  onPress={handlePublish}
                >
                  {isPublishing ? "Publicando..." : "Publicar branding"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wide text-default-500">Paleta ativa</p>
                <div className="mt-3 flex items-center gap-3">
                  <div
                    className="h-9 w-9 rounded-full border border-white/20"
                    style={{ backgroundColor: initialData.primaryColor || "#2563eb" }}
                  />
                  <div
                    className="h-9 w-9 rounded-full border border-white/20"
                    style={{ backgroundColor: initialData.secondaryColor || "#1d4ed8" }}
                  />
                  <div
                    className="h-9 w-9 rounded-full border border-white/20"
                    style={{ backgroundColor: initialData.accentColor || "#3b82f6" }}
                  />
                </div>
                <p className="mt-2 text-xs text-default-400">
                  {getBrandingPresetByKey(initialData.activePresetKey)?.name ||
                    "Paleta personalizada"}
                </p>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs uppercase tracking-wide text-default-500">Ativos visuais</p>
                <div className="mt-3 flex items-center gap-4">
                  {initialData.logoUrl ? (
                    <img
                      alt="Logo do escritório"
                      className="h-14 max-w-[180px] object-contain"
                      src={initialData.logoUrl}
                    />
                  ) : (
                    <span className="text-sm text-default-500">Sem logo</span>
                  )}
                  {initialData.faviconUrl ? (
                    <img
                      alt="Favicon do escritório"
                      className="h-8 w-8 object-contain"
                      src={initialData.faviconUrl}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card className="border border-white/10 bg-background/70 backdrop-blur-xl">
        <CardHeader className="flex items-center justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <History className="h-4 w-4 text-primary" />
              Histórico de versões
            </h3>
            <p className="text-xs text-default-400">
              Rastreabilidade completa das mudanças de identidade visual.
            </p>
          </div>
          <Chip size="sm" variant="flat">
            {initialData.history.length} registro(s)
          </Chip>
        </CardHeader>
        <Divider className="border-white/10" />
        <CardBody className="space-y-3">
          {initialData.history.length === 0 ? (
            <p className="text-sm text-default-400">
              Ainda não há histórico registrado para branding deste escritório.
            </p>
          ) : (
            <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
              {initialData.history.map((historyItem) => (
                <div
                  key={historyItem.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip color={getModeColor(historyItem.mode)} size="sm" variant="flat">
                        {getModeLabel(historyItem.mode)}
                      </Chip>
                      <span className="text-xs text-default-400">
                        {formatDate(historyItem.createdAt)}
                      </span>
                    </div>
                    {historyItem.snapshot ? (
                      <Button
                        color="primary"
                        isLoading={isRestoringId === historyItem.id}
                        radius="full"
                        size="sm"
                        startContent={
                          isRestoringId !== historyItem.id ? (
                            <RotateCcw className="h-3.5 w-3.5" />
                          ) : null
                        }
                        variant="flat"
                        onPress={() => handleRollback(historyItem)}
                      >
                        Restaurar
                      </Button>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-default-400">
                    {historyItem.usuario
                      ? `${historyItem.usuario.name} (${historyItem.usuario.email})`
                      : "Alteração automática"}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {(historyItem.changedFields || []).slice(0, 5).map((field) => (
                      <Chip key={field} size="sm" variant="dot">
                        {field}
                      </Chip>
                    ))}
                    {historyItem.presetKey ? (
                      <Chip size="sm" startContent={<Eye className="h-3 w-3" />} variant="flat">
                        {getBrandingPresetByKey(historyItem.presetKey)?.name ||
                          historyItem.presetKey}
                      </Chip>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
