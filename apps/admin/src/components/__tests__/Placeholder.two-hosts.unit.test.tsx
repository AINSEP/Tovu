import { render, screen } from "@/__tests__/fetch-query-render";
import { expect, it } from "vitest";
import { Placeholder } from "../Placeholder";

it("binds the real navigation and locale copy", () => {
  const { rerender } = render(<Placeholder sectionId="newsletter" useAdminLocaleHook={() => "en"} />);
  expect(screen.getByRole("heading", { name: "Newsletter" })).toBeInTheDocument();
  expect(screen.getByText("Newsletter is coming soon.")).toBeInTheDocument();
  rerender(<Placeholder sectionId="missing" useAdminLocaleHook={() => "de"} />);
  expect(screen.getByText("Unbekannter Abschnitt: missing")).toBeInTheDocument();
});
