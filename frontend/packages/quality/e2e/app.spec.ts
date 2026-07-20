import { smokeSurface } from "./smoke";

smokeSurface({
  name: "app",
  port: 3000,
  brandFontReady: true,
  // The doctor app enforces the session gate in middleware; the smoke rides
  // a seeded mock session (the real journey is proven in app-auth-journeys).
  sessionGated: true,
});
