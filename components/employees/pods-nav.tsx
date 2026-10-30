"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Box, Plus } from "lucide-react";
import type { Pod } from "@/lib/pods";
export function PodsNav() {
  const [pods, setPods] = useState<Pod[]>([]);
  useEffect(() => {
    fetch("/api/pods")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setPods(d.items);
      })
      .catch(() => {});
  }, []);
  return (
    <div className="workspace-pods-nav">
      <div>
        <Link href="/pods">Pods</Link>
        <Link href="/pods" aria-label="Create or browse Pods">
          <Plus size={14} />
        </Link>
      </div>
      {pods.slice(0, 8).map((p) => (
        <Link className="workspace-pod-link" key={p.id} href={"/pods/" + p.id}>
          <Box size={15} />
          <span>{p.name}</span>
        </Link>
      ))}
    </div>
  );
}
