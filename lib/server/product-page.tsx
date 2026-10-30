import { readWorkspace } from "./workspace-query";
import { listPods } from "./pods";
import { readConversation } from "./conversations";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth";
import { requireUser } from "@/lib/server/http";
import { ProductApp, type ProductView } from "@/components/product/product-app";
export async function productPage(
  view: ProductView,
  entityId?: string,
  section?: string,
) {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  if (!session.session.activeOrganizationId) redirect("/onboarding");
  const user = await requireUser();
  const [initialData, initialPods] = await Promise.all([
    readWorkspace(user, { includeArchived: true }),
    listPods(user, true),
  ]);
  let initialScoped,
    initialConversation,
    initialContextError = "";
  try {
    if (view === "pod" && entityId)
      initialScoped = await readWorkspace(user, { podId: entityId });
    if (view === "conversation" && entityId)
      initialConversation = await readConversation(user, entityId);
  } catch (error) {
    initialContextError =
      error instanceof Error ? error.message : "This item is unavailable.";
  }
  return (
    <ProductApp
      initialData={initialData}
      initialPods={initialPods}
      initialScoped={initialScoped}
      initialConversation={initialConversation}
      initialContextError={initialContextError}
      view={view}
      entityId={entityId}
      section={section}
      user={{
        id: user.userId,
        name: user.displayName,
        organizationId: user.organizationId,
        organizationName: user.organizationName,
        role: user.role,
      }}
    />
  );
}
