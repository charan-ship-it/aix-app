import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { builderPreviewSchema } from "@/lib/builder-preview";
import { runBuilderPreview } from "@/lib/server/builder-preview";
import { AppError, errorResponse, readBody, requireUser } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/redis";
import { secret } from "@/lib/server/secrets";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    if (!(await rateLimit(`${user.organizationId}:${user.userId}:agent-preview`, 10)))
      throw new AppError(429, "Too many previews. Wait a minute and try again.");
    const parsed = builderPreviewSchema.safeParse(await readBody(req, 32000));
    if (!parsed.success) throw new AppError(400, "Add agent instructions and a sample message to preview.");
    const input = parsed.data;
    const key = await secret(user.organizationId, input.provider);
    if (!key) throw new AppError(428, "Connect the selected model provider in Settings first.");
    const model = input.provider === "openai"
      ? createOpenAI({ apiKey: key, baseURL: process.env.OPENAI_BASE_URL }).responses(input.model)
      : createAnthropic({ apiKey: key, baseURL: process.env.ANTHROPIC_BASE_URL })(input.model);
    const text = await runBuilderPreview(model, input);
    if (!text.trim()) throw new AppError(502, "The model returned an empty preview. Try again.");
    return Response.json({ text }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
