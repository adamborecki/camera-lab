#!/usr/bin/env bash
# Assembles the GitHub Pages site: main at the root, and each preview branch
# under branch/<slug>/. Run by .github/workflows/pages.yml; also runs locally:
#   ROOT_REF=HEAD REF_NS=refs/heads tools/build-pages.sh /tmp/site
# See docs/BRANCH_PREVIEWS.md.
set -euo pipefail

OUT="${1:?usage: build-pages.sh <out-dir>}"
ROOT_REF="${ROOT_REF:-origin/main}"
REF_NS="${REF_NS:-refs/remotes/origin}"
# Keep in sync with the branch list in .github/workflows/preview-trigger.yml.
PREFIXES="${PREVIEW_PREFIXES:-claude/ skin/ feature/ preview/}"
MAX="${MAX_PREVIEWS:-15}"

rm -rf "$OUT"
mkdir -p "$OUT/branch"
git archive "$ROOT_REF" | tar -x -C "$OUT"
# Which commit each copy is: receipts and bug reports carry it (js/app-version.js).
stamp() { git log -1 --format='{"commit":"%h","date":"%cI"}' "$1" > "$2/version.json"; }
stamp "$ROOT_REF" "$OUT"
# Reference photos of real recitals stay in the repo for whoever builds
# scenes, but aren't published on the site (docs/reference/README.md).
rm -rf "$OUT/docs/reference"

slugify() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g'; }
html() { printf '%s' "$1" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g'; }

# Branch names are refs minus the namespace ("refs/remotes/origin/" = 3 parts).
STRIP="$(awk -F/ '{print NF}' <<< "$REF_NS")"
rows=""
count=0
# Newest first, so the cap drops the stalest branches.
while IFS=$'\t' read -r branch date; do
  match=""
  for p in $PREFIXES; do [[ "$branch" == "$p"* ]] && match=1; done
  [[ -n "$match" ]] || continue
  slug="$(slugify "$branch")"
  [[ -n "$slug" && ! -e "$OUT/branch/$slug" ]] || continue
  if (( count >= MAX )); then echo "skip (over $MAX previews): $branch"; continue; fi
  mkdir -p "$OUT/branch/$slug"
  git archive "$REF_NS/$branch" | tar -x -C "$OUT/branch/$slug"
  stamp "$REF_NS/$branch" "$OUT/branch/$slug"
  rm -rf "$OUT/branch/$slug/docs/reference"
  # Previews stay out of search results.
  [[ -f "$OUT/branch/$slug/index.html" ]] && perl -pi -e 's#<head>#<head>\n  <meta name="robots" content="noindex" />#' "$OUT/branch/$slug/index.html"
  rows+="<li><a href=\"$slug/\">$(html "$branch")</a> <small>$date</small></li>"$'\n'
  count=$((count + 1))
  echo "preview: $branch -> branch/$slug/"
done < <(git for-each-ref --sort=-committerdate --format="%(refname:lstrip=$STRIP)%09%(committerdate:short)" "$REF_NS")

cat > "$OUT/branch/index.html" <<EOF
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>Branch previews</title>
  <style>
    :root { --bg: #fff; --text: #16181d; --dim: #5b6070; --link: #0b62c4; }
    @media (prefers-color-scheme: dark) { :root { --bg: #0f1220; --text: #f3f4fb; --dim: #a6acc8; --link: #7ce0ff; } }
    body { margin: 0; padding: 1.5rem 16px; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, sans-serif; }
    main { max-width: 40rem; margin: 0 auto; }
    a { color: var(--link); }
    small { color: var(--dim); }
    li { margin: 0.5rem 0; overflow-wrap: anywhere; }
  </style>
</head>
<body>
<main>
  <h1>Branch previews</h1>
  <p><a href="../">Live site (main)</a>. Previews are work in progress, not the assignment.</p>
  <ul>
${rows:-<li>No preview branches right now.</li>}
  </ul>
</main>
</body>
</html>
EOF
echo "built $OUT with $count preview(s)"
