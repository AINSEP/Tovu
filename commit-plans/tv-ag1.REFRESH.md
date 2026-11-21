# REFRESH

## TV-AG1

- No unlisted production or test importers were found by the targeted lookup for the five deleted declarations; no importer repoints are owed.
- Combine: refresh the existing `development/scripts/error-gate-debt.json` row with `file: apps/website/src/server/runtime/composition/modules/assistant-ag-ui.ts`, `rule: catch-reads-error`, currently `value: 2`. Recompute with the actual combined tree; this job did not run a linter or guess a replacement count.
- Combine: execute the new `a pending approval interrupts the run` wire golden against the old drain (must fail the interrupt assertion) and the adopted Jini drain (must pass). Run the pre-existing wire cases byte-for-byte, including the unmarked MCP-UI result card.
- Combine: remove the host `res.end()` temporarily; the raw HTTP response helper must fail with `the AG-UI response must reach HTTP EOF` after five idle seconds, within the combine timeout.
- Combine: run the existing Stop witness, retaining its authenticated bearer/principal checks and exactly-one-daemon-cancel assertion. Remove only the close listener's reader cancellation for the mutation; the upstream daemon response must remain open and the added subscription-close wait must fail within the five-second Stop timeout. Test cleanup closes daemon connections after the witness, including on mutation failure.
- Chrome: admin canary, disconnect and Stop. Keep actual production `pendingApproval` emission gated on the working AG3-T admin resume path.
- No tests, builds, installs, type checks, linters, browser checks or mutations were executed in this job, as required by the dispatch.
