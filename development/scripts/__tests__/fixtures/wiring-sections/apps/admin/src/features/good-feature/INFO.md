# Good feature

## Wiring

Needs `GoodFeaturePorts` (a `GoodReaderPort`) and the shared `ContractsClockPort`.
Provides `SharedEngineKit` from `@jini-ai/fake`. Must not import `apps/website/src/server`.
See ADR-071.

## Other

`NotCheckedHerePort` sits outside the Wiring section and is ignored.
