"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal, ModalBody, ModalContent, ModalFooter, ModalHeader, Button, Card, CardBody, Chip, Input, Spinner, Select, SelectItem } from "@heroui/react";
import { addToast } from "@heroui/toast";
import {
  Bot,
  History,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

import {
  listarHistoricoSincronizacaoOab,
  listarTribunaisSincronizacaoOab,
  resolverCaptchaSincronizacaoOab,
  sincronizarProcessosIniciaisPorOab,
  type SincronizacaoInicialHistoricoItem,
  type SincronizacaoInicialOabResponse,
  type TribunalSincronizacaoOption,
} from "@/app/actions/processos-sincronizacao-oab";

interface ProcessosSyncOabModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSynced?: () => void;
}

const statusMeta: Record<
  "SUCESSO" | "ERRO" | "PENDENTE_CAPTCHA" | "AGUARDANDO_WEBHOOK",
  { color: "success" | "danger" | "warning" | "primary"; label: string }
> = {
  SUCESSO: { color: "success", label: "Sucesso" },
  ERRO: { color: "danger", label: "Erro" },
  PENDENTE_CAPTCHA: { color: "warning", label: "Captcha pendente" },
  AGUARDANDO_WEBHOOK: { color: "primary", label: "Aguardando webhook" },
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function ProcessosSyncOabModal({
  isOpen,
  onClose,
  onSynced,
}: ProcessosSyncOabModalProps) {
  const [tribunais, setTribunais] = useState<TribunalSincronizacaoOption[]>(
    [],
  );
  const [historico, setHistorico] = useState<SincronizacaoInicialHistoricoItem[]>(
    [],
  );
  const [tribunalSigla, setTribunalSigla] = useState("TJSP");
  const [oab, setOab] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [captchaText, setCaptchaText] = useState("");
  const [resultado, setResultado] =
    useState<SincronizacaoInicialOabResponse | null>(null);
  const [captchaId, setCaptchaId] = useState<string | null>(null);
  const [captchaImage, setCaptchaImage] = useState<string | undefined>(
    undefined,
  );
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isResolvingCaptcha, setIsResolvingCaptcha] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const resetState = useCallback(() => {
    setTribunalSigla("TJSP");
    setOab("");
    setClienteNome("");
    setCaptchaText("");
    setResultado(null);
    setCaptchaId(null);
    setCaptchaImage(undefined);
  }, []);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const loadHistorico = useCallback(async () => {
    setIsLoadingHistory(true);

    try {
      const response = await listarHistoricoSincronizacaoOab();
      if (response.success) {
        setHistorico(response.itens);
      } else {
        setHistorico([]);
      }
    } catch (error) {
      setHistorico([]);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  const loadBootData = useCallback(async () => {
    setIsBootstrapping(true);

    try {
      const [tribunaisResponse, historicoResponse] = await Promise.all([
        listarTribunaisSincronizacaoOab(),
        listarHistoricoSincronizacaoOab(),
      ]);

      if (tribunaisResponse.success) {
        setTribunais(tribunaisResponse.tribunais);

        if (tribunaisResponse.tribunais.length > 0) {
          const hasCurrent = tribunaisResponse.tribunais.some(
            (item) => item.sigla === tribunalSigla,
          );
          if (!hasCurrent) {
            setTribunalSigla(tribunaisResponse.tribunais[0].sigla);
          }
        }
      } else {
        setTribunais([]);
      }

      if (historicoResponse.success) {
        setHistorico(historicoResponse.itens);
      } else {
        setHistorico([]);
      }
    } catch (error) {
      setTribunais([]);
      setHistorico([]);
    } finally {
      setIsBootstrapping(false);
    }
  }, [tribunalSigla]);

  useEffect(() => {
    if (!isOpen) return;
    void loadBootData();
  }, [isOpen, loadBootData]);

  const processosPreview = useMemo(
    () => (resultado?.processosNumeros ?? []).slice(0, 6),
    [resultado],
  );

  const executarSincronizacao = async () => {
    setIsSyncing(true);
    setResultado(null);
    setCaptchaId(null);
    setCaptchaImage(undefined);
    setCaptchaText("");

    try {
      const response = await sincronizarProcessosIniciaisPorOab({
        tribunalSigla,
        oab,
        clienteNome: clienteNome.trim() || undefined,
      });

      setResultado(response);

      if (response.success) {
        if (response.monitoramentoRegistrado) {
          addToast({
            title: "Monitoramento registrado",
            description:
              response.message ||
              "O Jusbrasil vai enviar os processos por webhook assim que concluir a coleta.",
            color: "primary",
          });
          await loadHistorico();
          onSynced?.();
          return;
        }

        addToast({
          title: "Sincronização concluída",
          description: `${response.syncedCount ?? 0} processo(s) sincronizado(s) com sucesso.`,
          color: "success",
        });
        await loadHistorico();
        onSynced?.();
        return;
      }

      if (response.captchaRequired && response.captchaId) {
        setCaptchaId(response.captchaId);
        setCaptchaImage(response.captchaImage);
        addToast({
          title: "Captcha obrigatório",
          description:
            response.error ||
            "Informe o captcha para continuar a sincronização no e-SAJ.",
          color: "warning",
        });
        return;
      }

      addToast({
        title: "Falha na sincronização",
        description: response.error || "Não foi possível sincronizar os processos.",
        color: "danger",
      });
      await loadHistorico();
    } catch (error) {
      addToast({
        title: "Erro interno",
        description: "Não foi possível iniciar a sincronização agora.",
        color: "danger",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const resolverCaptcha = async () => {
    if (!captchaId) {
      addToast({
        title: "Captcha ausente",
        description: "Inicie uma sincronização que exija captcha antes de validar.",
        color: "warning",
      });
      return;
    }

    if (!captchaText.trim()) {
      addToast({
        title: "Digite o captcha",
        description: "Informe os caracteres da imagem para validar.",
        color: "warning",
      });
      return;
    }

    setIsResolvingCaptcha(true);

    try {
      const response = await resolverCaptchaSincronizacaoOab({
        tribunalSigla,
        oab,
        clienteNome: clienteNome.trim() || undefined,
        captchaId,
        captchaText: captchaText.trim(),
      });

      setResultado(response);

      if (response.success) {
        setCaptchaId(null);
        setCaptchaImage(undefined);
        setCaptchaText("");

        addToast({
          title: "Captcha validado",
          description: `${response.syncedCount ?? 0} processo(s) sincronizado(s) após validação.`,
          color: "success",
        });
        await loadHistorico();
        onSynced?.();
        return;
      }

      addToast({
        title: "Captcha inválido",
        description: response.error || "Não foi possível concluir a validação.",
        color: "danger",
      });
      await loadHistorico();
    } catch (error) {
      addToast({
        title: "Erro interno",
        description: "Falha ao validar captcha.",
        color: "danger",
      });
    } finally {
      setIsResolvingCaptcha(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      scrollBehavior="inside"
      size="3xl"
      onClose={handleClose}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-1">
          Sincronização inicial de processos (OAB)
          <p className="text-sm font-normal text-default-500">
            Execute a captura em lote por tribunal e OAB para trazer os processos
            públicos para o sistema com histórico auditável.
          </p>
        </ModalHeader>

        <ModalBody className="space-y-4">
          <Card className="border border-default-200/70 bg-default-50/70">
            <CardBody className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-default-200/70 bg-content1 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-default-500">
                  1. Selecione o tribunal
                </p>
                <p className="mt-1 text-xs text-default-500">
                  Use o tribunal com consulta pública por e-SAJ.
                </p>
              </div>
              <div className="rounded-xl border border-default-200/70 bg-content1 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-default-500">
                  2. Informe a OAB
                </p>
                <p className="mt-1 text-xs text-default-500">
                  Exemplo: 123456SP. Se vazio, usamos a OAB do advogado logado.
                </p>
              </div>
              <div className="rounded-xl border border-default-200/70 bg-content1 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-default-500">
                  3. Sincronize e audite
                </p>
                <p className="mt-1 text-xs text-default-500">
                  O histórico registra sucesso, erros e pendências de captcha.
                </p>
              </div>
            </CardBody>
          </Card>

          <div className="grid gap-3 md:grid-cols-2">
            <Select
              isDisabled={isBootstrapping || isSyncing || isResolvingCaptcha}
              label="Tribunal"
              placeholder="Selecione o tribunal"
              selectedKeys={tribunalSigla ? [tribunalSigla] : []}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as string;
                setTribunalSigla(selected || "");
              }}
            >
              {tribunais.map((tribunal) => (
                <SelectItem key={tribunal.sigla} textValue={tribunal.sigla}>
                  {tribunal.sigla} · {tribunal.nome} ({tribunal.uf})
                </SelectItem>
              ))}
            </Select>

            <Input
              isDisabled={isSyncing || isResolvingCaptcha}
              label="OAB (opcional)"
              placeholder="Ex: 123456SP"
              value={oab}
              onChange={(event) => setOab(event.target.value)}
            />
          </div>

          <Input
            isDisabled={isSyncing || isResolvingCaptcha}
            label="Cliente padrão (opcional)"
            placeholder="Se informado, vincula como cliente padrão da importação"
            value={clienteNome}
            onChange={(event) => setClienteNome(event.target.value)}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              color="primary"
              isDisabled={!tribunalSigla || tribunais.length === 0}
              isLoading={isSyncing}
              startContent={<RefreshCw className="h-4 w-4" />}
              onPress={executarSincronizacao}
            >
              Sincronizar agora
            </Button>
            <Button
              isLoading={isBootstrapping}
              startContent={<History className="h-4 w-4" />}
              variant="flat"
              onPress={() => loadHistorico()}
            >
              Atualizar histórico
            </Button>
          </div>

          {captchaId && (
            <Card className="border border-warning/40 bg-warning/5">
              <CardBody className="space-y-3">
                <div className="flex items-center gap-2 text-warning-700">
                  <ShieldAlert className="h-4 w-4" />
                  <p className="text-sm font-semibold">
                    Captcha necessário para continuar
                  </p>
                </div>

                {captchaImage ? (
                  <img
                    alt="Captcha e-SAJ"
                    className="h-16 w-48 rounded-md border border-warning/30 bg-white object-contain p-1"
                    src={captchaImage}
                  />
                ) : (
                  <p className="text-xs text-warning-700">
                    O tribunal exigiu captcha, mas não retornou imagem. Gere uma
                    nova tentativa para obter um código válido.
                  </p>
                )}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    className="sm:flex-1"
                    isDisabled={isResolvingCaptcha}
                    label="Código do captcha"
                    placeholder="Digite os caracteres exibidos"
                    value={captchaText}
                    onChange={(event) => setCaptchaText(event.target.value)}
                  />
                  <Button
                    className="sm:self-end"
                    color="warning"
                    isLoading={isResolvingCaptcha}
                    onPress={resolverCaptcha}
                  >
                    Validar captcha
                  </Button>
                </div>
              </CardBody>
            </Card>
          )}

          {resultado && (
            <Card
              className={`border ${
                resultado.monitoramentoRegistrado
                  ? "border-primary/30 bg-primary/5"
                  : resultado.success
                    ? "border-success/30 bg-success/5"
                  : "border-danger/30 bg-danger/5"
              }`}
            >
              <CardBody className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    Resultado da última execução
                  </p>
                  <Chip
                    color={
                      resultado.monitoramentoRegistrado
                        ? "primary"
                        : resultado.success
                          ? "success"
                          : "danger"
                    }
                    variant="flat"
                  >
                    {resultado.monitoramentoRegistrado
                      ? "Aguardando webhook"
                      : resultado.success
                        ? "Concluido"
                        : "Falha"}
                  </Chip>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-default-200/70 bg-content1 p-3">
                    <p className="text-xs uppercase tracking-wide text-default-500">
                      Capturados
                    </p>
                    <p className="text-lg font-semibold">
                      {resultado.syncedCount ?? 0}
                    </p>
                  </div>
                  <div className="rounded-xl border border-default-200/70 bg-content1 p-3">
                    <p className="text-xs uppercase tracking-wide text-default-500">
                      Criados
                    </p>
                    <p className="text-lg font-semibold text-success">
                      {resultado.createdCount ?? 0}
                    </p>
                  </div>
                  <div className="rounded-xl border border-default-200/70 bg-content1 p-3">
                    <p className="text-xs uppercase tracking-wide text-default-500">
                      Atualizados
                    </p>
                    <p className="text-lg font-semibold text-primary">
                      {resultado.updatedCount ?? 0}
                    </p>
                  </div>
                </div>

                {resultado.error && (
                  <div className="rounded-xl border border-danger/40 bg-danger/5 p-3 text-xs text-danger-700">
                    {resultado.error}
                  </div>
                )}

                {resultado.message && !resultado.error && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs text-primary-700">
                    {resultado.message}
                  </div>
                )}

                {resultado.monitoramentoRegistrado && resultado.webhookUrl && (
                  <div className="rounded-xl border border-default-200/70 bg-content1 p-3 text-xs text-default-600">
                    Webhook esperado: {resultado.webhookUrl}
                  </div>
                )}

                {processosPreview.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-default-500">
                      Processos sincronizados (amostra)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {processosPreview.map((numero) => (
                        <Chip key={numero} color="default" size="sm" variant="flat">
                          {numero}
                        </Chip>
                      ))}
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          <Card className="border border-default-200/70">
            <CardBody className="space-y-3">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-default-500" />
                <p className="text-sm font-semibold">
                  Histórico de sincronizações
                </p>
              </div>

              {isLoadingHistory ? (
                <div className="flex items-center gap-2 text-sm text-default-500">
                  <Spinner size="sm" />
                  Carregando histórico...
                </div>
              ) : historico.length === 0 ? (
                <p className="text-sm text-default-500">
                  Nenhuma sincronização registrada até o momento.
                </p>
              ) : (
                <div className="space-y-2">
                  {historico.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl border border-default-200/70 bg-default-50/60 p-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Chip color={statusMeta[item.status].color} size="sm" variant="flat">
                            {statusMeta[item.status].label}
                          </Chip>
                          <p className="text-xs text-default-500">
                            {formatDateTime(item.createdAt)}
                          </p>
                        </div>
                        <p className="text-xs text-default-500">
                          {item.executadoPor}
                        </p>
                      </div>

                      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                        <p className="text-default-600">
                          <strong>Tribunal:</strong> {item.tribunalSigla}
                        </p>
                        <p className="text-default-600">
                          <strong>OAB:</strong> {item.oab}
                        </p>
                        <p className="text-default-600">
                          <strong>Criados:</strong> {item.createdCount}
                        </p>
                        <p className="text-default-600">
                          <strong>Atualizados:</strong> {item.updatedCount}
                        </p>
                      </div>

                      <p className="mt-1 text-xs text-default-500">
                        {item.syncedCount} processo(s) processado(s)
                      </p>

                      {item.error && (
                        <div className="mt-2 rounded-lg border border-danger/30 bg-danger/5 p-2 text-xs text-danger-700">
                          {item.error}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {isBootstrapping && (
            <div className="flex items-center gap-2 text-xs text-default-500">
              <Bot className="h-4 w-4" />
              Carregando configurações da sincronização...
            </div>
          )}
        </ModalBody>

        <ModalFooter className="flex flex-col gap-2 border-t border-default-200/60 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-default-500">
            <ShieldCheck className="h-4 w-4" />
            Todas as execuções são registradas com auditoria.
          </div>
          <div className="flex w-full justify-end gap-2 sm:w-auto">
            <Button variant="flat" onPress={handleClose}>
              Fechar
            </Button>
          </div>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
