import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { Wordmark } from "@/components/Header";

type SearchParams = Promise<{ error?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error } = await searchParams;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-5 text-center">
      <Wordmark />
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          Find out which of your apps is worth selling
        </h1>
        <p className="mt-3 text-muted text-balance">
          Connect GitHub, pick your repos, and get your three most viable
          products with market research, pricing and a plan to sell them.
        </p>
      </div>

      <GoogleSignInButton />

      {error === "oauth_failed" && (
        <p className="text-sm text-warn">Sign-in failed. Please try again.</p>
      )}
    </div>
  );
}
