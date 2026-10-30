import { productPage } from "@/lib/server/product-page";
export const dynamic = "force-dynamic";
export default async function Agents() {
  return productPage("agents");
}
