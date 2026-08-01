import { useEffect, useState } from "react";
import { api, type PresentationSettings } from "../lib/api";
import { siteUrl } from "../lib/site-url";

const THEME_BLURBS: Record<string, string> = {
  "tovu-official": "The official explainer — a landing page that documents Tovu itself.",
  column: "A reading-first literary theme — serif type in a single column.",
  signal: "A bright product-blog — cobalt masthead and a rounded card grid.",
};

export function Appearance() {
  const [settings, setSettings] = useState<PresentationSettings | null>(null);
  const [themes, setThemes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyTheme, setBusyTheme] = useState<string | null>(null);

  useEffect(() => {
    api
      .getPresentation()
      .then((r) => {
        setSettings(r.settings);
        setThemes(r.availableThemeIds);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "failed to load themes"));
  }, []);

  async function activate(themeId: string) {
    setBusyTheme(themeId);
    setError(null);
    try {
      const r = await api.setActiveTheme(themeId);
      setSettings(r.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to switch theme");
    } finally {
      setBusyTheme(null);
    }
  }

  if (error && !settings) return <div className="notice error">{error}</div>;
  if (!settings) return <div className="notice">Loading themes…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-text">
          <p className="page-kicker">Design & System</p>
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
          const active = settings.activeThemeId === themeId;
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
