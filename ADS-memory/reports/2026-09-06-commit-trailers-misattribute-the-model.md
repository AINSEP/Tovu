# Commit trailers misattribute the model, systemically and permanently

**Filed 2026-09-06. Not a bug in the repo — a defect in its provenance record.**

## The finding

A `Co-Authored-By:` trailer in this repository records the **session's configured
attribution string**, not the model that actually produced the commit. The string is
fixed in a session's instructions and passed verbatim into every subagent spawn prompt,
so a subagent running on a different model still emits its parent's string.

## The evidence

Session `tovu-0f` ran subagents on Sonnet and on Opus during the night of 2026-09-06.
Its configured string was `Co-Authored-By: Claude Opus 5`. Every resulting commit
carries that string regardless of which model ran, including these, which were produced
by **Sonnet** subagents:

`01146403`, `c171e62b`, `6df1f9a7`, `ae13e739`, `f50b8463`, `3bc9a415`, `204e01a7`,
`9e77a778`

## Why it matters, concretely

It already produced a wrong answer. Asked whether the 2026-09-01..03 commits were
authored with Sonnet rather than Fable, a trailer count over that window returned Opus 5
154, Opus 5 (1M) 118, Sonnet 5 54, Gemini 3.8 Flash 43, and zero Fable. That count
measures what the commit messages CLAIM. For at least the 2026-09-06 window the same
measurement is demonstrably wrong, so the earlier window's numbers cannot be trusted
either, and "zero Fable trailers" is not evidence that Fable never ran.

The underlying question was real and reasonable: which model reviewed a given window, so
a re-run on a stronger model can be scoped. Git history cannot answer it today.

## What is and is not known

- Verified: the trailer does not track the model, for the 2026-09-06 window, by direct
  comparison against a session that knows which model each subagent used.
- NOT verified: whether any earlier window's trailers were accurate. There is no
  independent record to check them against.
- One partial exception found: `ADS-memory/reports/2026-09-01-to-03-review-bugs.md`
  carries its own `Co-Authored-By: Claude Sonnet 5` under a distinct session id. That is
  an attribution written by the reviewing session itself rather than relayed, so it is
  better evidence than hearsay — but it is still a configured string, not a runtime fact.
  The sibling architecture and excess-code reports carry no model record at all.

## The fix, stated as options rather than a recommendation

1. Make the trailer reflect the model that actually ran, resolved at commit time rather
   than fixed in session instructions. Requires the value to be derivable per-agent.
2. Drop the model from the trailer entirely, keeping only the tool attribution. An absent
   record is honest; a confidently wrong one is not.
3. Record model provenance somewhere that is not the commit message, and stop implying
   it in the trailer.

Doing nothing is a choice too, but it means every future attribution question about this
repository is unanswerable from its own history.
