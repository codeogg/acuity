import type { ReactNode } from "react";
import "@/lib/api-session";
import "./globals.css";

export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
