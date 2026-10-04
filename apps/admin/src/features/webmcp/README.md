# Admin browser-agent access

Owner decision: ON by default, 2026-09-22. Toggle under Settings → Privacy.
This preference is scoped to the current browser/origin, not a site-wide server
policy. It is stored in localStorage; blocked storage falls back to the current
session. The toggle deliberately carries no agent handle.

The admin consumes Jini's existing WebMCP projection, native host adapter and
page executor. The assistant and Chrome use the same DOM driver. Every non-read
page action requires a native confirmation dialog with the operation and input.
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
