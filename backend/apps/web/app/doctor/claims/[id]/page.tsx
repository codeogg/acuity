import { Suspense } from "react";

import ClaimDetailPageClient from "./ClaimDetailPageClient";
import { LocalizedLoading } from "../../LocalizedLoading";

export default async function ClaimDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const claimId = Number(id);

  return (
    <Suspense
      fallback={<LocalizedLoading />}
    >
      <ClaimDetailPageClient claimId={claimId} />
    </Suspense>
  );
}
