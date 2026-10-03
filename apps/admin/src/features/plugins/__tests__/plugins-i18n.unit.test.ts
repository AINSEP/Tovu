import { expect, it } from "vitest";
import { t } from "../plugins-i18n";

it("binds plugin actions and package-viewer copy to the requested locale", () => {
  // F4.3 regression target: bind an empty dictionary, or swap Enable and Disable entries.
  expect(t("es", "Enable")).toBe("Activar");
  expect(t("es", "Disable")).toBe("Desactivar");
  expect(t("es", "Move to trash")).toBe("Mover a la papelera");
  expect(t("es", "Inspect package files")).toBe("Inspeccionar los archivos del paquete");
  expect(t("bn", "Wrap: off")).toBe("র‍্যাপ: বন্ধ");
});

it("inherits common copy and uses English keys for absent translations", () => {
  // Regression target: return undefined on a miss, or omit the common-copy fallback.
  expect(t("es", "Save")).toBe("Guardar");
  expect(t("en", "Inspect package files")).toBe("Inspect package files");
  expect(t("unknown", "Inspect package files")).toBe("Inspect package files");
  expect(t("es", "new plugin message")).toBe("new plugin message");
});
