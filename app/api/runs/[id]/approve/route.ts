import { z } from "zod";
import {
  requireUser,
  readBody,
  errorResponse,
  AppError,
} from "@/lib/server/http";
import { approveRun } from "@/lib/server/runtime";
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const u = await requireUser(req);
    const body = z
      .object({
        approved: z.boolean(),
        expectedApprovalIds: z
          .array(z.string().max(200))
          .min(1)
          .max(50)
          .optional(),
      })
      .safeParse(await readBody(req, 1000));
    if (!body.success) throw new AppError(400, "Choose approve or deny.");
    return Response.json(
      await approveRun(
        u,
        (await params).id,
        body.data.approved,
        body.data.expectedApprovalIds,
      ),
      { status: 202 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
