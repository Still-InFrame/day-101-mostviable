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
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
        <Link href="/">
          <Wordmark />
        </Link>
        <form action="/auth/signout" method="post" className="flex items-center gap-4">
          {email && <span className="hidden text-sm text-muted sm:inline">{email}</span>}
          <button className="text-sm text-muted underline-offset-4 hover:text-text hover:underline">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
