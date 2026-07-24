"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import {
  ImpersonationBar,
  type ImpersonationUiMode,
} from "./impersonation-bar";
import { ImpersonationTabSignal } from "./impersonation-tab-signal";
import { exitImpersonationAndCloseTab } from "./impersonation-exit";

export function ImpersonationBannerHost({
  mode,
  doctorName,
}: {
  mode: ImpersonationUiMode;
  doctorName: string;
}) {
  const locale = useLocale();
  const router = useRouter();
  const [exiting, setExiting] = useState(false);

  const onExit = useCallback(async () => {
    if (exiting) return;
    setExiting(true);
    try {
      await exitImpersonationAndCloseTab(locale);
      if (!window.closed) router.replace("/impersonation-ended");
    } finally {
      setExiting(false);
    }
  }, [exiting, locale, router]);

  return (
    <>
      <ImpersonationTabSignal doctor={doctorName} mode={mode} />
      <ImpersonationBar
        mode={mode}
        doctorName={doctorName}
        exiting={exiting}
        onExit={() => {
          void onExit();
        }}
      />
    </>
  );
}
