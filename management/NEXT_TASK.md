# Next task / next manager decision

**Snapshot:** 2026-10-23; verify active refs before execution.

## Manager's first action

1. Check current `origin/dev`, PR #33 and the authorized separate smoke-readiness fix PR (if created). Confirm which changes are already merged and whether CI is green **on the actual latest HEAD**.
2. Ensure management PR #33 contains only management documentation in the effective diff against current `dev`, preserves D-016–D-020 plus local-first, manager-first, and Canvas/player refinements, and is ready for the owner's explicit merge approval. Do not merge on assumption.
3. Review this small agent-handoff PR separately; avoid blocking application usability work on a documentation framework.

## Upcoming development directives — propose separately, not a mega-PR

- Focused Space Play/Pause with proper focus safeguards and evidence-based player reliability investigation.
- Shared seconds/milliseconds UI formatter/parser while JSON persists integer frame values.
- Consider a limited Text Canvas selection/move proof **if safe**; full direct-selection/resize/rotate and group multi-select are a high-priority shared Core milestone.
- PNG-first Media Library + Image Timeline/JSON/preview/MP4 proof. Compare ordering with urgent Canvas usability evidence rather than blindly deferring Canvas.

## Approval boundary

The owner approves implementation scope and merging; developer executes narrowly scoped tasks and reports commit, files, tests and blockers. No personal projects/media, `main` changes, hosted agent platform, automatic MCP build, or speculative framework work.

## Definition of handoff complete

A fresh AI manager or developer can identify next action, scope, relevant decision section and verification commands without any previous chat. Update STATUS and this document at the end of the next development handoff.
