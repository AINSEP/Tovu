import { expect, it } from "vitest";
import { t } from "../plugins-i18n";

it("binds plugin actions and package-viewer copy to the requested locale", () => {
  // F4.3 regression target: bind an empty dictionary, or swap Enable and Disable entries.
  expect(t({ locale: "es", key: "Enable" })).toBe("Activar");
  expect(t({ locale: "es", key: "Disable" })).toBe("Desactivar");
  expect(t({ locale: "es", key: "Move to trash" })).toBe("Mover a la papelera");
  expect(t({ locale: "es", key: "Inspect package files" })).toBe("Inspeccionar los archivos del paquete");
  expect(t({ locale: "bn", key: "Wrap: off" })).toBe("র‍্যাপ: বন্ধ");
});

it("inherits common copy and uses English keys for absent translations", () => {
  // Regression target: return undefined on a miss, or omit the common-copy fallback.
  expect(t({ locale: "es", key: "Save" })).toBe("Guardar");
  expect(t({ locale: "en", key: "Inspect package files" })).toBe("Inspect package files");
  expect(t({ locale: "unknown", key: "Inspect package files" })).toBe("Inspect package files");
  expect(t({ locale: "es", key: "new plugin message" })).toBe("new plugin message");
});
