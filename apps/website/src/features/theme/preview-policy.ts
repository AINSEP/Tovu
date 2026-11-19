export function isReservedThemePreviewPath(
  { pathname }: { pathname: string },
  _optional: Record<string, never> = {},
): boolean {
  return /^\/(?:api|admin)(?:\/|$)/i.test(pathname);
}
