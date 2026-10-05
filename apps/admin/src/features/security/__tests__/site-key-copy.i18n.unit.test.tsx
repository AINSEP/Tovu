import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteKeyTab } from "../SiteKeyTab";
import { t } from "../security-i18n";
import { siteKeyStatusBadgeLabel } from "../hooks/site-key-status.rules";
import type { SiteKeyController } from "../hooks/use-site-key.hooks";
import type { SiteKeyRecoveryController } from "../hooks/use-site-key-recovery.hooks";

const locales = ["en", "es", "de", "fr", "it", "pt-BR", "pl", "hu", "tr", "ru", "uk", "id", "ar", "fa", "hi", "bn", "ur", "ja", "ko", "th", "zh-CN", "zh-TW"];
const copy = [
  "This key protects the passwords, API keys, and other credentials you've saved in Tovu — including on your live site.",
  "On a live site, this key is stored right next to your database. Anyone who gets a full backup of your server would get both your data and the key that unlocks it.",
  "One exception: webhook signing and newsletter unsubscribe links use a separate key on your live site.",
  "Active — key file", "None", "Fingerprint", "A short ID for this key. It changes if the key changes.",
  "Stored in a file on this server, at", "Reveal", "Revealing…", "View and reveal the site key", "Switch to the site key tab",
];

describe("site key tab translations", () => {
  for (const locale of locales) {
    it(`supplies the tab disclosure, status, reveal and accessibility copy in ${locale}`, () => {
      for (const key of copy) {
        const translated = t(locale, key);
        expect(translated.trim()).not.toBe("");
        if (locale !== "en") expect(translated, key).not.toBe(key);
      }
      const label = siteKeyStatusBadgeLabel({ status: { active: true, source: "env", envVarName: "TOVU_SITE_KEY" }, t: key => t(locale, key) });
      expect(label).toContain("TOVU_SITE_KEY");
      expect(label).not.toContain("{name}");
    });
  }

  it("renders the German file-key disclosure and Reveal control without advertising hidden Generate", () => {
    const translate = (key: string) => t("de", key);
    const controller: SiteKeyController = {
      status: { active: true, source: "file", state: "active", fingerprint: "a1b2c3", keyFilePath: "/fixture/site-key.hex", runtimeMode: "production" },
      loadError: null, revealing: false, revealError: null, revealedHex: null,
      reveal: async () => {}, hideRevealed: () => {}, generating: false, generateError: null,
      generate: async () => {}, refresh: async () => {}, t: translate,
    };
    const recovery: SiteKeyRecoveryController = {
      siteKey: "", setSiteKey: () => {}, unlocking: false, unlockError: null, unlock: async () => {},
      startFreshStep: "closed", preview: null, openStartFresh: async () => {}, cancelStartFresh: () => {},
      confirmText: "", setConfirmText: () => {}, canConfirmStartFresh: false, startingFresh: false,
      startFreshError: null, startFresh: async () => {}, resultMessage: null, t: translate,
    };
    const { container } = render(<SiteKeyTab useSiteKeyHook={() => controller} useSiteKeyRecoveryHook={() => recovery} />);
    expect(screen.getByText(translate(copy[0]))).toBeInTheDocument();
    expect(screen.getByText(translate(copy[1]))).toBeInTheDocument();
    expect(screen.getByText(translate(copy[2]))).toBeInTheDocument();
    expect(screen.getByText("Aktiv — Schlüsseldatei")).toBeInTheDocument();
    expect(screen.getByText("Fingerabdruck")).toBeInTheDocument();
    expect(screen.getByText("In einer Datei auf diesem Server gespeichert, unter")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anzeigen" })).toBeInTheDocument();
    expect(container.querySelector('[data-agent-element="security-site-key"]')).toHaveAttribute("data-agent-label", translate("View and reveal the site key"));
    expect(container.textContent).not.toContain("whether or not you generate");
    expect(screen.queryByRole("button", { name: /Generate/ })).not.toBeInTheDocument();
  });
});
