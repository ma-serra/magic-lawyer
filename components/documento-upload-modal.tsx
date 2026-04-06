"use client";

import React, { useState } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, } from "@heroui/modal";
import { Button } from "@heroui/button";
import { Input } from "@heroui/input";
import { Textarea } from "@heroui/input";

import { Upload, FileText, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { UploadProgress } from "@/components/ui/upload-progress";

import {
  useUploadDocumentoProcuracao,
  TIPOS_DOCUMENTO,
} from "@/app/hooks/use-documentos-procuracao";
import { Select, SelectItem } from "@heroui/react";

interface DocumentoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  procuracaoId: string;
  onSuccess?: () => void;
}

export default function DocumentoUploadModal({
  isOpen,
  onClose,
  procuracaoId,
  onSuccess,
}: DocumentoUploadModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [description, setDescription] = useState("");
  const [tipo, setTipo] =
    useState<(typeof TIPOS_DOCUMENTO)[number]["value"]>("documento_original");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { upload, isUploading } = useUploadDocumentoProcuracao();

  const isPdfFile = (file: File) => {
    const mimeType = file.type?.toLowerCase() || "";
    const hasPdfMime = mimeType === "application/pdf";
    const hasPdfExtension = file.name.toLowerCase().endsWith(".pdf");

    return hasPdfMime || hasPdfExtension;
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (file) {
      // Validar tipo de arquivo
      if (!isPdfFile(file)) {
        toast.error("Apenas arquivos PDF são permitidos");
        event.target.value = "";

        return;
      }

      // Validar tamanho (máximo 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB

      if (file.size > maxSize) {
        toast.error("Arquivo muito grande. Máximo permitido: 10MB");

        return;
      }

      setSelectedFile(file);

      // Definir nome do arquivo baseado no nome original
      if (!fileName) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");

        setFileName(nameWithoutExt);
      }
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      toast.error("Selecione um arquivo");

      return;
    }

    if (!fileName.trim()) {
      toast.error("Digite um nome para o arquivo");

      return;
    }

    setIsSubmitting(true);

    try {
      // Criar FormData
      const formData = new FormData();

      formData.append("file", selectedFile);

      // Fazer upload
      await upload({
        procuracaoId,
        formData,
        options: {
          fileName: fileName.trim(),
          description: description.trim() || undefined,
          tipo,
        },
      });

      toast.success("Documento enviado com sucesso!");

      // Limpar formulário
      setSelectedFile(null);
      setFileName("");
      setDescription("");
      setTipo("documento_original");

      // Fechar modal e chamar callback
      onClose();
      onSuccess?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao enviar documento",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting && !isUploading) {
      setSelectedFile(null);
      setFileName("");
      setDescription("");
      setTipo("documento_original");
      onClose();
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <Modal isOpen={isOpen} size="md" onOpenChange={handleClose}>
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-semibold">Anexar Documento</h3>
              </div>
              <p className="text-sm text-default-500">
                Faça upload de um documento PDF para esta procuração
              </p>
            </ModalHeader>

            <ModalBody className="space-y-4">
              {/* Tipo de Documento */}
              <Select
                label="Tipo de Documento"
                placeholder="Selecione o tipo"
                selectedKeys={[tipo]}
                onSelectionChange={(keys) => {
                  const selected = Array.from(
                    keys,
                  )[0] as (typeof TIPOS_DOCUMENTO)[number]["value"];

                  setTipo(selected);
                }}
              >
                {TIPOS_DOCUMENTO.map((tipo) => (
                  <SelectItem key={tipo.value} textValue={tipo.label}>
                    <div className="flex flex-col">
                      <span className="font-medium">{tipo.label}</span>
                      <span className="text-xs text-default-400">
                        {tipo.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </Select>

              {/* Nome do Arquivo */}
              <Input
                isRequired
                label="Nome do Arquivo"
                placeholder="Ex: Procuração Assinada"
                value={fileName}
                onValueChange={setFileName}
              />

              {/* Upload de Arquivo */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Arquivo PDF</p>
                <div className="border-2 border-dashed border-default-300 rounded-lg p-6 text-center hover:border-primary transition-colors">
                  <input
                    accept=".pdf"
                    className="hidden"
                    disabled={isSubmitting || isUploading}
                    id="file-upload"
                    type="file"
                    onChange={handleFileChange}
                  />
                  <label className="cursor-pointer" htmlFor="file-upload">
                    {selectedFile ? (
                      <div className="space-y-2">
                        <FileText className="h-8 w-8 text-primary mx-auto" />
                        <div>
                          <p className="font-medium text-default-900">
                            {selectedFile.name}
                          </p>
                          <p className="text-sm text-default-500">
                            {formatFileSize(selectedFile.size)}
                          </p>
                        </div>
                        <Button
                          color="danger"
                          isDisabled={isSubmitting || isUploading}
                          size="sm"
                          startContent={<X className="h-3 w-3" />}
                          variant="light"
                          onPress={() => setSelectedFile(null)}
                        >
                          Remover
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="h-8 w-8 text-default-400 mx-auto" />
                        <div>
                          <p className="text-sm font-medium text-default-600">
                            Clique para selecionar um arquivo PDF
                          </p>
                          <p className="text-xs text-default-400">
                            Máximo 10MB
                          </p>
                        </div>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              {/* Descrição */}
              <Textarea
                label="Descrição (opcional)"
                minRows={2}
                placeholder="Adicione uma descrição sobre o documento..."
                value={description}
                onValueChange={setDescription}
              />
              {isSubmitting || isUploading ? (
                <UploadProgress
                  label="Enviando documento"
                  description="Validando o PDF e vinculando o arquivo a esta procuração."
                />
              ) : null}
            </ModalBody>

            <ModalFooter>
              <Button
                isDisabled={isSubmitting || isUploading}
                variant="light"
                onPress={handleClose}
              >
                Cancelar
              </Button>
              <Button
                color="primary"
                isDisabled={!selectedFile || !fileName.trim()}
                isLoading={isSubmitting || isUploading}
                startContent={
                  !isSubmitting && !isUploading ? (
                    <Upload className="h-4 w-4" />
                  ) : undefined
                }
                onPress={handleSubmit}
              >
                {isSubmitting || isUploading
                  ? "Enviando..."
                  : "Enviar Documento"}
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
