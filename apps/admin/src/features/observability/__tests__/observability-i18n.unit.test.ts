import { expect, it } from "vitest";
import { t } from "../observability-i18n";

// F4.3: translated strings differ from English; these are examples, not a completeness claim.
it("binds the observability dictionary for enabled, disabled and failed status", () => {
  // Regression target: bind an empty dictionary, or route every lookup to English.
  expect(t("es", "OpenTelemetry is ON — traces are being recorded.")).toBe("OpenTelemetry está ACTIVADO — se están registrando trazas.");
  expect(t("es", "OpenTelemetry is OFF (the default) — nothing is being recorded.")).toBe("OpenTelemetry está DESACTIVADO (el valor predeterminado) — no se está registrando nada.");
  expect(t("es", "failed to load observability status")).toBe("no se pudo cargar el estado de observabilidad");
  expect(t("de", "Checking current status…")).toBe("Aktueller Status wird geprüft…");
});

it("inherits common copy and falls back to the source key for unknown locales and keys", () => {
  // Regression target: return undefined on a miss, or omit the common-copy fallback.
  expect(t("es", "Save")).toBe("Guardar");
  expect(t("en", "Observability Overview")).toBe("Observability Overview");
  expect(t("unknown", "Observability Overview")).toBe("Observability Overview");
  expect(t("es", "new observability message")).toBe("new observability message");
});
