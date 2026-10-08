import { describe, expect, it } from "vitest";
import { t } from "../sites-i18n";

// Author Checklist / F4.1: literal language expectations; no expected values derived from t.
describe("Sites assembled dictionary", () => {
  it("retains base copy and merges detail and token copy into the same locale", () => {
    // Mutation: remove either Object.assign loop; the relevant lookup falls back to English.
    expect(t({ locale: "de", key: "Serve after restart" })).toBe("Nach Neustart bereitstellen");
    expect(t({ locale: "de", key: "Folder name" })).toBe("Ordnername");
    expect(t({ locale: "de", key: "Save {name} as the site to serve after the next restart" })).toBe("{name} als nach dem nächsten Neustart bereitzustellende Website speichern");
    expect(t({ locale: "de", key: "Connect services" })).toBe("Dienste verbinden");
    expect(t({ locale: "fr", key: "Connect services" })).toBe("Connecter des services");
  });

  it("inherits shared copy and keeps unknown locale/key text readable", () => {
    // Mutation: return an empty string on a dictionary miss instead of delegating fallback.
    expect(t({ locale: "de", key: "Cancel" })).toBe("Abbrechen");
    expect(t({ locale: "en", key: "Folder name" })).toBe("Folder name");
    expect(t({ locale: "xx", key: "Connect services" })).toBe("Connect services");
    expect(t({ locale: "de", key: "plugin supplied phrase" })).toBe("plugin supplied phrase");
  });
});
