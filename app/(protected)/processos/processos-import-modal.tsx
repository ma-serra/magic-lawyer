"use client";

import { useCallback, useMemo, useRef, useState, DragEvent } from "react";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Button,
  Chip,
  Switch,
} from "@heroui/react";
import { addToast } from "@heroui/toast";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileWarning,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";

import { importarProcessosPlanilha } from "@/app/actions/processos-importacao";
import { gerarPlanilhaModeloProcessos } from "@/app/actions/processos-template";
import { UploadProgress } from "@/components/ui/upload-progress";

interface ProcessosImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImported?: () => void;
}

type ImportSummary =
  | Awaited<ReturnType<typeof importarProcessosPlanilha>>
  | null;

export function ProcessosImportModal({
  isOpen,
  onClose,
  onImported,
}: ProcessosImportModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [criarAcessoClientes, setCriarAcessoClientes] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [baixandoModelo, setBaixandoModelo] = useState(false);
  const [resultado, setResultado] = useState<ImportSummary>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetState = useCallback(() => {
    setSelectedFile(null);
    setCriarAcessoClientes(false);
    setIsDragging(false);
    setIsProcessing(false);
    setResultado(null);
  }, []);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleFileSelect = (file?: File | null) => {
    if (!file) return;

    const allowedTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "text/csv",
    ];

    if (!allowedTypes.includes(file.type) && !file.name.endsWith(".xls") && !file.name.endsWith(".xlsx") && !file.name.endsWith(".csv")) {
      addToast({
        title: "Formato não suportado",
        description: "Envie um arquivo .xls, .xlsx ou .csv.",
        color: "danger",
      });

      return;
    }

    setSelectedFile(file);
    setResultado(null);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      addToast({
        title: "Selecione um arquivo",
        description: "Arraste o arquivo ou clique em “Escolher arquivo”.",
        color: "warning",
      });
      return;
    }

    setIsProcessing(true);
    setResultado(null);

    try {
      const formData = new FormData();
      formData.append("arquivo", selectedFile);
      formData.append(
        "criarAcessoClientes",
        criarAcessoClientes ? "true" : "false",
      );

      const response = await importarProcessosPlanilha(formData);
      setResultado(response);

      if (response.success) {
        addToast({
          title: "Processos importados",
          description: `${response.createdProcessos + response.updatedProcessos} processos foram sincronizados.`,
          color: "success",
        });
        setSelectedFile(null);
        onImported?.();
      } else {
        addToast({
          title: "Importação não concluída",
          description:
            response.erros?.[0] ??
            "Revisamos o arquivo e encontramos inconsistências.",
          color: "danger",
        });
      }
    } catch (error) {
      addToast({
        title: "Erro ao importar",
        description: "Não foi possível processar a planilha. Tente novamente.",
        color: "danger",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const instructions = useMemo(
    () => [
      {
        title: "1. Baixe o modelo",
        description:
          "Clique em “Baixar modelo” para gerar um XLSX com as colunas corretas.",
      },
      {
        title: "2. Preencha os dados",
        description:
          "Cada linha representa um processo. Informe número, cliente, parte contrária e vara.",
      },
      {
        title: "3. Importe e revise",
        description:
          "Envie o arquivo e revise o relatório para ajustes pontuais.",
      },
    ],
    [],
  );

  const downloadBase64AsFile = (base64: string, fileName: string) => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i += 1) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleDownloadModelo = async () => {
    setBaixandoModelo(true);
    try {
      const { base64, fileName } = await gerarPlanilhaModeloProcessos();
      downloadBase64AsFile(base64, fileName);
      addToast({
        title: "Modelo gerado",
        description: "Planilha modelo baixada com sucesso.",
        color: "success",
      });
    } catch (error) {
      addToast({
        title: "Erro ao gerar modelo",
        description:
          "Não conseguimos gerar a planilha modelo agora. Tente novamente.",
        color: "danger",
      });
    } finally {
      setBaixandoModelo(false);
    }
  };

  const columnHighlights = useMemo(
    () => [
      {
        title: "Número do processo",
        description: "Formato completo (ex: 0001234-56.2024.8.26.0100).",
      },
      {
        title: "Autor (cliente)",
        description:
          "Nome completo do cliente responsável pela ação (obrigatório).",
      },
      {
        title: "E-mail do autor",
        description:
          "Obrigatório se desejar gerar acesso automático ao portal.",
      },
      {
        title: "Área e vara",
        description:
          "Usadas para classificar o processo e direcionar para o tribunal correto.",
      },
    ],
    [],
  );

  return (
    <Modal
      isOpen={isOpen}
      scrollBehavior="inside"
      size="4xl"
      onClose={handleClose}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          Importar processos via planilha
          <p className="text-sm font-normal text-default-500">
            Use o modelo oficial, arraste o arquivo para cá e deixe que o sistema
            crie processos e clientes automaticamente.
          </p>
        </ModalHeader>
        <ModalBody className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3">
            {instructions.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-default-200/70 bg-default-50/80 p-4 shadow-sm dark:border-default-100/30 dark:bg-default-50/10"
              >
                <p className="text-sm font-semibold text-default-700">
                  {item.title}
                </p>
                <p className="mt-1 text-xs text-default-500">
                  {item.description}
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              color="secondary"
              isLoading={baixandoModelo}
              startContent={<Download className="h-4 w-4" />}
              variant="flat"
              onPress={handleDownloadModelo}
            >
              Baixar planilha modelo
            </Button>
            <Button
              color="primary"
              startContent={<UploadCloud className="h-4 w-4" />}
              variant="solid"
              onPress={() => fileInputRef.current?.click()}
            >
              Escolher arquivo
            </Button>
            <input
              ref={fileInputRef}
              accept=".xlsx,.xls,.csv"
              className="hidden"
              type="file"
              onChange={(event) =>
                handleFileSelect(event.target.files?.[0] ?? null)
              }
            />
          </div>

          <div
            className={`rounded-2xl border-2 border-dashed p-6 text-center transition ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-default-200 bg-default-50/40"
            }`}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragging(false);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDrop={handleDrop}
          >
            {selectedFile ? (
              <div className="flex flex-col items-center gap-2">
                <FileSpreadsheet className="h-8 w-8 text-success" />
                <p className="text-sm font-semibold text-default-700">
                  {selectedFile.name}
                </p>
                <Chip color="success" size="sm" variant="flat">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </Chip>
                <Button
                  size="sm"
                  variant="bordered"
                  onPress={() => setSelectedFile(null)}
                >
                  Trocar arquivo
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <UploadCloud className="mx-auto h-8 w-8 text-default-400" />
                <p className="text-sm font-semibold text-default-600">
                  Arraste e solte aqui ou clique em “Escolher arquivo”
                </p>
                <p className="text-xs text-default-500">
                  Aceitamos .xls, .xlsx ou .csv com até 5MB
                </p>
              </div>
            )}
          </div>

          {isProcessing ? (
            <UploadProgress
              label="Importando planilha"
              description="Estamos validando os dados e sincronizando processos e clientes."
            />
          ) : null}

          <div className="rounded-2xl border border-default-200/70 bg-default-50/80 p-4 dark:border-default-100/20 dark:bg-default-50/10">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-default-700">
                  Criar acesso para os clientes importados?
                </p>
                <p className="text-xs text-default-500">
                  Ao ativar, criaremos acesso para cada cliente com e-mail
                  válido e enviaremos automaticamente o link de primeiro
                  acesso.
                </p>
              </div>
              <Switch
                isSelected={criarAcessoClientes}
                size="sm"
                onValueChange={setCriarAcessoClientes}
              >
                Criar acessos
              </Switch>
            </div>
            {criarAcessoClientes && (
              <p className="mt-2 flex items-center gap-2 text-xs text-warning">
                <ShieldCheck className="h-3.5 w-3.5" />
                O e-mail se torna obrigatório para criar o acesso automático.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-default-700">
              Colunas essenciais do modelo
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {columnHighlights.map((highlight) => (
                <div
                  key={highlight.title}
                  className="rounded-2xl border border-default-200/70 bg-white/80 p-4 text-sm shadow-sm dark:border-default-100/20 dark:bg-default-50/10"
                >
                  <p className="font-semibold text-default-700">
                    {highlight.title}
                  </p>
                  <p className="text-xs text-default-500">
                    {highlight.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {resultado && (
            <div className="space-y-3 rounded-2xl border border-success/30 bg-success/5 p-4">
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="h-5 w-5" />
                <p className="text-sm font-semibold">
                  Resumo da importação
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-success/30 bg-white/90 p-3 text-sm text-success-700 dark:bg-success/10 dark:text-success-200">
                  <p className="text-xs uppercase tracking-widest text-success/80">
                    Processos
                  </p>
                  <p className="text-lg font-semibold">
                    {resultado.createdProcessos} criados ·{" "}
                    {resultado.updatedProcessos} atualizados
                  </p>
                  {resultado.failedProcessos > 0 ? (
                    <p className="mt-1 text-xs text-warning-700 dark:text-warning-300">
                      {resultado.failedProcessos} processo(s) com falha
                    </p>
                  ) : null}
                </div>
                <div className="rounded-xl border border-success/30 bg-white/90 p-3 text-sm text-success-700 dark:bg-success/10 dark:text-success-200">
                  <p className="text-xs uppercase tracking-widest text-success/80">
                    Clientes e acessos
                  </p>
                  <p className="text-lg font-semibold">
                    {resultado.createdClientes} clientes ·{" "}
                    {resultado.createdUsuarios.length} acessos
                  </p>
                </div>
              </div>
              {resultado.createdUsuarios.length > 0 && (
                <div className="space-y-1 rounded-xl border border-default-200/70 bg-white/90 p-3 text-xs dark:bg-default-50/10">
                  <p className="text-sm font-semibold text-default-700">
                    Acessos criados
                  </p>
                  {resultado.createdUsuarios.map((credencial) => (
                    <div
                      key={credencial.email}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-default-200/60 bg-default-50/60 px-3 py-1.5"
                    >
                      <div>
                        <p className="text-sm font-semibold text-default-700">
                          {credencial.nome}
                        </p>
                        <p className="text-xs text-default-500">
                          {credencial.email}
                        </p>
                      </div>
                      <Chip
                        color={
                          credencial.statusEnvio === "LINK_ENVIADO"
                            ? "success"
                            : credencial.statusEnvio === "EMAIL_NAO_CONFIGURADO"
                              ? "warning"
                              : "danger"
                        }
                        size="sm"
                        variant="flat"
                      >
                        {credencial.statusEnvio === "LINK_ENVIADO"
                          ? "Link enviado"
                          : credencial.statusEnvio === "EMAIL_NAO_CONFIGURADO"
                            ? "E-mail pendente"
                            : "Falha no envio"}
                      </Chip>
                    </div>
                  ))}
                </div>
              )}
              {resultado.avisos.length > 0 && (
                <div className="rounded-xl border border-warning/40 bg-warning/5 p-3 text-xs text-warning-700 dark:bg-warning/10 dark:text-warning-300">
                  <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    Avisos durante a importação
                  </p>
                  <ul className="list-disc space-y-1 pl-5">
                    {resultado.avisos.slice(0, 4).map((aviso) => (
                      <li key={aviso}>{aviso}</li>
                    ))}
                  </ul>
                  {resultado.avisos.length > 4 && (
                    <p className="mt-1 text-[11px] uppercase tracking-wide text-warning-600">
                      +{resultado.avisos.length - 4} avisos adicionais
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {resultado?.erros && resultado.erros.length > 0 && (
            <div className="rounded-2xl border border-danger/30 bg-danger/5 p-3 text-sm text-danger-700">
              <p className="flex items-center gap-2 font-semibold">
                <FileWarning className="h-4 w-4" />
                Ocorreu um erro durante a importação
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                {resultado.erros.map((erro) => (
                  <li key={erro}>{erro}</li>
                ))}
              </ul>
            </div>
          )}
        </ModalBody>
        <ModalFooter className="flex flex-col gap-3 border-t border-default-200/60 pt-4 lg:flex-row lg:items-center lg:justify-between">
          <p className="w-full text-xs text-default-500 lg:w-auto lg:max-w-[65%]">
            Cada importação gera um log de auditoria com quantidade de clientes e
            processos sincronizados.
          </p>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:justify-end lg:w-auto lg:shrink-0">
            <Button className="whitespace-nowrap" variant="flat" onPress={handleClose}>
              Cancelar
            </Button>
            <Button
              className="min-w-[150px] whitespace-nowrap"
              color="primary"
              isDisabled={!selectedFile}
              isLoading={isProcessing}
              onPress={handleImport}
            >
              Importar agora
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
