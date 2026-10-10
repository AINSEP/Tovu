import { Fragment } from "react";
import { CodeWithLines } from "@jini-ai/ui";
import { agentHandle } from "@jini-ai/agentic";
import type { Translate } from "@jini-ai/ui/panel-kit";

/**
 * @file Read-only line-numbered code with a Wrap on/off toggle, shared by the plugin package-files
 * viewer and the theme template viewer (2026-10-10; extracted from `PackageFilesModal.tsx`).
 */

/**
 * Wrap-safe stand-in for Jini's `CodeWithLines`, used only while wrapping is on. `CodeWithLines`
 * renders the gutter and the code as two independent `white-space: pre` text blocks that stay
 * aligned only because neither one wraps — the instant a code line wraps to more than one visual
 * row, every later gutter number drifts out of sync with its line. This lays out one CSS grid row
 * per source line instead (`.code-viewer--wrap` in styles.css): a wrapped line's row simply grows
 * taller, and its own gutter number grows with it, so nothing downstream can ever desync.
 */
function WrappedCode({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="code-viewer code-viewer--wrap">
      {lines.map((line, i) => (
        <Fragment key={i}>
          <span className="line-number" aria-hidden>
            {i + 1}
          </span>
          <span className="line-content">{line}</span>
        </Fragment>
      ))}
    </div>
  );
}

/** The code itself: wrapped grid rows, or Jini's unwrapped `CodeWithLines`. */
export function CodeView({ text, wrap }: { text: string; wrap: boolean }) {
  return wrap ? <WrappedCode text={text} /> : <CodeWithLines text={text} />;
}

/** "Wrap: on" / "Wrap: off" — a pressed-state toggle; labels come from the common dictionary. */
export function CodeWrapToggle({ wrap, onToggle, t, agentHandleId, className }: {
  wrap: boolean;
  onToggle: () => void;
  t: Translate;
  agentHandleId: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-pressed={wrap}
      onClick={onToggle}
      {...agentHandle({ handle: agentHandleId }, { role: "button", label: "Toggle line wrapping for this file" })}
    >
      {wrap ? t("Wrap: on") : t("Wrap: off")}
    </button>
  );
}
