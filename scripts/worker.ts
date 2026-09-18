import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { ensureData } from "../src/core/service";
import { runJobs, scheduleDaily } from "../src/core/jobs";
let stop = false;
process.on("SIGTERM", () => {
  stop = true;
});
process.on("SIGINT", () => {
  stop = true;
});
async function main() {
  await ensureData();
  let lastDay = "";
  while (!stop) {
    const day = new Date().toISOString().slice(0, 10);
    if (day !== lastDay) {
      await scheduleDaily();
      lastDay = day;
    }
    await runJobs(40000);
    if (!stop) await new Promise((r) => setTimeout(r, 2000));
  }
}
main().catch(() => {
  console.error("Worker failed. Check database configuration.");
  process.exitCode = 1;
});
