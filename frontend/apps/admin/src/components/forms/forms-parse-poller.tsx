"use client";

// While any template is still PENDING/PARSING, refresh the Forms grid so
// parse_progress and field counts update without a manual reload.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function FormsParsePoller({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      router.refresh();
    }, 2000);
    return () => window.clearInterval(id);
  }, [active, router]);

  return null;
}
