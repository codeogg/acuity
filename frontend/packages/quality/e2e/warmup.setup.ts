import { test } from "@playwright/test";

// Dev-server warm-up (a dependency project that runs before every spec): the
// three app dev servers compile routes on demand, so the first spec against a
// cold route used to race its compile. Fetching the primary destinations once
// here makes the suite deterministic without retries.

const ROUTES = [
  // doctor app (3000)
  "http://localhost:3000/en-HK",
  "http://localhost:3000/en-HK/sign-in",
  "http://localhost:3000/en-HK/forms/new",
  "http://localhost:3000/en-HK/history",
  "http://localhost:3000/en-HK/patients",
  // site (3001)
  "http://localhost:3001/en-HK",
  "http://localhost:3001/en-HK/how-it-works",
  "http://localhost:3001/en-HK/contact",
  // admin console (3002)
  "http://localhost:3002/en-HK",
  "http://localhost:3002/en-HK/sign-in",
  "http://localhost:3002/en-HK/clinics",
  "http://localhost:3002/en-HK/doctors",
  "http://localhost:3002/en-HK/tickets",
  "http://localhost:3002/en-HK/forms",
  "http://localhost:3002/en-HK/claims",
  "http://localhost:3002/en-HK/audit",
];

test("warm the dev servers' primary routes", async ({ request }) => {
  test.setTimeout(300_000);
  for (const route of ROUTES) {
    const response = await request.get(route, { timeout: 120_000 });
    if (!response.ok()) {
      throw new Error(`warm-up fetch failed: ${route} -> ${response.status()}`);
    }
  }
});
