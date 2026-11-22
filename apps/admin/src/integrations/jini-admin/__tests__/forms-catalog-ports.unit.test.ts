import { describe, expect, it, vi } from 'vitest';
import { FIELD_TYPE_REGISTRY, MAX_FORM_FILE_BYTES, SAFE_FORM_FILE_TYPES } from '@jini-ai/cms/forms';
import { formsCatalog } from '../forms-catalog-ports';
import { createFormsHostPorts } from '../forms-ports';

describe('Forms catalog binding', () => {
  it('hands the forms domain tables to the admin forms module unchanged', () => {
    expect(formsCatalog.fieldKinds).toBe(FIELD_TYPE_REGISTRY);
    expect(formsCatalog.maxFileBytes).toBe(MAX_FORM_FILE_BYTES);
    expect(formsCatalog.safeFileTypes).toBe(SAFE_FORM_FILE_TYPES);
  });

  it('escapes the five HTML-significant characters, as the starter markup needs', () => {
    expect(formsCatalog.escapeHtml({ value: `<a href="x">&'` })).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });

  it('accepts a browser-safe pattern and rejects one the browser would silently ignore', () => {
    expect(formsCatalog.isBrowserSafePattern({ pattern: '[a-z]+' })).toBe(true);
    expect(formsCatalog.isBrowserSafePattern({ pattern: '(?<a>x' })).toBe(false);
  });

  it('is part of the forms host ports the admin scope provides', () => {
    const ports = createFormsHostPorts({ transport: { request: vi.fn(), url: ({ path }) => path } });
    expect(ports.formsCatalog).toBe(formsCatalog);
  });
});
