/** Test-only browser model. Captures host-only starts, never added to a production port or result. */
import { API_CONNECTION_BINDING_COOKIE } from "../../browser-binding.js";
import type { ApiConnectionService } from "@jini-ai/integrations/api-connections";
import type { ApiConnectionHost } from "../../host.js";

export interface StartingBrowser {
  providerUrl(link: string): string;
  cookieFor(url: string | URL): Readonly<Record<string, string>>;
}

/** Existing adapter tests start below HTTP; remember the binding as that starting browser would. */
export function trackStartingBrowser(required: { readonly host: ApiConnectionHost }, _optional: Record<string, never> = {}): StartingBrowser {
  const { host } = required;
  const bindings = new Map<string, string>();
  const links = new Map<string, string>();
  const serviceFor = host.serviceFor.bind(host);
  host.serviceFor = (required) => {
    const service = serviceFor(required);
    const start = service.start.bind(service);
    const wrapped: ApiConnectionService = { ...service, async start(input, options) {
      const begun = await start(input, options);
      bindings.set(begun.state, begun.browserBinding);
      return begun;
    } };
    return wrapped;
  };
  const issue = host.signInHandoffs.issue.bind(host.signInHandoffs);
  host.signInHandoffs.issue = (input) => {
    const id = issue(input);
    links.set(id, input.authorizationUrl);
    return id;
  };
  return {
    providerUrl(link) { return links.get(new URL(link).pathname.split("/").at(-1) ?? "") ?? link; },
    cookieFor(url): Readonly<Record<string, string>> {
      const binding = bindings.get(new URL(url).searchParams.get("state") ?? "");
      return binding === undefined ? {} : { cookie: `${API_CONNECTION_BINDING_COOKIE}=${binding}` };
    },
  };
}
