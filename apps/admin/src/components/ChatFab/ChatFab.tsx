import { useFabPosition } from "./ChatFab.hooks";
import { DEFAULT_LOCALE } from "../../lib/settings-tabs";
import { interpolate } from "../../lib/template-i18n";

interface ChatFabProps {
  open: boolean;
  onToggle: () => void;
  label?: string;
  /**
   * `useAdminLocale()`'s current value, threaded from the caller (`App.tsx`) rather than read here
   * directly — this component has no other data-dependent hook today, and the existing unit tests
   * render it with no locale at all, so `DEFAULT_LOCALE` ("en") is what every un-parameterized call
   * — tests included — keeps getting. Only the "Open"/"Close" verb template is this component's own
   * to translate; `label` itself is the caller's word (see `App.tsx`'s `dockT("assistant")`).
   */
  locale?: string;
  /**
   * Bottom clearance (px) to hold above while `open` — the mobile sheet's current rendered
   * height, or `0` at desktop, where the assistant docks to the *side* of `.admin-content`
   * rather than below it, so there is nothing at the bottom edge to avoid. See `App.tsx`, which
   * measures the actual sheet element rather than assuming a fixed height.
   */
  avoidBottomPx: number;
  /**
   * Right clearance (px) to hold left of while `open` — the DESKTOP dock's current rendered width,
   * or `0` in sheet mode where the sheet spans the full width and `avoidBottomPx` is the axis that
   * matters. Without this the FAB sits on top of the dock's own composer send button and eats its
   * clicks; see `useFabPosition`'s `avoidRightPx` doc for the full history.
   */
  avoidRightPx: number;
  ref?: React.Ref<HTMLButtonElement>;
  /**
   * Injectable seam for the drag/position hook. Defaults to the real {@link useFabPosition}
   * (MSG-01, 2026-08-06, owner directive — `useFabPosition` was named as the strongest case in the
   * pass): that hook attaches document-level `pointermove`/`pointerup`/`pointercancel` listeners,
   * calls `setPointerCapture`, reads/writes `localStorage`, and reads `window.innerWidth`/
   * `innerHeight` on every render. A test can pass a fake here to assert this component's markup/
   * aria/class-name behavior without driving any of that — the drag physics themselves stay
   * covered by `ChatFab.hooks.unit.test.tsx` against the real hook. Named `useFab`, shortening
   * `useFabPosition` the same way Jini's `ConfirmDialog` shortens `useConfirmDialog` to `useDialog`.
   */
  useFab?: typeof useFabPosition;
}

const FAB_ACTION_TEMPLATE: Record<string, { open: string; close: string }> = {
  en: { open: "Open {label}", close: "Close {label}" },
  es: { open: "Abrir {label}", close: "Cerrar {label}" },
  id: { open: "Buka {label}", close: "Tutup {label}" },
  de: { open: "{label} öffnen", close: "{label} schließen" },
  "zh-CN": { open: "打开{label}", close: "关闭{label}" },
  "zh-TW": { open: "開啟{label}", close: "關閉{label}" },
  "pt-BR": { open: "Abrir {label}", close: "Fechar {label}" },
  ru: { open: "Открыть {label}", close: "Закрыть {label}" },
  fa: { open: "باز کردن {label}", close: "بستن {label}" },
  ar: { open: "فتح {label}", close: "إغلاق {label}" },
  ja: { open: "{label}を開く", close: "{label}を閉じる" },
  ko: { open: "{label} 열기", close: "{label} 닫기" },
  pl: { open: "Otwórz {label}", close: "Zamknij {label}" },
  hu: { open: "{label} megnyitása", close: "{label} bezárása" },
  fr: { open: "Ouvrir {label}", close: "Fermer {label}" },
  uk: { open: "Відкрити {label}", close: "Закрити {label}" },
  tr: { open: "{label} aç", close: "{label} kapat" },
  th: { open: "เปิด {label}", close: "ปิด {label}" },
  it: { open: "Apri {label}", close: "Chiudi {label}" },
};

/** "Open {label}"/"Close {label}" in the caller's locale — `label` itself is already translated
 *  (by the caller; see `App.tsx`'s `dockT("assistant")`) by the time it reaches this component. */
function fabActionLabel(locale: string, action: "open" | "close", label: string): string {
  const forms = FAB_ACTION_TEMPLATE[locale] ?? FAB_ACTION_TEMPLATE.en;
  return interpolate(forms[action], { label });
}

/**
 * Floating toggle for the global assistant dock (ADR-049), and — per MSG-09 — draggable to
 * wherever the operator wants it out of the way. Mirrors
 * `examples/reference-web/src/ChatFab.tsx`'s role in Jini's own reference app: a fixed-position
 * button that opens/closes the docked chat pane without ever unmounting it — see
 * `AssistantDock.tsx`'s module doc for why the dock itself uses `hidden`, not conditional render.
 *
 * The drag itself is `useFabPosition`'s job entirely (injectable via the `useFab` prop, defaulted
 * to the real implementation); this component only wires its `style`/`onPointerDown` onto the
 * button and guards `onClick` with `consumeDragFlag()` so a drag's release does not also fire a
 * toggle (see that function's own doc for why a plain `isDragging` check at this call site would
 * be timing-unsafe).
 */
export function ChatFab({ open, onToggle, label = "assistant", avoidBottomPx, avoidRightPx, ref, useFab = useFabPosition, locale = DEFAULT_LOCALE }: ChatFabProps) {
  const fab = useFab({ dockOpen: open, avoidBottomPx, avoidRightPx });
  const actionLabel = fabActionLabel(locale, open ? "close" : "open", label);

  return (
    <button
      ref={ref}
      type="button"
      className={`chat-fab${open ? " chat-fab-dock-open" : ""}${fab.isDragging ? " chat-fab-dragging" : ""}`}
      style={fab.style}
      onPointerDown={fab.onPointerDown}
      onClick={() => {
        if (fab.consumeDragFlag()) return;
        onToggle();
      }}
      aria-expanded={open}
      aria-label={actionLabel}
      title={actionLabel}
    >
      {open ? (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M5 5 15 15M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M9 1.8 10.6 6 15 7.2 10.6 8.4 9 12.6 7.4 8.4 3 7.2 7.4 6Z" fill="currentColor" />
          <circle cx="14" cy="13.5" r="1.7" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}
