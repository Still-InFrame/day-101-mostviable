// Model output is untrusted, so a URL is only rendered as a link when it is
// plain http(s). Anything else (javascript:, data:, malformed) returns null.
export function safeUrl(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

function normalize(url: URL) {
  return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`.toLowerCase();
}

// null means there is nothing to check against (the search tool reported no
// URLs), which is different from a source that is known not to match.
export function sourceVerified(raw: string, searchedUrls: string[]) {
  const url = safeUrl(raw);
  if (!url || searchedUrls.length === 0) return null;
  const target = normalize(url);
  return searchedUrls.some((s) => {
    const candidate = safeUrl(s);
    return candidate !== null && normalize(candidate) === target;
  });
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
