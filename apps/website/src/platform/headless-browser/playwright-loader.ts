import type { PlaywrightLike } from "@jini-ai/diagnostics/web-evidence/playwright";

/** Resolve the optional browser module from Tovu, including when Jini is linked from another repo.
 * Forward Jini's Chromium/Chrome selection and security launch options. */
export const playwrightModuleLoader = {
  // A literal host import checks the native module against the structural port without a cast;
  // dynamic loading still lets Jini report a missing module or browser as unavailable evidence.
  load: async (_required: { moduleName: string }): Promise<PlaywrightLike> => {
    const { chromium } = await import("playwright");
    return {
      chromium: {
        launch: async (options) => {
          const { args, ...launchOptions } = options ?? {};
          const browser = await chromium.launch({ ...launchOptions, ...(args === undefined ? {} : { args: [...args] }) });
          return {
            newContext: async (contextOptions) => {
              const context = await browser.newContext(contextOptions);
              return {
                newPage: () => context.newPage(),
                // Playwright returns a Disposable; the evidence port only awaits registration.
                route: async (pattern, handler) => { await context.route(pattern, handler); },
                cookies: () => context.cookies(),
                routeWebSocket: async (pattern, handler) => { await context.routeWebSocket(pattern, handler); },
                close: () => context.close(),
              };
            },
            close: () => browser.close(),
          };
        },
      },
    };
  },
};

