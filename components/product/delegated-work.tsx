"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { GitBranch } from "lucide-react";
import { request } from "@/lib/product-client";
import { workStatus } from "@/lib/work-inbox";
export function DelegatedWork({
  chatId,
  watching,
  revision,
}: {
  chatId: string;
  watching: boolean;
  revision: string;
}) {
  const [items, setItems] = useState<
    { id: string; chatId: string; status: string; agentName: string }[]
  >([]);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setInterval> | undefined;
    setItems([]);
    const load = () =>
      request<{ items: typeof items }>(
        `/api/conversations/${chatId}/delegations`,
        undefined,
        controller.signal,
      )
        .then((d) => {
          setItems(d.items);
          if (
            d.items.length &&
            d.items.every((i) =>
              ["completed", "failed", "cancelled"].includes(i.status),
            )
          )
            clearInterval(timer);
        })
        .catch(() => {});
    void load();
    if (!watching) return () => controller.abort();
    timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 5000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [chatId, watching, revision]);
  if (!items.length) return null;
  return (
    <nav className="product-delegation-bar" aria-label="Delegated work">
      <span>
        <GitBranch size={14} /> Specialist work
      </span>
      {items.map((item) => (
        <Link key={item.id} href={`/work/${encodeURIComponent(item.id)}`}>
          {item.agentName}
          <small>{workStatus(item.status)}</small>
        </Link>
      ))}
    </nav>
  );
}
