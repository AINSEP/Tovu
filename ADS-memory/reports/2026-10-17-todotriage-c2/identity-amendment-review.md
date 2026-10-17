# SPEC-006 combined amendment review

Software Architect + Spec (Direct): architecture and specification personas loaded; bounded written adversarial review, not an independent Red-Team stage certification.

Date: 2026-10-17. Inputs: TRIAGE s3-21 (original TODO line 1095), SPEC-006 `feature`, `api`, `state`, `behavior`, `errors`, `traceability`, and `spec-manifest`; the existing identity pipeline ledger and Red-Team report; constitution Articles I–VIII. Scope: 0.6.0 REQ-15–19 / AC-27–32 / INV-09 / EC-14–17 and 0.7.0 principal-creation HTTP surface / AC-33, including interactions with the previously approved security core. No implementation audit or executable application tests.

## Outcome

**NOT CLEARED.** The recorded v0.7.0 hash is not the current spec's canonical hash. The July combined-amendment stage cannot honestly certify these bytes as the recorded amendment. No approval, hash, or prior review was overwritten.

Read-only document validator invocation:

```text
python3 AI-Dev-Shop/framework/spec-providers/speckit/validators/validate_spec_package.py ADS-memory/specs/006-identity-and-authorization --phase spec --print-hash
exit: 1
computed: sha256:d8e88380dd6cb68792986a50429178ff99a871dd160e24fd9551da90d74bce4b
recorded: sha256:5544fb325854e9bea531ee01b57ca8dc63d7bcae2f8f1be4c2b00183cbc96a7c
```

The five reported violations are DRAFT status, hash mismatch, DoD B-03, DoD B-32, and overall DoD result. The four status/readiness violations were already disclosed in July; the **hash mismatch is additional**. This was document validation only; no test, typecheck, build, server, benchmark, network command, commit, or push ran.

## Findings and disposition

| ID | Disposition | Evidence | Required next action |
|---|---|---|---|
| IAM-01 | BLOCKING — Article VII | `ADS-memory/specs/006-identity-and-authorization/feature.spec.md:355` and `:541`: REQ-16 / AC-28 now explicitly contain a 0.1.14 username amendment dated 2026-10-08; Header Metadata and the pipeline ledger still identify 0.7.0 / July hash. Validator confirms mismatch. | Coordinator routes the expanded amendment to Spec: preserve the owner’s username decision, version and hash the reviewed package consistently, then request review against that exact package. Do not merely stamp the old review as current. |
| IAM-02 | ADVISORY — reset failure proof | `state.spec.md:106`, REQ-17 / AC-29 require a new password hash and revocation of all active sessions; `behavior.spec.md:258` explicitly says “in the same operation.” Successful-operation semantics are covered; a failure between persisted effects still needs certification. | TDD / Architect preserve that same-operation requirement through the existing identity transaction owner and certify fault injection/all-or-nothing persisted results. This is an evidence requirement, not a claim that revocation is absent from the spec. Do not invent a second revocation pipeline. |
| IAM-03 | ADVISORY — issuance interaction | `api.spec.md:223` and `state.spec.md:99` define separate grantless principal creation and issuance. The new route is not itself an issuance or a grant. | Retain the issuance-time workspace/kind/grantless recheck and frozen-snapshot clamp. Certify concurrent issuance to one principal at the owning transaction boundary; principal creation alone must never authenticate a request. |

## Probe coverage

These are contract-reading results, not executed certifications. Existing owners remain identity authorization, session lifecycle, and issuance; HTTP adapters must call those owners.

| Amendment surface | Adversarial probe | Written contract result |
|---|---|---|
| ENABLE_PRINCIPAL | Enable system / api_key / agent, or call without user.manage | REQ-15, AC-27, EC-14 and state §3 reject non-user targets and gate the operation. Revoked sessions must remain revoked; enabling is not a token reissue. |
| UPDATE_USER | Use member.manage to rename another user; inject password; normalize into a taken or trashed name | Current REQ-16 / AC-28 and state §3 specify self email-only access, user.manage for renames, owner protection, normalization, conflict handling and ignored password fields. This is **later material**, not the historical 0.6.0 contract; IAM-01 blocks certification of its provenance. |
| RESET_USER_PASSWORD | member.manage takeover, omitted target, stale pre-reset session | REQ-17 / AC-29 / EC-16 require user.manage, target existence, argon2id and all-session revocation. Failure ordering requires IAM-02 follow-up. |
| UPDATE_ROLE / UPDATE_POLICY | Relabel a built-in; edit a frozen issuance snapshot; use rename to change grants | REQ-18 / AC-30 / state §3 forbid built-in/frozen edits and restrict writes to metadata. Existing grant assignments retain identity. No new grant writer appears. |
| DELETE_ROLE / DELETE_POLICY | Delete a referenced / built-in / frozen row; race a new reference against delete | REQ-19 / AC-31 / INV-09 / state §3 require atomic reference-check plus delete, preserve immutable targets, and return conflict for references. Policy-owned permission cascade is distinguished from incoming references. |
| Existing transition HTTP wrappers | Bypass DISABLE_PRINCIPAL owner floor or WRITE_POLICY_PERMISSION clamp through a new route | AC-32 explicitly requires parity with AC-08/21 and AC-10/24/26; route wrappers cannot implement separate authorization. |
| APIKEY_PRINCIPAL_CREATE | Inject user/system/agent kind or another workspace; omit permission; blank name | AC-33 / API §1 / state §3 fix api_key kind, caller workspace, grantless state, apikey.manage and post-trim name validation. API bounds displayName to 255. |
| Creation → issuance | Bind a user principal, bind a granted machine principal, snapshot owner wildcard, widen source policy later | AC-23/25/26 remain the required interaction tests; creation does not relax any of those issuance preconditions. |

## Constitution and handoff

I: no new implementation/library; II and V: test-first and HTTP integration proof still owed; III–IV: existing identity owners and adapters reused, no new seam proposed; VI: permission, workspace and secret boundaries retained by the written contracts; **VII: BLOCKED by IAM-01**; VIII: preserve existing gateway actor/audit semantics and the later rename amendment’s atomic audit requirement. No constitution exception granted.

Output: combined review coverage and three dispositions above. Risks: current document identity is stale; no runtime result follows from this review. Next assignee: Coordinator → Spec for IAM-01, then independent Red-Team on the synchronized package, owner spec checkpoint, and separate ADR-PIPE-006 / ADR-048 architecture sign-off. All existing gates remain open.
