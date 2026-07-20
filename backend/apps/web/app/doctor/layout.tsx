import { redirect } from "next/navigation";

import { DoctorAppShell } from "@/components/doctor/DoctorAppShell";
import { getSession } from "@/lib/auth/session";

export default async function DoctorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role !== "DOCTOR") redirect("/admin/clinics");

  return (
    <DoctorAppShell displayName={session.display_name}>{children}</DoctorAppShell>
  );
}
