import Image from "next/image";

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// Day folders are named "day-22-prospectcentral"; the day number reads better
// as a small label above the name than inside it.
export function splitRepoName(name: string) {
  const match = /^day-(\d+)-(.+)$/.exec(name);
  return match ? { title: match[2], day: `Day ${Number(match[1])}` } : { title: name, day: null };
}

const RANK_TONE: Record<number, string> = {
  1: "border-gold/40 bg-gold/10 text-gold",
  2: "border-silver/30 bg-silver/10 text-silver",
  3: "border-bronze/40 bg-bronze/10 text-bronze",
};

export function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={cx(
        "inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 font-mono text-xs",
        RANK_TONE[rank] ?? "border-line bg-raised text-muted",
      )}
    >
      No. {rank}
    </span>
  );
}

// A single 0-100 score as a ring. The number sits in the middle in the normal
// text colour; the arc only carries magnitude.
export function ScoreRing({
  value,
  size = 72,
  label = "Viability",
}: {
  value: number;
  size?: number;
  label?: string;
}) {
  const stroke = size >= 80 ? 6 : 5;
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${label}: ${clamped} out of 100`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--raised)"
          strokeWidth={stroke}
        />
        <circle
          className="ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - clamped / 100)}
          style={{ "--ring-length": length } as React.CSSProperties}
        />
      </svg>
      <span
        className={cx(
          "absolute inset-0 flex items-center justify-center font-mono tabular-nums",
          size >= 80 ? "text-2xl" : size >= 64 ? "text-lg" : "text-sm",
        )}
      >
        {clamped}
      </span>
    </div>
  );
}

// Decorative artwork behind a section, faded into the page so text placed on
// the left stays readable. Purely visual, so it is hidden from assistive tech.
export function ArtBackdrop({
  src,
  priority = false,
  className,
}: {
  src: string;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div aria-hidden className={cx("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <Image
        src={src}
        alt=""
        fill
        priority={priority}
        sizes="(min-width: 1152px) 1152px, 100vw"
        className="object-cover object-right"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/75 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-bg/90 via-transparent to-transparent" />
    </div>
  );
}
