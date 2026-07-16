# Sessions

One file per conversation: what was discussed, learned, asked, and answered.

## File naming
`YYYY-MM-DD-HHmmSS-<topic>.md` — UTC timestamp of when the session started.
The in-progress record is `CURRENT-SESSION.md` until it is finalized.

## Contents (each file)
- Date and time (UTC), and the user
- Model(s) used (e.g. Claude Opus 4.8, Codex 5.5 xhigh — several if more than one participated)
- Summary of what was accomplished
- Questions & Answers
- Decisions & Learnings

## How it works
`harness-engineering/hooks/session-record.sh` maintains the record. On Claude Code it runs
automatically (Stop refreshes it, SessionEnd archives it). On other hosts the AI runs it
directly. Ask the AI to "save this session" and it writes the summary and model list.
See `harness-engineering/hooks/README.md`.
