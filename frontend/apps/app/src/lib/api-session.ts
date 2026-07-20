import "server-only";

import { cookies } from "next/headers";
import { setServerSessionHeadersProvider } from "@acuity/api-client";

// Request-scoped session forwarding for server-rendered doctor-app API calls.
setServerSessionHeadersProvider(async (): Promise<Record<string, string>> => {
  const cookie = (await cookies()).toString();
  return cookie ? { cookie } : {};
});
