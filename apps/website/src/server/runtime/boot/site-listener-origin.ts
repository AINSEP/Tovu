/** Publish the site's selected listener to its tool host and inherited daemon environment.
 * Explicit CLI host/port selections win over inherited values; wildcard binds use localhost.
 * @complexity O(1); writes one environment variable and returns the same origin.
 */
export function pinSiteListenerOrigin(
  { scheme, host, port }: { scheme: 'http' | 'https'; host: string | undefined; port: number },
  { env = process.env }: { env?: NodeJS.ProcessEnv } = {},
): string {
  const hostname = host && host !== '0.0.0.0' && host !== '::' ? host : 'localhost';
  const origin = `${scheme}://${hostname.includes(':') ? `[${hostname}]` : hostname}:${port}`;
  env.TOVU_SITE_LISTENER_ORIGIN = origin;
  return origin;
}

/** Read the pinned listener selected before composition. Direct composition callers fall back to
 * the same PORT/TLS inputs as the entrypoint; public registrations do not use this dev fallback.
 * @throws TypeError for an invalid pinned URL, rather than silently mailing links to another server.
 * @complexity O(1), one native URL parse.
 */
export function readSiteListenerOrigin(
  { fallbackScheme }: { fallbackScheme: "http" | "https" },
  { env = process.env }: { env?: NodeJS.ProcessEnv } = {},
): URL {
  return new URL(env.TOVU_SITE_LISTENER_ORIGIN ?? `${fallbackScheme}://localhost:${Number(env.PORT ?? 3000)}`);
}
