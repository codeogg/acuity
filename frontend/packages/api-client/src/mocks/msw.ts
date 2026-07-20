// MSW authoring primitives, re-exported from the one package that owns `msw` as
// a dependency. Apps that extend the mock backend with their own handlers import
// `http` / `HttpResponse` from "@acuity/api-client/mocks" instead of "msw"
// directly — so no app needs a direct `msw` dependency, a bundler alias, or a
// tsconfig path to reach the primitives (pnpm scopes `msw` to this package). The
// foundation handlers under ./handlers already import these from "msw" locally;
// this module is the app-facing surface.

export { http, HttpResponse } from "msw";
export type { RequestHandler, HttpHandler } from "msw";
