import { siteUrl } from "../../lib/site-url";
import { useAppearance } from "./hooks/use-appearance.hooks";
import { isActiveTheme } from "./rules";

/**
 * @file The Appearance/Themes screen — markup only.
 *
 * State, the fetch, and theme activation live in `hooks/use-appearance.hooks.ts`. The
 * active-theme status derivation lives in `rules.ts`. `THEME_BLURBS` is static copy, not a
 * derivation, so it stays here.
 */
const THEME_BLURBS: Record<string, string> = {
  "tovu-official": "The official explainer — a landing page that documents Tovu itself.",
  column: "A reading-first literary theme — serif type in a single column.",
  signal: "A bright product-blog — cobalt masthead and a rounded card grid.",
};

export interface AppearanceProps {
  /**
   * Dependency injection seam for tests — the same convention `Posts.tsx`'s `usePostsHook` uses.
   * Defaulted to the real hook, so production callers pass nothing and behave exactly as before.
   */
  useAppearanceHook?: typeof useAppearance;
}

export function Appearance({ useAppearanceHook = useAppearance }: AppearanceProps = {}) {
  const { settings, themes, error, busyTheme, activate } = useAppearanceHook();

  if (error && !settings) return <div className="notice error">{error}</div>;
  if (!settings) return <div className="notice">Loading themes…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Studio</p>
          <h1 className="page-title">Themes</h1>
          <p className="page-description">The active theme controls what visitors see across the entire public site.</p>
        </div>
      </div>
      <p>
        <a href={siteUrl("/")} target="_blank" rel="noreferrer">View site ↗</a>
      </p>
      {error ? <div className="notice error">{error}</div> : null}
      <div className="theme-grid">
        {themes.map((themeId) => {
          const active = isActiveTheme(settings, themeId);
          return (
            <div key={themeId} className={`theme-card theme-${themeId}${active ? " active" : ""}`}>
              <h3>{themeId}</h3>
              <p>{THEME_BLURBS[themeId] ?? ""}</p>
              {active ? (
                <span className="theme-active-tag">Active</span>
              ) : (
                <button disabled={busyTheme !== null} onClick={() => activate(themeId)}>
                  {busyTheme === themeId ? "Activating…" : "Activate"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
