import Image from "next/image";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { Wordmark } from "@/components/Header";

type SearchParams = Promise<{ error?: string }>;

const POINTS = [
  ["Reads the repos you pick", "README, file list and dependencies. Nothing else, and nothing you have not ticked."],
  ["Researches the real market", "Live web search for demand, competitors and what they charge, with sources."],
  ["Names your top three", "A price, a go-to-market plan and a checklist to make each one sellable."],
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error } = await searchParams;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <Image
          src="/art/pillars.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-right"
        />
        <div className="smoke">
          <div className="smoke-layer smoke-a" />
          <div className="smoke-layer smoke-b" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/85 to-bg/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-bg/60" />
      </div>

      <div className="relative mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8 sm:px-10">
        <Wordmark />

        <div className="flex flex-1 flex-col justify-center py-16">
          <p className="eyebrow">For builders who ship more than they sell</p>
          <h1 className="mt-4 max-w-2xl font-display text-6xl leading-[1.02] text-balance sm:text-7xl">
            Find out which of your apps is <em className="text-accent">worth selling</em>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            Connect GitHub, pick your repos, and get your three most viable
            products with market research, pricing and a plan to sell them.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-4">
            <GoogleSignInButton />
            {error === "oauth_failed" && (
              <p className="text-sm text-warn">Sign-in failed. Please try again.</p>
            )}
          </div>

          <ul className="mt-16 grid max-w-3xl gap-6 sm:grid-cols-3">
            {POINTS.map(([title, body], i) => (
              <li key={title} className="border-t border-line pt-4">
                <span className="font-mono text-xs text-accent">0{i + 1}</span>
                <p className="mt-2 font-medium">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-muted">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
