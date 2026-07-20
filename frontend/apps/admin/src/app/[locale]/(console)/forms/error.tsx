"use client";

import { RouteError } from "@/components/system/route-error";

export default function ErrorBoundary({ reset }: { error: Error; reset: () => void }) {
  return <RouteError reset={reset} />;
}
