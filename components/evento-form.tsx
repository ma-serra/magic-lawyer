"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Textarea, Chip, Spinner, Select, SelectItem, Switch } from "@heroui/react";
import { Calendar, MapPin, Users, FileText, AlertCircle, Video, Link as LinkIcon } from "lucide-react";
import { toast } from "@/lib/toast";
import { parseAbsoluteToLocal } from "@internationalized/date";

import {
  createEvento,
  updateEvento,
  type EventoFormData,
} from "@/app/actions/eventos";
import { useEventoFormData } from "@/app/hooks/use-eventos";
import { useUserPermissions } from "@/app/hooks/use-user-permissions";
import { Evento, EventoTipo, EventoStatus } from "@/generated/prisma";
import { DateInput } from "@/components/ui/date-input";
import { SearchableSelect } from "@/components/searchable-select";

// Interface específica para o formulário (com DateValue para datas)
interface FormEventoData {
  titulo: string;
  descricao: string;
  tipo: EventoTipo;
  dataInicio: any; // DateValue do @internationalized/date
  dataFim: any; // DateValue do @internationalized/date
  local: string;
  isOnline: boolean;
  linkAcesso: string;
  participantes: string[];
  processoId: string | null;
  clienteId: string | null;
  advogadoResponsavelId: string | null;
  status: EventoStatus;
  lembreteMinutos: number;
  lembretesMinutos: number[];
  observacoes: string;
  recorrencia: string;
  recorrenciaFim: any;
  googleEventId: string | null;
  googleCalendarId: string | null;
}

interface EventoFormProps {
  isOpen: boolean;
  onClose: () => void;
  evento?: Evento; // Evento existente para edição
  initialDate?: Date; // Data inicial para novo evento
  onSuccess?: () => void;
}

const tiposEvento = [
  { key: EventoTipo.REUNIAO, label: "Reunião" },
  { key: EventoTipo.AUDIENCIA, label: "Audiência" },
  { key: EventoTipo.CONSULTA, label: "Consulta" },
  { key: EventoTipo.PRAZO, label: "Prazo" },
  { key: EventoTipo.LEMBRETE, label: "Lembrete" },
];

const statusEvento = [
  { key: EventoStatus.AGENDADO, label: "Agendado" },
  { key: EventoStatus.CONFIRMADO, label: "Confirmado" },
  { key: EventoStatus.REALIZADO, label: "Realizado" },
  { key: EventoStatus.CANCELADO, label: "Cancelado" },
];

const lembretes = [
  { key: 0, label: "Sem lembrete" },
  { key: 15, label: "15 minutos antes" },
  { key: 30, label: "30 minutos antes" },
  { key: 60, label: "1 hora antes" },
  { key: 120, label: "2 horas antes" },
  { key: 1440, label: "1 dia antes" },
];

const recorrencias = [
  { key: "NENHUMA", label: "Não repetir" },
  { key: "DIARIA", label: "Repetir diariamente" },
  { key: "SEMANAL", label: "Repetir semanalmente" },
  { key: "MENSAL", label: "Repetir mensalmente" },
  { key: "ANUAL", label: "Repetir anualmente" },
];

export default function EventoForm({
  isOpen,
  onClose,
  evento,
  initialDate,
  onSuccess,
}: EventoFormProps) {
  const validationAlertRef = useRef<HTMLDivElement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [novoParticipante, setNovoParticipante] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { isCliente } = useUserPermissions();
  const [formData, setFormData] = useState<FormEventoData>({
    titulo: "",
    descricao: "",
    tipo: EventoTipo.REUNIAO,
    dataInicio: null,
    dataFim: null,
    local: "",
    isOnline: false,
    linkAcesso: "",
    participantes: [],
    processoId: null,
    clienteId: null,
    advogadoResponsavelId: null,
    status: EventoStatus.AGENDADO,
    lembreteMinutos: 30,
    lembretesMinutos: [30],
    observacoes: "",
    recorrencia: "NENHUMA",
    recorrenciaFim: null,
    googleEventId: null,
    googleCalendarId: null,
  });
  const [participantes, setParticipantes] = useState<string[]>([]);

  const { formData: selectData, isLoading: isLoadingFormData } =
    useEventoFormData();

  // Estado derivado do evento - sem useEffect!
  const initialFormData = useMemo(() => {
    if (evento) {
      return {
        titulo: evento.titulo || "",
        descricao: evento.descricao || "",
        tipo: evento.tipo || EventoTipo.REUNIAO,
        dataInicio: evento.dataInicio
          ? parseAbsoluteToLocal(new Date(evento.dataInicio).toISOString())
          : null,
        dataFim: evento.dataFim
          ? parseAbsoluteToLocal(new Date(evento.dataFim).toISOString())
          : null,
        local: evento.local || "",
        isOnline: evento.isOnline || false,
        linkAcesso: evento.linkAcesso || "",
        participantes: evento.participantes || [],
        processoId: evento.processoId || null,
        clienteId: evento.clienteId || null,
        advogadoResponsavelId: evento.advogadoResponsavelId || null,
        status: evento.status || EventoStatus.AGENDADO,
        lembreteMinutos: evento.lembreteMinutos || 30,
        lembretesMinutos:
          (evento as Evento & { lembretesMinutos?: number[] }).lembretesMinutos
            ?.length
            ? [...(evento as Evento & { lembretesMinutos?: number[] }).lembretesMinutos]
            : evento.lembreteMinutos !== null &&
                evento.lembreteMinutos !== undefined &&
                evento.lembreteMinutos > 0
              ? [evento.lembreteMinutos]
              : [],
        observacoes: evento.observacoes || "",
        recorrencia: evento.recorrencia || "NENHUMA",
        recorrenciaFim: evento.recorrenciaFim
          ? parseAbsoluteToLocal(new Date(evento.recorrenciaFim).toISOString())
          : null,
        googleEventId: evento.googleEventId || null,
        googleCalendarId: evento.googleCalendarId || null,
      };
    }

    // Se há initialDate, usar ela para inicializar as datas
    const dataInicioDefault = initialDate
      ? parseAbsoluteToLocal(initialDate.toISOString())
      : null;
    const dataFimDefault = initialDate
      ? parseAbsoluteToLocal(
          new Date(initialDate.getTime() + 60 * 60 * 1000).toISOString(),
        )
      : null;

    return {
      titulo: "",
      descricao: "",
      tipo: EventoTipo.REUNIAO,
      dataInicio: dataInicioDefault,
      dataFim: dataFimDefault,
      local: "",
      isOnline: false,
      linkAcesso: "",
      participantes: [],
      processoId: null,
      clienteId: null,
      advogadoResponsavelId: null,
      status: EventoStatus.AGENDADO,
      lembreteMinutos: 30,
      lembretesMinutos: [30],
      observacoes: "",
      recorrencia: "NENHUMA",
      recorrenciaFim: null,
      googleEventId: null,
      googleCalendarId: null,
    } as FormEventoData;
  }, [evento, initialDate]);

  // Participantes derivados do evento
  const participantesIniciais = useMemo(() => {
    return evento?.participantes || [];
  }, [evento]);

  // Filtrar processos baseado no cliente selecionado
  const processosFiltrados = useMemo(() => {
    const currentClienteId = formData.clienteId || initialFormData.clienteId;

    return (
      selectData?.processos?.filter((processo) => {
        if (!currentClienteId) return true; // Se não há cliente selecionado, mostrar todos

        return processo.clienteId === currentClienteId;
      }) || []
    );
  }, [selectData?.processos, formData.clienteId, initialFormData.clienteId]);

  const clienteKeys = useMemo(
    () => new Set((selectData?.clientes || []).map((cliente) => cliente.id)),
    [selectData?.clientes],
  );
  const processoKeys = useMemo(
    () => new Set(processosFiltrados.map((processo) => processo.id)),
    [processosFiltrados],
  );
  const advogadoKeys = useMemo(
    () => new Set((selectData?.advogados || []).map((advogado) => advogado.id)),
    [selectData?.advogados],
  );
  const selectedClienteKeys =
    formData.clienteId && clienteKeys.has(formData.clienteId)
      ? [formData.clienteId]
      : [];
  const selectedProcessoKeys =
    formData.processoId && processoKeys.has(formData.processoId)
      ? [formData.processoId]
      : [];
  const selectedAdvogadoKeys =
    formData.advogadoResponsavelId &&
    advogadoKeys.has(formData.advogadoResponsavelId)
      ? [formData.advogadoResponsavelId]
      : [];
  const clienteOptions = useMemo(
    () =>
      (selectData?.clientes || []).map((cliente) => ({
        key: cliente.id,
        label: cliente.nome,
        textValue: [cliente.nome, cliente.email || ""]
          .filter(Boolean)
          .join(" "),
        description: cliente.email || undefined,
      })),
    [selectData?.clientes],
  );
  const processoOptions = useMemo(
    () =>
      processosFiltrados.map((processo) => ({
        key: processo.id,
        label: processo.numero,
        textValue: [processo.numero, processo.titulo || ""]
          .filter(Boolean)
          .join(" "),
        description: processo.titulo || "Sem titulo",
      })),
    [processosFiltrados],
  );
  const advogadoOptions = useMemo(
    () =>
      (selectData?.advogados || []).map((advogado) => {
        const nome =
          `${advogado.usuario.firstName || ""} ${
            advogado.usuario.lastName || ""
          }`.trim() || advogado.usuario.email;

        return {
          key: advogado.id,
          label: nome,
          textValue: [nome, advogado.usuario.email || ""].filter(Boolean).join(" "),
          description: advogado.usuario.email || undefined,
        };
      }),
    [selectData?.advogados],
  );
  const validationMessages = useMemo(() => Object.values(errors), [errors]);

  // Inicializar formData quando modal abre ou evento muda
  useEffect(() => {
    if (isOpen && evento) {
      setFormData(initialFormData as FormEventoData);
      setParticipantes(participantesIniciais);
      setErrors({});
    } else if (isOpen && !evento) {
      // Reset para criação - usar initialFormData que já considera initialDate
      setFormData(initialFormData as FormEventoData);
      setParticipantes([]);
      setErrors({});
    }
  }, [isOpen, evento, initialDate]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.titulo?.trim()) {
      newErrors.titulo = "Título é obrigatório";
    } else if (formData.titulo.length > 200) {
      newErrors.titulo = "Título deve ter no máximo 200 caracteres";
    }

    if (!formData.dataInicio) {
      newErrors.dataInicio = "Data de início é obrigatória";
    }

    if (!formData.dataFim) {
      newErrors.dataFim = "Data de fim é obrigatória";
    }

    if (!formData.tipo) {
      newErrors.tipo = "Tipo de evento é obrigatório";
    }

    if (formData.dataInicio && formData.dataFim) {
      const inicio = formData.dataInicio.toDate();
      const fim = formData.dataFim.toDate();

      if (fim <= inicio) {
        newErrors.dataFim = "Data de fim deve ser posterior à data de início";
      }
    }

    if (formData.recorrencia !== "NENHUMA" && !evento) {
      if (!formData.recorrenciaFim) {
        newErrors.recorrenciaFim = "Informe até quando a recorrência deve ocorrer";
      } else {
        const inicio = formData.dataInicio?.toDate();
        const recorrenciaFim = formData.recorrenciaFim.toDate();
        if (inicio && recorrenciaFim <= inicio) {
          newErrors.recorrenciaFim =
            "A data final da recorrência deve ser posterior ao início";
        }
      }
    }

    if (formData.descricao && formData.descricao.length > 1000) {
      newErrors.descricao = "Descrição deve ter no máximo 1000 caracteres";
    }

    if (formData.local && formData.local.length > 200) {
      newErrors.local = "Local deve ter no máximo 200 caracteres";
    }

    if (formData.isOnline) {
      if (!formData.linkAcesso?.trim()) {
        newErrors.linkAcesso = "Link do evento online é obrigatório";
      } else {
        try {
          const candidate =
            formData.linkAcesso.startsWith("http://") ||
            formData.linkAcesso.startsWith("https://")
              ? formData.linkAcesso
              : `https://${formData.linkAcesso}`;
          new URL(candidate);
        } catch {
          newErrors.linkAcesso = "Informe um link válido";
        }
      }
    }

    if (formData.observacoes && formData.observacoes.length > 500) {
      newErrors.observacoes = "Observações devem ter no máximo 500 caracteres";
    }

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      requestAnimationFrame(() => {
        validationAlertRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });

      toast.error("Preencha os campos obrigatórios antes de salvar");

      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      const dataToSubmit = {
        ...formData,
        participantes,
        lembreteMinutos:
          formData.lembretesMinutos.length > 0
            ? Math.min(...formData.lembretesMinutos)
            : 0,
        dataInicio: formData.dataInicio
          ? formData.dataInicio.toDate().toISOString()
          : "",
        dataFim: formData.dataFim
          ? formData.dataFim.toDate().toISOString()
          : "",
        recorrencia: formData.recorrencia || "NENHUMA",
        recorrenciaFim:
          formData.recorrencia !== "NENHUMA" && formData.recorrenciaFim
            ? formData.recorrenciaFim.toDate().toISOString()
            : null,
      } as EventoFormData;

      let result;

      if (evento) {
        result = await updateEvento(evento.id, dataToSubmit);
      } else {
        result = await createEvento(dataToSubmit);
      }

      if (result.success) {
        toast.success(
          evento
            ? "Evento atualizado com sucesso!"
            : "Evento criado com sucesso!",
        );
        onSuccess?.();
        onClose();
      } else {
        toast.error(result.error || "Erro ao salvar evento");
      }
    } catch (error) {
      toast.error("Erro interno do servidor");
    } finally {
      setIsLoading(false);
    }
  };

  const adicionarParticipante = () => {
    if (novoParticipante && !participantes.includes(novoParticipante)) {
      setParticipantes([...participantes, novoParticipante]);
      setNovoParticipante("");
    }
  };

  const removerParticipante = (email: string) => {
    setParticipantes(participantes.filter((p) => p !== email));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      adicionarParticipante();
    }
  };

  // Se for cliente, não permitir abrir o formulário
  if (isCliente) {
    return null;
  }

  return (
    <Modal
      classNames={{
        base: "max-h-[90vh]",
        body: "max-h-[65vh] overflow-y-auto py-6",
        footer: "border-t border-default-200 mt-4",
      }}
      isOpen={isOpen}
      scrollBehavior="inside"
      size="2xl"
      onClose={onClose}
    >
      <ModalContent>
        <form data-testid="evento-form-modal" onSubmit={handleSubmit}>
          <ModalHeader className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              {evento ? "Editar Evento" : "Novo Evento"}
            </div>
            <div className="text-sm text-default-500 mt-2">
              <p>
                Campos obrigatórios: <span className="text-danger">*</span>
              </p>
              <p className="text-xs">
                Título, Tipo, Data de Início e Data de Fim são obrigatórios.
              </p>
            </div>
          </ModalHeader>

          <ModalBody className="gap-4">
            {isLoadingFormData ? (
              <div className="flex justify-center py-8">
                <Spinner size="lg" />
              </div>
            ) : (
              <>
                {validationMessages.length > 0 ? (
                  <div
                    ref={validationAlertRef}
                    className="rounded-2xl border border-danger-300 bg-danger-50/80 p-4 text-danger-700 dark:border-danger/40 dark:bg-danger/10 dark:text-danger-200"
                    role="alert"
                  >
                    <div className="flex items-start gap-3">
                      <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                      <div className="space-y-2">
                        <p className="text-sm font-semibold">
                          Revise os campos obrigatórios antes de salvar
                        </p>
                        <ul className="space-y-1 text-xs sm:text-sm">
                          {validationMessages.map((message) => (
                            <li key={message}>- {message}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Título */}
                <Input
                  isRequired
                  color="primary"
                  errorMessage={errors.titulo}
                  isInvalid={!!errors.titulo}
                  label="Título do Evento"
                  placeholder="Ex: Audiência de Conciliação"
                  startContent={<FileText className="w-4 h-4 text-primary" />}
                  value={formData.titulo}
                  variant="bordered"
                  onChange={(e) => {
                    setFormData({ ...formData, titulo: e.target.value });
                    if (errors.titulo) {
                      setErrors({ ...errors, titulo: "" });
                    }
                  }}
                />

                {/* Descrição */}
                <Textarea
                  color="secondary"
                  errorMessage={errors.descricao}
                  isInvalid={!!errors.descricao}
                  label="Descrição"
                  minRows={2}
                  placeholder="Descrição detalhada do evento..."
                  value={formData.descricao}
                  variant="bordered"
                  onChange={(e) => {
                    setFormData({ ...formData, descricao: e.target.value });
                    if (errors.descricao) {
                      setErrors({ ...errors, descricao: "" });
                    }
                  }}
                />

                {/* Tipo e Status */}
                <div className="grid grid-cols-2 gap-4">
                  <Select
                    isRequired
                    color="primary"
                    errorMessage={errors.tipo}
                    isInvalid={!!errors.tipo}
                    label="Tipo"
                    placeholder="Selecione o tipo"
                    selectedKeys={formData.tipo ? [formData.tipo] : []}
                    onSelectionChange={(keys) => {
                      const selectedKey = Array.from(keys)[0] as string | undefined;

                      if (!selectedKey) return;

                      setFormData({
                        ...formData,
                        tipo: selectedKey as EventoTipo,
                      });

                      if (errors.tipo) {
                        setErrors({ ...errors, tipo: "" });
                      }
                    }}
                  >
                    {tiposEvento.map((tipo) => (
                      <SelectItem key={tipo.key} textValue={tipo.label}>{tipo.label}</SelectItem>
                    ))}
                  </Select>

                  <Select
                    color="default"
                    label="Status"
                    placeholder="Selecione o status"
                    selectedKeys={formData.status ? [formData.status] : []}
                    onSelectionChange={(keys) => {
                      const selectedKey = Array.from(keys)[0] as string | undefined;

                      if (!selectedKey) return;

                      setFormData({
                        ...formData,
                        status: selectedKey as EventoStatus,
                      });
                    }}
                  >
                    {statusEvento.map((status) => (
                      <SelectItem key={status.key} textValue={status.label}>{status.label}</SelectItem>
                    ))}
                  </Select>
                </div>

                {/* Data e Hora */}
                <div className="grid grid-cols-2 gap-4">
                  <DateInput
                    hideTimeZone
                    isRequired
                    showMonthAndYearPickers
                    color="success"
                    errorMessage={errors.dataInicio}
                    granularity="minute"
                    isInvalid={!!errors.dataInicio}
                    label="Data e Hora de Início"
                    dateValue={formData.dataInicio}
                    variant="bordered"
                    onDateChange={(value) => {
                      setFormData({ ...formData, dataInicio: value });
                      if (errors.dataInicio) {
                        setErrors({ ...errors, dataInicio: "" });
                      }
                    }}
                  />

                  <DateInput
                    hideTimeZone
                    isRequired
                    showMonthAndYearPickers
                    color="warning"
                    errorMessage={errors.dataFim}
                    granularity="minute"
                    isInvalid={!!errors.dataFim}
                    label="Data e Hora de Fim"
                    dateValue={formData.dataFim}
                    variant="bordered"
                    onDateChange={(value) => {
                      setFormData({ ...formData, dataFim: value });
                      if (errors.dataFim) {
                        setErrors({ ...errors, dataFim: "" });
                      }
                    }}
                  />
                </div>

                {!evento ? (
                  <div className="space-y-3 rounded-2xl border border-default-200 bg-default-50/60 p-4 dark:border-white/10 dark:bg-white/5">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        Repetição do evento na agenda
                      </p>
                      <p className="text-xs text-default-500">
                        Use isso apenas quando o mesmo compromisso precisa reaparecer automaticamente no calendário.
                        Isso não controla avisos. O aviso é configurado no campo
                        {" "}
                        <span className="font-medium text-foreground">
                          Avisar antes do evento
                        </span>
                        {" "}
                        mais abaixo.
                      </p>
                      <p className="text-xs text-default-500">
                        No jurídico, isso costuma ser raro. Na maior parte dos casos, deixe como
                        {" "}
                        <span className="font-medium text-foreground">
                          Não repetir
                        </span>
                        .
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Select
                        color="secondary"
                        label="Repetição do evento"
                        placeholder="Use apenas se este compromisso se repetir"
                        selectedKeys={
                          formData.recorrencia ? [formData.recorrencia] : ["NENHUMA"]
                        }
                        onSelectionChange={(keys) => {
                          const selectedKey =
                            (Array.from(keys)[0] as string | undefined) ||
                            "NENHUMA";
                          setFormData((prev) => ({
                            ...prev,
                            recorrencia: selectedKey,
                            recorrenciaFim:
                              selectedKey === "NENHUMA" ? null : prev.recorrenciaFim,
                          }));
                        }}
                      >
                        {recorrencias.map((item) => (
                          <SelectItem key={item.key} textValue={item.label}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </Select>

                      {formData.recorrencia !== "NENHUMA" ? (
                        <DateInput
                          color="secondary"
                          errorMessage={errors.recorrenciaFim}
                          granularity="day"
                          isInvalid={!!errors.recorrenciaFim}
                          label="Repetir até"
                          dateValue={formData.recorrenciaFim}
                          variant="bordered"
                          onDateChange={(value) =>
                            setFormData((prev) => ({
                              ...prev,
                              recorrenciaFim: value,
                            }))
                          }
                        />
                      ) : (
                        <div className="rounded-lg border border-dashed border-default-300 p-3 text-xs text-default-500">
                          O evento será criado uma única vez. Use a repetição somente se esse mesmo compromisso precisar voltar automaticamente para a agenda.
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}

                {/* Local */}
                <div className="space-y-4 rounded-2xl border border-default-200 bg-default-50/60 p-4 dark:border-white/10 dark:bg-white/5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        Tipo de atendimento
                      </p>
                      <p className="text-xs text-default-500">
                        Marque quando esse compromisso acontecer por videoconferência ou outra plataforma online.
                      </p>
                    </div>
                    <Switch
                      color="primary"
                      isSelected={formData.isOnline}
                      onValueChange={(value) => {
                        setFormData({
                          ...formData,
                          isOnline: value,
                          linkAcesso: value ? formData.linkAcesso : "",
                        });

                        if (errors.linkAcesso) {
                          setErrors({ ...errors, linkAcesso: "" });
                        }
                      }}
                    >
                      Evento online
                    </Switch>
                  </div>

                  {formData.isOnline ? (
                    <Input
                      isRequired
                      color="primary"
                      errorMessage={errors.linkAcesso}
                      isInvalid={!!errors.linkAcesso}
                      label="Link do evento online"
                      placeholder="Ex: https://meet.google.com/abc-defg-hij"
                      startContent={<LinkIcon className="w-4 h-4 text-primary" />}
                      value={formData.linkAcesso}
                      variant="bordered"
                      onChange={(e) => {
                        setFormData({ ...formData, linkAcesso: e.target.value });
                        if (errors.linkAcesso) {
                          setErrors({ ...errors, linkAcesso: "" });
                        }
                      }}
                    />
                  ) : null}

                  <Input
                    color="danger"
                    errorMessage={errors.local}
                    isInvalid={!!errors.local}
                    label={formData.isOnline ? "Plataforma / observação do local" : "Local"}
                    placeholder={
                      formData.isOnline
                        ? "Ex: Sala virtual principal ou observação complementar"
                        : "Ex: Fórum Central - Sala 101"
                    }
                    startContent={
                      formData.isOnline ? (
                        <Video className="w-4 h-4 text-danger" />
                      ) : (
                        <MapPin className="w-4 h-4 text-danger" />
                      )
                    }
                    value={formData.local}
                    variant="bordered"
                    onChange={(e) => {
                      setFormData({ ...formData, local: e.target.value });
                      if (errors.local) {
                        setErrors({ ...errors, local: "" });
                      }
                    }}
                  />
                </div>

                {/* Relacionamentos */}
                <div className="grid grid-cols-3 gap-4">
                  <SearchableSelect
                    color="secondary"
                    label="Cliente"
                    placeholder="Selecione um cliente"
                    items={clienteOptions}
                    selectedKey={selectedClienteKeys[0] ?? null}
                    onSelectionChange={(selectedKey) => {
                      
                      setFormData({
                        ...formData,
                        clienteId: selectedKey ?? null,
                        processoId: null, // Limpar processo quando cliente muda
                      });
                    }}
                  />

                  <SearchableSelect
                    color="warning"
                    isDisabled={!formData.clienteId}
                    label="Processo"
                    placeholder={
                      formData.clienteId
                        ? "Selecione um processo"
                        : "Primeiro selecione um cliente"
                    }
                    items={processoOptions}
                    selectedKey={selectedProcessoKeys[0] ?? null}
                    onSelectionChange={(selectedKey) => {

                      setFormData({ ...formData, processoId: selectedKey ?? null });
                    }}
                  />

                  <SearchableSelect
                    color="success"
                    label="Advogado Responsável"
                    placeholder="Selecione um advogado"
                    items={advogadoOptions}
                    selectedKey={selectedAdvogadoKeys[0] ?? null}
                    onSelectionChange={(selectedKey) => {

                      setFormData({
                        ...formData,
                        advogadoResponsavelId: selectedKey ?? null,
                      });
                    }}
                  />
                </div>

                {/* Participantes */}
                <div>
                  <label
                    className="text-sm font-medium text-default-700 mb-2 block"
                    htmlFor="participant-email"
                  >
                    <Users className="w-4 h-4 inline mr-1" />
                    Participantes
                  </label>
                  <div className="flex gap-2 mb-2">
                    <Input
                      className="flex-1"
                      color="primary"
                      id="participant-email"
                      placeholder="Digite o email do participante"
                      startContent={<Users className="w-4 h-4 text-primary" />}
                      value={novoParticipante}
                      variant="bordered"
                      onChange={(e) => setNovoParticipante(e.target.value)}
                      onKeyPress={handleKeyPress}
                    />
                    <Button
                      isDisabled={!novoParticipante}
                      size="sm"
                      type="button"
                      onPress={adicionarParticipante}
                    >
                      Adicionar
                    </Button>
                  </div>
                  {participantes.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {participantes.map((email) => (
                        <Chip
                          key={email}
                          color="primary"
                          variant="flat"
                          onClose={() => removerParticipante(email)}
                        >
                          {email}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>

                {/* Lembretes */}
                <div className="space-y-3 rounded-2xl border border-default-200 bg-default-50/60 p-4 dark:border-white/10 dark:bg-white/5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-warning" />
                      <p className="text-sm font-semibold text-foreground">
                        Avisar antes do evento
                      </p>
                    </div>
                    <p className="text-xs text-default-500">
                      Você pode marcar mais de um aviso para o mesmo evento. Exemplo: 1 dia antes, 1 hora antes e 15 minutos antes.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {lembretes.map((lembrete) => {
                      const isSelected = formData.lembretesMinutos.includes(
                        Number(lembrete.key),
                      );

                      return (
                        <Button
                          key={lembrete.key.toString()}
                          color={isSelected ? "warning" : "default"}
                          size="sm"
                          variant={isSelected ? "flat" : "bordered"}
                          onPress={() => {
                            const key = Number(lembrete.key);
                            const nextLembretes = isSelected
                              ? formData.lembretesMinutos.filter((item) => item !== key)
                              : [...formData.lembretesMinutos, key].sort((a, b) => b - a);

                            setFormData({
                              ...formData,
                              lembretesMinutos: nextLembretes,
                              lembreteMinutos:
                                nextLembretes.length > 0
                                  ? Math.min(...nextLembretes)
                                  : 0,
                            });
                          }}
                        >
                          {lembrete.label}
                        </Button>
                      );
                    })}
                  </div>
                  <div className="text-xs text-default-500">
                    {formData.lembretesMinutos.length > 0
                      ? `O sistema vai avisar ${formData.lembretesMinutos.length} vez(es): ${formData.lembretesMinutos
                          .slice()
                          .sort((a, b) => b - a)
                          .map((minutos) => lembretes.find((item) => Number(item.key) === minutos)?.label || `${minutos} minutos antes`)
                          .join(", ")}.`
                      : "Nenhum aviso automático será enviado antes deste evento."}
                  </div>
                </div>

                {/* Observações */}
                <Textarea
                  color="default"
                  errorMessage={errors.observacoes}
                  isInvalid={!!errors.observacoes}
                  label="Observações"
                  minRows={2}
                  placeholder="Observações adicionais..."
                  value={formData.observacoes}
                  variant="bordered"
                  onChange={(e) => {
                    setFormData({ ...formData, observacoes: e.target.value });
                    if (errors.observacoes) {
                      setErrors({ ...errors, observacoes: "" });
                    }
                  }}
                />
              </>
            )}
          </ModalBody>

          <ModalFooter className="gap-3 px-6 py-4">
            <Button
              isDisabled={isLoading}
              type="button"
              variant="light"
              onPress={onClose}
            >
              Cancelar
            </Button>
            <Button
              color="primary"
              isDisabled={
                !formData.titulo || !formData.dataInicio || !formData.dataFim
              }
              isLoading={isLoading}
              type="submit"
            >
              {evento ? "Atualizar" : "Criar"} Evento
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
