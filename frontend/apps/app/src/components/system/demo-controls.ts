"use client";

// App-level demo switchboard complementing the mock scenario engine: states
// the reference reaches through its tweaks panel that live ABOVE the network
// layer (idle lock now, support-access notice, self-verification hold). A
// framework-free external store, mirrored by useSyncExternalStore consumers.

export interface DemoControls {
  lockNow: boolean;
  showSupportNotice: boolean;
  selfVerificationBlock: boolean;
}

const DEFAULTS: DemoControls = {
  lockNow: false,
  showSupportNotice: false,
  selfVerificationBlock: false,
};

let current: DemoControls = { ...DEFAULTS };
const listeners = new Set<() => void>();

export function getDemoControls(): DemoControls {
  return current;
}

export function setDemoControls(partial: Partial<DemoControls>): void {
  current = { ...current, ...partial };
  for (const notify of listeners) notify();
}

export function subscribeDemoControls(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
