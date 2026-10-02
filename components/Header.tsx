import Link from "next/link";

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5 font-mono text-[15px] font-medium tracking-tight">
      {/* Three bars of rising height: the podium the app exists to fill. */}
      <span aria-hidden className="flex items-end gap-[3px]">
        <span className="h-2 w-[5px] rounded-[1px] bg-muted" />
        <span className="h-3.5 w-[5px] rounded-[1px] bg-accent" />
        <span className="h-[11px] w-[5px] rounded-[1px] bg-muted" />
      </span>
      mostviable
    </span>
  );
}

export function Header({ email }: { email?: string | null }) {
  return (
    <header className="sticky top-0 z-30 h-14 border-b border-line/70 bg-bg/75 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-5">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <Wordmark />
        </Link>
        <form action="/auth/signout" method="post" className="flex items-center gap-3">
          {email && (
            <span className="hidden items-center gap-2.5 text-sm text-muted sm:flex">
              <span
                aria-hidden
                className="flex size-7 items-center justify-center rounded-full border border-line bg-raised font-mono text-xs text-text uppercase"
              >
                {email[0]}
              </span>
              {email}
            </span>
          )}
          <button className="rounded-full border border-line px-3 py-1 text-sm text-muted transition-colors hover:border-muted/50 hover:text-text">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
