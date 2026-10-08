---
name: age-of-wars-project-management
description: Session workflow for Age of Wars. Sync with the GitHub board, pick one Ready issue with closed blockers, implement only its scope, verify, update the issue and Project truthfully, and report. Use at the start of any development session, or when asked "what next" or to work on an issue.
---

# Age of Wars: project workflow

GitHub is the source of truth: repo `DarkLordGeo/age-of-wars`, Project #2 (owner `DarkLordGeo`), milestones M1–M8.
Don't keep task status anywhere else. Don't trust status from memory or earlier conversations.

## 1. Sync with GitHub and inspect the board
```bash
gh auth status          # needs scopes repo + project
git fetch && git status -sb && git log --oneline -10
gh project item-list 2 --owner DarkLordGeo --limit 200 --format json \
  --jq '.items[] | "\(.status)\t\(.priority)\t#\(.content.number)\t\(.title)"' | sort
# Ready candidates only, highest priority first:
gh project item-list 2 --owner DarkLordGeo --limit 200 --format json \
  --jq '.items[] | select(.status=="Ready") | "\(.priority)\t#\(.content.number)\t\(.title)"' | sort
gh issue list -R DarkLordGeo/age-of-wars --state closed --limit 20
```
Also check for In Progress or Review / QA items left over from an earlier session, and finish or report them before starting anything new.

## 2. Select one issue
- Candidates have Status **Ready**. Sort by Priority (P0 first), then milestone (M1 first).
- Read the body (`gh issue view N -R DarkLordGeo/age-of-wars`). Every "Blocked by #M" issue must be closed. If one isn't, the issue isn't really Ready: move it to Backlog and say why.
- Skip `needs: owner` issues unless the owner has supplied the missing input. List them in the report so the owner sees them.
- Before editing, move the chosen item to In Progress (see "Status updates" below).

## 3. Understand the task
Read the issue's Definition of Done, the files it lists, related tests, and the docs that apply: `docs/AGE1_SPEC.md` for gameplay, `docs/ASSET_SPEC.md` for models, `docs/ASSET_LICENSES.md` for assets.

## 4. Baseline and plan
Run `npm run typecheck` and `npm test` before changing anything, and record the result. If the baseline already fails, say so, don't hide it. Pick the smallest change that meets the Definition of Done.

## 5. Implement only the selected scope
- No drive-by refactors. File new issues for anything else you find (`gh issue create` with priority, category and milestone).
- Keep the sim free of Three.js and DOM code. Gameplay numbers belong in `src/config/`, with their source.
- New third-party assets need a licence row before they are committed.
- A significant architectural decision goes into the relevant doc in `docs/`, linked from the issue.

## 6. Verify
- Run targeted tests first, then `npm test`, `npm run typecheck` and `npm run build`.
- For visible changes, run the dev server and check the result in a browser (screenshot if possible).
- Tick only the Definition of Done items you actually verified.

## 7. Review the diff
Run `git diff --stat` and `git diff`. Look for regressions, unrelated changes, leftover debug code, licence risks and unfinished TODOs.

## 8. Update GitHub truthfully
- Comment on the issue: what changed (files), the commands run with their results, the Definition of Done items verified, the limitations or follow-ups (with new issue numbers), and the commit SHA if one was made.
- Status: **Done** (and close the issue) only when every Definition of Done item is verified. **Review / QA** when implemented but awaiting validation, for example owner checks on the RTX 3050 PC. Otherwise leave it **In Progress**.
- When an issue is closed, look at the issues it blocked. Move one to **Ready** if all its blockers are now closed.
- Commit and push only if the session allows it (a push to `main` deploys production). Use the message `age1: … Refs #N`.

## 9. Report to the owner
Include: the issue number and title, the changes, test, typecheck and build results, commit/push/deploy status (say "not committed" when that's the case), the new board status, and the next recommended Ready issue. If the board couldn't be updated, say so.

## Status updates (gh)
```bash
# Look up IDs (stable, but re-check if a command fails)
gh project field-list 2 --owner DarkLordGeo --format json
ITEM=$(gh project item-list 2 --owner DarkLordGeo --limit 200 --format json --jq '.items[]|select(.content.number==N)|.id')
gh project item-edit --id "$ITEM" --project-id PVT_kwHOCOAR2s4BmRH8 \
  --field-id PVTSSF_lAHOCOAR2s4BmRH8zhk60gQ --single-select-option-id <OPTION>
```
Status option IDs (at setup time): Backlog `d2572257`, Ready `d9d82666`, In Progress `8e096f8e`, Review / QA `7b41b808`, Done `b2526f8f`.
A new issue must be added to the board with `gh project item-add 2 --owner DarkLordGeo --url <issue-url>`, then given its Status, Priority and Category.

## Cloud sessions (code only)
- Assume no local PC, no Blender, no MCP server, and no access to `*.vercel.app` (egress proxy). Don't plan steps that need them.
- If `gh` isn't authenticated, use a GitHub connector if one is available. Otherwise work only on code that is safe without the board, and report "board not synchronized".
- Visual checks run in headless or SwiftShader browsers, which are slow. Say real-time feel is unverified and move the issue to Review / QA for an owner check on real hardware.
- Pick only issues that don't need Blender, owner accounts, or new downloads awaiting licence approval.

## Local sessions (Blender / MCP)
- First confirm Blender is reachable: run the Blender MCP `get_addon_status`, then `get_scene_info`. If it isn't, say so; never pretend a Blender operation ran.
- Blender sources: `assets_src/soldier/soldier_production.blend`, scripts in `assets_src/pipeline/`. Never overwrite originals; export to `public/models/`.
- After export: validate the GLB (`scripts/validate-glb.mts`, plus the tests in `tests/scenery-assets.test.ts` and `tests/model-pipeline.test.ts`), check tris, height, origin, facing and clips against `docs/ASSET_SPEC.md`, then view it in the running game.
- Generating with Rodin or downloading assets can cost credits or carry licence terms. Confirm with the owner unless the issue already approves it.
