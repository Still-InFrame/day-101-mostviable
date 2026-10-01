"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChecklistItem } from "@/lib/types";

const EFFORT: Record<string, string> = { S: "Small", M: "Medium", L: "Large" };

export function Checklist({ items: initial }: { items: ChecklistItem[] }) {
  const [items, setItems] = useState(initial);
  const done = items.filter((i) => i.done).length;

  async function toggle(id: string, value: boolean) {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, done: value } : i)));
    const { error } = await createClient()
      .from("mostviable_checklist_items")
      .update({ done: value })
      .eq("id", id);
    if (error) {
      setItems((list) => list.map((i) => (i.id === id ? { ...i, done: !value } : i)));
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted">No checklist was generated for this app.</p>;
  }

  return (
    <div>
      <p className="font-mono text-sm text-muted">
        {done}/{items.length} done
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.id}>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-bg px-3 py-2.5 hover:border-muted/50">
              <input
                type="checkbox"
                checked={item.done}
                onChange={(e) => toggle(item.id, e.target.checked)}
                className="mt-1 size-4 accent-accent"
              />
              <span className="min-w-0 flex-1">
                <span className={item.done ? "text-muted line-through" : ""}>{item.task}</span>
                {item.why && <span className="mt-0.5 block text-sm text-muted">{item.why}</span>}
              </span>
              {item.effort && (
                <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 font-mono text-[11px] text-muted">
                  {EFFORT[item.effort] ?? item.effort}
                </span>
              )}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
