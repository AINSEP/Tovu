export function isPortFree(port: number): Promise<boolean>;
export function pickFreePort(
  range: { start: number; span: number },
  deps?: { isPortFree?: (port: number) => Promise<boolean> },
): Promise<number | null>;
