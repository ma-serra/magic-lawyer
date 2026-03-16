"use client";

import { useState } from "react";
import { Button, Card, CardBody, Input } from "@heroui/react";
import { CreditCard, Lock } from "lucide-react";

type PacoteCreditCardFormProps = {
  amount: number;
  isLoading?: boolean;
  onSubmit: (payload: {
    cardNumber: string;
    cardName: string;
    expiryMonth: string;
    expiryYear: string;
    cvv: string;
  }) => Promise<void>;
};

export function PacoteJuizCreditCardForm({
  amount,
  isLoading = false,
  onSubmit,
}: PacoteCreditCardFormProps) {
  const [form, setForm] = useState({
    cardNumber: "",
    cardName: "",
    expiryMonth: "",
    expiryYear: "",
    cvv: "",
  });

  const handleChange = (field: keyof typeof form, value: string) => {
    let nextValue = value;

    if (field === "cardNumber") {
      nextValue = value
        .replace(/\D/g, "")
        .replace(/(\d{4})(?=\d)/g, "$1 ")
        .slice(0, 19);
    }

    if (field === "expiryMonth") {
      nextValue = value.replace(/\D/g, "").slice(0, 2);
    }

    if (field === "expiryYear") {
      nextValue = value.replace(/\D/g, "").slice(0, 2);
    }

    if (field === "cvv") {
      nextValue = value.replace(/\D/g, "").slice(0, 4);
    }

    setForm((current) => ({
      ...current,
      [field]: nextValue,
    }));
  };

  const isValid =
    form.cardNumber.replace(/\D/g, "").length >= 16 &&
    form.cardName.trim().length > 3 &&
    form.expiryMonth.length === 2 &&
    form.expiryYear.length === 2 &&
    form.cvv.length >= 3;

  return (
    <Card className="border border-white/10 bg-background/60">
      <CardBody className="space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-semibold text-foreground">
              Cartão de crédito
            </p>
            <p className="text-xs text-default-500">
              Valor da cobrança:{" "}
              {new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: "BRL",
              }).format(amount)}
            </p>
          </div>
        </div>

        <Input
          label="Número do cartão"
          placeholder="0000 0000 0000 0000"
          value={form.cardNumber}
          onValueChange={(value) => handleChange("cardNumber", value)}
        />

        <Input
          label="Nome no cartão"
          placeholder="Como impresso no cartão"
          value={form.cardName}
          onValueChange={(value) => handleChange("cardName", value)}
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="Mês"
            placeholder="MM"
            value={form.expiryMonth}
            onValueChange={(value) => handleChange("expiryMonth", value)}
          />
          <Input
            label="Ano"
            placeholder="AA"
            value={form.expiryYear}
            onValueChange={(value) => handleChange("expiryYear", value)}
          />
          <Input
            label="CVV"
            placeholder="123"
            value={form.cvv}
            onValueChange={(value) => handleChange("cvv", value)}
          />
        </div>

        <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3 text-xs text-default-500">
          <div className="flex items-center gap-2 font-medium text-primary">
            <Lock className="h-3.5 w-3.5" />
            Processamento seguro
          </div>
          <p className="mt-1">
            Os dados são enviados apenas para autorização da cobrança do pacote.
          </p>
        </div>

        <Button
          color="primary"
          isDisabled={!isValid || isLoading}
          isLoading={isLoading}
          onPress={() => onSubmit(form)}
        >
          Confirmar pagamento
        </Button>
      </CardBody>
    </Card>
  );
}
