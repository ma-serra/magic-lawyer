"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { Button, Card, CardBody, CardHeader, Checkbox, Input, Select, SelectItem, Textarea } from "@heroui/react";
import { ArrowLeft, Save, Settings2 } from "lucide-react";

import { title } from "@/components/primitives";
import { toast } from "@/lib/toast";
import { fetchTenantBrandingFromDomain } from "@/lib/fetchers/tenant-branding";
import {
  createModeloPeticao,
  type ModeloPeticaoCreateInput,
} from "@/app/actions/modelos-peticao";
import {
  useCategoriasModeloPeticao,
  useTiposModeloPeticao,
} from "@/app/hooks/use-modelos-peticao";
import {
  mergeModeloPeticaoVariaveisWithConteudo,
  ModeloPeticaoDocumentWorkspace,
  normalizeModeloPeticaoVariaveis,
  type ModeloPeticaoVariavel,
} from "@/components/modelos-peticao/modelo-peticao-document-workspace";

const CATEGORIAS_PADRAO = [
  "INICIAL",
  "CONTESTACAO",
  "RECURSO",
  "MANIFESTACAO",
  "AGRAVO",
  "APELACAO",
  "EMBARGOS",
  "PETICAO_SIMPLES",
];

const TIPOS_PADRAO = [
  "CIVEL",
  "TRABALHISTA",
  "CRIMINAL",
  "TRIBUTARIO",
  "FAMILIA",
  "PREVIDENCIARIO",
  "EMPRESARIAL",
];

export default function NovoModeloPeticaoPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { categorias: categoriasExistentes } = useCategoriasModeloPeticao();
  const { tipos: tiposExistentes } = useTiposModeloPeticao();
  const { data: tenantBranding } = useSWR(
    "tenant-branding-from-domain",
    fetchTenantBrandingFromDomain,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
    },
  );

  const [formData, setFormData] = useState<ModeloPeticaoCreateInput>({
    nome: "",
    descricao: "",
    conteudo: "",
    categoria: "",
    tipo: "",
    publico: false,
    ativo: true,
  });
  const [variaveis, setVariaveis] = useState<ModeloPeticaoVariavel[]>([]);
  const [novaCategoria, setNovaCategoria] = useState("");
  const [novoTipo, setNovoTipo] = useState("");

  const todasCategorias = Array.from(
    new Set([...CATEGORIAS_PADRAO, ...categoriasExistentes]),
  );
  const todosTipos = Array.from(new Set([...TIPOS_PADRAO, ...tiposExistentes]));
  const branding = tenantBranding?.success ? tenantBranding.data : null;

  const handleSubmit = async () => {
    if (!formData.nome.trim()) {
      toast.error("Nome do modelo e obrigatorio");
      return;
    }

    if (!formData.conteudo.trim()) {
      toast.error("Conteudo do modelo e obrigatorio");
      return;
    }

    startTransition(async () => {
      const mergedVariaveis = mergeModeloPeticaoVariaveisWithConteudo(
        normalizeModeloPeticaoVariaveis(variaveis),
        formData.conteudo,
      );

      const payload: ModeloPeticaoCreateInput = {
        ...formData,
        categoria: novaCategoria.trim() || formData.categoria || undefined,
        tipo: novoTipo.trim() || formData.tipo || undefined,
        variaveis: mergedVariaveis.length > 0 ? mergedVariaveis : undefined,
      };

      const result = await createModeloPeticao(payload);

      if (!result.success) {
        toast.error(result.error || "Erro ao criar modelo");
        return;
      }

      toast.success("Modelo criado com sucesso");
      router.push("/modelos-peticao");
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={title()}>Novo Modelo de Peticao</h1>
          <p className="mt-1 text-sm text-default-500">
            Monte um documento reutilizavel com variaveis, preview e identidade do escritorio.
          </p>
        </div>
        <Button
          as={Link}
          href="/modelos-peticao"
          startContent={<ArrowLeft className="h-4 w-4" />}
          variant="light"
        >
          Voltar
        </Button>
      </div>

      <Card className="border border-default-200/80 bg-content1/90 dark:border-white/10 dark:bg-background/60">
        <CardHeader className="flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-primary" />
          <div>
            <p className="text-lg font-semibold">Configuracao do modelo</p>
            <p className="text-sm text-default-500">
              Defina nome, classificacao e regras de uso antes de montar o documento.
            </p>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <Input
            isRequired
            label="Nome do modelo"
            placeholder="Ex: Contestacao trabalhista padrao"
            value={formData.nome}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, nome: value }))}
          />

          <Textarea
            label="Descricao"
            minRows={2}
            placeholder="Quando usar este modelo e qual estrategia ele cobre."
            value={formData.descricao}
            onValueChange={(value) =>
              setFormData((prev) => ({ ...prev, descricao: value }))
            }
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Select
                label="Categoria"
                placeholder="Selecione uma categoria"
                selectedKeys={formData.categoria ? [formData.categoria] : []}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0] as string;
                  setFormData((prev) => ({ ...prev, categoria: value }));
                  setNovaCategoria("");
                }}
              >
                {todasCategorias.map((categoria) => (
                  <SelectItem key={categoria} textValue={categoria}>
                    {categoria}
                  </SelectItem>
                ))}
              </Select>
              <Input
                placeholder="Ou digite uma nova categoria"
                size="sm"
                value={novaCategoria}
                onValueChange={setNovaCategoria}
              />
            </div>

            <div className="space-y-2">
              <Select
                label="Tipo"
                placeholder="Selecione uma area ou rito"
                selectedKeys={formData.tipo ? [formData.tipo] : []}
                onSelectionChange={(keys) => {
                  const value = Array.from(keys)[0] as string;
                  setFormData((prev) => ({ ...prev, tipo: value }));
                  setNovoTipo("");
                }}
              >
                {todosTipos.map((tipo) => (
                  <SelectItem key={tipo} textValue={tipo}>
                    {tipo}
                  </SelectItem>
                ))}
              </Select>
              <Input
                placeholder="Ou digite um novo tipo"
                size="sm"
                value={novoTipo}
                onValueChange={setNovoTipo}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-5">
            <Checkbox
              isSelected={formData.ativo}
              onValueChange={(checked) =>
                setFormData((prev) => ({ ...prev, ativo: checked }))
              }
            >
              Modelo ativo
            </Checkbox>
            <Checkbox
              isSelected={formData.publico}
              onValueChange={(checked) =>
                setFormData((prev) => ({ ...prev, publico: checked }))
              }
            >
              Modelo publico do escritorio
            </Checkbox>
          </div>
        </CardBody>
      </Card>

      <ModeloPeticaoDocumentWorkspace
        branding={
          branding
            ? {
                name: branding.name,
                logoUrl: branding.logoUrl,
                primaryColor: branding.primaryColor,
                secondaryColor: branding.secondaryColor,
                accentColor: branding.accentColor,
              }
            : null
        }
        value={formData.conteudo}
        variaveis={variaveis}
        onChange={(conteudo) => setFormData((prev) => ({ ...prev, conteudo }))}
        onVariaveisChange={setVariaveis}
      />

      <div className="flex justify-end gap-3">
        <Button variant="light" onPress={() => router.push("/modelos-peticao")}>
          Cancelar
        </Button>
        <Button
          color="primary"
          isLoading={isPending}
          startContent={<Save className="h-4 w-4" />}
          onPress={handleSubmit}
        >
          Criar modelo
        </Button>
      </div>
    </div>
  );
}
