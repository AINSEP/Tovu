import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AdminSchemaState } from "@/lib/api";
import { ADMIN_LOCALES } from "@/lib/settings-tabs";
import { planReadyMessage, t } from "../database-i18n";
import { resolveSchemaStateWarning } from "../rules";

// Author Checklist F4.3/F6.2: always returning the English key or skipping shared fallback fails.
it("resolves feature copy, shared copy and missing-key/locale fallbacks to exact strings", () => {
  expect(t("es", "Timeline")).toBe("Cronología");
  expect(t("de", "Migrate forward")).toBe("Vorwärts migrieren");
  expect(t("es", "Failed to plan the forward migration")).toBe("No se pudo planificar la migración hacia adelante");
  expect(t("de", "Save")).toBe("Speichern");
  expect(t("en", "Timeline")).toBe("Timeline");
  expect(t("xx", "Timeline")).toBe("Timeline");
  expect(t("es", "New unregistered copy")).toBe("New unregistered copy");
});

describe("plan-ready message", () => {
  // F4.1: literal reviewed copy, not expectations built from the dictionary or current output.
  it.each([
    ["es", "Plan listo (plan ", "). Confirmarlo emite un token de ejecución de un solo uso: nada se ha migrado todavía."],
    ["de", "Plan bereit (Plan ", "). Die Bestätigung stellt ein einmaliges Ausführungstoken aus — es wurde noch nichts migriert."],
    ["en", "Plan ready (plan ", "). Confirming issues a one-time execution token — nothing is migrated yet."],
    ["xx", "Plan ready (plan ", "). Confirming issues a one-time execution token — nothing is migrated yet."],
  ])("renders %s copy around the exact plan identifier as inert code text", (locale, before, after) => {
    const id = '<b>plan-42 & "next"</b>';
    const { container } = render(<div>{planReadyMessage(locale, id)}</div>);
    const code = container.querySelector("code")!;
    expect(code).toBeInTheDocument();
    expect(code.textContent).toBe(id);
    expect(container.textContent).toBe(`${before}${id}${after}`);
    expect(container.querySelector("b")).toBeNull();
  });

  // F4.2/F5.2: locale membership comes from the production picker, not a hand-kept test list.
  it("has localized ceremony fragments for every supported non-English locale", () => {
    const locales = ADMIN_LOCALES.filter(({ code }) => code !== "en");
    expect(locales.map(({ code }) => code)).toContain("es");
    for (const { code } of locales) {
      const { container, unmount } = render(<div>{planReadyMessage(code, "migration-17")}</div>);
      expect(container.querySelector("code")?.textContent, code).toBe("migration-17");
      expect(container.textContent, code).not.toContain("Plan ready (plan");
      expect(container.textContent!.length, code).toBeGreaterThan("migration-17".length);
      unmount();
    }
  });
});

it("translates every warning emitted by the schema-state rules in every supported locale", () => {
  // F4.2/F5.2: collect keys from the actual warning producer, with positive controls. A missing
  // safety-critical key must fail even when newly introduced by that producer.
  const warnings = ["diverged", "ahead", "behind", "unknown", "future-status"].map((status) =>
    resolveSchemaStateWarning({ state: { status } as AdminSchemaState, error: null }));
  warnings.push(resolveSchemaStateWarning({ state: null, error: "offline" }));
  for (const warning of warnings) expect(warning).not.toBeNull();
  const keys = new Set(warnings.flatMap((warning) => [warning!.title, warning!.body]));
  expect(keys).toContain("Your database is out of date");
  expect(keys.size).toBeGreaterThan(0);
  const locales = ADMIN_LOCALES.filter(({ code }) => code !== "en");
  expect(locales.map(({ code }) => code)).toContain("es");
  for (const { code } of locales) {
    for (const key of keys) {
      expect(t(code, key), `${code}: ${key}`).not.toBe(key);
      expect(t(code, key).trim().length, `${code}: ${key}`).toBeGreaterThan(0);
    }
  }
});
