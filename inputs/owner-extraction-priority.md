---
name: extraction-not-finished-furious-1121
description: "FURIOUS 11-21: after a week of refactor/extraction combines, Tovu still holds Jini-bound code (themes 85, publishing 58, posts 52, backup 43, deployments 40, security 39, newsletter 24, admin screens, desktop). Extraction = top priority until DONE; every plan/report must show files-left counts."
metadata:
  node_type: memory
  type: feedback
  originSessionId: eb325ef1-c52e-4232-8809-2bcf35d62959
  modified: 2026-11-22T04:36:16.948Z
---

Owner 2026-11-21 ~9:20 PM, on seeing the todos triage: "this is fucking ridiculous i still have jini code in tovu that we havent extracted. this is what the refactors and extractions we did all this week was supposed to fucking take care of ... we need to merge everything and create some overnight tasks to handle all of this. you fucking agents, you just never finish what i fucking ask".

**Why:** a week of combines moved pieces (exports, errors, AG-UI, protocols) but the big feature areas were never put into lanes, and nobody reported a files-left number, so the gap stayed invisible.

**How to apply:** treat "finish Tovu → Jini extraction" as the top priority until the file counts reach zero. Every extraction plan, combine brief and status report states files left per area (themes, publish-content, post, site-backup, deployments, security, newsletter, rendering/routes, admin screens/shell, desktop) before and after. Never report "extraction done" without that count. Related: [[owner_decisions_2026_11_20]], [[massive_refactor_list_location]].
