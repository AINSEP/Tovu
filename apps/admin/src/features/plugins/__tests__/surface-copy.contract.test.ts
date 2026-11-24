import { expect, it } from 'vitest';
import { translatePlugins as pluginCopy } from "../../../lib/i18n-common";
import { t as monitoringCopy } from '@jini-ai/admin/screens/observability/observability-i18n';
import { t as securityCopy } from '../../../integrations/jini-admin/security-i18n';
import { SHARED_COMPONENTS_DICT } from '@jini-ai/admin/shell/components/shared-components-i18n';

it('category examples remain translated across every shipped locale', () => {
  const keys = [
    [pluginCopy, 'Install from a repository or a .zip link.'],
    [monitoringCopy, 'Monitoring integrations are planned. {product} does not fetch, configure, or send data to any provider yet.'],
    [monitoringCopy, 'Where a monitoring connection will live.'],
    [securityCopy, 'Optional — some providers use more than one API host for the same account (e.g. api.example.test and secondary-api.example.test). One per line, or comma-separated.'],
  ] as const;
  for (const locale of Object.keys(SHARED_COMPONENTS_DICT)) {
    for (const [translate, key] of keys) {
      const value = translate({ locale, key });
      expect(value, `${locale}: ${key}`).not.toBe(key);
      expect(value.length).toBeGreaterThan(0);
    }
    expect(SHARED_COMPONENTS_DICT[locale]['e.g. a project link']).toBeTruthy();
  }
});

it('English and unknown locales retain useful category fallback copy', () => {
  const key = 'Install from a repository or a .zip link.';
  expect(pluginCopy({ locale: 'en', key })).toBe(key);
  expect(pluginCopy({ locale: 'unknown', key })).toBe(key);
  expect(monitoringCopy({ locale: 'en', key: 'Where a monitoring connection will live.' })).toBe('Where a monitoring connection will live.');
});
