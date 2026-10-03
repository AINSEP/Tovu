import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { baselineUnavailableMessage, discardCountLine, restoreDoneMessage, restorePlanReadyMessage, sinceDiscardMessage, t } from "../recovery-i18n";

// Author Checklist F1.1/F4.3/F6.2: literal translated sentences, distinct IDs/counts,
// actual rendered nodes, no translator mocks; reject forcing all helpers to English.
it("binds the recovery dictionary and keeps untranslated keys intact", () => {
  expect(t("es", "Restore points")).toBe("Puntos de restauración");
  expect(t("unlisted-locale", "Restore points")).toBe("Restore points");
  expect(t("es", "unknown future recovery label")).toBe("unknown future recovery label");
});

it.each([
  ["es", "Desde stamp-17, restaurar aquí descartaría al menos:", "Plan de restauración listo (plan plan-42). Confirmarlo emite un token de ejecución de un solo uso: nada se ha restaurado todavía.", "La ejecución de restauración run-83 finalizó en estado refused."],
  ["unlisted-locale", "Since stamp-17, restoring here would discard at least:", "Restore plan ready (plan plan-42). Confirming issues a one-time execution token — nothing is restored yet.", "Restore run run-83 finished in state refused."],
])("preserves interpolated identities and caller markup for %s", (locale, since, plan, done) => {
  const { container } = render(<>
    <p data-testid="since">{sinceDiscardMessage(locale, "stamp-17")}</p>
    <p data-testid="plan">{restorePlanReadyMessage(locale, "plan-42")}</p>
    <p data-testid="done">{restoreDoneMessage(locale, "run-83", <span role="status">refused</span>)}</p>
  </>);
  expect(screen.getByTestId("since").textContent).toBe(since);
  expect(container.querySelector("strong")?.textContent).toBe("stamp-17");
  expect(screen.getByTestId("plan").textContent).toBe(plan);
  expect(screen.getByTestId("plan").querySelector("code")?.textContent).toBe("plan-42");
  expect(screen.getByTestId("done").textContent).toBe(done);
  expect(screen.getByRole("status").textContent).toBe("refused");
});

it.each([
  ["es", "al menos una cantidad desconocida de posts/pages writes", 'No se pudo calcular la línea base de la ventana de escritura descartada para este sitio en este momento — cada recuento anterior se muestra como "desconocido", no como un cero verificado.'],
  ["unlisted-locale", "at least an unknown number of posts/pages writes", 'The discarded-write-window baseline could not be computed for this site right now — every count above is shown as "unknown", not a verified zero.'],
])("distinguishes unknown from verified zero for %s", (locale, unknown, baseline) => {
  // Reject: count === "unknown" returns numeric zero.
  render(<>
    <div data-testid="unknown">{discardCountLine(locale, "unknown", "posts/pages writes")}</div>
    <div data-testid="zero">{discardCountLine(locale, 0, "plugin-table rows")}</div>
    <div data-testid="count">{discardCountLine(locale, 17, "redirect writes")}</div>
    <p role="alert">{baselineUnavailableMessage(locale)}</p>
  </>);
  expect(screen.getByTestId("unknown").textContent).toBe(unknown);
  expect(screen.getByTestId("unknown").querySelector("[data-unknown=true]")?.textContent).toBe(unknown.replace("posts/pages writes", ""));
  expect(screen.getByTestId("zero").textContent).toBe("0 plugin-table rows");
  expect(screen.getByTestId("zero").querySelector("[data-unknown]")).toBeNull();
  expect(screen.getByTestId("count").textContent).toBe("17 redirect writes");
  expect(screen.getByRole("alert").textContent).toBe(baseline);
});
