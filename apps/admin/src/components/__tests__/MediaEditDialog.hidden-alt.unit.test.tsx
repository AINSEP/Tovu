import { useWiredMediaEditDialog } from "@/components/MediaEditDialog/MediaEditDialog.hooks";
import { Dialog } from "@jini-ai/ui-kit/react";
import "@/styles/native-domain-dialogs.css";
import { fireEvent, render, screen } from "@/__tests__/fetch-query-render";
import { afterEach, expect, it, vi } from "vitest";
import { MediaEditDialog } from "@jini-ai/cms/react/media/MediaEditDialog/MediaEditDialog";
import { settingsApi } from "../../lib/admin-http/settings-api";

afterEach(() => vi.restoreAllMocks());

it("the real dialog controller preserves hidden alt when styling is saved", () => {
  vi.spyOn(settingsApi, "getSettingsEffective").mockResolvedValue({ data: [] });
  const onSave = vi.fn();
  render(<MediaEditDialog Dialog={Dialog} useDialog={useWiredMediaEditDialog} showAlt={false} initial={{ alt: "Keep this alt", cssClass: null, htmlAttributes: null }} onSave={onSave} onCancel={() => {}} />);
  fireEvent.change(screen.getByLabelText("CSS class (optional)"), { target: { value: "hero" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(onSave).toHaveBeenCalledWith({ alt: "Keep this alt", cssClass: "hero", htmlAttributes: null });
});
