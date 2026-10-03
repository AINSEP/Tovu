import { describe, expect, it } from "vitest";
import { t } from "../analytics-i18n";

// Author Checklist F3.4/F4.3/F6.2: identity translator fakes in Analytics tests cannot
// catch a dropped dictionary binding. These execute the real public translation surface.
describe("analytics screen translations", () => {
  it.each([
    ["Analytics", "Analítica"],
    ["The most recent pageviews and events captured on this site.", "Las vistas de página y eventos más recientes capturados en este sitio."],
    ["Each visit is listed on its own row, newest first. This is not a summary — there are no totals, trends, or breakdowns to compare traffic over time yet.", "Cada visita aparece en su propia fila, de la más reciente a la más antigua. Esto no es un resumen: todavía no hay totales, tendencias ni desgloses para comparar el tráfico a lo largo del tiempo."],
    ["No hits recorded yet.", "Aún no se han registrado visitas."],
    ["Once the site beacon starts sending traffic, recent hits will appear here.", "Una vez que el beacon del sitio empiece a enviar tráfico, las visitas recientes aparecerán aquí."],
    ["Path", "Ruta"],
    ["Referrer", "Referente"],
    ["(direct)", "(directo)"],
    ["Device / Browser", "Dispositivo / Navegador"],
    ["event:", "evento:"],
    ["Time", "Hora"],
    ["Loading recent hits…", "Cargando visitas recientes…"],
  ])("translates Spanish analytics copy %s", (key, expected) => {
    expect(t("es", key)).toBe(expected);
  });

  it("uses the locale on every call and retains the fallback chain", () => {
    expect(t("de", "No hits recorded yet.")).toBe("Noch keine Treffer erfasst.");
    expect(t("es", "No hits recorded yet.")).toBe("Aún no se han registrado visitas.");
    expect(t("es", "Cancel")).toBe("Cancelar");
    expect(t("en", "Loading recent hits…")).toBe("Loading recent hits…");
    expect(t("unknown-locale", "Path")).toBe("Path");
    expect(t("es", "Unlisted analytics error")).toBe("Unlisted analytics error");
  });
});
