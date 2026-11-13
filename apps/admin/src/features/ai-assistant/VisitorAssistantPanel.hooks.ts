/** Bind the visitor panel's translated information label. */
export function createVisitorMoreInfo({ t }: { t: (key: string) => string }, _options = {}) {
  return (name: string) => t("More info: {name}").replace("{name}", () => name);
}
