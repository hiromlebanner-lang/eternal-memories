export function buildInviteURL(
  kind: "join" | "invite",
  value: string,
  currentURL = window.location.href,
) {
  const url = new URL(currentURL);
  url.search = "";
  url.hash = "";
  url.searchParams.set(kind, value);
  return url.toString();
}
