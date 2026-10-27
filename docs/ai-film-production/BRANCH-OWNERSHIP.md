# Documentation branch ownership and branch cleanup

**Authoritative working documentation branch for this conversation:** `docs/ai-film-production-architecture`.
**Repository:** `MTiberiu/floxbow-motion-studio`.
**Originally branched from:** `dev` (not automatically rebased as `dev` moves).
**Updated:** 2026-10-27.

## Branch policy

- `dev`: shared integration base; do not directly commit this documentation draft here without an explicit merge/review.
- `main`: stable mainline (verify release policy separately).
- `docs/ai-film-production-architecture`: persistent **Manager / Director product architecture notes**. Add decisions and developer handoff updates here. This is the branch to find later when many feature branches exist. It contains planning, not automatically current application code.
- `feat/storyboard-director-ux-v2`: developer implementation branch observed at commit `f8f7a66` on 2026-10-27 (storyboard approvals, asset hash, annotations). Independent from these docs; needs review and UI verification.
- Other feature branches might exist. **This is not a complete inventory**; inspect remote branches, PR references and unmerged commits before archiving or deleting anything.

## Before deleting old branches

1. List remote branches, associated PRs, merge status and unique commits against current `dev`.
2. Protect unmerged work, open reviews and branches owned by other developers.
3. Merge/rebase only through reviewed PRs; do not automatically force-push `dev`, `main` or anyone else's branch.
4. Delete only branches confirmed merged or explicitly designated obsolete by owner. Keep this documentation branch until its notes have a durable approved home in `dev`.
5. If this branch is eventually merged or superseded, update this file and `management/README.md` with the new canonical documentation location before deleting it.

## Latest planning note

Read [07-CURRENT-PRODUCT-DIRECTION.md](07-CURRENT-PRODUCT-DIRECTION.md) for Director-first Storyboard, external Codex workflows, hybrid layers/masks/AI-video proposals and the no-integrated-chat boundary. Earlier 01–06 docs contain exploratory implementation framing; 07 clarifies newer product decisions when they conflict.

**No branch was deleted, merged or force-pushed as part of this documentation update.**
