import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { t } from "../comments-i18n";
import { describeModerationError as describeJiniModerationError } from "@jini-ai/admin/comments";
import { createCommentsTranslator } from "../../../integrations/jini-admin/comments-ports";

// Keep the host's original assertions while adapting to the package's injected translator.
const describeModerationError = (e: unknown, locale: string) =>
  describeJiniModerationError({ e }, { t: createCommentsTranslator({ locale }) });

// Author Checklist F4.3/F4.4/F6.2: Spanish menu labels already have coverage; the
// missing contract is localized errors and templates. Real rules/translator, no mocks/state.
describe("comment moderation translation gaps", () => {
  it("reports the current version through the real localized error consumer", () => {
    const conflict = new ApiError("raw conflict", 409, "CONFLICT", { currentVersion: 17 });
    expect(describeModerationError(conflict, "es")).toBe("Este comentario cambió desde que lo cargaste (versión actual 17); actualiza e inténtalo de nuevo.");
    expect(describeModerationError(new ApiError("raw conflict", 409, "CONFLICT"), "es"))
      .toBe("Este comentario cambió desde que lo cargaste; actualiza e inténtalo de nuevo.");
    expect(describeModerationError(null, "es")).toBe("No se pudo actualizar el comentario.");
  });

  it.each([
    ["Loading Comments settings…", "Cargando la configuración de comentarios…"],
    ["Require moderation (new comments start pending)", "Requerir moderación (los comentarios nuevos comienzan como pendientes)"],
    ["Spam auto-reject score must be between 0 and 1.", "La puntuación de rechazo automático de spam debe estar entre 0 y 1."],
    ["failed to load the moderation queue", "no se pudo cargar la cola de moderación"],
    ["Failed to purge comment.", "No se pudo purgar el comentario."],
    ["failed to load Comments settings", "no se pudo cargar la configuración de comentarios"],
    ["failed to save Comments settings", "no se pudo guardar la configuración de comentarios"],
    ["No {status} comments.", 'No hay comentarios "{status}".'],
    ['Permanently delete this comment by "{author}"? This cannot be undone.', '¿Eliminar permanentemente este comentario de "{author}"? Esta acción no se puede deshacer.'],
    ['Actions for the comment by "{author}"', 'Acciones para el comentario de "{author}"'],
  ])("returns Spanish copy with template tokens intact: %s", (key, expected) => {
    expect(t({ locale: "es", key: key })).toBe(expected);
  });

  it("resolves each locale independently and inherits shared copy", () => {
    expect(t({ locale: "de", key: "Purge" })).toBe("Endgültig löschen");
    expect(t({ locale: "es", key: "Purge" })).toBe("Eliminar permanentemente");
    expect(t({ locale: "es", key: "Trash" })).toBe("Papelera");
    expect(t({ locale: "en", key: "Comments enabled" })).toBe("Comments enabled");
    expect(t({ locale: "unknown-locale", key: "Comments enabled" })).toBe("Comments enabled");
    expect(t({ locale: "es", key: "Unlisted moderation message" })).toBe("Unlisted moderation message");
  });
});
