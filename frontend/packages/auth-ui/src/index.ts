// @acuity/auth-ui — the shared authentication journey set + mount kit.
//
// A consuming Next.js app adopts the full journey with:
//   1. a sign-in page:   export default createAuthPage({ ...doctorAuthMount })
//   2. middleware:       createAuthMiddleware(...) from "@acuity/auth-ui/middleware"
//   3. styles:           @import "@acuity/auth-ui/styles.css" after @acuity/ui
//   4. sign-out:         <SignOutButton /> (adapter POST, never a GET link)
//   5. session guard:    useSessionGuard() on protected pages (deep-link
//                        preserving session-expiry re-entry)
// Catalogs are package-local (see "@acuity/auth-ui/messages"); the journey
// carries its own provider, so no app-catalog merge is required to mount.

export { AuthJourney, type AuthJourneyProps } from "./components/auth-journey";
export {
  SignOutButton,
  signOut,
  type SignOutOptions,
} from "./components/sign-out";
export {
  useSessionGuard,
  type SessionGuard,
  type SessionGuardOptions,
  type SessionGuardState,
} from "./components/use-session-guard";
export { createAuthPage } from "./mount/create-auth-page";
export {
  MOCK_SESSION_COOKIE,
  doctorAuthMount,
  operatorAuthMount,
  type AuthMountConfig,
} from "./mount/config";
export {
  parseAuthEntry,
  isInternalPath,
  resolveDestination,
  resolveErrorNote,
  roleAllowed,
  swapLocaleInPath,
  type AuthEntryParams,
} from "./journey/logic";
export type {
  AuthNote,
  AuthNoteKind,
  AuthScreen,
  AuthSurfaceKind,
  ClinicOption,
} from "./journey/types";
export { AUTH_UI_NAMESPACE, authUiMessages, type AuthUiMessages } from "./messages";
