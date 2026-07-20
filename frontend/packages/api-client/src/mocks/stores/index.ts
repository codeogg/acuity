// The stateful mock stores, keyed by surface: the doctor claims loop, the admin
// entity groups, the auth journey, and the frontend-only destinations. Apps and
// dev tooling import via "@acuity/api-client/mocks/stores".

export * from "./admin-store";
export * from "./claims-store";
export * from "./frontend-only-store";
export * as authStore from "./auth-store";
