import { productPage } from "@/lib/server/product-page";

export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  return productPage("work", runId);
}
