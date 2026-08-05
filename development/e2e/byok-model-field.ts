import { expect, type Locator, type Page } from "@playwright/test";

/**
 * @file The one place that knows how the BYOK Model field is rendered.
 *
 * As of `@jini-ai/ui` `3b5d648d` the Model field has TWO shapes, chosen by
 * `ByokProviderForm.tsx`'s `showModelPicker = liveModels.length > 0`:
 *
 * 1. **Picker** — live discovery returned at least one model, so the field is a
 *    `SearchableModelSelect` (`[data-testid="jini-byok-model-select"]`) wrapping a
 *    `CustomSelect`: a `button[role="combobox"]` whose menu is a `[role="listbox"]`
 *    **portalled to `document.body`**, so its `button[role="option"]` children are NOT
 *    descendants of the field. Its search box only renders once the combined option count
 *    reaches `minSearchableOptions` (8), so a 2-model list has no search box at all.
 * 2. **Plain text input** — no live list. It carries `list="jini-byok-model-options"` ONLY
 *    when `suggestions.length > 0` (the preset's static `preferredModels`); with an empty
 *    preset (azure) it has no `list` attribute either.
 *
 * And the two shapes co-exist: `shouldShowCustomModelInput` renders the plain input
 * ALONGSIDE the picker whenever `config.model` is blank or absent from the live list, or
 * after an explicit `Custom…` pick — which is the common case in this suite, because the
 * stubs return `["stub-model"]` while the specs type real model ids.
 *
 * So `input[list="jini-byok-model-options"]` — the locator every spec in this suite used —
 * matches nothing whenever discovery succeeds, and the spec burns its whole timeout on a
 * field that is right there on screen. This module exists so that fact is encoded once
 * instead of nine times, and so a THIRD shape breaks every caller loudly with a message
 * naming what it found, rather than silently matching zero elements.
 */

/** `t('Custom…')` in `ByokProviderForm.tsx` — a real U+2026 ellipsis, not three dots. */
const CUSTOM_MODEL_OPTION_LABEL = "Custom…";

/** `ariaLabel={t('Model')}` — the accessible name of both the combobox and its portalled menu. */
const MODEL_ARIA_LABEL = "Model";

/**
 * The Model field's `<label>`.
 *
 * Matched on its `.jini-field-label` text, NOT with `label:has-text("Model")`: Playwright's
 * `hasText` string form is a case-insensitive SUBSTRING match, and the Max-tokens field's own
 * hint reads "Leave blank to use the model default" — so the string form matches two labels
 * and throws in strict mode. The anchored regex matches only `Model*` (the trailing `*` is
 * the `aria-hidden` required marker).
 */
export function byokModelField(page: Page): Locator {
  return page
    .locator(".jini-byok-card label.jini-field")
    .filter({ has: page.locator(".jini-field-label", { hasText: /^Model\s*\*?$/ }) });
}

/**
 * The plain `<input>`, present in shape 2 and in the picker's custom mode.
 *
 * Deliberately not filtered on `list`: the attribute is absent in custom mode and absent for
 * a preset with no `preferredModels`. Safe as a bare `input` descendant because the picker
 * contributes no input of its own here — its search box lives in the portalled menu.
 */
export function byokModelTextInput(page: Page): Locator {
  return byokModelField(page).locator("input");
}

/** The `SearchableModelSelect` container, present in shape 1. */
export function byokModelPicker(page: Page): Locator {
  return page.getByTestId("jini-byok-model-select");
}

/** The picker's trigger. Its `aria-label` is `Model: <selected label>`. */
export function byokModelPickerTrigger(page: Page): Locator {
  return byokModelPicker(page).getByRole("combobox");
}

/** The picker's option menu. Portalled to `document.body`, so it is located from `page`. */
export function byokModelMenu(page: Page): Locator {
  return page.getByRole("listbox", { name: MODEL_ARIA_LABEL, exact: true });
}

/**
 * Opens the picker menu if it is not already open, and returns it.
 *
 * Exported because the menu is where the option list physically EXISTS: unlike the old
 * `<datalist>`, which rendered every option eagerly, these option nodes are only in the
 * document while the menu is open. A test that inspects the rendered options for anything
 * other than their text (the XSS spec inspects the live DOM for injected elements) has to hold
 * the menu open across its assertions, or it is inspecting a document the payload never
 * entered — which would pass for exactly the wrong reason.
 */
export async function openByokModelMenu(page: Page, options: { timeout?: number } = {}): Promise<Locator> {
  return openMenu(page, options.timeout ?? 15_000);
}

async function openMenu(page: Page, timeout: number): Promise<Locator> {
  const menu = byokModelMenu(page);
  if ((await menu.count()) === 0) {
    await byokModelPickerTrigger(page).click();
    await expect(menu).toBeVisible({ timeout });
  }
  return menu;
}

/** Closes the picker menu. Escape is handled both on the trigger and on the menu itself
 *  (`CustomSelect`'s `onButtonKeyDown` / `onMenuKeyDown`), so it works whether or not the
 *  search box exists to take focus. */
async function closeByokModelMenu(page: Page, timeout: number): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(byokModelMenu(page)).toHaveCount(0, { timeout });
}

async function requireModelField(page: Page, timeout: number, action: string): Promise<void> {
  const text = byokModelTextInput(page);
  const picker = byokModelPicker(page);
  try {
    await expect(text.or(picker).first()).toBeVisible({ timeout });
  } catch {
    // Fail with what is actually on screen. A bare locator timeout here reads as "the page
    // is slow" and has, in this suite, been mistaken for a hang three sessions running.
    const [fields, texts, pickers, cards] = await Promise.all([
      byokModelField(page).count(),
      text.count(),
      picker.count(),
      page.locator(".jini-byok-card").count(),
    ]);
    throw new Error(
      `[byok-model-field] Cannot ${action}: neither shape of the Model field is present after ${timeout}ms. ` +
        `Found .jini-byok-card=${cards}, Model <label>=${fields}, plain <input>=${texts}, ` +
        `picker [data-testid="jini-byok-model-select"]=${pickers}. ` +
        `If the field has been re-rendered a third way, update development/e2e/byok-model-field.ts.`,
    );
  }
}

/**
 * Sets the Model field to `model`, whichever shape is rendered, and verifies it took.
 *
 * The plain input is preferred wherever it exists, and `Custom…` is used to reveal it when it
 * does not: every caller in this suite types a specific model id, and an id the provider did
 * not list (which is the norm against these stubs) is only reachable through free text.
 * `chooseByokModelFromPicker` is the counterpart for a test whose subject IS the picker.
 *
 * Retried once on a shape change, because the field can change shape WHILE it is being driven,
 * not merely before. Mount-time discovery is in flight when a spec arrives at this field: until
 * the stubbed response lands `liveModels` is empty and the plain input renders, and the moment it
 * lands `showModelPicker` flips and `SearchableModelSelect` replaces it. A locator is re-resolved
 * on every use so there is no stale element reference to latch, but the BRANCH taken here can
 * still go stale between deciding and acting. One re-decide covers it; the flip happens once, on
 * the first discovery response, not repeatedly.
 */
export async function setByokModel(
  page: Page,
  model: string,
  options: { timeout?: number } = {},
): Promise<void> {
  const timeout = options.timeout ?? 15_000;
  await requireModelField(page, timeout, `set the Model field to "${model}"`);

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await setByokModelOnce(page, model, timeout);
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      // Only a shape change is worth retrying. Anything else (a genuinely missing field, a
      // picker with no escape hatch) is re-thrown on the second pass with its own message.
      await requireModelField(page, timeout, `set the Model field to "${model}" (retry after a shape change)`);
    }
  }
}

async function setByokModelOnce(page: Page, model: string, timeout: number): Promise<void> {
  const text = byokModelTextInput(page);
  if ((await text.count()) === 0) {
    // Picker-only: `config.model` is in the live list, so the free-text box is not rendered.
    // `Custom…` opens it without clearing the current model (see `ByokProviderForm.tsx`).
    const menu = await openMenu(page, timeout);
    const custom = menu.getByRole("option", { name: CUSTOM_MODEL_OPTION_LABEL, exact: true });
    if ((await custom.count()) === 0) {
      const labels = await readOptionLabels(menu);
      throw new Error(
        `[byok-model-field] Cannot set the Model field to "${model}": the picker is the only shape ` +
          `rendered and it offers no "${CUSTOM_MODEL_OPTION_LABEL}" escape hatch. Options: ${JSON.stringify(labels)}.`,
      );
    }
    await custom.click();
    await expect(text).toBeVisible({ timeout });
  }

  await text.fill(model);
  await expect(text).toHaveValue(model);
}

/**
 * Picks `model` from the picker's own menu — the real operator path through the combobox,
 * for tests that are about the picker rather than about getting a value into the field.
 * Fails loudly if the picker is not rendered or does not offer `model`.
 */
export async function chooseByokModelFromPicker(
  page: Page,
  model: string,
  options: { timeout?: number } = {},
): Promise<void> {
  const timeout = options.timeout ?? 15_000;
  const picker = byokModelPicker(page);
  if ((await picker.count()) === 0) {
    throw new Error(
      `[byok-model-field] Cannot pick "${model}" from the picker: no ` +
        `[data-testid="jini-byok-model-select"] is rendered, so live discovery did not return any models.`,
    );
  }
  const menu = await openMenu(page, timeout);
  const search = byokModelSearch(page);
  // Narrow first when the search box exists (>= 8 combined options) — the real path, and it
  // keeps a 10,000-model menu from being scanned option by option.
  if ((await search.count()) > 0) await search.fill(model);
  const option = menu.getByRole("option", { name: model, exact: true });
  if ((await option.count()) === 0) {
    const labels = await readOptionLabels(menu);
    throw new Error(
      `[byok-model-field] Cannot pick "${model}" from the picker: it is not among the ${labels.length} ` +
        `option(s) offered${labels.length <= 12 ? ` (${JSON.stringify(labels)})` : ""}.`,
    );
  }
  await option.first().click();
  await expect(byokModelPickerTrigger(page)).toHaveAttribute("aria-label", `${MODEL_ARIA_LABEL}: ${model}`);
}

/** The picker's in-menu search box. Absent when the combined option count is below
 *  `SearchableModelSelect`'s `minSearchableOptions` (8) — so callers must treat it as optional. */
export function byokModelSearch(page: Page): Locator {
  return page.getByTestId("jini-byok-model-search");
}

async function readOptionLabels(menu: Locator): Promise<string[]> {
  // `textContent` of the label span, not `innerText`: `innerText` normalizes whitespace, and
  // one caller (the XSS spec) asserts a model id byte-for-byte.
  return menu.locator('[role="option"]').evaluateAll((nodes) =>
    nodes.map((node) => node.querySelector(".jini-select-option-label")?.textContent ?? ""),
  );
}

/**
 * Every model id the Model field is currently offering, in render order, whichever shape is
 * rendered — the picker's portalled listbox (minus the `Custom…` sentinel) or the
 * `<datalist>`. The menu is opened and closed again, so this is safe to poll.
 *
 * Throws rather than returning `[]` when neither source exists: "the field offers nothing"
 * and "the assertion is looking at the wrong DOM" are different facts, and this suite has
 * already spent one session on a spec that could not tell them apart.
 */
export async function readByokModelOptions(
  page: Page,
  options: { timeout?: number } = {},
): Promise<string[]> {
  const timeout = options.timeout ?? 15_000;
  const datalist = page.locator("#jini-byok-model-options");
  // Wait for a source to exist before deciding there isn't one. Callers wrap this in
  // `expect.poll`, which does NOT retry a callback that throws — so without this wait, being
  // called one tick before the discovery response lands would fail the test outright instead
  // of polling again.
  try {
    await expect
      .poll(async () => (await byokModelPicker(page).count()) + (await datalist.count()), { timeout })
      .toBeGreaterThan(0);
  } catch {
    throw new Error(
      "[byok-model-field] Cannot read the Model field's options: after " +
        `${timeout}ms neither the picker ([data-testid="jini-byok-model-select"]) nor the ` +
        "#jini-byok-model-options datalist is in the DOM. That means live discovery returned no " +
        "models AND the preset offers no static suggestions — which is a different fact from an " +
        "empty option list, and the reason this throws instead of returning [].",
    );
  }

  if ((await byokModelPicker(page).count()) > 0) {
    const menu = await openMenu(page, timeout);
    const labels = await readOptionLabels(menu);
    await closeByokModelMenu(page, timeout);
    return labels.filter((label) => label !== CUSTOM_MODEL_OPTION_LABEL);
  }
  return datalist.evaluate((list) =>
    Array.from(list.querySelectorAll("option")).map((option) => option.getAttribute("value") ?? ""),
  );
}
