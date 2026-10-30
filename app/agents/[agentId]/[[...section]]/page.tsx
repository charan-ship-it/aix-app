import { notFound, redirect } from "next/navigation";
import { productPage } from "@/lib/server/product-page";
export const dynamic = "force-dynamic";
export default async function Agent({
  params,
}: {
  params: Promise<{ agentId: string; section?: string[] }>;
}) {
  const { agentId, section = [] } = await params;
  if (section[0] === "conversations")
    redirect(
      "/conversation/" +
        (section[1] || "new") +
        (section[1] && section[1] !== "new"
          ? ""
          : "?agent=" + encodeURIComponent(agentId)),
    );
  if (
    section[0] &&
    !["settings", "activity", "tools", "files", "tasks"].includes(section[0])
  )
    notFound();
  return productPage(
    section[0] === "settings" ? "studio" : "agent",
    agentId,
    section[0],
  );
}
