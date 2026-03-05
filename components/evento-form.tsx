"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Textarea, Chip, Spinner, Select, SelectItem } from "@heroui/react";
import { Calendar, MapPin, Users, FileText, AlertCircle } from "lucide-react";
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

// Interface específica para o formulário (com DateValue para datas)
interface FormEventoData {
  titulo: string;
  descricao: string;
  tipo: EventoTipo;
  dataInicio: any; // DateValue do @internationalized/date
  dataFim: any; // DateValue do @internationalized/date
  local: string;
  participantes: string[];
  processoId: string | null;
  clienteId: string | null;
  advogadoResponsavelId: string | null;
  status: EventoStatus;
  lembreteMinutos: number;
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
  { key: "NENHUMA", label: "Sem recorrência" },
  { key: "DIARIA", label: "Diária" },
  { key: "SEMANAL", label: "Semanal" },
  { key: "MENSAL", label: "Mensal" },
  { key: "ANUAL", label: "Anual" },
];

export default function EventoForm({
  isOpen,
  onClose,
  evento,
  initialDate,
  onSuccess,
}: EventoFormProps) {
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
    participantes: [],
    processoId: null,
    clienteId: null,
    advogadoResponsavelId: null,
    status: EventoStatus.AGENDADO,
    lembreteMinutos: 30,
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
        participantes: evento.participantes || [],
        processoId: evento.processoId || null,
        clienteId: evento.clienteId || null,
        advogadoResponsavelId: evento.advogadoResponsavelId || null,
        status: evento.status || EventoStatus.AGENDADO,
        lembreteMinutos: evento.lembreteMinutos || 30,
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
      participantes: [],
      processoId: null,
      clienteId: null,
      advogadoResponsavelId: null,
      status: EventoStatus.AGENDADO,
      lembreteMinutos: 30,
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

    if (formData.observacoes && formData.observacoes.length > 500) {
      newErrors.observacoes = "Observações devem ter no máximo 500 caracteres";
    }

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error("Por favor, corrija os erros no formulário");

      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      const dataToSubmit = {
        ...formData,
        participantes,
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
        <form onSubmit={handleSubmit}>
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
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Select
                      color="secondary"
                      label="Recorrência"
                      placeholder="Selecione a recorrência"
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
                        Defina a recorrência para habilitar a data final das ocorrências.
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Local */}
                <Input
                  color="danger"
                  errorMessage={errors.local}
                  isInvalid={!!errors.local}
                  label="Local"
                  placeholder="Ex: Fórum Central - Sala 101"
                  startContent={<MapPin className="w-4 h-4 text-danger" />}
                  value={formData.local}
                  variant="bordered"
                  onChange={(e) => {
                    setFormData({ ...formData, local: e.target.value });
                    if (errors.local) {
                      setErrors({ ...errors, local: "" });
                    }
                  }}
                />

                {/* Relacionamentos */}
                <div className="grid grid-cols-3 gap-4">
                  <Select
                    color="secondary"
                    label="Cliente"
                    placeholder="Selecione um cliente"
                    selectedKeys={selectedClienteKeys}
                    onSelectionChange={(keys) => {
                      const selectedKey = Array.from(keys)[0] as string | undefined;

                      setFormData({
                        ...formData,
                        clienteId: selectedKey ?? null,
                        processoId: null, // Limpar processo quando cliente muda
                      });
                    }}
                  >
                    {selectData?.clientes?.map((cliente) => (
                      <SelectItem key={cliente.id} textValue={cliente.nome}>{cliente.nome}</SelectItem>
                    )) || []}
                  </Select>

                  <Select
                    color="warning"
                    isDisabled={!formData.clienteId}
                    label="Processo"
                    placeholder={
                      formData.clienteId
                        ? "Selecione um processo"
                        : "Primeiro selecione um cliente"
                    }
                    selectedKeys={selectedProcessoKeys}
                    onSelectionChange={(keys) => {
                      const selectedKey = Array.from(keys)[0] as string | undefined;

                      setFormData({ ...formData, processoId: selectedKey ?? null });
                    }}
                  >
                    {processosFiltrados.map((processo) => (
                      <SelectItem key={processo.id} textValue={processo.numero}>
                        {processo.numero}
                      </SelectItem>
                    ))}
                  </Select>

                  <Select
                    color="success"
                    label="Advogado Responsável"
                    placeholder="Selecione um advogado"
                    selectedKeys={selectedAdvogadoKeys}
                    onSelectionChange={(keys) => {
                      const selectedKey = Array.from(keys)[0] as string | undefined;

                      setFormData({
                        ...formData,
                        advogadoResponsavelId: selectedKey ?? null,
                      });
                    }}
                  >
                    {selectData?.advogados?.map((advogado) => (
                      <SelectItem key={advogado.id} textValue={`${advogado.usuario.firstName || ""} ${advogado.usuario.lastName || ""}`.trim() ||
                          advogado.usuario.email}>
                        {`${advogado.usuario.firstName || ""} ${advogado.usuario.lastName || ""}`.trim() ||
                          advogado.usuario.email}
                      </SelectItem>
                    )) || []}
                  </Select>
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

                {/* Lembrete */}
                <Select
                  color="warning"
                  label="Lembrete"
                  placeholder="Selecione quando receber o lembrete"
                  selectedKeys={
                    formData.lembreteMinutos !== undefined &&
                    formData.lembreteMinutos !== null
                      ? [formData.lembreteMinutos.toString()]
                      : []
                  }
                  startContent={
                    <AlertCircle className="w-4 h-4 text-warning" />
                  }
                  onSelectionChange={(keys) => {
                    const selectedKey = Array.from(keys)[0] as string | undefined;

                    if (!selectedKey) return;

                    setFormData({
                      ...formData,
                      lembreteMinutos: parseInt(selectedKey),
                    });
                  }}
                >
                  {lembretes.map((lembrete) => (
                    <SelectItem key={lembrete.key.toString()} textValue={lembrete.label}>
                      {lembrete.label}
                    </SelectItem>
                  ))}
                </Select>

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
