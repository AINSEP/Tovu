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
