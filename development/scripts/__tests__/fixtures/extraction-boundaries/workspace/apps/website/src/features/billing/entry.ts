import type { Clock } from "../../contracts/core/clock-port.js";
import { core } from "@jini-ai/core";
import type { Contract } from "@jini-ai/core/contracts";
export const entry = (clock: Clock, c: Contract) => [clock.now(), core, c];
