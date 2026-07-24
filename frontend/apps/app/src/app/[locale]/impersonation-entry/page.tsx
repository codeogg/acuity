import { Suspense } from "react";
import ImpersonationEntryClient from "./entry-client";

function EntryFallback() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background px-6">
      <div
        className="text-center select-none font-title text-2xl font-semibold text-primary"
        style={{ width: "min(24rem, calc(100vw - 3rem))" }}
      >
        Acuity
      </div>
    </div>
  );
}

export default function ImpersonationEntryPage() {
  return (
    <Suspense fallback={<EntryFallback />}>
      <ImpersonationEntryClient />
    </Suspense>
  );
}
