import "dotenv/config";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

import prisma from "../app/lib/prisma";
import { ensureDefaultCargosForTenant } from "../app/lib/default-cargos";

const TENANT_SLUG = "dayane-assis-advocacia";
const TENANT_NAME = "Dayane Assis Advocacia e Consultoria Juridica";
const TENANT_EMAIL = "assisdayane@hotmail.com";
const TENANT_TIMEZONE = "America/Belem";
const ADMIN_FIRST_NAME = "Dayane";
const ADMIN_LAST_NAME = "Costa Assis";
const OAB_NUMERO = "21833";
const OAB_UF = "PA";

function generateTemporaryPassword() {
  return `Dayane@${randomBytes(4).toString("hex")}`;
}

async function main() {
  const providedPassword = process.env.DAYANE_TEMP_PASSWORD?.trim() || "";
  const temporaryPassword = providedPassword || generateTemporaryPassword();

  const existingTenant = await prisma.tenant.findUnique({
    where: { slug: TENANT_SLUG },
    select: { id: true },
  });
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);

  const result = await prisma.$transaction(async (tx) => {
    const tenant = existingTenant
      ? await tx.tenant.update({
          where: { id: existingTenant.id },
          data: {
            name: TENANT_NAME,
            email: TENANT_EMAIL,
            timezone: TENANT_TIMEZONE,
            tipoPessoa: "JURIDICA",
            domain: null,
            telefone: null,
            nomeFantasia: TENANT_NAME,
          },
        })
      : await tx.tenant.create({
          data: {
            name: TENANT_NAME,
            slug: TENANT_SLUG,
            email: TENANT_EMAIL,
            timezone: TENANT_TIMEZONE,
            tipoPessoa: "JURIDICA",
            domain: null,
            telefone: null,
            nomeFantasia: TENANT_NAME,
            status: "ACTIVE",
          },
        });

    await ensureDefaultCargosForTenant(tx, tenant.id);

    await tx.tenantBranding.upsert({
      where: { tenantId: tenant.id },
      update: {},
      create: {
        tenantId: tenant.id,
        primaryColor: "#2563eb",
        secondaryColor: "#1d4ed8",
        accentColor: "#3b82f6",
      },
    });

    let adminUser = await tx.usuario.findUnique({
      where: {
        email_tenantId: {
          email: TENANT_EMAIL,
          tenantId: tenant.id,
        },
      },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    let generatedPassword: string | null = null;

    if (!adminUser) {
      adminUser = await tx.usuario.create({
        data: {
          tenantId: tenant.id,
          email: TENANT_EMAIL,
          passwordHash,
          firstName: ADMIN_FIRST_NAME,
          lastName: ADMIN_LAST_NAME,
          role: "ADMIN",
          active: true,
        },
        select: {
          id: true,
          passwordHash: true,
        },
      });
      generatedPassword = temporaryPassword;
    } else {
      const shouldSetPassword = !adminUser.passwordHash;

      await tx.usuario.update({
        where: { id: adminUser.id },
        data: {
          firstName: ADMIN_FIRST_NAME,
          lastName: ADMIN_LAST_NAME,
          role: "ADMIN",
          active: true,
          ...(shouldSetPassword ? { passwordHash } : {}),
        },
      });

      if (shouldSetPassword) {
        generatedPassword = temporaryPassword;
      }
    }

    const conflictingAdvogado = await tx.advogado.findFirst({
      where: {
        tenantId: tenant.id,
        oabUf: OAB_UF,
        oabNumero: OAB_NUMERO,
      },
      select: {
        id: true,
        usuarioId: true,
      },
    });

    if (
      conflictingAdvogado &&
      conflictingAdvogado.usuarioId !== adminUser.id
    ) {
      throw new Error(
        `Ja existe outro advogado com OAB ${OAB_UF}/${OAB_NUMERO} neste tenant.`,
      );
    }

    const advogadoExistente = await tx.advogado.findUnique({
      where: { usuarioId: adminUser.id },
      select: { id: true },
    });

    if (advogadoExistente) {
      await tx.advogado.update({
        where: { id: advogadoExistente.id },
        data: {
          tenantId: tenant.id,
          oabNumero: OAB_NUMERO,
          oabUf: OAB_UF,
          isExterno: false,
        },
      });
    } else {
      await tx.advogado.create({
        data: {
          tenantId: tenant.id,
          usuarioId: adminUser.id,
          oabNumero: OAB_NUMERO,
          oabUf: OAB_UF,
          isExterno: false,
        },
      });
    }

    return {
      tenantId: tenant.id,
      userId: adminUser.id,
      generatedPassword,
      existed: Boolean(existingTenant),
    };
  });

  console.log("");
  console.log("=== Dayane pilot environment ===");
  console.log(`Tenant slug: ${TENANT_SLUG}`);
  console.log(`Tenant id: ${result.tenantId}`);
  console.log(`User id: ${result.userId}`);
  console.log(`Admin email: ${TENANT_EMAIL}`);
  console.log(`OAB: ${OAB_UF} ${OAB_NUMERO}`);
  console.log(`Tenant existed before run: ${result.existed ? "yes" : "no"}`);

  if (result.generatedPassword) {
    console.log(`Temporary password: ${result.generatedPassword}`);
  } else {
    console.log(
      "Temporary password: preserved existing password hash (no reset performed)",
    );
  }
}

main()
  .catch((error) => {
    console.error("Failed to create Dayane pilot environment");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
