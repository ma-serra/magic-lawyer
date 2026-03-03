"use client";

import React, { use } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, CardHeader } from "@heroui/card";
import { Button } from "@heroui/button";
import { Chip } from "@heroui/chip";
import { Divider } from "@heroui/divider";
import { Spinner } from "@heroui/spinner";
import {
  ArrowLeft,
  Edit,
  FileText,
  Eye,
  Download,
  User,
  Building2,
  Calendar,
  DollarSign,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";

import { getContratoById } from "@/app/actions/contratos";
import { DateUtils } from "@/app/lib/date-utils";
import { title } from "@/components/primitives";

const STATUS_CONFIG = {
  ATIVO: { label: "Ativo", color: "success" as const },
  RASCUNHO: { label: "Rascunho", color: "warning" as const },
  SUSPENSO: { label: "Suspenso", color: "default" as const },
  CANCELADO: { label: "Cancelado", color: "danger" as const },
  ENCERRADO: { label: "Encerrado", color: "default" as const },
};

export default function ContratoPage({
  params,
}: {
  params: Promise<{ contratoId: string }>;
}) {
  const router = useRouter();
  const resolvedParams = use(params);
  const contratoId = resolvedParams.contratoId;

  const [contrato, setContrato] = React.useState<any>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    async function loadContrato() {
      setIsLoading(true);
      try {
        const result = await getContratoById(contratoId);

        if (result.success && result.contrato) {
          setContrato(result.contrato);
        } else {
          setError(result.error || "Erro ao carregar contrato");
        }
      } catch (err) {
        setError("Erro ao carregar contrato");
      } finally {
        setIsLoading(false);
      }
    }

    loadContrato();
  }, [contratoId]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <Spinner label="Carregando contrato..." size="lg" />
      </div>
    );
  }

  if (error || !contrato) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertCircle className="h-12 w-12 text-danger" />
        <p className="text-lg font-semibold text-danger">
          {error || "Contrato não encontrado"}
        </p>
        <Button color="primary" onPress={() => router.push("/contratos")}>
          Voltar para Contratos
        </Button>
      </div>
    );
  }

  const statusConfig =
    STATUS_CONFIG[contrato.status as keyof typeof STATUS_CONFIG] ||
    STATUS_CONFIG.RASCUNHO;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            isIconOnly
            as={Link}
            href="/contratos"
            startContent={<ArrowLeft className="h-4 w-4" />}
            variant="light"
          />
          <div>
            <h1 className={title()}>{contrato.titulo}</h1>
            <p className="text-sm text-default-500 mt-1">
              Visualização do contrato
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            as={Link}
            color="primary"
            href={`/contratos/${contratoId}/editar`}
            startContent={<Edit className="h-4 w-4" />}
          >
            Editar Contrato
          </Button>
        </div>
      </div>

      {/* Card Principal */}
      <Card>
        <CardHeader className="flex gap-3">
          <FileText className="h-6 w-6 text-primary" />
          <div className="flex flex-col flex-1">
            <p className="text-lg font-semibold">{contrato.titulo}</p>
            <Chip color={statusConfig.color} size="sm" variant="flat">
              {statusConfig.label}
            </Chip>
          </div>
        </CardHeader>
        <Divider />
        <CardBody className="gap-6">
          {/* Informações do Cliente */}
          <div>
            <h3 className="text-sm font-semibold text-default-600 mb-3">
              👤 Cliente
            </h3>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-default-100">
              {contrato.cliente.tipoPessoa === "JURIDICA" ? (
                <Building2 className="h-5 w-5 text-default-500" />
              ) : (
                <User className="h-5 w-5 text-default-500" />
              )}
              <div className="flex-1">
                <p className="font-semibold">{contrato.cliente.nome}</p>
                <p className="text-xs text-default-500">
                  {contrato.cliente.tipoPessoa === "JURIDICA"
                    ? "Pessoa Jurídica"
                    : "Pessoa Física"}
                </p>
                {contrato.cliente.documento && (
                  <p className="text-xs text-default-500 mt-1">
                    Doc: {contrato.cliente.documento}
                  </p>
                )}
                {contrato.cliente.email && (
                  <p className="text-xs text-default-500">
                    Email: {contrato.cliente.email}
                  </p>
                )}
              </div>
            </div>
          </div>

          <Divider />

          {/* Informações do Contrato */}
          <div>
            <h3 className="text-sm font-semibold text-default-600 mb-3">
              📄 Informações do Contrato
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {contrato.valor && (
                <div className="flex items-start gap-2">
                  <DollarSign className="h-4 w-4 text-default-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-default-500">Valor</p>
                    <p className="font-semibold">
                      R${" "}
                      {contrato.valor.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                </div>
              )}

              {contrato.tipo && (
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-default-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-default-500">Tipo de Contrato</p>
                    <p className="font-semibold">{contrato.tipo.nome}</p>
                  </div>
                </div>
              )}

              {contrato.modelo && (
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-default-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-default-500">Modelo utilizado</p>
                    <p className="font-semibold">{contrato.modelo.nome}</p>
                  </div>
                </div>
              )}

              {contrato.dataInicio && (
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 text-default-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-default-500">Data de Início</p>
                    <p className="font-semibold">
                      {DateUtils.formatDate(contrato.dataInicio)}
                    </p>
                  </div>
                </div>
              )}

              {contrato.dataFim && (
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 text-default-400 mt-0.5" />
                  <div>
                    <p className="text-xs text-default-500">Data de Término</p>
                    <p className="font-semibold">
                      {DateUtils.formatDate(contrato.dataFim)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Resumo */}
          {contrato.resumo && (
            <>
              <Divider />
              <div>
                <h3 className="text-sm font-semibold text-default-600 mb-2">
                  📝 Resumo
                </h3>
                <p className="text-sm text-default-700 whitespace-pre-wrap">
                  {contrato.resumo}
                </p>
              </div>
            </>
          )}

          {/* Documento do Contrato */}
          {contrato.arquivoUrl ? (
            <>
              <Divider />
              <div>
                <h3 className="text-sm font-semibold text-default-600 mb-3">
                  📎 Documento do Contrato
                </h3>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      as="a"
                      href={contrato.arquivoUrl}
                      rel="noopener noreferrer"
                      startContent={<Eye className="h-4 w-4" />}
                      target="_blank"
                      variant="flat"
                    >
                      Abrir PDF
                    </Button>
                    <Button
                      as="a"
                      href={contrato.arquivoUrl}
                      rel="noopener noreferrer"
                      startContent={<Download className="h-4 w-4" />}
                      target="_blank"
                      variant="solid"
                    >
                      Baixar PDF
                    </Button>
                  </div>
                  <div className="rounded-lg border border-default-200 overflow-hidden">
                    <iframe
                      className="h-80 w-full"
                      src={contrato.arquivoUrl}
                      title="Visualização do contrato em PDF"
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <Divider />
              <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning-700">
                <p className="font-medium">
                  Este contrato ainda não possui PDF anexado.
                </p>
                <p className="text-xs mt-1">
                  Você pode anexar um PDF na criação deste contrato ou na tela de
                  edição.
                </p>
              </div>
            </>
          )}

          {/* Advogado Responsável */}
          {contrato.advogadoResponsavel && (
            <>
              <Divider />
              <div>
                <h3 className="text-sm font-semibold text-default-600 mb-3">
                  ⚖️ Advogado Responsável
                </h3>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-default-100">
                  <User className="h-5 w-5 text-default-500" />
                  <div>
                    <p className="font-semibold">
                      {contrato.advogadoResponsavel.usuario.firstName}{" "}
                      {contrato.advogadoResponsavel.usuario.lastName}
                    </p>
                    {contrato.advogadoResponsavel.oabNumero && (
                      <p className="text-xs text-default-500">
                        OAB: {contrato.advogadoResponsavel.oabNumero}/
                        {contrato.advogadoResponsavel.oabUf}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Processo e Procuração Vinculados */}
          {contrato.processo && (
            <>
              <Divider />
              <div>
                <h3 className="text-sm font-semibold text-default-600 mb-3">
                  📋 Processo e Procuração
                </h3>
                <div className="space-y-3">
                  {/* Processo */}
                  <div className="p-3 rounded-lg bg-default-100">
                    <p className="text-xs text-default-500 mb-1">
                      Processo vinculado
                    </p>
                    <p className="font-semibold">{contrato.processo.numero}</p>
                    {contrato.processo.titulo && (
                      <p className="text-xs text-default-500 mt-1">
                        {contrato.processo.titulo}
                      </p>
                    )}
                    <Chip className="mt-2" size="sm" variant="flat">
                      {contrato.processo.status}
                    </Chip>
                  </div>

                  {/* Procurações */}
                  <div className="p-3 rounded-lg bg-default-50 border border-default-200">
                    <p className="text-xs text-default-500 mb-2">
                      Procurações vinculadas a este processo
                    </p>
                    {contrato.processo.procuracoesVinculadas &&
                    contrato.processo.procuracoesVinculadas.length > 0 ? (
                      <div className="flex items-center gap-2 text-success">
                        <span className="text-sm font-medium">
                          ✓ {contrato.processo.procuracoesVinculadas.length}{" "}
                          procuração(ões) vinculada(s)
                        </span>
                      </div>
                    ) : (
                      <div className="text-warning">
                        <p className="text-sm font-medium">
                          ⚠️ Este processo ainda não possui procurações
                          vinculadas
                        </p>
                        <p className="text-xs text-default-500 mt-1">
                          É recomendado vincular uma procuração ao processo
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Observações */}
          {contrato.observacoes && (
            <>
              <Divider />
              <div>
                <h3 className="text-sm font-semibold text-default-600 mb-2">
                  💬 Observações
                </h3>
                <p className="text-sm text-default-700 whitespace-pre-wrap">
                  {contrato.observacoes}
                </p>
              </div>
            </>
          )}

          {/* Faturas */}
          {contrato.faturas && contrato.faturas.length > 0 && (
            <>
              <Divider />
              <div>
                <h3 className="text-sm font-semibold text-default-600 mb-3">
                  💰 Faturas ({contrato.faturas.length})
                </h3>
                <div className="grid gap-2">
                  {contrato.faturas.map((fatura: any) => (
                    <div
                      key={fatura.id}
                      className="p-3 rounded-lg bg-default-100 flex items-center justify-between"
                    >
                      <div>
                        <p className="text-sm font-semibold">{fatura.numero}</p>
                        <p className="text-xs text-default-500">
                          Vencimento: {DateUtils.formatDate(fatura.vencimento)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">
                          R${" "}
                          {fatura.valor.toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                        <Chip
                          color={
                            fatura.status === "PAGO" ? "success" : "warning"
                          }
                          size="sm"
                          variant="flat"
                        >
                          {fatura.status}
                        </Chip>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
