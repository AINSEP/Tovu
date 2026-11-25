import { render } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";

/** The host binds the shared copy and the operator's locale into Jini's hint hook. */
const { locale } = vi.hoisted(() => ({ locale: { value: "en" } }));
vi.mock("@/hooks/use-admin-locale.hooks", () => ({ useAdminLocale: () => locale.value }));

import { CredentialHint } from "../CredentialHint";

beforeEach(() => { locale.value = "en"; });

test("shows the server hint in the operator's locale, and nothing without one", () => {
  const { container, rerender } = render(<CredentialHint hint={{ length: 1234, last4: "abcd" }} />);
  expect(container.textContent).toBe("…abcd, 1,234 chars");
  locale.value = "de";
  rerender(<CredentialHint hint={{ length: 1234, last4: "abcd" }} />);
  expect(container.textContent?.startsWith("…abcd, 1.234")).toBe(true);
  rerender(<CredentialHint hint={null} />);
  expect(container.textContent).toBe("");
});
