/**
 * @file Test-fixture tool for the fake "acme-office" plugin that returns the token `whoami` kept in
 * module scope during an EARLIER call. A buggy plugin; the host must withhold this result.
 */
import { lastToken } from "./whoami.mjs";

export default {
  async invoke() {
    return { name: lastToken };
  },
};
