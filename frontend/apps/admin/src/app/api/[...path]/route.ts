// Mock backend seam — the console's /api/* surface in mock-first mode.
//
// Server components and server actions call the typed endpoints with an
// absolute base pointing back at this app; this catch-all resolves each
// request directly through the shared MSW admin handler set
// (@acuity/api-client/mocks/handlers) over the one stateful fixture
// universe. Direct handler dispatch (no network-level interception) keeps
// the store a single in-process instance across reads, writes and the
// impersonation session, in dev and `next start` alike. When the real
// backend exists this route is deleted and NEXT_PUBLIC_API_BASE points at it.
//
// The dev-only scenario switchboard lives on the same graph (same module
// instances as the handlers) at /api/dev/scenario?name=<scenario>[,<s2>].

import { NextResponse } from "next/server";
import { handlers } from "@acuity/api-client/mocks/handlers";
import {
  SCENARIO_NAMES,
  applyMockScenarioName,
  getMockScenario,
  resetMockScenario,
} from "@acuity/api-client/mocks/scenario";

const mocking = process.env.NEXT_PUBLIC_API_MOCKING !== "disabled";

// msw's RequestHandler#run — the same resolution getResponse() performs; typed
// loosely here because the app reaches msw only through the api-client package.
interface RunnableHandler {
  run(args: {
    request: Request;
    requestId: string;
    resolutionContext?: { baseUrl?: string };
  }): Promise<{ response?: Response } | null>;
}

function scenarioSwitchboard(url: URL): Response {
  const raw = url.searchParams.get("name");
  if (raw) {
    for (const name of raw.split(",")) {
      const trimmed = name.trim();
      if (trimmed === "baseline") resetMockScenario();
      else if (trimmed in SCENARIO_NAMES) applyMockScenarioName(trimmed as keyof typeof SCENARIO_NAMES);
      else return NextResponse.json({ error: `unknown scenario: ${trimmed}` }, { status: 400 });
    }
  }
  return NextResponse.json({ scenario: getMockScenario() });
}

async function dispatch(request: Request): Promise<Response> {
  if (!mocking) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "mock backend disabled" } },
      { status: 404 },
    );
  }
  const url = new URL(request.url);
  if (url.pathname === "/api/dev/scenario") return scenarioSwitchboard(url);

  const requestId = crypto.randomUUID();
  const baseUrl = url.origin;
  for (const handler of handlers as unknown as RunnableHandler[]) {
    const result = await handler.run({
      request: request.clone(),
      requestId,
      resolutionContext: { baseUrl },
    });
    if (result?.response) return result.response;
  }
  return NextResponse.json(
    { error: { code: "NOT_FOUND", message: `無此接口 No mock handler for ${url.pathname}` } },
    { status: 404 },
  );
}

export {
  dispatch as GET,
  dispatch as POST,
  dispatch as PUT,
  dispatch as PATCH,
  dispatch as DELETE,
};
