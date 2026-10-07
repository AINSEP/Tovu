# Admin browser-agent access

Owner decision: ON by default, 2026-09-22. Toggle under Settings → Privacy.
This preference is scoped to the current browser/origin, not a site-wide server
policy. It is stored in localStorage; blocked storage falls back to the current
session. The toggle deliberately carries no agent handle.

The admin consumes Jini's existing WebMCP projection, native host adapter and
page executor. The assistant and Chrome use the same DOM driver. Ordinary field edits, navigation and reviewed plugin/skill add controls run directly
(owner 2026-10-07). Other page clicks have opaque effects and retain explicit consent.
A protected page action returns `approval_required` with `approvalId`, `capabilityId`, `args` and
`responseTool: "admin.respond_page_approval"`, and opens the app's shared confirmation
dialog with that exact operation/input. It does not run until a human chooses Confirm
or an authorized agent explicitly calls the response tool with `{ approvalId, approved }`.
Declining consumes the request without executing it; accepting executes it once and
returns the usual page result. Only one request can be pending. Invalid ids, duplicate
responses, disabled access and aborted registrations refuse execution. Destructive
steps still require approval and retain their feature-specific confirmation dialogs.
The response tool is the approval decision itself, so it does not recursively ask for
another approval. `window.confirm` is not used.
Server permissions and Jini's credential-field/navigation guards still apply.
WebMCP has no principal or run and does not pass through ToolExecutor; this is
an explicit page-local consent surface. The final Publish button remains
untagged. Opt-out unregisters page, publish and chat-pane tools and leaves the
assistant's SSE bridge attached.

Registration uses AbortSignal and catches both synchronous and asynchronous
browser registration failures. Aborted/disabled page and publish callbacks
refuse later execution, even if a caller retained the callback reference.
This does not cancel a server request that already began executing.

Coordinator acceptance in a compatible Chrome trial/flag environment:

1. Open the admin. Discover admin.publish_content, page.* and chat-pane tools.
2. Call page.find_elements. Only published handles and navigation targets appear.
3. Call page.click on a tagged control. Decline the prompt: nothing changes.
   Approve a second call: the ordinary UI handler runs.
4. Attempt to fill a credential field or navigate to an unpublished page: refused.
5. Disable browser-agent access in Settings → Privacy. Registered tools disappear;
   ordinary assistant chat still works. Reload: preference remains disabled.
6. Re-enable access. Tools return without restarting the assistant bridge.

Automated tests were authored but not executed in this dispatch. Chrome
acceptance also remains pending. Published-site form annotations and non-form
registration, and theme validator/scaffolds, are subsequent work. See the scoped
plan in ADS-memory/.local-artifacts/codex-waves/features-2026-10-04/webmcp-plan.md.

Plugin add-tab handles cover upload/drop targets, Advanced, Replace, Preview, Install,
Cancel and Skills GitHub/upload/confirmation controls. Browser page tools cannot
supply file bytes; file/folder inputs are tagged for discovery, but users or a browser
upload driver must provide those files. The shared add card has no border/shadow at
any width, including the 390px Skills tab.
