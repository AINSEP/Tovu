# Posts and Pages: one embed contract

Version: 0.1.0 · Date: 2026-10-17 · Status: DRAFT, written follow-up; not approved for implementation.

Parent reference: SPEC-043 v1.1.0. Its existing spec-manifest explicitly records that no canonical hash was computed; this slice does not invent one or certify the incomplete parent package.

Inputs: TRIAGE s3-33 / s3-28 (original TODO lines 1147 / 1136); the original embeds follow-up text; SPEC-043 feature/UI specs; SPEC-047 Pages; ADR-047 (still NOT Accepted), ADR-020 render-IR amendment, ADR-027 media and ADR-056 HTML Pages. This standalone slice supplements the existing packages; it does not replace their active entrypoints, change their hashes or clear their gates. Promotion must version the affected package, include this slice in its manifest/read set, update traceability and pass provider validation/preflight.

## Goal and boundary

A writer inserts an embed once and sees the same resolved content in the Post editor preview, the published Post, and a Page using the corresponding representation. Posts and Pages share resolution and rendering semantics while retaining their existing stored formats. This is the unified subject owed after the August render-path, media-sizing, Embed toolbar and widgets changes.

Actors: an authorized editor, an agent delegated by that editor, and an anonymous public reader. Resources: the host post/page, referenced widget/media/content, and each placement. Workflow: choose → insert → save with the host version → resolve in the host workspace → render through the theme/content seam. Errors stay visible to the editor and contained for the reader.

Out of scope: a new universal document format, conversion of HTML Pages to TipTap, arbitrary iframe/provider support, new rich-text editing tools, a new media transform system, theme JS, or accepting ADR-047. Region widgets retain SPEC-043’s existing placement contract.

## Reuse and observed end-to-end flow

| Behavior | Existing owner and boundary |
|---|---|
| Post authoring | `apps/admin/src/features/posts/PostEditor.tsx:465` mounts the existing EmbedInsertControl; its hooks own menu/picker state. Existing media/widget extensions own document nodes. |
| Document persistence | Existing post/entry update services own authorization, version preconditions, change sets and revisions. Widget insert/remove/reorder calls `@jini-ai/cms/widgets` embed-service, composed through `apps/website/src/features/widgets/deps.ts`; there is no second widget mutation contract for agents. |
| HTML syntax | Jini CMS `packages/cms/src/widgets/markers/marker.ts` owns parsing. `@jini-ai/cms/widgets/html/html-embeds` adapts parsed markers and substitutes output. Do not copy its scanner into the admin, reference indexer or renderer. |
| Resolution | Jini CMS widgets resolver-service owns typed resolution/IR; Tovu injects host repositories and render context. Workspace, publication visibility and missing targets are resolved before rendering. |
| Rendering | `apps/website/src/server/inbound/public-http/http/site/render.ts`: renderDocNode handles doc nodes; renderWidgetPostContent handles post-content IR; substituteHtmlEmbeds handles HTML markers. Resolved widget maps, media transform versions and metadata must reach every branch. |
| Theme composition | Declarative, static, Liquid and existing Handlebars paths consume resolved content/IR. Liquid’s render_block is the existing registry seam, not a new resolver. |

The two authoring representations have different storage invariants: a doc node has identity-bearing attrs in bodyJson; an HTML marker has authored wrappers/attributes in body_html. Separate adapters are justified; lookup, authorization, reference semantics and resolution remain shared. No persisted-variant consolidation is authorized.

## Representation and compatibility

| Surface | Canonical authoring representation | Compatibility rule |
|---|---|---|
| Rich-text Post or Page | Block atom widgetEmbed with placementId + widgetEntryId; generic media node with assetId + transformName + alt; existing youtube node for supported URLs | Preserve existing image nodes (asset refs or legacy src) and their current rendering rules. Newly picked assets use generic media nodes. |
| HTML Page / static template | The shared marker grammar, e.g. `<div data-embed-config='{"type":"widget","id":"w1"}'></div>` or a media marker | Read legacy marker forms through the existing parser; new authoring emits the canonical JSON attribute. No bulk rewrite. |
| Post content embedded by template | Existing post/content marker → post-content IR → same document renderer | Forward the embedded post’s media metadata, transform map and supported inline widget resolution. Never call renderDocNode with accidental empty defaults. |

Use the parser’s existing id/slug/name precedence and occurrence keys; do not derive a new slug lookup rule. Two placements may reference the same target but retain independent placement identity and attributes. A valid literal HTML wrapper is not a widget instance.

## Requirements and acceptance

| ID | Required observable behavior | Acceptance scenario |
|---|---|---|
| EMB-01 | Resolve references only within the host workspace and visibility context. | An otherwise valid id from workspace B placed in a workspace A host yields unavailable content, never B’s data. A public request cannot disclose a draft/private target. |
| EMB-02 | All supported render branches receive the same resolved dependencies. | One Post containing media + widget is rendered directly, through a static Page’s post/content marker, through a declarative template, and through Liquid render_block/content. Each output contains the expected media rendition and widget content; no raw marker or undefined widget output appears. Repeat in authorized preview. |
| EMB-03 | Preserve media-kind dispatch and safe sizing. | Pick image, video and audio assets through Media. At 375px and 1280px viewport widths they fit their containing content area without horizontal overflow; images preserve aspect ratio, video exposes controls by default, and audio exposes its player. HTML authored width/max-width constraints survive according to the existing substitution contract. |
| EMB-04 | A repeated target is resolved once per existing batching contract and rendered per occurrence. | Two markers with the same id but different wrapper styles retain both placements and their distinct styles; resolver query count scales with distinct lookup groups, not each occurrence. No cross-request cache is introduced. |
| EMB-05 | Preserve wrapper semantics owned by html-embeds. | Media/post/content retain the authored wrapper; widget markers retain an attributed wrapper and replace a bare wrapper. Media attributes follow the existing wrapper/media-element partition. Successful output contains no active marker attributes. Add explicit tests for id, class, style and aria-* preservation. |
| EMB-06 | Failures are contained at the embed boundary. | Missing/trashed target, unknown type, invalid config or resolver failure renders the existing safe empty/placeholder result. The surrounding page returns usable content; public HTML contains no stack, SQL, raw secret or internal diagnostic. Preview offers a diagnostic/correlation reference using the existing error surface. |
| EMB-07 | Document widget mutations use the existing security and concurrency contract. | UI save and server/agent mutation reject a stale baseVersion without lost edits; lack of widgets.place or the host write permission prevents mutation and audit/ref changes. Widget-owned docs cannot recursively embed widgets; count clamps apply at persisted-write validation. |
| EMB-08 | Where-used and deletion protection track saved references through the owning write path. | Insert → reference appears; remove → reference retracts; rejected stale/unauthorized save → no reference delta. Existing target-delete guards see references from both doc hosts and HTML markers. |
| EMB-09 | Preserve YouTube’s current restricted URL and responsive render behavior. | Supported URL renders privacy-enhanced youtube-nocookie iframe at responsive 16:9; malformed/unsupported URL renders unavailable video. Arbitrary iframe HTML is not created by the toolbar. |
| EMB-10 | Shared widget editing communicates reuse. | Inserting an existing widget reuses its identity. Editing a widget used in N places shows that effect and offers the existing detach/edit flow where supported; a one-off media placement does not create a reusable widget just for symmetry. |

## Unified Post-editor Embed control (original line 1136)

The existing **Embed** trigger is the single entry point for library embeds. Its menu offers **Media**, **Form**, **Menu**, **Gallery**, and **Widget…**. These are shortcuts over the existing media picker / widget-type picker and insertion commands, not separate insertion services. Form/Menu/Gallery pin the widget type; Widget… exposes the remaining registered types. Legacy image-by-URL and supported YouTube controls remain explicitly labeled external-URL tools.

- EMB-UI-01: opening and cancelling any picker leaves bodyJson and the dirty state unchanged; focus returns to Embed. Choosing an item inserts once at the retained editor selection and closes the picker. A missing editor yields no active insertion action.
- EMB-UI-02: Media inserts the selected assetId/transformName/alt with insertMediaEmbed; widget choices call insertWidgetEmbed with a fresh placementId and the chosen reusable widget id. Creating a widget uses the existing authorized create flow before insertion; a failed create leaves the document untouched and retains the error/draft.
- EMB-UI-03: buttons have accessible names; the menu supports keyboard opening, arrow movement, Escape dismissal and focus return. Pickers follow the existing dialog focus contract. Keyboard-only insertion and cancellation must be tested, not inferred from ARIA roles.
- EMB-UI-04: one menu action produces one insertion. Reopening after cancellation does not reuse stale widget type, target or error state. Labels use the existing translation mechanism; no hard-coded new locale table is introduced by this spec.

## Validation mapping and failure proof

These are required tests for a future implementation/recertification dispatch; none ran here and no new runtime behavior was implemented.

| Criteria | Existing test neighborhood to extend | Proof required |
|---|---|---|
| EMB-01/06/07/08 | `apps/website/src/features/widgets/__tests__/integration/embed-service*.test.ts`, HTML embed integration suites | Real host adapter, permission denial, stale versions, ref rollback, cross-workspace and missing-target cases. Shared CMS unit/contract changes belong beside Jini’s existing widgets tests. |
| EMB-02/03/09 | `apps/website/src/server/inbound/public-http/http/site/__tests__/render.test.ts` and route/template-preview tests | Assert rendered media + widgets through each actual route/template branch, not source-text matching. Include both direct and embedded post-content paths. |
| EMB-04/05 | Jini CMS widgets HTML embed unit tests; Tovu HTML embed integration suites | Per-occurrence wrappers and bounded grouped lookups; retain parser ownership. |
| EMB-UI-01–04/10 | `apps/admin/src/components/__tests__/EmbedInsertControl*.test.tsx`, widget picker and extension tests | Fake editor/picker ports for insert count and cancellation; browser journey for focus and responsive media. |

NFRs: existing bounded marker/document limits and resolver cost clamps apply; no new global numeric limits or latency SLA are invented. Public embeds add no React runtime. Authorized preview may see draft content only through its existing authenticated boundary. HTML Page trust is inherited from ADR-056; this document does not claim that preserving authored HTML attributes sanitizes arbitrary trusted markup.

Constitution: I reuses existing parsers/libraries; II/V require future test-first boundary proof; III/IV add no implementation abstractions; VI preserves permission/workspace/publication checks; VII requires package promotion/re-hash before downstream handoff; VIII preserves existing audit/error events. No exceptions proposed.

Output: one cross-surface contract including the unified toolbar. Risks: ADR-047 acceptance remains open, existing tests were only inventoried, and target behavior is not a claim that every path is currently certified. Next: Coordinator → Spec package reconciliation and independent review; TDD then implementation only for verified gaps. Logic stays in owning services/hooks, with shared behavior in Jini and Tovu-specific rendering adapters in Tovu.
