import { generateText, type LanguageModel } from "ai";
import type { BuilderPreviewInput } from "@/lib/builder-preview";

export async function runBuilderPreview(model: LanguageModel, input: BuilderPreviewInput) {
  const result = await generateText({
    model,
    system: `You are previewing an unsaved agent. No external tools, connected apps, files, or workspace knowledge are available in this preview. Use only the user's input and general knowledge. Do not claim to have accessed or changed external data.\n\nAgent instructions:\n${input.instructions}`,
    prompt: input.prompt,
    maxOutputTokens: 1500,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(45000),
  });
  return result.text;
}
