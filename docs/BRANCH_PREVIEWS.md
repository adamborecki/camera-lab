# Branch previews

`main` is the live Canvas assignment at the site root. Work on any other branch can be seen at its own URL without touching `main`. (Same setup as Mixer Lab.)

| What | Where |
|---|---|
| Live site (`main`) | `https://adamborecki.github.io/camera-lab/` |
| A preview | `https://adamborecki.github.io/camera-lab/branch/<slug>/` |
| List of previews | `https://adamborecki.github.io/camera-lab/branch/` |

The slug is the branch name in lower case with every run of other characters turned into `-`: `claude/hw3-sgk-salmon` → `claude-hw3-sgk-salmon`.

## One-time setup

**Settings → Pages → Build and deployment → Source: GitHub Actions.** Until that's set, the site keeps deploying from the `main` branch the old way and the `Deploy site and branch previews` workflow fails harmlessly (no previews).

## Which branches get one

Branches starting with `claude/`, `skin/`, `feature/` or `preview/`; at most 15, newest first.

## How it works

- `.github/workflows/preview-trigger.yml`: a push to a preview branch asks `pages.yml` to run on `main`.
- `.github/workflows/pages.yml`: runs on `main`; `tools/build-pages.sh` builds the whole site (main at the root, every preview under `branch/`) and deploys it. `docs/reference/` (real recital photos) is left out of the published site.

## How the app behaves in a preview

`js/deploy-context.js` reads `branch/<slug>/` from the path: a yellow banner links to the live site, the tab title starts with `[preview]`, and progress and bug reports are saved under their own keys (`cameralab.progress.v1@<slug>`), so trying a preview never touches a student's real homework. A Finish summary made in a preview says so (`"preview": "<slug>"`).

## Testing the build locally

```bash
ROOT_REF=HEAD REF_NS=refs/heads tools/build-pages.sh /tmp/site
```
