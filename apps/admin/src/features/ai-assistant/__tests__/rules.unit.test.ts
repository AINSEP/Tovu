import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/admin-http/request";
import { describeApiError } from "../rules";

// Author Checklist: literal outcomes, real rules and provider library, no I/O or shared state.
// F4.3/F6.2: non-default providers distinguish protocol, endpoint and nullish fallback branches.
describe("assistant error copy", () => {
  // Removing any code-specific override must fail its literal assertion (F1.2/F4.4).
  it("names the assistant setting on forbidden writes", () => {
    expect(describeApiError({ e: new ApiError({ message: "raw denial", status: 403 }, { code: "FORBIDDEN" }), fallback: "fallback" }))
      .toBe("You do not have permission to change the AI assistant's settings.");
  });

  it.each(["ASSISTANT_SETTINGS_VALIDATION_ERROR", "SITE_CREDENTIAL_VALIDATION_ERROR"])("preserves %s details and supplies its empty-message fallback", (code) => {
    expect(describeApiError({ e: new ApiError({ message: "Model is unavailable", status: 400 }, { code }), fallback: "generic fallback" })).toBe("Model is unavailable");
    expect(describeApiError({ e: new ApiError({ message: "", status: 400 }, { code }), fallback: "generic fallback" })).toBe("That value was rejected.");
  });

  it("explains an unconfigured secret store without blaming the pasted key", () => {
    expect(describeApiError({ e: new ApiError({ message: "operator-only detail", status: 503 }, { code: "SECRET_STORE_UNCONFIGURED" }), fallback: "fallback" }))
      .toBe("The server can't store keys yet: it has no site key. Set TOVU_SITE_KEY (hex) and restart. Your key was not saved.");
  });

  it("delegates unrelated API, ordinary Error and non-Error failures", () => {
    expect(describeApiError({ e: new ApiError({ message: "Conflict detail", status: 409 }, { code: "CONFLICT" }), fallback: "fallback" })).toBe("Conflict detail");
    expect(describeApiError({ e: new ApiError({ message: "", status: 500 }, { code: "OTHER" }), fallback: "fallback" })).toBe("fallback");
    expect(describeApiError({ e: new Error("offline"), fallback: "fallback" })).toBe("offline");
    expect(describeApiError({ e: { code: "FORBIDDEN" }, fallback: "fallback" })).toBe("fallback");
    expect(describeApiError({ e: null, fallback: "fallback" })).toBe("fallback");
  });
});
