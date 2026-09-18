import { checkCron } from "@/server/auth";
import { ensureData } from "@/core/service";
import { runJobs, scheduleDaily } from "@/core/jobs";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  if (!checkCron(request)) return new Response("Unauthorized", { status: 401 });
  await ensureData();
  await scheduleDaily();
  return Response.json(await runJobs(45000));
}
