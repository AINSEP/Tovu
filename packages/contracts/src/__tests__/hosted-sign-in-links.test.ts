import assert from "node:assert/strict";
import test from "node:test";

import { isHostedMcpSignInLinkPath, isHostedSignInLinkPath } from "../hosted-sign-in-links.js";

/**
 * @file Pins the two path recognizers the desktop shell uses to decide which same-origin links it
 * hands to the OS browser. The regular expressions must not loosen: each near-miss below differs from
 * a valid path by exactly one character, so widening a quantifier or an anchor turns a case red.
 */

const TOKEN = "A".repeat(43);

test("a plugin sign-in link with a 43-character token is recognized", () => {
  assert.equal(isHostedSignInLinkPath({ pathname: `/api/admin/v1/workspaces/w1/agent-plugins/connections/sign-in/${TOKEN}` }), true);
});

test("a plugin sign-in token one character longer or shorter is refused", () => {
  const base = "/api/admin/v1/workspaces/w1/agent-plugins/connections/sign-in/";
  assert.equal(isHostedSignInLinkPath({ pathname: `${base}${TOKEN}A` }), false);
  assert.equal(isHostedSignInLinkPath({ pathname: `${base}${TOKEN.slice(1)}` }), false);
});

test("a plugin sign-in path with a trailing segment or a nested workspace id is refused", () => {
  const base = "/api/admin/v1/workspaces/w1/agent-plugins/connections/sign-in/";
  assert.equal(isHostedSignInLinkPath({ pathname: `${base}${TOKEN}/` }), false);
  assert.equal(isHostedSignInLinkPath({ pathname: `/api/admin/v1/workspaces/w1/x/agent-plugins/connections/sign-in/${TOKEN}` }), false);
  assert.equal(isHostedSignInLinkPath({ pathname: `/x${base}${TOKEN}` }), false);
});

test("an MCP sign-in path is recognized only with exactly one server segment and the oauth/sign-in tail", () => {
  assert.equal(isHostedMcpSignInLinkPath({ pathname: "/api/admin/v1/workspaces/w1/mcp-servers/s1/oauth/sign-in" }), true);
  assert.equal(isHostedMcpSignInLinkPath({ pathname: "/api/admin/v1/workspaces/w1/mcp-servers/s1/oauth/sign-in/" }), false);
  assert.equal(isHostedMcpSignInLinkPath({ pathname: "/api/admin/v1/workspaces/w1/mcp-servers/s1/s2/oauth/sign-in" }), false);
  assert.equal(isHostedMcpSignInLinkPath({ pathname: "/api/admin/v1/workspaces/w1/mcp-servers//oauth/sign-in" }), false);
  assert.equal(isHostedMcpSignInLinkPath({ pathname: "/api/admin/v1/workspaces/w1/mcp-servers/s1/oauth/sign-ins" }), false);
  assert.equal(isHostedMcpSignInLinkPath({ pathname: "/x/api/admin/v1/workspaces/w1/mcp-servers/s1/oauth/sign-in" }), false);
});
