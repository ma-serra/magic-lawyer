import { getSession } from "@/app/lib/auth";

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
  const role = String((session?.user as any)?.role ?? "");

  if (!email) {
    return false;
  }

  if (process.env.NODE_ENV === "development") {
    return true;
  }

  if (process.env.NODE_ENV !== "production") {
    return false;
  }

  if (role !== "SUPER_ADMIN") {
    return false;
  }

  return getProductionAllowlist().has(email);
}
