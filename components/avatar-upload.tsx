"use client";

import { useState } from "react";
import { Avatar, Button } from "@heroui/react";
import { Edit3, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { useSession } from "next-auth/react";
import { UploadProgress } from "@/components/ui/upload-progress";

import { ImageEditorModal } from "./image-editor-modal";

import { uploadAvatar, deleteAvatar } from "@/app/actions/profile";

interface AvatarUploadProps {
  currentAvatarUrl?: string | null;
  userName: string;
  onAvatarChange: (avatarUrl: string) => void;
  disabled?: boolean;
}

export function AvatarUpload({
  currentAvatarUrl,
  userName,
  onAvatarChange,
  disabled = false,
}: AvatarUploadProps) {
  const { update: updateSession } = useSession();
  const [pendingAction, setPendingAction] = useState<"upload" | "delete" | null>(
    null,
  );
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const isLoading = pendingAction !== null;

  const handleSaveAvatar = async (
    imageData: string | FormData | null,
    isUrl: boolean,
  ) => {
    if (!imageData) return;

    setPendingAction("upload");
    setIsEditorOpen(false);

    try {
      let result;

      if (isUrl && typeof imageData === "string") {
        // Se for URL, criar um FormData com a URL
        const formData = new FormData();

        formData.append("url", imageData);
        result = await uploadAvatar(formData);
      } else if (imageData instanceof FormData) {
        // Se for FormData (arquivo original), usar diretamente
        result = await uploadAvatar(imageData);
      } else if (typeof imageData === "string") {
        // Se for base64 (crop), converter para blob
        const response = await fetch(imageData);
        const blob = await response.blob();
        const formData = new FormData();

        formData.append("file", blob, "avatar.jpg");
        result = await uploadAvatar(formData);
      } else {
        throw new Error("Tipo de dados inválido");
      }

      if (result.success) {
        toast.success("Avatar atualizado com sucesso!");
        onAvatarChange(result.avatarUrl || "");

        // Forçar atualização da sessão para atualizar o header
        if (result.sessionUpdated) {
          await updateSession();
          // Disparar evento customizado para atualizar o header
          window.dispatchEvent(
            new CustomEvent("avatarUpdated", {
              detail: { avatarUrl: "" },
            }),
          );
        }
      } else {
        toast.error(result.error || "Erro ao atualizar avatar");
      }
    } catch (error) {
      toast.error("Erro ao salvar avatar");
    } finally {
      setPendingAction(null);
    }
  };

  const handleDelete = async () => {
    if (!currentAvatarUrl) return;

    setPendingAction("delete");

    try {
      const result = await deleteAvatar(currentAvatarUrl);

      if (result.success) {
        toast.success("Avatar removido com sucesso!");
        onAvatarChange("");

        // Forçar atualização da sessão para atualizar o header
        if (result.sessionUpdated) {
          await updateSession();
          // Disparar evento customizado para atualizar o header
          window.dispatchEvent(
            new CustomEvent("avatarUpdated", {
              detail: { avatarUrl: "" },
            }),
          );
        }
      } else {
        toast.error(result.error || "Erro ao remover avatar");
      }
    } catch (error) {
      toast.error("Erro ao remover avatar");
    } finally {
      setPendingAction(null);
    }
  };

  // Verificar se é uma URL externa (não pode ser deletada)
  const isExternalUrl = (url: string): boolean => {
    try {
      const urlObj = new URL(url);

      return (
        !urlObj.hostname.includes("cloudinary.com") &&
        !urlObj.hostname.includes("res.cloudinary.com")
      );
    } catch {
      return false;
    }
  };

  return (
    <>
      <div className="flex flex-col items-center gap-4">
        <Avatar
          isBordered
          className="w-20 h-20"
          color="primary"
          name={userName}
          size="lg"
          src={currentAvatarUrl || undefined}
        />

        <div className="flex gap-2">
          <Button
            color="primary"
            isDisabled={disabled || isLoading}
            size="sm"
            startContent={<Edit3 className="w-4 h-4" />}
            variant="bordered"
            onPress={() => setIsEditorOpen(true)}
          >
            Editar Avatar
          </Button>

          {currentAvatarUrl && !isExternalUrl(currentAvatarUrl) && (
            <Button
              color="danger"
              isDisabled={disabled || isLoading}
              size="sm"
              startContent={<Trash2 className="w-4 h-4" />}
              variant="bordered"
              onPress={handleDelete}
            >
              Remover
            </Button>
          )}
        </div>

        <div className="text-center">
          <p className="text-xs text-default-400">JPG, PNG, WebP ou URL</p>
          <p className="text-xs text-default-400">Máximo 5MB</p>
          {currentAvatarUrl && isExternalUrl(currentAvatarUrl) && (
            <p className="text-xs text-warning-500 mt-1">
              ⚠️ URL externa - não pode ser removida
            </p>
          )}
        </div>

        {pendingAction === "upload" ? (
          <UploadProgress
            className="w-full max-w-56"
            label="Enviando avatar"
            description="Aguarde a atualização da foto no perfil."
          />
        ) : null}
      </div>

      <ImageEditorModal
        currentImageUrl={currentAvatarUrl}
        isOpen={isEditorOpen}
        onClose={() => setIsEditorOpen(false)}
        onSave={handleSaveAvatar}
      />
    </>
  );
}
