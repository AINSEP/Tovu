import { agentHandle } from "@jini-ai/agentic";
import { useT } from "@jini-ai/ui";

import type { Translate } from "@/lib/dictionary-translator";

import { SeeMore } from "../../components/SeeMore/SeeMore";

import { useExternalMcpDriftCopy } from "./ExternalMcpSettingsPanel.hooks";
import {
  describeToolCount,
  describeToolRowBadges,
  describeToolRowLock,
  toolPickerHandle,
  useToolRowHandles,
} from "./ExternalMcpToolPicker.hooks";
import { displayToolDescription, isToolRowLocked, type ToolPickerRow } from "./external-mcp-tool-picker-rules";
import { useWiredExternalMcpToolPicker } from "./hooks/use-external-mcp-tool-picker.hooks";

/**
 * @file The write-tool picker — Phase 4 of
 * `ADS-memory/reports/pipeline/external-mcp-write-tools/implementation-outline.md`, named there and
 * promised by name in two shipping comments (`use-external-mcp.hooks.ts`'s `testSource`,
 * `external-mcp-i18n.ts`'s header) since Phase 2C translated its copy.
 *
 * ## What this replaces, and what it deliberately does not
 *
 * The roster card's two free-text fields (`ALLOWED TOOLS`, `ALLOWED TO MAKE CHANGES`) require an
 * operator to already know a remote's tool names and to type them without a typo — on the live
 * higgsfield connection that is 7 names chosen from 101, and a misspelling is silently reported as
 * `allowlistedButAbsent` rather than refused. This picker lists what the server actually advertises
 * and writes the same two fields back.
 *
 * It is a superset affordance, NOT a replacement (§3.5). The text fields stay, on the Connection
 * tab, because they are the failure path: a probe failure, an unreachable server, or a `stdio`
 * connection (which D-7 keeps out of the v1 probe entirely, to avoid spawning a child process in
 * the web server) leaves no advertised list to pick from, and an operator must still be able to
 * type. The picker degrades to a stated reason and never removes the other route.
 *
 * ## Two grants, and why one of them is not always rendered
 *
 * The gate reads two lists, and a name on the write list alone grants nothing — `trust.ts`'s
 * `writeAllowedButNotAllowlisted` is a named drift condition the existing banner exists to report.
 * So each row carries an allowlist checkbox, and a "may write" checkbox only for a tool that
 * DECLARES it writes. A read-only tool has no write to grant, and a silent one has not told us it
 * has: rendering the toggle anyway would invite a grant with no meaning at the gate. Both setters
 * in `external-mcp-tool-picker-rules.ts` keep the two lists consistent in both directions, so the
 * broken combination is unreachable from this control rather than merely discouraged.
 *
 * ## Colour is declared, never inherited
 *
 * Every control here sets `color` explicitly in `styles/external-mcp-tool-picker.css`. This app's
 * global `button` reset (`styles.css:279`) supplies `color: var(--primary-ink)` — near-white — and
 * a component stylesheet that declares `background` and `border` but not `color` loses that one
 * property to the host reset while winning the others, which is exactly how the sibling card's
 * Edit/Save/Cancel pills shipped as invisible text on a light panel (fixed in Jini `b82cbe95`; a
 * prior instance is documented at `settings-dialog.css:851-865`). A `getByText` assertion passes
 * throughout that failure, so legibility here is pinned against the stylesheet source instead.
 */

/** One tool. A real `<label>` wraps each checkbox rather than an `aria-label` — `agentHandle`'s
 *  `label` emits `data-agent-label` and supplies no accessible name at all, the same reasoning
 *  `ExternalMcpAdmissionsBanner`'s own row documents. Split out of the list `.map()` for this app's
 *  9/9 complexity ceiling, which scores a branch inside an inline callback with a nesting penalty. */
function ToolPickerRowItem(props: {
  row: ToolPickerRow;
  handle: string;
  t: Translate;
  onEnabled: (remoteName: string, enabled: boolean) => void;
  onMayWrite: (remoteName: string, mayWrite: boolean) => void;
}) {
  const { row, handle, t, onEnabled, onMayWrite } = props;
  const locked = isToolRowLocked(row);
  const lockReason = describeToolRowLock(row, t);
  const badges = describeToolRowBadges(row, t);

  return (
    <li className="external-mcp-tool-row" data-locked={locked || undefined}>
      <label className="external-mcp-tool-enable">
        <input
          type="checkbox"
          checked={row.enabled}
          disabled={locked}
          {...agentHandle(handle, { role: "checkbox", label: `Enable the tool ${row.remoteName}` })}
          onChange={(event) => onEnabled(row.remoteName, event.target.checked)}
        />
        <code className="external-mcp-tool-name">{row.remoteName}</code>
      </label>

      {badges.length > 0 ? (
        <p className="external-mcp-tool-badges">
          {badges.map((badge) => (
            <span key={badge} className="external-mcp-tool-badge">
              {badge}
            </span>
          ))}
        </p>
      ) : null}

      {/* `displayToolDescription` strips the `[EXTERNAL TOOL — provided by '...']` wrapper for
          THIS RENDER ONLY — `row.description` itself keeps carrying it, since that same string
          (via `describeRemoteToolSurface`/`describeFederatedTool`) is what actually reaches the
          model; see that function's own doc. `SeeMore` clamps a long one to 3 lines rather than
          running the row out to the description's full R6-capped length — this list can be 101
          rows deep, and an operator scanning it should not have to scroll past one tool's essay to
          reach the next tool's checkbox. */}
      {row.description ? (
        <SeeMore
          lines={3}
          className="external-mcp-tool-description-wrap"
          textClassName="external-mcp-tool-description"
          toggleAriaLabel={`See more of ${row.remoteName}'s description`}
          agentHandle={`${handle}-description-toggle`}
        >
          {displayToolDescription(row.description)}
        </SeeMore>
      ) : null}

      {/* Only for a tool that declares it writes — see this file's header. A locked row renders no
          write control either: its allowlist grant is refused outright, so a write grant on top of
          it would be doubly meaningless. */}
      {row.writeDeclared && !locked ? (
        <label className="external-mcp-tool-write">
          <input
            type="checkbox"
            checked={row.mayWrite}
            {...agentHandle(`${handle}-write`, { role: "checkbox", label: `Allow ${row.remoteName} to make changes` })}
            onChange={(event) => onMayWrite(row.remoteName, event.target.checked)}
          />
          <span>{t("may write")}</span>
        </label>
      ) : null}

      {lockReason ? <p className="external-mcp-tool-lock">{lockReason}</p> : null}
    </li>
  );
}

/** The count line plus the three actions. Its own component for the same complexity-ceiling reason
 *  as {@link ToolPickerRowItem}; it also keeps the count — the one thing the owner asked to be
 *  legible without scrolling a 101-row list — structurally above the scroll container rather than
 *  inside it. */
function ToolPickerHeader(props: {
  base: string;
  countLabel: string;
  zero: boolean;
  dirty: boolean;
  saving: boolean;
  refreshing: boolean;
  tUi: ReturnType<typeof useT>;
  onSave: () => void;
  onReset: () => void;
  onRefresh: () => void;
}) {
  const { base, countLabel, zero, dirty, saving, refreshing, tUi, onSave, onReset, onRefresh } = props;
  return (
    <div className="external-mcp-tool-head">
      <p
        className="external-mcp-tool-count"
        data-zero={zero || undefined}
        {...agentHandle(`${base}-count`, { role: "status", label: "How many of this server's tools are enabled" })}
      >
        {countLabel}
      </p>
      <div className="external-mcp-tool-actions">
        <button
          type="button"
          className="btn-secondary"
          {...agentHandle(`${base}-refresh`, { role: "button", label: "Re-read this server's advertised tool list" })}
          onClick={onRefresh}
          disabled={refreshing || saving}
        >
          {refreshing ? tUi("Refreshing…") : tUi("Refresh")}
        </button>
        <button
          type="button"
          className="btn-secondary"
          {...agentHandle(`${base}-reset`, { role: "button", label: "Discard unsaved tool selection changes" })}
          onClick={onReset}
          disabled={!dirty || saving}
        >
          {tUi("Cancel")}
        </button>
        <button
          type="button"
          className="external-mcp-tool-save"
          {...agentHandle(`${base}-save`, { role: "button", label: "Save this server's tool selection" })}
          onClick={onSave}
          disabled={!dirty || saving}
        >
          {tUi("Save")}
        </button>
      </div>
    </div>
  );
}

/** The list, the empty state, and the two states that are NOT an empty list — split out so the
 *  parent stays under the complexity ceiling, and so "the probe failed" and "this server genuinely
 *  advertises nothing" cannot collapse into the same rendering. An empty `<ul>` after a failed probe
 *  would read as "this server has no tools", which is a confident wrong answer. */
function ToolPickerBody(props: {
  base: string;
  loading: boolean;
  unreachable: string | null;
  rows: readonly ToolPickerRow[];
  handles: string[];
  t: Translate;
  tUi: ReturnType<typeof useT>;
  onEnabled: (remoteName: string, enabled: boolean) => void;
  onMayWrite: (remoteName: string, mayWrite: boolean) => void;
}) {
  const { base, loading, unreachable, rows, handles, t, tUi, onEnabled, onMayWrite } = props;

  if (loading) {
    return (
      <div className="external-mcp-tool-note" role="status">
        {tUi("Loading…")}
      </div>
    );
  }

  if (unreachable) {
    return (
      <div className="external-mcp-tool-note" role="alert">
        {unreachable}
      </div>
    );
  }

  if (rows.length === 0) {
    return <div className="external-mcp-tool-note">{t("This server advertises no tools.")}</div>;
  }

  return (
    <ul className="external-mcp-tool-list">
      {rows.map((row, index) => (
        <ToolPickerRowItem
          key={row.remoteName}
          row={row}
          handle={handles[index] ?? `${base}-tool-${index}`}
          t={t}
          onEnabled={onEnabled}
          onMayWrite={onMayWrite}
        />
      ))}
    </ul>
  );
}

export interface ExternalMcpToolPickerProps {
  /** The roster row's own id — the probe route's path parameter. */
  serverId: string;
  /** Whether the operator is looking at this server's Tools tab. Gates the outbound probe. */
  active: boolean;
  /** Whether the CONNECTION itself is switched on. A carefully-picked roster on a disabled
   *  connection loads nothing, and the card's own toggle is one tab away, so the state is restated
   *  here rather than left invisible while someone works. */
  connectionEnabled: boolean;
  allowedToolNames: string | undefined;
  writeAllowedToolNames: string | undefined;
  saving: boolean;
  onSave: (fields: { allowedToolNames: string; writeAllowedToolNames: string }) => void;
  /** This server's card handle, from `resolveExternalMcpCardHandles` — the picker derives its own
   *  namespace from it so the two never collide. */
  cardHandle: string;
}

export function ExternalMcpToolPicker(props: ExternalMcpToolPickerProps) {
  const { serverId, active, connectionEnabled, allowedToolNames, writeAllowedToolNames, saving, onSave, cardHandle } = props;
  const t = useExternalMcpDriftCopy();
  const tUi = useT();
  const picker = useWiredExternalMcpToolPicker({ serverId, active, allowedToolNames, writeAllowedToolNames, t });
  const base = toolPickerHandle(cardHandle);
  const handles = useToolRowHandles(base, picker.rows);
  const countLabel = describeToolCount(picker.enabledCount, picker.advertisedCount || picker.rows.length, t);

  return (
    <section className="external-mcp-tool-picker" {...agentHandle(base, { role: "region", label: "External tool permissions" })}>
      {connectionEnabled ? null : (
        <p className="external-mcp-tool-note" role="status">
          {t("This connection is switched off — these tools will not load until you enable it.")}
        </p>
      )}

      <ToolPickerHeader
        base={base}
        countLabel={countLabel}
        zero={picker.enabledCount === 0}
        dirty={picker.dirty}
        saving={saving}
        refreshing={picker.refreshing}
        tUi={tUi}
        onSave={() => onSave(picker.fieldValues())}
        onReset={picker.reset}
        onRefresh={picker.refresh}
      />

      <ToolPickerBody
        base={base}
        loading={picker.loading}
        unreachable={picker.unreachable}
        rows={picker.rows}
        handles={handles}
        t={t}
        tUi={tUi}
        onEnabled={picker.setEnabled}
        onMayWrite={picker.setMayWrite}
      />

      <p className="external-mcp-tool-footnote">{t("Changes here take effect when the assistant next restarts.")}</p>
    </section>
  );
}
