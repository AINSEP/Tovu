import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// The calendly skill in @jini-ai/agent-plugins is host-neutral; Tovu's embed markup, page tools and
// sign-in tool ship from this overlay. These pins are the ones the Jini test no longer carries.
const guidance = readFileSync(new URL('../GUIDANCE.md', import.meta.url), 'utf8');

test('Tovu guidance gives the calendly embed markup and the page tools that write it', () => {
  assert.match(guidance, /"plugin":"tovu\/calendly"/);
  assert.match(guidance, /<a href="https:\/\/calendly\.com\/their-name\/30min">Book a time<\/a><\/div>/);
  assert.match(guidance, /`pages_read_html`.*`pages_write_region` or `pages_write_html`/);
});

test('the Calendly sign-in stays optional and names the tool', () => {
  assert.match(guidance, /Only offer `agent_plugin_connect` if they want you to look up their event types/);
});
