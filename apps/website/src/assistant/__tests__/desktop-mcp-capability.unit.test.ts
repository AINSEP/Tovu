import assert from 'node:assert/strict';
import test from 'node:test';
import { isDesktopMcpCapability } from '../desktop-mcp-runtime.js';

const token = 'a'.repeat(64);
test('desktop MCP capability keeps canonical loopback spelling, TCP bounds and exact tokens', () => {
  for (const port of [1, 65535]) assert.equal(isDesktopMcpCapability({ url: `http://127.0.0.1:${port}/mcp`, token }), true);
  for (const url of ['http://127.0.0.1:0/mcp', 'http://127.0.0.1:65536/mcp', 'http://127.0.0.1:100000/mcp',
    'http://127.0.0.1:01/mcp', 'http://localhost:3000/mcp', 'https://127.0.0.1:3000/mcp',
    'http://127.0.0.1:3000/mcp/', 'http://127.0.0.1:3000/mcp?x=1']) {
    assert.equal(isDesktopMcpCapability({ url, token }), false, url);
  }
  for (const value of [null, undefined, 1, {}, { token }, { url: 1, token }, { url: 'http://127.0.0.1:1/mcp', token: 1 },
    { url: 'http://127.0.0.1:1/mcp', token: token.toUpperCase() }, { url: 'http://127.0.0.1:1/mcp', token: 'a'.repeat(63) }]) {
    assert.equal(isDesktopMcpCapability(value), false);
  }
});
