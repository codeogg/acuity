import "server-only";

import { cookies } from "next/headers";
import { setServerSessionHeadersProvider } from "@acuity/api-client";

// Register a request-scoped provider once for every admin server module.
// The callback reads cookies only when a request is being handled, so no user
// session is retained in module state or shared with another request.
setServerSessionHeadersProvider(async (): Promise<Record<string, string>> => {
  const cookie = (await cookies()).toString();
  return cookie ? { cookie } : {};
});
