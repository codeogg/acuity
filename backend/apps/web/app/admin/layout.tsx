import { redirect } from "next/navigation";

import { AppShell, type NavItem } from "@/components/shared/AppShell";
import { getSession } from "@/lib/auth/session";

const NAV: NavItem[] = [
  { href: "/admin/clinics", label: "admin.nav.clinics" },
  { href: "/admin/doctors", label: "admin.nav.doctors" },
  { href: "/admin/insurance-companies", label: "admin.nav.insurers" },
  { href: "/admin/standard-fields", label: "admin.nav.standardFields" },
  { href: "/admin/templates", label: "admin.nav.templates" },
  { href: "/admin/stats", label: "admin.nav.aiUsage" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "DOCTOR") redirect("/doctor");

  return (
    <AppShell title="admin.shell.title" nav={NAV} displayName={session.display_name}>
      {children}
    </AppShell>
  );
}
