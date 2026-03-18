const { PrismaClient } = require("../../generated/prisma");

const prisma = new PrismaClient();

const bancosBrasil = [
  {
    codigo: "001",
    nome: "Banco do Brasil",
    nomeCompleto: "Banco do Brasil S.A.",
    ispb: "00000000",
    site: "https://www.bb.com.br",
    telefone: "4004-0001",
  },
  {
    codigo: "004",
    nome: "Banco do Nordeste",
    nomeCompleto: "Banco do Nordeste do Brasil S.A.",
    ispb: "07237373",
    site: "https://www.bnb.gov.br",
    telefone: "0800 728 3030",
  },
  {
    codigo: "021",
    nome: "Banestes",
    nomeCompleto: "Banco do Estado do Espirito Santo S.A.",
    ispb: "28127603",
    site: "https://www.banestes.com.br",
    telefone: "0800 283 8383",
  },
  {
    codigo: "033",
    nome: "Santander",
    nomeCompleto: "Banco Santander (Brasil) S.A.",
    ispb: "90400888",
    site: "https://www.santander.com.br",
    telefone: "0800 762 7777",
  },
  {
    codigo: "036",
    nome: "Bradesco BBI",
    nomeCompleto: "Banco Bradesco BBI S.A.",
    ispb: "06271464",
    site: "https://www.bradescobbi.com.br",
    telefone: "0800 704 8383",
  },
  {
    codigo: "041",
    nome: "Banrisul",
    nomeCompleto: "Banco do Estado do Rio Grande do Sul S.A.",
    ispb: "92702067",
    site: "https://www.banrisul.com.br",
    telefone: "0800 051 9999",
  },
  {
    codigo: "070",
    nome: "BRB",
    nomeCompleto: "Banco de Brasilia S.A.",
    ispb: "00000208",
    site: "https://www.brb.com.br",
    telefone: "0800 644 0700",
  },
  {
    codigo: "077",
    nome: "Inter",
    nomeCompleto: "Banco Inter S.A.",
    ispb: "00416968",
    site: "https://www.bancointer.com.br",
    telefone: "0800 940 0007",
  },
  {
    codigo: "085",
    nome: "Ailos",
    nomeCompleto: "Cooperativa Central de Credito Ailos",
    ispb: "05442029",
    site: "https://www.ailos.coop.br",
    telefone: "0800 647 2200",
  },
  {
    codigo: "104",
    nome: "Caixa",
    nomeCompleto: "Caixa Economica Federal",
    ispb: "00360305",
    site: "https://www.caixa.gov.br",
    telefone: "0800 726 0104",
  },
  {
    codigo: "184",
    nome: "Itau BBA",
    nomeCompleto: "Banco Itau BBA S.A.",
    ispb: "01023570",
    site: "https://www.itau.com.br/itaubba-pt",
    telefone: "0800 728 0728",
  },
  {
    codigo: "212",
    nome: "Original",
    nomeCompleto: "Banco Original S.A.",
    ispb: "92894922",
    site: "https://www.original.com.br",
    telefone: "0800 775 0808",
  },
  {
    codigo: "237",
    nome: "Bradesco",
    nomeCompleto: "Banco Bradesco S.A.",
    ispb: "60746948",
    site: "https://www.bradesco.com.br",
    telefone: "0800 704 8383",
  },
  {
    codigo: "260",
    nome: "Nu Pagamentos",
    nomeCompleto: "Nu Pagamentos S.A.",
    ispb: "18236120",
    site: "https://nubank.com.br",
    telefone: "0800 591 2117",
  },
  {
    codigo: "290",
    nome: "PagSeguro",
    nomeCompleto: "Pagseguro Internet S.A.",
    ispb: "08561701",
    site: "https://pagseguro.uol.com.br",
    telefone: "0800 728 2174",
  },
  {
    codigo: "323",
    nome: "Mercado Pago",
    nomeCompleto: "Mercado Pago Instituicao de Pagamento Ltda.",
    ispb: "10573521",
    site: "https://www.mercadopago.com.br",
    telefone: "0800 637 7246",
  },
  {
    codigo: "336",
    nome: "C6 Bank",
    nomeCompleto: "Banco C6 S.A.",
    ispb: "31872495",
    site: "https://www.c6bank.com.br",
    telefone: "0800 660 0060",
  },
  {
    codigo: "341",
    nome: "Itau",
    nomeCompleto: "Itau Unibanco S.A.",
    ispb: "60701190",
    site: "https://www.itau.com.br",
    telefone: "0800 728 0728",
  },
  {
    codigo: "394",
    nome: "Bradesco Financiamentos",
    nomeCompleto: "Banco Bradesco Financiamentos S.A.",
    ispb: "07207996",
    site: "https://banco.bradesco/financiamentos",
    telefone: "0800 570 7000",
  },
  {
    codigo: "422",
    nome: "Safra",
    nomeCompleto: "Banco Safra S.A.",
    ispb: "58160789",
    site: "https://www.safra.com.br",
    telefone: "0800 772 5755",
  },
  {
    codigo: "623",
    nome: "Banco Pan",
    nomeCompleto: "Banco Pan S.A.",
    ispb: "59285411",
    site: "https://www.bancopan.com.br",
    telefone: "0800 776 8000",
  },
  {
    codigo: "633",
    nome: "Banco Rendimento",
    nomeCompleto: "Banco Rendimento S.A.",
    ispb: "68900810",
    site: "https://www.rendimento.com.br",
    telefone: "0800 775 9500",
  },
  {
    codigo: "655",
    nome: "Votorantim",
    nomeCompleto: "Banco Votorantim S.A.",
    ispb: "59588111",
    site: "https://www.bv.com.br",
    telefone: "0800 772 8028",
  },
  {
    codigo: "748",
    nome: "Sicredi",
    nomeCompleto: "Banco Cooperativo Sicredi S.A.",
    ispb: "01181521",
    site: "https://www.sicredi.com.br",
    telefone: "0800 724 7220",
  },
  {
    codigo: "756",
    nome: "Sicoob",
    nomeCompleto: "Banco Cooperativo Sicoob S.A.",
    ispb: "02038232",
    site: "https://www.sicoob.com.br",
    telefone: "0800 642 0000",
  },
];

async function seedBancos() {
  console.log("🏦 Iniciando seed de bancos...");

  try {
    const bancosCriados = await prisma.banco.createMany({
      data: bancosBrasil,
      skipDuplicates: true,
    });

    console.log(`✅ ${bancosCriados.count} bancos inseridos no catálogo!`);

    const bancosListados = await prisma.banco.findMany({
      take: 5,
      orderBy: { codigo: "asc" },
      select: {
        codigo: true,
        nome: true,
        nomeCompleto: true,
      },
    });

    console.log("📋 Amostra do catálogo:");
    bancosListados.forEach((banco) => {
      console.log(`   ${banco.codigo} - ${banco.nome} (${banco.nomeCompleto})`);
    });
  } catch (error) {
    console.error("❌ Erro ao criar bancos:", error);
    throw error;
  }
}

module.exports = { seedBancos };
