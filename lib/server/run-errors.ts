import { APICallError, RetryError } from "ai";
import { AppError } from "./http";
export function runErrorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (RetryError.isInstance(error)) return runErrorMessage(error.lastError);
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 401 || error.statusCode === 403)
      return "The provider rejected the key or model access. Ask an organization admin to check Settings → Models & API keys.";
    if (error.statusCode === 404)
      return "This model is not available to your account. Configure the agent and choose an available model.";
    if (error.statusCode === 429)
      return "The model provider reached a usage or rate limit. Check provider credits and limits before trying again.";
    if (error.statusCode && error.statusCode >= 500)
      return "The model provider is temporarily unavailable. Try again shortly.";
  }
  if (
    error instanceof Error &&
    ["TimeoutError", "AbortError"].includes(error.name)
  )
    return "This run reached its time limit. Try a smaller task or reduce the number of steps.";
  return "The agent could not finish. Check its model and app connections, then try a smaller task.";
}
