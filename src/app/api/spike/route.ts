import { start } from "workflow/api";
import { spikeWorkflow } from "@/workflows/spike";

export async function POST() {
  const run = await start(spikeWorkflow, ["aaron"]);
  const result = await run.returnValue;
  const reader = run.getReadable<{ message: string }>({ namespace: "progress" }).getReader();
  const { value } = await reader.read();
  return Response.json({ runId: run.runId, result, firstEvent: value ?? null });
}
