// Which build this page is: tools/build-pages.sh overwrites version.json
// (commit and date) next to index.html for the live site and each preview.
// Receipts and bug reports carry it, so a report can be read against the
// code that produced it. The committed placeholder says "local".
let cached = null;

export function appVersion() {
  cached ??= fetch(new URL("version.json", document.baseURI), { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((v) => (v?.commit && v.commit !== "local" ? `${v.commit} (${v.date})` : "local"))
    .catch(() => "local");
  return cached;
}

// For code that can't wait (the bug dialog): whatever has arrived so far.
let known = "unknown";
appVersion().then((v) => (known = v));
export const appVersionNow = () => known;
