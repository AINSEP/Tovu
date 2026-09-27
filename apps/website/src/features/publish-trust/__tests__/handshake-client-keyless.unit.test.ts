import assert from "node:assert/strict";
import test from "node:test";

import { fetchDestinationIdentity, PublishTrustHandshakeError } from "../handshake-client.js";

// A destination with no Site Token answers every handshake route with a typed 503. The owner must
// read what to fix on that site, not "try again in a moment", which no retry will ever satisfy.
test("a destination without a Site Token is named as the thing to fix", async () => {
  const httpClient = {
    send: async () => ({
      status: 503,
      headers: {},
      bodyText: JSON.stringify({ error: "whatever the destination says", code: "SECRET_STORE_UNCONFIGURED" }),
    }),
  };

  await assert.rejects(
    fetchDestinationIdentity({ httpClient: httpClient as never }, { baseUrl: "https://dest.example" }),
    (err: unknown) => {
      assert.ok(err instanceof PublishTrustHandshakeError);
      assert.equal(err.failure, "refused");
      assert.equal(
        err.message,
        "dest.example has no Site Token set up yet, so it cannot accept publishes. Set one up on that site, then try again."
      );
      return true;
    }
  );
});
