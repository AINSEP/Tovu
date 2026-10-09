import { describe, expect, it } from "vitest";
import { t } from "../sites-i18n";

// Author Checklist / F4.1: literal language expectations; no expected values derived from t.
describe("Sites assembled dictionary", () => {
  it("retains base copy and merges detail and token copy into the same locale", () => {
    // Mutation: remove either Object.assign loop; the relevant lookup falls back to English.
    expect(t({ locale: "de", key: "Make default" })).toBe("Als Standard festlegen");
    expect(t({ locale: "de", key: "Folder name" })).toBe("Ordnername");
    expect(t({ locale: "de", key: "Make {name} the default site" })).toBe("{name} als Standardwebsite festlegen");
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

  it("localizes the inline Supabase hint without sending readers to a removed section", () => {
    expect(t({ locale: "en", key: "Hosted · not for site content yet." })).toBe("Hosted · not for site content yet.");
    expect(t({ locale: "de", key: "Hosted · not for site content yet." })).toBe("Gehostet · noch nicht für Website-Inhalte.");
    expect(t({ locale: "fr", key: "Hosted · not for site content yet." })).toBe("Hébergé · pas encore pour le contenu du site.");
    expect(t({ locale: "zh-CN", key: "Hosted · not for site content yet." })).toBe("托管 · 暂不用于网站内容。");
  });
});

it("localizes process actions and destructive confirmation, with a readable unknown-locale fallback", () => {
  expect(t({ locale: "de", key: "Move this site to Trash? You can restore it later." })).toBe("Diese Website in den Papierkorb verschieben? Sie können sie später wiederherstellen.");
  expect(t({ locale: "fr", key: "Switch now? Unsaved changes will be lost." })).toBe("Basculer maintenant ? Les modifications non enregistrées seront perdues.");
  expect(t({ locale: "ja", key: "Make default" })).toBe("既定に設定");
  expect(t({ locale: "zh-CN", key: "Delete permanently" })).toBe("永久删除");
  expect(t({ locale: "xx", key: "Starting…" })).toBe("Starting…");
});

it("localizes the card polish copy: pill, meta, overflow menu and confirm dialog chrome", () => {
  // Mutation: drop the SITE_CARD_DICT merge loop; every lookup below falls back to English.
  expect(t({ locale: "de", key: "Running on :{port}" })).toBe("Läuft auf :{port}");
  expect(t({ locale: "fr", key: "More actions for {name}" })).toBe("Plus d'actions pour {name}");
  expect(t({ locale: "ja", key: "Delete…" })).toBe("削除…");
  expect(t({ locale: "zh-TW", key: "Move site to Trash?" })).toBe("將網站移至垃圾桶？");
  expect(t({ locale: "ar", key: "In Trash" })).toBe("في سلة المهملات");
  expect(t({ locale: "xx", key: "Open {name} in a new tab" })).toBe("Open {name} in a new tab");
});
