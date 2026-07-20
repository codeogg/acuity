import type { ReactNode } from "react";
import "@/lib/api-session";
import "./globals.css";

// Root layout. The <html>/<body> shell lives here; the locale layout under
// [locale] sets <html lang> per request. globals.css carries the full theme.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
