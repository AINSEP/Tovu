import { render } from "@/__tests__/fetch-query-render";
import { expect, it, vi } from "vitest";
import { TOVU_ERROR_REDACTION_OPTIONS } from "@tovu/contracts/secret-redaction";
import { MediaPickerDialog } from "../MediaPickerDialog/media-picker-host";

it("passes the host redaction policy to the enabled picker backend", () => {
  const usePicker = vi.fn(() => ({ enabled: true, error: null, onCancel: () => {} }));
  render(<MediaPickerDialog onSelect={() => {}} onCancel={() => {}} useJiniMediaPickerHook={usePicker} useHostMediaPickerHook={() => null} useAdminLocaleHook={() => "en"} />);
  expect(usePicker).toHaveBeenCalledWith(expect.objectContaining({ errorRedaction: TOVU_ERROR_REDACTION_OPTIONS }));
});
