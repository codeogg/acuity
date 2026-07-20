// Contract tests for the api-client error mapping. The backend speaks two
// error shapes — native FastAPI 422 { detail: [...] } and the domain envelope
// { error: { code, message } } — and messages may be Chinese. Every endpoint
// rejects with a typed ApiError whose `kind` encodes the outcome, including
// 409 (row_version optimistic lock) and tenant-isolation 404.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { ApiError, api } from "@acuity/api-client";

// Absolute base so Node fetch resolves; MSW intercepts before the network.
const BASE = "http://acuity.test/api";
process.env.NEXT_PUBLIC_API_BASE = BASE;

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

async function expectApiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error("expected the request to reject with ApiError");
}

describe("ApiError mapping", () => {
  it("maps a 409 row_version envelope to kind=conflict", async () => {
    server.use(
      http.put(`${BASE}/admin/template-fields/1`, () =>
        HttpResponse.json(
          { error: { code: "ROW_VERSION_CONFLICT", message: "版本衝突，請重新載入" } },
          { status: 409 },
        ),
      ),
    );
    const error = await expectApiError(
      api.put("/admin/template-fields/1", { row_version: 1 }),
    );
    expect(error.kind).toBe("conflict");
    expect(error.isConflict).toBe(true);
    expect(error.status).toBe(409);
    expect(error.code).toBe("ROW_VERSION_CONFLICT");
    // Traditional Chinese backend messages surface verbatim.
    expect(error.message).toBe("版本衝突，請重新載入");
  });

  it("maps a tenant-isolation 404 envelope to kind=not_found", async () => {
    server.use(
      http.get(`${BASE}/doctor/claims/999`, () =>
        HttpResponse.json(
          { error: { code: "NOT_FOUND", message: "理賠記錄不存在" } },
          { status: 404 },
        ),
      ),
    );
    const error = await expectApiError(api.get("/doctor/claims/999"));
    expect(error.kind).toBe("not_found");
    expect(error.isNotFound).toBe(true);
    expect(error.message).toBe("理賠記錄不存在");
  });

  it("maps native FastAPI 422 detail[] to kind=validation with details", async () => {
    const detail = [
      { loc: ["body", "patient_name"], msg: "Field required", type: "missing" },
    ];
    server.use(
      http.post(`${BASE}/doctor/claims`, () =>
        HttpResponse.json({ detail }, { status: 422 }),
      ),
    );
    const error = await expectApiError(api.post("/doctor/claims", {}));
    expect(error.kind).toBe("validation");
    expect(error.status).toBe(422);
    expect(error.message).toBe("Field required");
    expect(error.validation).toEqual(detail);
  });

  it("maps 401 / 403 / 429 / 503 to their kinds", async () => {
    const cases = [
      [401, "unauthorized"],
      [403, "forbidden"],
      [429, "rate_limited"],
      [503, "ai_unavailable"],
    ] as const;
    for (const [status, kind] of cases) {
      server.use(
        http.get(`${BASE}/status-probe`, () =>
          HttpResponse.json(
            { error: { code: "E", message: `status ${status}` } },
            { status },
          ),
        ),
      );
      const error = await expectApiError(api.get("/status-probe"));
      expect(error.kind).toBe(kind);
      expect(error.status).toBe(status);
    }
  });

  it("maps a non-envelope error body to kind=unknown with a status message", async () => {
    server.use(
      http.get(`${BASE}/broken`, () =>
        HttpResponse.text("Internal Server Error", { status: 500 }),
      ),
    );
    const error = await expectApiError(api.get("/broken"));
    expect(error.kind).toBe("unknown");
    expect(error.status).toBe(500);
    expect(error.message).toBe("Request failed with status 500");
  });

  it("maps transport failure to kind=network", async () => {
    server.use(
      http.get(`${BASE}/offline`, () => HttpResponse.error()),
    );
    const error = await expectApiError(api.get("/offline"));
    expect(error.kind).toBe("network");
    expect(error.status).toBe(0);
  });

  it("resolves 200 JSON and 204 empty responses", async () => {
    server.use(
      http.get(`${BASE}/doctor/home/overview`, () =>
        HttpResponse.json({ items: [], total: 0, page: 1, page_size: 20 }),
      ),
      http.delete(`${BASE}/admin/templates/5`, () =>
        new HttpResponse(null, { status: 204 }),
      ),
    );
    await expect(api.get("/doctor/home/overview")).resolves.toEqual({
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
    });
    await expect(api.delete("/admin/templates/5")).resolves.toBeUndefined();
  });
});
