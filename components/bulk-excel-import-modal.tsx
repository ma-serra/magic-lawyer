"use client";

import { useRef, useState } from "react";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Button,
  Chip,
  Link,
} from "@heroui/react";
import { toast } from "@/lib/toast";
import { Download, UploadCloud } from "lucide-react";
import { UploadProgress } from "@/components/ui/upload-progress";

interface SampleField {
  label: string;
  description: string;
}

export interface BulkImportUploadResult {
  success: boolean;
  message?: string;
  totalRows?: number;
  importedCount?: number;
  failedCount?: number;
  errors?: string[];
  warnings?: string[];
}

interface BulkExcelImportModalProps {
  entityLabel: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  templateUrl: string;
  sampleFields: SampleField[];
  onUpload?: (file: File) => Promise<BulkImportUploadResult>;
}

export function BulkExcelImportModal({
  entityLabel,
  isOpen,
  onOpenChange,
  templateUrl,
  sampleFields,
  onUpload,
}: BulkExcelImportModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.warning("Selecione um arquivo .xlsx, .xls ou .csv para enviar.");
      return;
    }

    setIsUploading(true);
    try {
      if (onUpload) {
        const result = await onUpload(selectedFile);

        if (!result.success) {
          toast.error(result.message || "Não foi possível importar o arquivo.");
          if (result.errors?.length) {
            toast.error(result.errors[0]!);
          }

          return;
        }

        const importedCount = result.importedCount ?? 0;
        const failedCount = result.failedCount ?? 0;

        toast.success(
          result.message || `${importedCount} registro(s) importado(s).`,
        );

        if (failedCount > 0) {
          toast.warning(
            `${failedCount} linha(s) não puderam ser importadas.`,
          );
        }
      } else {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        toast.success(
          `${selectedFile.name} recebido! Processamento em lote será liberado em breve.`,
        );
      }

      setSelectedFile(null);
      onOpenChange(false);
    } catch (error) {
      toast.error("Não conseguimos processar o arquivo. Tente novamente.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} size="lg" onOpenChange={onOpenChange}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              Importar {entityLabel} via Excel
              <p className="text-sm font-normal text-default-500">
                Envie um arquivo conforme o modelo para cadastrar vários
                registros de uma vez só.
              </p>
            </ModalHeader>
            <ModalBody className="space-y-4">
              <div className="rounded-xl border border-default-200 bg-default-50/70 p-4 dark:border-default-100/40 dark:bg-default-50/5">
                <p className="text-sm font-semibold text-default-600 dark:text-default-200">
                  Passo a passo rápido
                </p>
                <ol className="mt-3 list-inside list-decimal space-y-1 text-sm text-default-500 dark:text-default-400">
                  <li>Baixe o modelo base e abra no Excel.</li>
                  <li>Preencha as colunas obrigatórias (uma linha por registro).</li>
                  <li>Salve como .xlsx ou .csv antes de enviar.</li>
                </ol>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  as={Link}
                  color="secondary"
                  href={templateUrl}
                  startContent={<Download className="h-4 w-4" />}
                  variant="flat"
                  download
                >
                  Baixar modelo
                </Button>
                <Button
                  color="primary"
                  startContent={<UploadCloud className="h-4 w-4" />}
                  variant="solid"
                  onPress={() => fileInputRef.current?.click()}
                >
                  Selecionar arquivo
                </Button>
                <input
                  ref={fileInputRef}
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  type="file"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      setSelectedFile(file);
                    }
                  }}
                />
              </div>

              {selectedFile && (
                <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary-700 dark:text-primary-200">
                  <span className="truncate">{selectedFile.name}</span>
                  <Chip color="primary" size="sm" variant="flat">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </Chip>
                </div>
              )}

              {isUploading ? (
                <UploadProgress
                  label="Enviando arquivo"
                  description="A planilha está sendo recebida e validada antes da importação."
                />
              ) : null}

              <div className="space-y-2">
                <p className="text-sm font-semibold text-default-600 dark:text-default-300">
                  Colunas do modelo
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {sampleFields.map((field) => (
                    <div
                      key={field.label}
                      className="rounded-xl border border-default-200 bg-white/80 p-3 text-sm dark:border-default-100/30 dark:bg-default-50/5"
                    >
                      <p className="font-semibold text-default-700 dark:text-white">
                        {field.label}
                      </p>
                      <p className="text-xs text-default-500 dark:text-default-400">
                        {field.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </ModalBody>
            <ModalFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button className="w-full sm:w-auto" variant="flat" onPress={onClose}>
                  Cancelar
                </Button>
                <Button
                  className="w-full whitespace-nowrap sm:w-auto"
                  color="primary"
                  isDisabled={!selectedFile}
                  isLoading={isUploading}
                  onPress={handleUpload}
                >
                  Enviar arquivo
                </Button>
              </div>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
