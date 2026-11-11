# Survey canary: cost results

- Start (UTC): 2026-11-11T20:19:29Z
- End (UTC): 2026-11-11T20:47:16Z
- Wall clock: 28 min (cap 120 min)
- Reviewer subagents: 16 of 16 cap (9 tier-2 opus, 7 tier-1 sonnet); max 5 concurrent; 10 batches
- Token, tool and duration figures are the per-subagent usage the Agent tool reported.

## Per-subagent

| Batch | Tier | Model | Files | Lines | Tokens | Tool uses | Duration (s) | Tokens/line |
|---|---|---|---|---|---|---|---|---|
| b041 | 2 | opus | 1 | 140 | 160,460 | 30 | 319 | 1146.1 |
| b062 | 2 | opus | 3 | 3,271 | 259,225 | 55 | 458 | 79.2 |
| b110 | 2 | opus | 1 | 3,701 | 267,984 | 46 | 524 | 72.4 |
| b114 | 2 | opus | 2 | 3,240 | 280,918 | 65 | 547 | 86.7 |
| b157 | 2 | opus | 9 | 2,942 | 256,437 | 62 | 541 | 87.2 |
| b166 | 2 | opus | 1 | 4,706 | 172,144 | 54 | 371 | 36.6 |
| b172 | 2 | opus | 2 | 308 | 136,746 | 29 | 239 | 444.0 |
| b189 | 2 | opus | 1 | 290 | 124,893 | 22 | 206 | 430.7 |
| b191 | 2 | opus | 3 | 197 | 141,438 | 33 | 241 | 718.0 |
| b041 | 1 | sonnet | 3 | 2,744 | 92,320 | 7 | 47 | 33.6 |
| b114 | 1 | sonnet | 2 | 89 | 80,864 | 5 | 30 | 908.6 |
| b157 | 1 | sonnet | 8 | 510 | 91,817 | 6 | 40 | 180.0 |
| b171 | 1 | sonnet | 13 | 2,665 | 111,581 | 8 | 62 | 41.9 |
| b172 | 1 | sonnet | 7 | 3,157 | 99,782 | 9 | 53 | 31.6 |
| b189 | 1 | sonnet | 20 | 2,948 | 137,075 | 15 | 104 | 46.5 |
| b191 | 1 | sonnet | 13 | 3,291 | 148,312 | 28 | 141 | 45.1 |

## Totals per tier / model

| Tier | Model | Agents | Files | Lines | Tokens | Tool uses | Agent-time (min) | Tokens/line | Tokens/agent |
|---|---|---|---|---|---|---|---|---|---|
| 2 | opus | 9 | 23 | 18,795 | 1,800,245 | 396 | 57.4 | 95.8 | 200,027 |
| 1 | sonnet | 7 | 66 | 15,404 | 761,751 | 78 | 8.0 | 49.5 | 108,822 |
| all | both | 16 | 89 | 34,199 | 2,561,996 | 474 | 65.4 | 74.9 | 160,125 |

## Notes

- Coordinator token use: not visible to the coordinator (n/a).
- Caps hit: no coordinator cap was hit (time, batches, agent count, concurrency). Per-agent ~250k context stop: 4 tier-2 agents (b062, b110, b114, b157) reported 256k-281k total tokens. That figure is cumulative usage, not peak context, so whether they reached the stop is not visible here. All 4 returned full reports.
- Unfinished: none. All 10 batches and both tiers have a sealed report (16 reports, 32 files in out/).
- Tier-0 files were skipped by design: 7 files, 51 lines.
- Setup (npm ci --ignore-scripts, dossier, slice) took about 3 min before the first dispatch.
