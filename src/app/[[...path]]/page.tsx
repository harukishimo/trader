import { authorized, configured } from "@/server/auth";
import { bootstrap } from "@/core/service";
import { Dashboard } from "@/components/dashboard";
import { Login } from "@/components/login";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path = [] } = await params;
  const valid = [
    "watchlist",
    "instruments",
    "compare",
    "evaluations",
    "paper",
    "alerts",
    "settings",
  ];
  if (path[0] && !valid.includes(path[0])) notFound();
  if (!configured()) return <Login setup />;
  if (!(await authorized())) return <Login />;
  const data = await bootstrap().catch(() => null);
  if (!data) return <Login databaseError />;
  return <Dashboard initial={data} path={path} />;
}
