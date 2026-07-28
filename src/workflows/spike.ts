import { getWritable } from "workflow";

async function emitGreeting(name: string) {
  "use step";
  const writer = getWritable<{ message: string }>({ namespace: "progress" }).getWriter();
  try {
    await writer.write({ message: `hello ${name}` });
  } finally {
    writer.releaseLock();
  }
  return `greeted ${name}`;
}

export async function spikeWorkflow(name: string) {
  "use workflow";
  const result = await emitGreeting(name);
  return { result };
}
