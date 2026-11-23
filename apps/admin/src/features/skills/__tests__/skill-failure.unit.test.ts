import { expect, it } from "vitest";
import { ApiError } from "@/lib/admin-http/request";
import { skillFailure } from "@jini-ai/admin/screens/skills/skill-failure";
import { t } from "@jini-ai/admin/screens/skills/skills-i18n";
import { SKILL_FAILURE_HOST } from "../skill-failure-host";

it("preserves the incident ID and redacts diagnostics before copying", () => {
  const failure = skillFailure({ ...SKILL_FAILURE_HOST, error: new ApiError({ message: "Could not load skills. password=SKILL_SECRET_CANARY", status: 500 }, { code: "INTERNAL_ERROR", body: { errorId: "skill-incident-123" } }),
    message: "Could not load skills.", t: key => key });
  expect(failure.errorId).toBe("skill-incident-123");
  expect(failure.copyText).toContain("skill-incident-123");
  expect(failure.copyText).not.toContain("SKILL_SECRET_CANARY");
  expect(failure.action).toMatch(/Reload skills/);
});

it("translates the fallback and next action for an opaque rejection", () => {
  const failure = skillFailure({ ...SKILL_FAILURE_HOST, error: null, message: "Could not install skill.", t: key => t({ locale: "es", key }) });
  expect(failure.message).toBe("No se pudo instalar la habilidad.");
  expect(failure.action).toBe("Recarga las habilidades antes de volver a intentar el cambio.");
});
