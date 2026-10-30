import { productPage } from "@/lib/server/product-page";
export const dynamic = "force-dynamic";
export default async function Conversation({
  params,
}: {
  params: Promise<{ chatId: string }>;
}) {
  const { chatId } = await params;
  return productPage(
    "conversation",
    chatId === "new" ? undefined : chatId,
  );
}
