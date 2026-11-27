import { expect, it } from 'vitest';
import { ApiError } from '@/lib/admin-http/request';
import { siteExportFailure } from '../site-export-error';

it('reformats raw export evidence with the host key policy before display or copying', () => {
  const secret = 'EXPORT_COPY_CANARY_abcdefghijklmnop';
  const key = `tovu_ak_012345abcdef.${secret}`;
  const error = new ApiError({ message: 'Export failed', status: 500 }, { code: 'SHARE_FAILED', body: { details: { failure: {
    message: 'The export stopped while building the ZIP.', action: 'Copy details and report this problem.',
    step: 'archive', cause: `ZIP error ${key}`, copyText: `untrusted copy ${secret}`,
  } } } });
  const failure = siteExportFailure({ error, t: text => text });
  expect(failure.cause).toContain('[REDACTED:tovu_api_key]');
  expect(failure.copyText).toContain('[REDACTED:tovu_api_key]');
  expect(JSON.stringify(failure)).not.toContain(secret);
});

it("uses safe host copy for missing or malformed export diagnostics", () => {
  const cases = [
    new ApiError({ message: "Export access expired.", status: 403 }),
    new ApiError({ message: "Export access expired.", status: 403 }, { body: { details: "old diagnostic" } }),
    new ApiError({ message: "Export access expired.", status: 403 }, { body: { details: { failure: "old diagnostic" } } }),
    new ApiError({ message: "Export access expired.", status: 403 }, { body: { details: { failure: { message: 9, step: false, action: ["retry"] } } } }),
  ];
  for (const error of cases) {
    expect(siteExportFailure({ error, t: (text) => text })).toMatchObject({
      message: "Export access expired.",
      step: "export request",
      action: "Check export history before starting another export. Copy details and report this problem.",
    });
  }
});
