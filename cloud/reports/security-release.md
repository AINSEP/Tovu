# security-release — assistant release investigation

Status: in progress. Tovu `cloud/security-release` only. No tag, publication, deployment or main push.

The gate discarded startup error frames and printed empty evidence on premature termination. It now retains the last actual error frame without changing any success condition, timeout, retry or ownership check. Four regression cases exercise the real SSE reader; all seven focused reporting and release-wiring tests pass. Root-cause reproduction is pending under Linux Electron with a virtual display. Jini is unchanged.

Prior completed desktop validation and package state: [report](https://github.com/AINSEP/Tovu/blob/4bbd0b2dfcfbf9afdb209e175c13d54cb3b36427/cloud/reports/security-release.md).
