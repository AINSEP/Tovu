import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { RemoteImageImport } from "../RemoteImageImport";

it("uses the upload row's short alt placeholder while keeping a distinct accessible name", () => {
  render(<FetchQueryProvider><RemoteImageImport t={(key) => key} dependencies={{ port: {
    importFromUrl: async () => { throw new Error("Placeholder inspection must not submit an import"); },
  } }} /></FetchQueryProvider>);
  expect(screen.getByLabelText("Imported image alt text (optional)")).toHaveAttribute("placeholder", "Alt text (optional)");
});
