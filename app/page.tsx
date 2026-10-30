import { redirect } from "next/navigation";
import { productPage } from "@/lib/server/product-page";
export const dynamic = "force-dynamic";
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  if (q.agent)
    redirect("/conversation/new?agent=" + encodeURIComponent(q.agent));
  if (q.chat) redirect("/conversation/" + encodeURIComponent(q.chat));
  const views: Record<string, string> = {
    agents: "/agents",
    knowledge: "/spaces",
    integrations: "/connections",
    settings: "/settings",
    activity: "/settings?section=activity",
  };
  if (q.view && views[q.view])
    redirect(
      views[q.view] +
        (q.section ? "?section=" + encodeURIComponent(q.section) : ""),
    );
  return productPage("home");
}
