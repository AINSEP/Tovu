import type { JSX, ReactNode } from 'react';

/** The shared 20-unit line-icon frame for `icons.tsx` and `tool-icons.tsx`. Its own module, with JSX
 *  only at render: `tool-icons.tsx` must not import `icons.tsx`, whose module-level glyph tables run
 *  before tests publish the classic-JSX `React` global (see `tool-icons.tsx`'s header). */
export function IconFrame({ children }: { children: ReactNode }): JSX.Element {
  return (
    <svg className="icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
