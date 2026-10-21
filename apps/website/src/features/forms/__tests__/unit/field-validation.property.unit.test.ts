/** Owner request 2026-10-20: Tovu consumes the Jini forms validator; never reimplement it here. */
import assert from 'node:assert/strict';
import test, { before } from 'node:test';
import fc from 'fast-check';
import { validateFieldDescriptors, validateSubmissionPayload, type FieldDescriptor, type FormDefinitionRecord } from '@jini-ai/cms/forms';

const parameters = { numRuns: 150, seed: 20261022 };
const descriptor = fc.record({
  id: fc.nat({ max: 1000000 }).map(id => `field_${id}`),
  label: fc.string({ minLength: 1, maxLength: 200 }),
  type: fc.constant('text' as const),
  required: fc.boolean(),
  maxLength: fc.integer({ min: 1, max: 5000 }),
});

function definition({ fields }: { fields: FieldDescriptor[] }, _options = {}): FormDefinitionRecord {
  return {
    id: '00000000-0000-4000-8000-000000000001', workspaceId: '00000000-0000-4000-8000-000000000002',
    name: 'Property test', slug: 'property-test', fields, notify: { enabled: false, recipients: [] },
    status: 'active', version: 1, createdAt: '2026-10-20T00:00:00.000Z', updatedAt: '2026-10-20T00:00:00.000Z',
  };
}

before(t => {
  t.diagnostic(`fast-check seed=${parameters.seed}, numRuns=${parameters.numRuns}`);
});

test('unique well-formed descriptors are accepted without mutating the caller', () => {
  fc.assert(fc.property(fc.uniqueArray(descriptor, { minLength: 1, maxLength: 20, selector: field => field.id }), fields => {
    // fast-check also emits null-prototype records; structuredClone erases that valid input shape.
    const before = fields.map(field => Object.assign(Object.create(Object.getPrototypeOf(field)), field));
    assert.deepEqual(validateFieldDescriptors({ fields }), { valid: true });
    assert.deepEqual(fields, before);
  }), parameters);
});

test('duplicating a valid field is always rejected as a duplicate identifier', () => {
  fc.assert(fc.property(descriptor, field => {
    const result = validateFieldDescriptors({ fields: [field, { ...field }] });
    assert.equal(result.valid, false);
    if (!result.valid) assert.ok(result.fieldErrors.some(error => error.field === field.id && error.reason === 'duplicate field id'));
  }), parameters);
});

test('unsafe HTML attribute names are rejected regardless of their values', () => {
  fc.assert(fc.property(descriptor, fc.constantFrom('onclick', 'onerror', 'style', 'srcdoc', 'formaction', 'name'), fc.string({ maxLength: 100 }), (field, name, value) => {
    const result = validateFieldDescriptors({ fields: [{ ...field, attributes: { [name]: value } }] });
    assert.equal(result.valid, false);
    if (!result.valid) assert.ok(result.fieldErrors.some(error => error.reason === `attribute '${name}' is not allowed`));
  }), parameters);
});

test('text submissions preserve accepted answers, enforce caps, and omit honeypot metadata', () => {
  fc.assert(fc.property(fc.integer({ min: 1, max: 100 }), fc.string({ maxLength: 100 }), (maxLength, answer) => {
    const form = definition({ fields: [{ id: 'answer', label: 'Answer', type: 'text', required: false, maxLength }] });
    const body = { answer, _hp: '' };
    const before = structuredClone(body);
    const result = validateSubmissionPayload({ definition: form, body });
    if (answer.length <= maxLength) assert.deepEqual(result, { valid: true, data: { answer } });
    else assert.deepEqual(result, { valid: false, fieldErrors: [{ field: 'answer', reason: 'too_long' }] });
    assert.deepEqual(body, before);
    const overflow = validateSubmissionPayload({ definition: form, body: { answer: 'x'.repeat(maxLength + 1) } });
    assert.deepEqual(overflow, { valid: false, fieldErrors: [{ field: 'answer', reason: 'too_long' }] });
  }), parameters);
});

test('required text rejects blank input and undeclared keys cannot become stored answers', () => {
  fc.assert(fc.property(fc.array(fc.constantFrom(' ', '\t', '\n', '\r'), { maxLength: 50 }), fc.nat({ max: 10000 }), (whitespace, id) => {
    const form = definition({ fields: [{ id: 'answer', label: 'Answer', type: 'text', required: true }] });
    const blank = validateSubmissionPayload({ definition: form, body: { answer: whitespace.join('') } });
    assert.deepEqual(blank, { valid: false, fieldErrors: [{ field: 'answer', reason: 'required' }] });
    const unknown = `unknown_${id}`;
    assert.deepEqual(validateSubmissionPayload({ definition: form, body: { answer: 'accepted', [unknown]: 'untrusted' } }), {
      valid: false, fieldErrors: [{ field: unknown, reason: 'unregistered_key' }],
    });
  }), parameters);
});
