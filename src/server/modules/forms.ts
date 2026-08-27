import { registerFormNotifySubscriber } from "../../features/forms/notify-subscriber.js";
import type { RegisterFormNotifySubscriberDeps } from "../../features/forms/notify-subscriber.js";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file ADR-046 Phase 3 (SPEC-031) — the `forms` module: owns starting the C-009 notify
 * subscriber (`registerFormNotifySubscriber`, SPEC-010/ADR-PIPE-010 W-004) — Forms' own,
 * business-logic subscription to `form.submission.received`. The SIBLING webhook-fanout
 * subscription to the same event is deliberately NOT here — see `modules/integrations.ts`'s file
 * header for why cross-feature integration is Integrations' job, not Forms'.
 */
export function createFormsModule(deps: RegisterFormNotifySubscriberDeps): ServerModuleHandle {
  return {
    name: "forms",
    start: () => {
      void registerFormNotifySubscriber(deps);
    },
  };
}
