import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import prisma from "@/app/lib/prisma";

/**
 * API route para setup de dados de teste
 * ATENÇÃO: Apenas em ambiente de testes!
 * Protegido por variável de ambiente TEST_MODE=true
 */
export async function POST(request: Request) {
  // Apenas permitir em ambiente de testes
  if (process.env.NODE_ENV !== "test" && process.env.TEST_MODE !== "true") {
    return NextResponse.json(
      { error: "Esta rota só está disponível em modo de teste" },
      { status: 403 },
    );
  }

  try {
    const body = await request.json();
    const { action, data } = body;

    switch (action) {
      case "createTenant": {
        const tenant = await prisma.tenant.create({
          data: {
            name: data.nome || "Test Tenant",
            slug: data.slug || `test-tenant-${Date.now()}`,
            status: "ACTIVE",
          },
        });

        return NextResponse.json({ success: true, tenant });
      }

      case "createUser": {
        const passwordHash = await bcrypt.hash(data.password || "test123", 10);
        const user = await prisma.usuario.create({
          data: {
            tenantId: data.tenantId,
            email: data.email,
            passwordHash,
            firstName: data.firstName || "Test",
            lastName: data.lastName || "User",
            role: data.role || "ADVOGADO",
            active: true,
          },
        });

        return NextResponse.json({ success: true, user });
      }

      case "createCargo": {
        const cargo = await prisma.cargo.create({
          data: {
            tenantId: data.tenantId,
            nome: data.nome || "Test Cargo",
            nivel: data.nivel || 1,
            ativo: true,
            permissoes: data.permissoes
              ? {
                  create: data.permissoes.map((p: any) => ({
                    tenantId: data.tenantId,
                    modulo: p.modulo,
                    acao: p.acao,
                    permitido: p.permitido,
                  })),
                }
              : undefined,
          },
        });

        return NextResponse.json({ success: true, cargo });
      }

      case "cleanup": {
        if (data.tenantId) {
          const existing = await prisma.tenant.findUnique({
            where: { id: data.tenantId },
            select: {
              id: true,
              slug: true,
              domain: true,
              status: true,
              sessionVersion: true,
            },
          });

          if (existing) {
            const archivedSlug = `${existing.slug}-cleanup-${Date.now()}`.slice(0, 191);

            await prisma.tenant.update({
              where: { id: existing.id },
              data: {
                status: "CANCELLED",
                statusReason: "TEST_CLEANUP",
                statusChangedAt: new Date(),
                slug: archivedSlug,
                domain: null,
                sessionVersion: (existing.sessionVersion ?? 1) + 1,
              },
            });
          }
        }

        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json(
          { error: "Ação não reconhecida" },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("Erro no setup de testes:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao executar setup",
      },
      { status: 500 },
    );
  }
}
