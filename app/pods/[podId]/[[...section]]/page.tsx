import { notFound, redirect } from "next/navigation";
import { productPage } from "@/lib/server/product-page";
export const dynamic = "force-dynamic";
export default async function Pod({
  params,
}: {
  params: Promise<{ podId: string; section?: string[] }>;
}) {
  const { podId, section = [] } = await params;
  if (section[0] === "conversations" && section[1])
    redirect(
      "/conversation/" +
        section[1] +
        (section[1] === "new" ? "?pod=" + podId : ""),
    );
  if (
    section[0] &&
    ![
      "conversations",
      "files",
      "tasks",
      "settings",
      "activity",
      "tools",
    ].includes(section[0])
  )
    notFound();
  if (section[0] === "tools") redirect("/pods/" + podId + "/settings");
  return productPage("pod", podId, section[0] || "conversations");
}
