import { estimateBookCost } from "@/ai/estimate";
import { estimateRequestSchema } from "@/lib/validation/project";

export async function POST(req: Request) {
  const parsed = estimateRequestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { tier, chapters, wordsPerChapter } = parsed.data;
  return Response.json(estimateBookCost(tier, chapters, wordsPerChapter));
}
