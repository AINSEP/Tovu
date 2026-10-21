# cov-T1 progress (tovu lots 001..018)
Start 2026-10-21 15:37 UTC. Base Tovu e0c935bb5, Jini b3c4144b. Node 24.22.0.
Setup: Jini pnpm install+build OK; Tovu npm ci (root/admin/site-chat/desktop) + build:preload + sdk build + link:jini OK.
Owner override: no Postgres, no Playwright in cloud.
Worktrees /home/user/wt/<X> (hardlinked node_modules) per subagent.

| lot | session | branch | status |
|---|---|---|---|
| 014+015 | T1-C | cloud/cov-T1-014 @4e777da9 | MERGED 16:27. Full desktop main suite on merged: 1569 tests, 1559 pass, 0 fail, 10 skip. 31/34 files 100% (+new site-discovery-scan.ts 100%). Gaps: desktop-agent br 116/117 fn 49/50 (security backstop deny branch; lifecycle.finish .catch), shared-sites br 79/80 fn 19/20 (readdir race; unused lockTimeout notice), site-process-registry 623/628 br 112/116 (macOS-only orphan reaping; kill race). |
