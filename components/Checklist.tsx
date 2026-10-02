"use client";

import type { ChecklistItem } from "@/lib/types";

const EFFORT: Record<string, string> = { S: "Small", M: "Medium", L: "Large" };

// Presentational: the report owns the items so tab badges and this list agree.
export function Checklist({
  items,
  onToggle,
}: {
  items: ChecklistItem[];
  onToggle: (id: string, done: boolean) => void;
}) {
  const done = items.filter((i) => i.done).length;

  if (items.length === 0) {
    return <p className="text-sm text-muted">No checklist was generated for this app.</p>;
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-500"
            style={{ width: `${(done / items.length) * 100}%` }}
          />
        </div>
        <p className="font-mono text-sm text-muted tabular-nums">
          {done}/{items.length} done
        </p>
      </div>
      <ul className="mt-5 flex flex-col gap-2.5">
        {items.map((item, i) => (
          <li key={item.id}>
            <label className="group flex cursor-pointer items-start gap-4 rounded-xl border border-line bg-bg/60 px-4 py-3.5 transition-colors hover:border-accent/40">
              <input
                type="checkbox"
                checked={item.done}
                onChange={(e) => onToggle(item.id, e.target.checked)}
                className="mt-1 size-4 accent-accent"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                  <span className={item.done ? "text-muted line-through" : "font-medium"}>
                    {item.task}
                  </span>
                </span>
                {item.why && <span className="mt-1 block text-sm text-muted">{item.why}</span>}
              </span>
              {item.effort && (
                <span className="shrink-0 rounded-full border border-line bg-raised px-2 py-0.5 font-mono text-[11px] text-muted">
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
