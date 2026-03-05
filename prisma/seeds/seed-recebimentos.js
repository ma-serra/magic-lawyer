const bcrypt = require("bcryptjs");

async function seedRecebimentos(prisma, Prisma) {
  console.log("💰 Seeding recebimentos (parcelas e faturas pagas)...");

  // Buscar tenants existentes
  const tenants = await prisma.tenant.findMany({
    where: { status: "ACTIVE" },
    include: {
      usuarios: {
        where: { role: "ADMIN" },
        take: 1,
      },
    },
  });

  if (tenants.length === 0) {
    console.log("❌ Nenhum tenant encontrado. Execute os seeds de tenants primeiro.");
    return;
  }

  for (const tenant of tenants) {
    console.log(`💰 Processando recebimentos para: ${tenant.name}`);

    // Buscar contratos com processos e advogados
    const contratos = await prisma.contrato.findMany({
      where: {
        tenantId: tenant.id,
        status: { in: ["ATIVO", "ENCERRADO"] },
      },
      include: {
        cliente: true,
        processo: true,
        advogadoResponsavel: {
          include: {
            usuario: true,
          },
        },
        tipo: true,
        parcelas: {
          where: { status: "PENDENTE" },
        },
      },
    });

    if (contratos.length === 0) {
      console.log(`⚠️  Nenhum contrato encontrado para ${tenant.name}`);
      continue;
    }

    console.log(`📋 Encontrados ${contratos.length} contratos para processar`);

    // Buscar dados bancários do tenant
    const dadosBancarios = await prisma.dadosBancarios.findMany({
      where: { tenantId: tenant.id },
      take: 2,
    });

    if (dadosBancarios.length === 0) {
      console.log(`⚠️  Nenhum dado bancário encontrado para ${tenant.name}`);
      continue;
    }

    // 1. CRIAR PARCELAS PAGAS COM INFORMAÇÕES COMPLETAS
    console.log(`💳 Criando parcelas pagas para ${tenant.name}...`);
    const parcelasPagas = [];

    for (let i = 0; i < 15; i++) {
      const contrato = contratos[Math.floor(Math.random() * contratos.length)];
      const dadosBancariosAleatorio = dadosBancarios[Math.floor(Math.random() * dadosBancarios.length)];

      // Verificar se já existem parcelas para este contrato
      const parcelasExistentes = await prisma.contratoParcela.findMany({
        where: { contratoId: contrato.id },
        orderBy: { numeroParcela: "desc" },
        take: 1,
      });

      const numeroParcela = parcelasExistentes.length > 0 ? parcelasExistentes[0].numeroParcela + 1 : 1;
      const valorParcela = Math.floor(Math.random() * 50000) + 1000; // R$ 1.000 a R$ 50.000
      const dataVencimento = new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000); // Últimos 6 meses
      const dataPagamento = new Date(dataVencimento.getTime() + Math.random() * 30 * 24 * 60 * 60 * 1000); // Pago até 30 dias após vencimento

      const formasPagamento = ["PIX", "DINHEIRO", "CARTAO"];

      const formaPagamento = formasPagamento[Math.floor(Math.random() * formasPagamento.length)];

      // Dados do pagamento (simulando dados do Asaas ou manual)
      const dadosPagamento = {
        formaPagamento,
        valor: valorParcela,
        dataPagamento: dataPagamento.toISOString(),
        ...(formaPagamento === "PIX" && {
          chavePix: "pix@exemplo.com",
          transacaoId: `PIX${Date.now()}${Math.random().toString(36).substr(2, 9)}`,
        }),
        ...(formaPagamento === "CARTAO" && {
          numeroCartao: "**** **** **** " + Math.random().toString().substr(2, 4),
          bandeira: ["VISA", "MASTERCARD", "ELO"][Math.floor(Math.random() * 3)],
          parcelas: Math.floor(Math.random() * 12) + 1,
        }),
      };

      const referenciaContrato = contrato.titulo || contrato.id;

      const parcela = await prisma.contratoParcela.create({
        data: {
          tenantId: tenant.id,
          contratoId: contrato.id,
          dadosBancariosId: dadosBancariosAleatorio.id,
          numeroParcela,
          titulo: `Parcela ${numeroParcela} - ${contrato.titulo}`,
          descricao: `Pagamento referente à parcela ${numeroParcela} do contrato ${referenciaContrato}`,
          valor: valorParcela,
          dataVencimento,
          dataPagamento,
          status: "PAGA",
          formaPagamento,
          asaasPaymentId: Math.random() > 0.5 ? `asaas_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` : null,
          dadosPagamento,
          responsavelUsuarioId: tenant.usuarios[0]?.id,
        },
      });

      parcelasPagas.push(parcela);
    }

    // 2. CRIAR FATURAS PAGAS (SUBSCRIPTIONS)
    console.log(`🏢 Criando faturas pagas para ${tenant.name}...`);
    const faturasPagas = [];

    // Buscar subscriptions do tenant
    const subscriptions = await prisma.tenantSubscription.findMany({
      where: { tenantId: tenant.id },
      include: {
        plano: true,
      },
    });

    for (let i = 0; i < 8; i++) {
      const subscription = subscriptions[Math.floor(Math.random() * subscriptions.length)];
      const valorFatura = Math.floor(Math.random() * 2000) + 100; // R$ 100 a R$ 2.000
      const dataVencimento = new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000); // Últimos 3 meses
      const dataPagamento = new Date(dataVencimento.getTime() + Math.random() * 15 * 24 * 60 * 60 * 1000); // Pago até 15 dias após vencimento

      const formasPagamento = ["PIX", "DINHEIRO", "CARTAO"];
      const formaPagamento = formasPagamento[Math.floor(Math.random() * formasPagamento.length)];

      const dadosPagamento = {
        formaPagamento,
        valor: valorFatura,
        dataPagamento: dataPagamento.toISOString(),
        subscriptionId: subscription.id,
        plano: subscription.plano.nome,
        ...(formaPagamento === "PIX" && {
          chavePix: "pix@magiclawyer.com",
          transacaoId: `PIX_SUB_${Date.now()}${Math.random().toString(36).substr(2, 9)}`,
        }),
      };

      const fatura = await prisma.fatura.create({
        data: {
          tenantId: tenant.id,
          subscriptionId: subscription.id,
          numero: `FAT-${String(i + 1).padStart(4, "0")}-${new Date().getFullYear()}`,
          descricao: `Fatura mensal - Plano ${subscription.plano.nome}`,
          valor: valorFatura,
          vencimento: dataVencimento,
          pagoEm: dataPagamento,
          status: "PAGA",
          metadata: dadosPagamento,
        },
      });

      faturasPagas.push(fatura);
    }

    // 3. CRIAR ALGUMAS PARCELAS PENDENTES PARA CONTRASTE
    console.log(`⏳ Criando parcelas pendentes para ${tenant.name}...`);

    for (let i = 0; i < 5; i++) {
      const contrato = contratos[Math.floor(Math.random() * contratos.length)];
      const dadosBancariosAleatorio = dadosBancarios[Math.floor(Math.random() * dadosBancarios.length)];

      // Verificar se já existem parcelas para este contrato
      const parcelasExistentes = await prisma.contratoParcela.findMany({
        where: { contratoId: contrato.id },
        orderBy: { numeroParcela: "desc" },
        take: 1,
      });

      const numeroParcela = parcelasExistentes.length > 0 ? parcelasExistentes[0].numeroParcela + 1 : 1;
      const valorParcela = Math.floor(Math.random() * 30000) + 1000;
      const dataVencimento = new Date(Date.now() + Math.random() * 60 * 24 * 60 * 60 * 1000); // Próximos 60 dias

      const referenciaContrato = contrato.titulo || contrato.id;

      await prisma.contratoParcela.create({
        data: {
          tenantId: tenant.id,
          contratoId: contrato.id,
          dadosBancariosId: dadosBancariosAleatorio.id,
          numeroParcela,
          titulo: `Parcela ${numeroParcela} - ${contrato.titulo}`,
          descricao: `Parcela ${numeroParcela} do contrato ${referenciaContrato} - Vencimento em ${dataVencimento.toLocaleDateString()}`,
          valor: valorParcela,
          dataVencimento,
          status: "PENDENTE",
          responsavelUsuarioId: tenant.usuarios[0]?.id,
        },
      });
    }

    console.log(`✅ Seed de recebimentos concluído para ${tenant.name}:`);
    console.log(`   💳 ${parcelasPagas.length} parcelas pagas criadas`);
    console.log(`   🏢 ${faturasPagas.length} faturas pagas criadas`);
    console.log(`   ⏳ 5 parcelas pendentes criadas`);
    console.log(`   📊 Dados completos com processos, advogados e clientes`);
    console.log(`   🔗 Relacionamentos corretos entre todas as entidades`);
  }

  console.log("🎉 Seed de recebimentos concluído!");
}

module.exports = { seedRecebimentos };
