import { notFound } from "next/navigation";

import ConviteAcceptForm from "./convite-accept-form";

import { getConviteByToken } from "@/app/actions/convites-equipe";

interface ConvitePageProps {
  params: Promise<{
    token: string;
  }>;
}

export default async function ConvitePage({ params }: ConvitePageProps) {
  const { token } = await params;

  if (!token) {
    notFound();
  }

  const convite = await getConviteByToken(token);

  if (!convite) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <ConviteAcceptForm convite={convite} />
      </div>
    </div>
  );
}
