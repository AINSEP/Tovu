/** The installed cookie 0.7 parser has no bundled TypeScript declarations. */
declare module "cookie" {
  export function parse(header: string): Record<string, string | undefined>;
}
