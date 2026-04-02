import { getSession } from "@/app/lib/auth";
import prisma from "@/app/lib/prisma";

function normalizeEmail(value?: string | null) {
  return value?.trim().toLowerCase() || "";
}

function getProductionAllowlist() {
  const raw = process.env.DEV_WORKBENCH_PROD_EMAIL_ALLOWLIST || "";

  return new Set(
    raw
      .split(/[,\n;]/)
      .map((item) => normalizeEmail(item))
      .filter(Boolean),
  );
}

export async function canCurrentUserAccessDevWorkbench() {
  const session = await getSession();
  const email = normalizeEmail(session?.user?.email);

  if (!email) {
    return false;
  }

  if (process.env.NODE_ENV === "development") {
    return true;
  }

  if (process.env.NODE_ENV !== "production") {
    return false;
  }

  const allowlist = getProductionAllowlist();

  if (!allowlist.has(email)) {
    return false;
  }

  const linkedSuperAdmin = await prisma.superAdmin.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      status: "ACTIVE",
    },
    select: { id: true },
  });

  return Boolean(linkedSuperAdmin);
}
