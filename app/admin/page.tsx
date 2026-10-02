import { notFound, redirect } from "next/navigation";
import { Admin } from "@/components/Admin";
import { Header } from "@/components/Header";
import { touchAccess } from "@/lib/access";
import type { AdminOverview, AdminScan, AdminSettings, AdminUser } from "@/lib/admin";
import { getSession } from "@/lib/auth";

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const { tab } = await searchParams;
  const { supabase, user } = await getSession();
  if (!user) redirect("/login");

  // Non-admins get a plain 404 so the page does not advertise itself. The
  // database functions below refuse non-admins as well.
  const access = await touchAccess(supabase);
  if (access.role !== "admin") notFound();

  const [overview, users, scans, settings] = await Promise.all([
    supabase.rpc("mostviable_admin_overview"),
    supabase.rpc("mostviable_admin_users"),
    supabase.rpc("mostviable_admin_recent_scans", { lim: 50 }),
    supabase
      .from("mostviable_settings")
      .select("require_approval, default_daily_scan_limit")
      .single(),
  ]);
  const failed = [overview, users, scans, settings].find((r) => r.error);
  if (failed?.error) throw new Error(`Admin data failed to load: ${failed.error.message}`);

  return (
    <>
      <Header email={user.email} isAdmin />
      <Admin
        overview={overview.data as AdminOverview}
        users={users.data as AdminUser[]}
        scans={scans.data as AdminScan[]}
        settings={settings.data as AdminSettings}
        currentUserId={user.id}
        initialTab={typeof tab === "string" ? tab : undefined}
      />
    </>
  );
}
