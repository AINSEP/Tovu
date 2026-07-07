import { useEffect, useState } from "react";
import { api, type PresentationSettings } from "../lib/api";

const THEME_BLURBS: Record<string, string> = {
  paper: "Editorial and warm — serif type on cream.",
  atlas: "Bold and atmospheric — light on deep navy.",
  glassmorphic: "Translucent and layered — frosted panels.",
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
    <div>
      <h1>Appearance</h1>
      <p>
        Active theme drives the public site. <a href="/" target="_blank" rel="noreferrer">View site ↗</a>
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
