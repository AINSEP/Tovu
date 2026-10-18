import { parse } from "postcss";

/** Last winning declaration for an exact selector, including grouped/responsive rules and
 * !important. This is a stylesheet guard; browser tests cover layout and contextual specificity. */
export function effectiveDeclarationsFor(stylesheet: string, selector: string): string {
  const declarations = new Map<string, { value: string; important: boolean }>();
  let found = false;
  parse(stylesheet).walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    found = true;
    for (const node of rule.nodes) {
      if (node.type !== "decl") continue;
      const previous = declarations.get(node.prop);
      if (previous?.important && !node.important) continue;
      declarations.set(node.prop, { value: node.value, important: Boolean(node.important) });
    }
  });
  if (!found) throw new Error(`No rule for selector "${selector}"`);
  return [...declarations].map(([property, { value }]) => `${property}: ${value};`).join(" ");
}

/** Classic's light/dark selectors (`admin-themes/classic/*.css`): classic applies with no
 *  `data-admin-theme` on <html> and when chosen, at `:root`'s own specificity. */
export const CLASSIC_ROOT = ':root:where(:not([data-admin-theme]), [data-admin-theme="classic"])';
export const CLASSIC_DARK = `${CLASSIC_ROOT}[data-theme="dark"]`;
