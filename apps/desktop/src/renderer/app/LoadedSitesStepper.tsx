/** Settings › Loaded sites: − / number / + on the gear menu's row under Theme — `@jini-ai/ui`'s
 *  `NumberStepper` over the 1–5 live-site policy, with the desktop's copy and stepper classes. Every
 *  step and every typed digit saves at once through `useLoadedSites`; there is no Save button
 *  to forget. */
import { NumberStepper, useNumberStepper, type NumberSetting, type NumberStepperClassNames, type NumberStepperLabels } from '@jini-ai/ui/number-stepper';
import { LIVE_SITE_VIEWS } from '../../contracts/site-view-preference.js';

export const LOADED_SITES_TIP = 'Each loaded site stays in memory (~300 MB each). Higher = instant switching between sites, more memory. Other open tabs reload when you switch to them.';

const LOADED_SITES_LABELS: NumberStepperLabels = { decrease: 'Fewer loaded sites', increase: 'More loaded sites', field: 'Loaded sites', tip: LOADED_SITES_TIP };
/** `app.css`'s `.stepper` rules style the control; `visually-hidden` keeps the tip for screen readers only. */
const STEPPER_CLASSES: NumberStepperClassNames = { group: 'stepper', step: 'stepper__step', value: 'stepper__value', tip: 'visually-hidden' };

/** The gear menu's row under Theme, plus a failed save's message. An older preload with no save
 *  channel gets no row rather than a stepper that cannot save. `setting` is `useLoadedSites`'s. */
export function LoadedSitesRow({ setting, useNumberStepperHook = useNumberStepper }: { setting: NumberSetting; useNumberStepperHook?: typeof useNumberStepper }) {
  if (!setting.available) return null;
  return <>
    <div className="settings__row">
      <span className="settings__label" id="settings-loaded-sites-label">Loaded sites</span>
      <NumberStepper setting={setting} bounds={LIVE_SITE_VIEWS} labels={LOADED_SITES_LABELS} labelledBy="settings-loaded-sites-label"
        useNumberStepperHook={useNumberStepperHook} classNames={STEPPER_CLASSES} />
    </div>
    {setting.error && <p role="alert" className="settings__note settings__note--error">{setting.error}</p>}
  </>;
}
