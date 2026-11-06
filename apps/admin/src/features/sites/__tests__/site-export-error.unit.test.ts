import { expect, it } from 'vitest';
import { ApiError } from '@/lib/api';
import { siteExportFailure } from '../site-export-error';

it('reformats raw export evidence with the host key policy before display or copying', () => {
  const secret = 'EXPORT_COPY_CANARY_abcdefghijklmnop';
  const key = `tovu_ak_012345abcdef.${secret}`;
  const error = new ApiError('Export failed', 500, 'SHARE_FAILED', { details: { failure: {
    message: 'The export stopped while building the ZIP.', action: 'Copy details and report this problem.',
    step: 'archive', cause: `ZIP error ${key}`, copyText: `untrusted copy ${secret}`,
  } } });
  const failure = siteExportFailure({ error, t: text => text });
  expect(failure.cause).toContain('[REDACTED:tovu_api_key]');
  expect(failure.copyText).toContain('[REDACTED:tovu_api_key]');
  expect(JSON.stringify(failure)).not.toContain(secret);
});
