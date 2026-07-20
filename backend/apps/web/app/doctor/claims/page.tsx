import { Suspense } from "react";

import ClaimsPageClient from "./ClaimsPageClient";
import { LocalizedLoading } from "../LocalizedLoading";

export default function ClaimsPage() {
  return (
    <Suspense
      fallback={<LocalizedLoading />}
    >
      <ClaimsPageClient />
    </Suspense>
  );
}
