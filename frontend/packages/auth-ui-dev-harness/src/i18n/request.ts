import { createLocaleRequestConfig } from "@acuity/i18n/request";
import { authUiMessages } from "@acuity/auth-ui/messages";

// Demonstrates the catalog merge a consuming app performs: app-local strings
// plus the auth-ui package catalogs under their "auth" namespace.
export default createLocaleRequestConfig(async (locale) => {
  const app = (await import(`../../messages/${locale}.json`)).default;
  return { default: { ...app, ...authUiMessages(locale) } };
});
