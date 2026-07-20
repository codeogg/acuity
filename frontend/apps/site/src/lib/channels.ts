// The concierge contact channels, defined once (mirrors the reference site.js
// constants). Every WhatsApp / demo / email destination on the site reads from
// here so a channel change lands everywhere at once.

export const EMAIL_ADDRESS = "hello@acuity.hk";
export const COMPLIANCE_EMAIL_ADDRESS = "compliance@acuity.hk";

export const WHATSAPP = "https://wa.me/85291234567";
export const CALENDLY = "https://calendly.com/acuity-hk/20min";
export const EMAIL = `mailto:${EMAIL_ADDRESS}`;
export const COMPLIANCE_EMAIL = `mailto:${COMPLIANCE_EMAIL_ADDRESS}`;

// Off-site hand-off kinds (drive the calm hand-off toast copy).
export type HandoffKind = "whatsapp" | "demo" | "email";
