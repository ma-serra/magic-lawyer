"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardHeader,
  CardBody,
  CardFooter,
} from "@heroui/card";
import { Button } from "@heroui/button";
import { Badge } from "@heroui/badge";
import { Chip } from "@heroui/chip";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/modal";
import { Input } from "@heroui/input";
import { Switch } from "@heroui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/table";
import { Tooltip } from "@heroui/tooltip";
import { Divider } from "@heroui/divider";
import { ScrollShadow } from "@heroui/scroll-shadow";
import { Spinner } from "@heroui/spinner";
import { Pagination } from "@heroui/pagination";
import { Select, SelectItem } from "@heroui/react";
import { UploadProgress } from "@/components/ui/upload-progress";
import {
  CheckCircle2,
  ShieldCheck,
  UploadCloud,
  AlertTriangle,
  Activity,
  UserCircle2,
  ShieldOff,
  Eye,
  EyeOff,
  KeyRound,
  Tag,
  Calendar,
  Sparkles,
  Search,
  Filter,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { AnimatePresence, motion } from "framer-motion";

import {
  activateDigitalCertificate,
  deactivateDigitalCertificate,
  listDigitalCertificateLogs,
  testDigitalCertificate,
  uploadDigitalCertificateFromForm,
} from "@/app/actions/digital-certificates";
import { DigitalCertificatePolicy } from "@/generated/prisma";
import { DateInput } from "@/components/ui/date-input";

interface CertificateResponsible {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

interface CertificateSummary {
  id: string;
  tenantId: string;
  responsavelUsuarioId: string | null;
  label: string | null;
  tipo: string;
  scope?: string;
  isActive: boolean;
  validUntil: string | null;
  lastValidatedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  responsavelUsuario: CertificateResponsible | null;
}

interface CertificateLog {
  id: string;
  action: string;
  message: string | null;
  createdAt: string;
  actor: CertificateResponsible | null;
}

interface DigitalCertificatesPanelProps {
  certificates: CertificateSummary[];
  mode: "office" | "lawyer";
  policy: DigitalCertificatePolicy;
}

const ACCEPTED_CERTIFICATE_EXTENSIONS = [".pfx", ".p12"];
const MAX_CERTIFICATE_SIZE_BYTES = 2 * 1024 * 1024;
const DEFAULT_PAGE_SIZE = 8;

function isValidCertificateFile(file: File) {
  const normalized = file.name.toLowerCase();
  return ACCEPTED_CERTIFICATE_EXTENSIONS.some((ext) =>
    normalized.endsWith(ext),
  );
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB"];
  const idx = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / Math.pow(1024, idx);
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatDate(date: string | null, fallback = "—") {
  if (!date) return fallback;

  try {
    return new Date(date).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return fallback;
  }
}

function initialsFromResponsible(responsible: CertificateResponsible | null) {
  if (!responsible) {
    return "—";
  }

  const parts = [responsible.firstName, responsible.lastName]
    .filter(Boolean)
    .map((piece) => piece!.charAt(0).toUpperCase());

  return parts.join("") || responsible.email.charAt(0).toUpperCase();
}

function fullName(responsible: CertificateResponsible | null) {
  if (!responsible) return "Não atribuído";

  if (responsible.firstName || responsible.lastName) {
    return `${responsible.firstName ?? ""} ${responsible.lastName ?? ""}`.trim();
  }

  return responsible.email;
}

export function DigitalCertificatesPanel({
  certificates,
  mode,
  policy,
}: DigitalCertificatesPanelProps) {
  const router = useRouter();
  const isOfficeMode = mode === "office";
  const policyAllowsOffice =
    policy === DigitalCertificatePolicy.OFFICE ||
    policy === DigitalCertificatePolicy.HYBRID;
  const policyAllowsLawyer =
    policy === DigitalCertificatePolicy.LAWYER ||
    policy === DigitalCertificatePolicy.HYBRID;
  const policyAllowsCurrent = isOfficeMode
    ? policyAllowsOffice
    : policyAllowsLawyer;

  const [isUploadOpen, setUploadOpen] = useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logs, setLogs] = useState<CertificateLog[]>([]);
  const [actionCertificateId, setActionCertificateId] = useState<
    string | null
  >(null);
  const [logsCertificateId, setLogsCertificateId] = useState<
    string | null
  >(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "ALL" | "ACTIVE" | "INACTIVE" | "EXPIRED"
  >("ALL");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_PAGE_SIZE);
  const [isPending, startTransition] = useTransition();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeCertificate = useMemo(
    () =>
      Array.isArray(certificates)
        ? certificates.find((cert) => cert.isActive)
        : undefined,
    [certificates],
  );

  const expiredCount = useMemo(
    () =>
      (certificates ?? []).filter(
        (cert) =>
          Boolean(cert.validUntil) &&
          new Date(cert.validUntil as string).getTime() < Date.now(),
      ).length,
    [certificates],
  );

  const expiringSoonCount = useMemo(() => {
    const now = Date.now();
    const limit = now + 1000 * 60 * 60 * 24 * 30;
    return (certificates ?? []).filter((cert) => {
      if (!cert.validUntil) {
        return false;
      }
      const ts = new Date(cert.validUntil).getTime();
      return ts >= now && ts <= limit;
    }).length;
  }, [certificates]);

  const filteredCertificates = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return (certificates ?? []).filter((cert) => {
      const expired =
        Boolean(cert.validUntil) &&
        new Date(cert.validUntil as string).getTime() < Date.now();
      const statusMatches =
        statusFilter === "ALL" ||
        (statusFilter === "ACTIVE" && cert.isActive) ||
        (statusFilter === "INACTIVE" && !cert.isActive && !expired) ||
        (statusFilter === "EXPIRED" && expired);

      if (!statusMatches) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const text = [
        cert.label,
        cert.tipo,
        cert.id,
        cert.responsavelUsuario?.firstName,
        cert.responsavelUsuario?.lastName,
        cert.responsavelUsuario?.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return text.includes(normalizedSearch);
    });
  }, [certificates, searchTerm, statusFilter]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredCertificates.length / rowsPerPage),
  );
  const pagedCertificates = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredCertificates.slice(start, start + rowsPerPage);
  }, [filteredCertificates, currentPage, rowsPerPage]);
  const pageStartItem =
    filteredCertificates.length === 0
      ? 0
      : (currentPage - 1) * rowsPerPage + 1;
  const pageEndItem = Math.min(currentPage * rowsPerPage, filteredCertificates.length);
  const hasActiveFilters =
    searchTerm.trim().length > 0 || statusFilter !== "ALL";

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, rowsPerPage]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const hasCertificates = Array.isArray(certificates) && certificates.length > 0;
  const dropzoneDisabled = isSubmitting || !policyAllowsCurrent;
  const dropzoneTone = isDraggingFile
    ? "border-primary/60 bg-primary/5"
    : "border-default-200 bg-default-50";
  const dropzoneState = dropzoneDisabled
    ? "cursor-not-allowed opacity-60"
    : "cursor-pointer hover:border-primary/50";
  const acceptedExtensionsAccept = ACCEPTED_CERTIFICATE_EXTENSIONS.join(",");
  const acceptedExtensionsLabel = ACCEPTED_CERTIFICATE_EXTENSIONS.join(", ");

  const [formState, setFormState] = useState({
    file: null as File | null,
    password: "",
    label: "",
    validUntil: "",
    activate: true,
    tipo: "PJE" as string,
  });
  const selectedFileLabel = formState.file
    ? `${formState.file.name} • ${formatBytes(formState.file.size)}`
    : null;

  const resetForm = () => {
    setFormState({
      file: null,
      password: "",
      label: "",
      validUntil: "",
      activate: true,
      tipo: "PJE",
    });
    setFormErrors(null);
    setIsDraggingFile(false);
    setIsPasswordVisible(false);
  };

  const togglePasswordVisibility = () => {
    setIsPasswordVisible((prev) => !prev);
  };

  const handleFileSelection = (file: File | null) => {
    if (!file) {
      setFormState((prev) => ({ ...prev, file: null }));
      return;
    }

    if (!isValidCertificateFile(file)) {
      setFormState((prev) => ({ ...prev, file: null }));
      setFormErrors("Formato invalido. Use arquivos .pfx ou .p12.");
      return;
    }

    if (file.size > MAX_CERTIFICATE_SIZE_BYTES) {
      setFormState((prev) => ({ ...prev, file: null }));
      setFormErrors("Certificado excede o limite de 2MB.");
      return;
    }

    setFormState((prev) => ({ ...prev, file }));
    if (formErrors) {
      setFormErrors(null);
    }
  };

  const openFilePicker = () => {
    if (dropzoneDisabled) return;
    fileInputRef.current?.click();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (dropzoneDisabled) {
      setIsDraggingFile(false);
      return;
    }

    const file = event.dataTransfer.files?.[0] ?? null;
    handleFileSelection(file);
    setIsDraggingFile(false);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (dropzoneDisabled) return;
    event.dataTransfer.dropEffect = "copy";
    setIsDraggingFile(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingFile(false);
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (dropzoneDisabled) return;
    setIsDraggingFile(true);
  };

  const handleUpload = async () => {
    if (!policyAllowsCurrent) {
      toast.error("Upload indisponivel", {
        description:
          "A politica atual do escritorio nao permite esse tipo de certificado.",
      });

      return;
    }

    if (!formState.file) {
      setFormErrors("Selecione um certificado (.pfx/.p12)");

      return;
    }

    if (!formState.password) {
      setFormErrors("Informe a senha do certificado.");

      return;
    }

    setIsSubmitting(true);
    setFormErrors(null);

    try {
      const fd = new FormData();

      fd.set("certificate", formState.file);
      fd.set("password", formState.password);
      fd.set("label", formState.label);
      fd.set("activate", String(formState.activate));
      fd.set("tipo", formState.tipo);
      fd.set("scope", isOfficeMode ? "OFFICE" : "LAWYER");

      if (formState.validUntil) {
        fd.set("validUntil", formState.validUntil);
      }

      const result = await uploadDigitalCertificateFromForm(fd);

      if (!result.success) {
        throw new Error(result.error ?? "Falha ao salvar certificado");
      }

      toast.success("Certificado enviado com sucesso.", {
        description: "Lista atualizada com o novo certificado.",
      });

      setUploadOpen(false);
      resetForm();
      router.refresh();
    } catch (error) {
      toast.error("Falha no upload", {
        description:
          error instanceof Error ? error.message : "Erro inesperado.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeactivate = (certificateId: string) => {
    if (!policyAllowsCurrent) {
      return;
    }

    startTransition(async () => {
      setActionCertificateId(certificateId);
      try {
        const result = await deactivateDigitalCertificate({ certificateId });

        if (!result.success) {
          toast.error("Não foi possível desativar o certificado", {
            description: result.error,
          });

          return;
        }

        toast.success("Certificado desativado", {
          description: "Status atualizado com sucesso.",
        });
        router.refresh();
      } finally {
        setActionCertificateId(null);
      }
    });
  };

  const handleActivate = (certificateId: string) => {
    if (!policyAllowsCurrent) {
      return;
    }

    startTransition(async () => {
      setActionCertificateId(certificateId);
      try {
        const result = await activateDigitalCertificate({ certificateId });

        if (!result.success) {
          toast.error("Não foi possível ativar o certificado", {
            description: result.error,
          });

          return;
        }

        toast.success("Certificado ativado", {
          description: "Status atualizado com sucesso.",
        });
        router.refresh();
      } finally {
        setActionCertificateId(null);
      }
    });
  };

  const handleTest = (certificateId: string) => {
    if (!policyAllowsCurrent) {
      return;
    }

    startTransition(async () => {
      setActionCertificateId(certificateId);
      try {
        const result = await testDigitalCertificate({ certificateId });

        if (!result.success) {
          toast.error("Teste falhou", { description: result.error });

          return;
        }

        toast.success("Teste bem-sucedido", {
          description: result.message ?? "Certificado validado.",
        });
        router.refresh();
      } finally {
        setActionCertificateId(null);
      }
    });
  };

  const handleOpenLogs = async (certificateId: string) => {
    setLogsCertificateId(certificateId);
    setLogs([]);
    setIsLoadingLogs(true);

    try {
      const { items } = await listDigitalCertificateLogs({
        certificateId,
        take: 20,
      });

      setLogs(
        items.map((item) => ({
          id: item.id,
          action: item.action,
          message: item.message ?? null,
          createdAt:
            typeof item.createdAt === "string"
              ? item.createdAt
              : new Date(item.createdAt).toISOString(),
          actor: item.actor,
        })),
      );
    } catch (error) {
      toast.error("Não foi possível carregar o histórico", {
        description:
          error instanceof Error ? error.message : "Erro desconhecido.",
      });
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const statusChip = (certificate: CertificateSummary) => {
    if (certificate.isActive) {
      return (
        <Chip color="success" size="sm" variant="flat">
          Ativo
        </Chip>
      );
    }

    if (
      certificate.validUntil &&
      new Date(certificate.validUntil).getTime() < Date.now()
    ) {
      return (
        <Chip color="danger" size="sm" variant="flat">
          Expirado
        </Chip>
      );
    }

    return (
        <Chip color="warning" size="sm" variant="flat">
          Inativo
        </Chip>
    );
  };

  return (
    <>
      <Card className="border border-primary/30 bg-background/80 backdrop-blur-xl">
        <CardHeader className="flex flex-col gap-3 pb-0">
          <div className="flex items-center gap-3 text-primary">
            <ShieldCheck className="h-6 w-6" />
            <div>
              <h2 className="text-xl font-semibold text-white">
                {isOfficeMode
                  ? "Integracoes PJe e Certificados A1"
                  : "Certificados Digitais A1"}
              </h2>
              <p className="text-sm text-default-400">
                {isOfficeMode
                  ? "Gerencie certificados ICP-Brasil do escritorio. Somente admins e super admins visualizam esta sessao."
                  : "Gerencie seu certificado ICP-Brasil para autenticacoes PJe."}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardBody className="space-y-6">
          <Card className="border border-primary/20 bg-primary/5">
            <CardBody className="space-y-2 text-sm text-default-300">
              <p className="font-medium text-white">
                {isOfficeMode
                  ? "Escopo: certificado do escritório"
                  : "Escopo: certificado pessoal do advogado"}
              </p>
              <p>
                {isOfficeMode
                  ? "Use esta aba para controlar integrações PJe do tenant. Certificado pessoal é gerenciado em Perfil do usuário."
                  : "Use esta aba para seu certificado individual no PJe. Certificado central do escritório fica em Configurações do escritório."}
              </p>
              <p>
                Fluxo recomendado: enviar certificado A1, testar conexão, ativar e monitorar validade.
              </p>
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Card className="border border-white/10 bg-white/5">
              <CardBody className="gap-1 py-4">
                <p className="text-[11px] uppercase tracking-wide text-default-500">
                  Cadastrados
                </p>
                <p className="text-xl font-semibold text-white">
                  {certificates.length}
                </p>
              </CardBody>
            </Card>
            <Card className="border border-white/10 bg-white/5">
              <CardBody className="gap-1 py-4">
                <p className="text-[11px] uppercase tracking-wide text-default-500">Ativos</p>
                <p className="text-xl font-semibold text-success">
                  {certificates.filter((item) => item.isActive).length}
                </p>
              </CardBody>
            </Card>
            <Card className="border border-white/10 bg-white/5">
              <CardBody className="gap-1 py-4">
                <p className="text-[11px] uppercase tracking-wide text-default-500">
                  Expiram em 30 dias
                </p>
                <p className="text-xl font-semibold text-warning">{expiringSoonCount}</p>
              </CardBody>
            </Card>
            <Card className="border border-white/10 bg-white/5">
              <CardBody className="gap-1 py-4">
                <p className="text-[11px] uppercase tracking-wide text-default-500">Expirados</p>
                <p className="text-xl font-semibold text-danger">{expiredCount}</p>
              </CardBody>
            </Card>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-3">
              <Badge
                color={activeCertificate ? "success" : "warning"}
                variant="flat"
              >
                {activeCertificate
                  ? isOfficeMode
                    ? "Integracao habilitada"
                    : "Certificado ativo"
                  : "Nenhum certificado ativo"}
              </Badge>
              {!policyAllowsCurrent && (
                <Badge color="warning" variant="flat">
                  Upload desativado pela politica do escritorio
                </Badge>
              )}
              {activeCertificate?.validUntil && (
                <Badge color="warning" variant="flat">
                  Válido até {formatDate(activeCertificate.validUntil)}
                </Badge>
              )}
              {activeCertificate?.lastValidatedAt && (
                <Badge color="primary" variant="flat">
                  Último teste: {formatDate(activeCertificate.lastValidatedAt)}
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                color="primary"
                isDisabled={!policyAllowsCurrent}
                startContent={<UploadCloud className="h-4 w-4" />}
                onPress={() => {
                  if (!policyAllowsCurrent) {
                    return;
                  }
                  resetForm();
                  setUploadOpen(true);
                }}
              >
                Enviar novo certificado
              </Button>
            </div>
          </div>

          {hasCertificates && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
              <Input
                label="Buscar certificado"
                placeholder="Nome, tipo, ID ou responsável"
                startContent={<Search className="h-4 w-4 text-default-400" />}
                value={searchTerm}
                onValueChange={setSearchTerm}
              />
              <Select
                label="Status"
                selectedKeys={statusFilter ? [statusFilter] : []}
                startContent={<Filter className="h-4 w-4 text-default-400" />}
                onSelectionChange={(keys) => {
                  const [value] = Array.from(keys);
                  if (typeof value === "string") {
                    setStatusFilter(
                      value as "ALL" | "ACTIVE" | "INACTIVE" | "EXPIRED",
                    );
                  }
                }}
              >
                <SelectItem key="ALL" textValue="Todos">
                  Todos
                </SelectItem>
                <SelectItem key="ACTIVE" textValue="Ativos">
                  Ativos
                </SelectItem>
                <SelectItem key="INACTIVE" textValue="Inativos">
                  Inativos
                </SelectItem>
                <SelectItem key="EXPIRED" textValue="Expirados">
                  Expirados
                </SelectItem>
              </Select>
              <Select
                label="Por página"
                selectedKeys={[String(rowsPerPage)]}
                onSelectionChange={(keys) => {
                  const [value] = Array.from(keys);
                  if (typeof value === "string") {
                    const parsed = Number(value);
                    if (!Number.isNaN(parsed)) {
                      setRowsPerPage(parsed);
                    }
                  }
                }}
              >
                <SelectItem key="6" textValue="6">
                  6
                </SelectItem>
                <SelectItem key="8" textValue="8">
                  8
                </SelectItem>
                <SelectItem key="12" textValue="12">
                  12
                </SelectItem>
              </Select>
              <Button
                className="self-end"
                isDisabled={!hasActiveFilters}
                variant="flat"
                onPress={() => {
                  setSearchTerm("");
                  setStatusFilter("ALL");
                  setCurrentPage(1);
                }}
              >
                Limpar filtros
              </Button>
            </div>
          )}

          {!policyAllowsCurrent && (
            <Card className="border border-dashed border-warning/40 bg-warning/5">
              <CardBody className="text-sm text-warning-700">
                Este modo de certificados foi desativado pela politica atual do
                escritorio. Fale com um administrador para alterar a
                configuracao.
              </CardBody>
            </Card>
          )}

          {!hasCertificates ? (
            <Card className="border border-dashed border-default-300 bg-white/5">
              <CardBody className="flex flex-col items-center gap-3 text-center text-default-400">
                <ShieldOff className="h-10 w-10 text-default-300" />
                <p className="text-base text-white">
                  Nenhum certificado cadastrado
                </p>
                <p className="max-w-xl text-sm text-default-400">
                  {isOfficeMode
                    ? "Faca o upload do certificado A1 (.pfx ou .p12) utilizado para peticionamento no PJe. O arquivo sera criptografado imediatamente e somente usuarios autorizados podem manipula-lo."
                    : "Envie seu certificado A1 (.pfx ou .p12) para autenticar consultas no PJe. O arquivo sera criptografado imediatamente."}
                </p>
              </CardBody>
            </Card>
          ) : (
            <div className="space-y-3">
              <ScrollShadow className="max-h-[420px]">
                <Table removeWrapper aria-label="Certificados digitais">
                  <TableHeader>
                    <TableColumn>STATUS</TableColumn>
                    <TableColumn>IDENTIFICAÇÃO</TableColumn>
                    <TableColumn>RESPONSÁVEL</TableColumn>
                    <TableColumn>ÚLTIMO USO</TableColumn>
                    <TableColumn>VALIDADE</TableColumn>
                    <TableColumn className="text-right">AÇÕES</TableColumn>
                  </TableHeader>
                  <TableBody emptyContent="Nenhum certificado encontrado no filtro aplicado.">
                    {pagedCertificates.map((certificate) => (
                      <TableRow key={certificate.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {statusChip(certificate)}
                            <span className="text-xs text-default-500">
                              {certificate.tipo}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <p className="font-medium text-white">
                              {certificate.label || certificate.id.slice(0, 12)}
                            </p>
                            <span className="text-xs text-default-500">
                              Registrado em {formatDate(certificate.createdAt)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs text-primary">
                              {initialsFromResponsible(certificate.responsavelUsuario)}
                            </div>
                            <div>
                              <p className="text-sm text-white">
                                {fullName(certificate.responsavelUsuario)}
                              </p>
                              <p className="text-xs text-default-500">
                                {certificate.responsavelUsuario?.email ?? "—"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm text-default-400">
                            <Activity className="h-4 w-4" />
                            <span>{formatDate(certificate.lastUsedAt)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm text-default-400">
                            <AlertTriangle className="h-4 w-4 text-warning" />
                            <span>{formatDate(certificate.validUntil)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            <Tooltip content="Visualizar histórico">
                              <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                onPress={() => handleOpenLogs(certificate.id)}
                              >
                                <UserCircle2 className="h-4 w-4" />
                              </Button>
                            </Tooltip>
                            <Tooltip content="Testar acesso">
                              <Button
                                isDisabled={!policyAllowsCurrent}
                                isLoading={
                                  isPending && actionCertificateId === certificate.id
                                }
                                isIconOnly
                                size="sm"
                                variant="light"
                                onPress={() => handleTest(certificate.id)}
                              >
                                <CheckCircle2 className="h-4 w-4 text-success" />
                              </Button>
                            </Tooltip>
                            {certificate.isActive ? (
                              <Tooltip content="Desativar">
                                <Button
                                  color="danger"
                                  isDisabled={!policyAllowsCurrent}
                                  isLoading={
                                    isPending &&
                                    actionCertificateId === certificate.id
                                  }
                                  size="sm"
                                  variant="flat"
                                  onPress={() => handleDeactivate(certificate.id)}
                                >
                                  Desativar
                                </Button>
                              </Tooltip>
                            ) : (
                              <Tooltip content="Ativar">
                                <Button
                                  color="success"
                                  isDisabled={!policyAllowsCurrent}
                                  isLoading={
                                    isPending &&
                                    actionCertificateId === certificate.id
                                  }
                                  size="sm"
                                  variant="flat"
                                  onPress={() => handleActivate(certificate.id)}
                                >
                                  Ativar
                                </Button>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollShadow>
              {filteredCertificates.length > rowsPerPage && (
                <div className="flex items-center justify-between">
                  <p className="text-xs text-default-500">
                    Exibindo {pageStartItem}-{pageEndItem} de {filteredCertificates.length} certificado(s).
                  </p>
                  <Pagination
                    color="primary"
                    page={currentPage}
                    total={totalPages}
                    onChange={setCurrentPage}
                  />
                </div>
              )}
            </div>
          )}
        </CardBody>
        <CardFooter className="flex flex-col items-start gap-2 text-xs text-default-500">
          <p>
            {isOfficeMode
              ? "Os certificados sao criptografados com AES-256-GCM e armazenados em repouso com logs de auditoria. Ative somente o que pretende usar no PJe para evitar instabilidades."
              : "Seu certificado e criptografado com AES-256-GCM e armazenado com logs de auditoria. Ative somente o que pretende usar no PJe para evitar instabilidades."}
          </p>
          <p>
            {isOfficeMode
              ? "Ao enviar um novo certificado do mesmo tipo, o anterior e arquivado automaticamente e permanece disponivel apenas para auditoria."
              : "Ao enviar um novo certificado do mesmo tipo, o anterior e arquivado automaticamente para auditoria."}
          </p>
        </CardFooter>
      </Card>

      <Modal
        isOpen={isUploadOpen}
        onClose={() => {
          if (!isSubmitting) {
            setUploadOpen(false);
            resetForm();
          }
        }}
        size="lg"
      >
        <ModalContent className="border border-primary/20 bg-linear-to-br from-slate-950 via-slate-950 to-slate-900 shadow-[0_32px_80px_-40px_rgba(59,130,246,0.55)]">
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-3 border-b border-white/10 pb-4">
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  initial={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <span className="text-lg font-semibold text-white">
                        Enviar certificado A1
                      </span>
                      <p className="text-sm text-default-400">
                        Somente formatos .pfx ou .p12 com senha ativa sao aceitos.
                      </p>
                    </div>
                  </div>
                  <div className="hidden items-center gap-2 text-xs text-default-300 md:flex">
                    <div className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-primary">
                      <Sparkles className="h-3.5 w-3.5" />
                      AES-256
                    </div>
                    <div className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Valido localmente
                    </div>
                  </div>
                </motion.div>
              </ModalHeader>
              <ModalBody className="space-y-4">
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  initial={{ opacity: 0, y: 10 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="space-y-4"
                >
                  <motion.div
                    animate={{ scale: isDraggingFile ? 1.02 : 1 }}
                    className={`group relative flex min-h-[150px] flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${dropzoneTone} ${dropzoneState}`}
                    role="button"
                    tabIndex={dropzoneDisabled ? -1 : 0}
                    transition={{ type: "spring", stiffness: 240, damping: 18 }}
                    aria-disabled={dropzoneDisabled}
                    onClick={openFilePicker}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openFilePicker();
                      }
                    }}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                  >
                    <input
                      ref={fileInputRef}
                      accept={acceptedExtensionsAccept}
                      className="sr-only"
                      disabled={dropzoneDisabled}
                      type="file"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        handleFileSelection(file);
                        event.currentTarget.value = "";
                      }}
                    />
                    <AnimatePresence mode="wait">
                      {formState.file ? (
                        <motion.div
                          key="selected"
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          initial={{ opacity: 0, y: 6 }}
                          className="flex flex-col items-center gap-2 text-center"
                        >
                          <div className="flex items-center gap-2 text-success">
                            <CheckCircle2 className="h-5 w-5" />
                            <span className="text-sm font-medium text-success">
                              Arquivo selecionado
                            </span>
                          </div>
                          <p className="text-xs text-default-500">
                            {selectedFileLabel}
                          </p>
                          <p className="text-xs text-default-400">
                            Clique ou arraste outro arquivo para trocar.
                          </p>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="empty"
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -6 }}
                          initial={{ opacity: 0, y: 6 }}
                          className="flex flex-col items-center gap-2 text-center"
                        >
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <UploadCloud className="h-6 w-6" />
                          </div>
                          <p className="text-sm font-medium text-white">
                            {dropzoneDisabled
                              ? "Upload desativado pela politica"
                              : isDraggingFile
                                ? "Solte o certificado aqui"
                                : "Arraste o certificado aqui"}
                          </p>
                          <p className="text-xs text-default-500">
                            {dropzoneDisabled
                              ? "Fale com um administrador para liberar."
                              : `ou clique para selecionar (${acceptedExtensionsLabel})`}
                          </p>
                          {!dropzoneDisabled && (
                            <p className="text-[11px] text-default-400">
                              Limite maximo:{" "}
                              {formatBytes(MAX_CERTIFICATE_SIZE_BYTES)}
                            </p>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  {isSubmitting ? (
                    <UploadProgress
                      label="Enviando certificado"
                      description="Validando o arquivo e protegendo os dados sensíveis do certificado."
                    />
                  ) : null}

                  <Input
                    isDisabled={isSubmitting || !policyAllowsCurrent}
                    label="Senha do certificado"
                    placeholder="Informe a senha utilizada no órgão emissor"
                    startContent={<KeyRound className="h-4 w-4 text-primary" />}
                    type={isPasswordVisible ? "text" : "password"}
                    value={formState.password}
                    endContent={
                      <Button
                        isIconOnly
                        aria-label={
                          isPasswordVisible ? "Ocultar senha" : "Mostrar senha"
                        }
                        isDisabled={isSubmitting || !policyAllowsCurrent}
                        size="sm"
                        type="button"
                        variant="light"
                        onPress={togglePasswordVisibility}
                      >
                        {isPasswordVisible ? (
                          <EyeOff className="h-4 w-4 text-default-400" />
                        ) : (
                          <Eye className="h-4 w-4 text-default-400" />
                        )}
                      </Button>
                    }
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        password: event.target.value,
                      }))
                    }
                  />

                  <Input
                    isDisabled={isSubmitting || !policyAllowsCurrent}
                    label="Identificação interna (opcional)"
                    placeholder="Ex: Certificado Dra. Sandra 2025"
                    startContent={<Tag className="h-4 w-4 text-secondary" />}
                    value={formState.label}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        label: event.target.value,
                      }))
                    }
                  />

                  <DateInput
                    isDisabled={isSubmitting || !policyAllowsCurrent}
                    label="Validade (opcional)"
                    startContent={<Calendar className="h-4 w-4 text-warning"  />}
                    value={formState.validUntil}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        validUntil: event.target.value,
                      }))
                    }
                  />

                  <div className="flex items-center justify-between rounded-lg border border-default-200 bg-default-50 px-3 py-2 text-sm text-default-500">
                    <span>Ativar imediatamente após o upload</span>
                    <Switch
                      isDisabled={isSubmitting || !policyAllowsCurrent}
                      isSelected={formState.activate}
                      onValueChange={(value) =>
                        setFormState((prev) => ({ ...prev, activate: value }))
                      }
                    />
                  </div>

                  {formErrors && (
                    <p className="text-sm text-danger-400">{formErrors}</p>
                  )}

                  <motion.div
                    animate={{ opacity: 1, y: 0 }}
                    initial={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.25, ease: "easeOut", delay: 0.05 }}
                  >
                    <Card className="border border-emerald-500/20 bg-emerald-500/5">
                      <CardBody className="space-y-2 text-xs text-default-500">
                        <div className="flex items-center gap-2 text-emerald-200">
                          <Sparkles className="h-4 w-4" />
                          <p className="font-semibold text-emerald-100">
                            Boas praticas
                          </p>
                        </div>
                        <ul className="space-y-2 text-default-400">
                          <li className="flex items-start gap-2">
                            <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-300" />
                            <span>
                              Mantenha uma copia segura do arquivo original em
                              midia offline.
                            </span>
                          </li>
                          <li className="flex items-start gap-2">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                            <span>
                              O Magic Lawyer nao exibe o conteudo do certificado
                              apos o upload.
                            </span>
                          </li>
                          <li className="flex items-start gap-2">
                            <AlertTriangle className="mt-0.5 h-4 w-4 text-warning" />
                            <span>
                              Configure alertas de validade para evitar
                              indisponibilidade na integracao.
                            </span>
                          </li>
                        </ul>
                      </CardBody>
                    </Card>
                  </motion.div>
                </motion.div>
              </ModalBody>
              <ModalFooter className="flex items-center justify-between">
                <Button
                  isDisabled={isSubmitting || !policyAllowsCurrent}
                  variant="light"
                  onPress={() => {
                    resetForm();
                    onClose();
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  color="primary"
                  isDisabled={!policyAllowsCurrent}
                  isLoading={isSubmitting}
                  startContent={
                    isSubmitting ? <Spinner size="sm" color="white" /> : null
                  }
                  onPress={handleUpload}
                >
                  Salvar certificado
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <Modal
        isOpen={!!logsCertificateId}
        onClose={() => {
          setLogsCertificateId(null);
          setLogs([]);
        }}
        size="lg"
      >
        <ModalContent className="max-h-[80vh] w-[92vw] max-w-4xl">
          {(onClose) => (
            <>
              <ModalHeader className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                <span>Histórico do certificado</span>
              </ModalHeader>
              <ModalBody className="max-h-[65vh] overflow-y-auto pr-4">
                {isLoadingLogs ? (
                  <div className="flex min-h-[160px] items-center justify-center">
                    <Spinner color="primary" />
                  </div>
                ) : logs.length === 0 ? (
                  <div className="flex min-h-[160px] items-center justify-center text-sm text-default-500">
                    Nenhum evento registrado.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {logs.map((log) => (
                      <div
                        key={log.id}
                        className="rounded-lg border border-default-200 bg-default-50 p-4"
                      >
                        <div className="flex items-center justify-between">
                          <Chip
                            color="primary"
                            size="sm"
                            variant="flat"
                          >
                            {log.action}
                          </Chip>
                          <span className="text-xs text-default-500">
                            {formatDate(log.createdAt)}
                          </span>
                        </div>
                        {log.message && (
                          <>
                            <Divider className="my-2 border-default-200" />
                            <p className="text-sm text-default-600">
                              {log.message}
                            </p>
                          </>
                        )}
                        <div className="mt-3 text-xs text-default-500">
                          <span>Responsável: </span>
                          <span>{fullName(log.actor)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  Fechar
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}
