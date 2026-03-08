type TenantBrandingResponse =
  | {
      success: true;
      data: {
        name: string | null;
        logoUrl: string | null;
        faviconUrl: string | null;
        primaryColor: string | null;
        secondaryColor: string | null;
        accentColor: string | null;
        loginBackgroundUrl: string | null;
      };
    }
  | {
      success: false;
      data: null;
      error?: string;
    };

export async function fetchTenantBrandingFromDomain(): Promise<TenantBrandingResponse> {
  const res = await fetch("/api/tenant-branding", {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    return { success: false, data: null };
  }

  return (await res.json()) as TenantBrandingResponse;
}
