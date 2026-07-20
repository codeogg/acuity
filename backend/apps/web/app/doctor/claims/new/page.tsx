import { Suspense } from "react";

import ClaimFlowPageClient from "./ClaimFlowPageClient";
import { LocalizedLoading } from "../../LocalizedLoading";

export default function ClaimFlowPage() {
  return (
    <Suspense
      fallback={<LocalizedLoading />}
    >
      <ClaimFlowPageClient />
    </Suspense>
  );
}
