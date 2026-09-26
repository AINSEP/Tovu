"use strict";
var kuinetic = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/index.ts
  var src_exports = {};
  __export(src_exports, {
    ATTR: () => ATTR,
    Animator: () => Animator,
    CHANNEL: () => CHANNEL,
    COMBOS: () => COMBOS,
    KUI_EVENT: () => KUI_EVENT,
    PRESETS: () => PRESETS,
    PRIMITIVES: () => PRIMITIVES,
    Registry: () => Registry,
    collectingReporter: () => collectingReporter,
    consoleReporter: () => consoleReporter,
    control: () => control,
    createActivationBinder: () => createActivationBinder,
    createAnimator: () => createAnimator,
    createRegistry: () => createRegistry,
    default: () => src_default,
    detect: () => detect,
    inertInstance: () => inertInstance,
    kuinetic: () => kuinetic,
    play: () => play,
    resolveActivationSpec: () => resolveActivationSpec,
    resolveTargets: () => resolveTargets,
    silentReporter: () => silentReporter,
    toAttributeValue: () => toAttributeValue
  });

  // src/core/target.ts
  function selectorBreadth(selector, doc) {
    try {
      if (doc.documentElement.matches(selector)) return "document-wide";
      if (doc.body?.matches(selector)) return "document-wide";
      return "ok";
    } catch {
      return "invalid";
    }
  }
  function resolveTarget(selector, ctx, effect) {
    if (!selector) return selector;
    const breadth = selectorBreadth(selector, ctx.doc);
    if (breadth === "invalid") {
      ctx.warn(`${effect} target "${selector}" is not a valid selector and will be ignored`);
      return "";
    }
    if (breadth === "document-wide") {
      ctx.warn(`${effect} target "${selector}" matches the whole document and will be ignored`);
      return "";
    }
    return selector;
  }
  var SCOPE_PARAM = {
    type: "keyword",
    default: "",
    cssProperty: "--kui-scope",
    keywords: ["self", "page"]
  };
  function scopeParam(params, fallback) {
    const authored = params.text("scope");
    if (authored === "page") return "page";
    if (authored === "self") return "self";
    return fallback;
  }
  function queryScoped(el, ctx, selector, scope) {
    return [...(scope === "page" ? ctx.doc : el).querySelectorAll(selector)];
  }

  // src/core/event-sources.ts
  function createEventSourceBindings() {
    const bindings = /* @__PURE__ */ new Map();
    function retain(source, type, run) {
      let types = bindings.get(source);
      if (!types) {
        types = /* @__PURE__ */ new Map();
        bindings.set(source, types);
      }
      let binding = types.get(type);
      if (!binding) {
        const runs = /* @__PURE__ */ new Set();
        const listener = () => {
          for (const callback of [...runs]) callback();
        };
        binding = { listener, runs };
        types.set(type, binding);
        source.addEventListener(type, listener, { passive: true });
      }
      binding.runs.add(run);
      let retained = true;
      return () => {
        if (!retained) return;
        retained = false;
        binding.runs.delete(run);
        if (binding.runs.size > 0) return;
        source.removeEventListener(type, binding.listener);
        types?.delete(type);
        if (types?.size === 0) bindings.delete(source);
      };
    }
    return {
      bind({ sources, types, run }) {
        const cleanups = [];
        for (const source of sources) {
          for (const type of types) cleanups.push(retain(source, type, run));
        }
        return () => {
          for (const cleanup of cleanups) cleanup();
        };
      },
      destroy() {
        for (const [source, types] of bindings) {
          for (const [type, binding] of types) source.removeEventListener(type, binding.listener);
        }
        bindings.clear();
      }
    };
  }
  function resolveEventSources({ el, from, reporter }) {
    if (!from) return [el];
    const doc = el.ownerDocument;
    const breadth = selectorBreadth(from, doc);
    if (breadth !== "ok") {
      const reason = breadth === "invalid" ? "is not a valid selector" : "matches the whole document";
      reporter?.warn(`activation source "${from}" ${reason} and will be ignored`, el);
      return [];
    }
    const sources = [...doc.querySelectorAll(from)];
    if (sources.length === 0) reporter?.warn(`activation source "${from}" matched nothing`, el);
    return sources;
  }

  // src/core/threshold-reachability.ts
  var RATIO_EPSILON = 1e-6;
  function maxReachableRatio(entry) {
    const root = entry.rootBounds;
    const box = entry.boundingClientRect;
    if (!root || box.width <= 0 || box.height <= 0) return void 0;
    return Math.min(1, root.width / box.width) * Math.min(1, root.height / box.height);
  }
  function formatThreshold(ratio) {
    return `${Math.round(ratio * 1e3) / 10}%`;
  }
  function checkThresholdReachability(binding, entry, ratio) {
    const reporter = binding.reporter;
    if (!reporter || ratio <= 0 || binding.thresholdWarned) return;
    if (entry.isIntersecting) {
      binding.sawIntersecting = true;
      return;
    }
    if (!binding.sawIntersecting || binding.entered) return;
    const max = maxReachableRatio(entry);
    if (max === void 0 || max >= ratio - RATIO_EPSILON) return;
    binding.thresholdWarned = true;
    reporter.warn(
      `threshold:${formatThreshold(ratio)} can never be met on this element \u2014 it is larger than the root it scrolls through, so its intersection ratio maxes out around ${formatThreshold(max)} and never reaches ${formatThreshold(ratio)}. An IntersectionObserver only reports ratio crossings, so the library cannot soften this from here \u2014 author a smaller threshold, or make the element (or its scrolling root) fit the other.`,
      entry.target
    );
  }

  // src/core/travel.ts
  var TRAVEL_WINDOW_MS = 200;
  function createTravelTracker() {
    const positions = /* @__PURE__ */ new WeakMap();
    let side;
    let at = Number.NEGATIVE_INFINITY;
    let holders = 0;
    const onScroll = (event) => {
      const target = event.target;
      if (!target) return;
      const now = scrollPositionOf(target);
      if (!now) return;
      const last = positions.get(target);
      positions.set(target, now);
      if (!last) return;
      const dy = now.y - last.y;
      const dx = now.x - last.x;
      const delta = Math.abs(dy) >= Math.abs(dx) ? dy : dx;
      if (delta === 0) return;
      side = delta > 0 ? "after" : "before";
      at = event.timeStamp;
    };
    const stop = () => {
      holders = 0;
      side = void 0;
      at = Number.NEGATIVE_INFINITY;
      if (typeof window !== "undefined") {
        window.removeEventListener("scroll", onScroll, { capture: true });
      }
    };
    return {
      arrivedFrom: (time2) => time2 - at <= TRAVEL_WINDOW_MS ? side : void 0,
      retain() {
        if (holders++ > 0 || typeof window === "undefined") return;
        window.addEventListener("scroll", onScroll, { capture: true, passive: true });
        const start = scrollPositionOf(window.document);
        if (start) positions.set(window.document, start);
      },
      release() {
        if (holders === 0 || --holders > 0) return;
        stop();
      },
      reset: stop
    };
  }
  function scrollPositionOf(target) {
    if (typeof window === "undefined") return void 0;
    if (target === window || target === window.document) {
      return { x: window.scrollX, y: window.scrollY };
    }
    if (target instanceof Element) return { x: target.scrollLeft, y: target.scrollTop };
    return void 0;
  }

  // src/core/activation.ts
  var PAIR_SEPARATOR = "/";
  var NAMED_TRIGGERS = {
    load: { kind: "immediate" },
    manual: { kind: "manual" },
    enter: { kind: "observed", when: "enter" },
    leave: { kind: "observed", when: "leave" },
    hover: { kind: "events", types: ["pointerenter", "focusin"] },
    unhover: { kind: "events", types: ["pointerleave", "focusout"] },
    focus: { kind: "events", types: ["focusin"] },
    blur: { kind: "events", types: ["focusout"] },
    click: { kind: "events", types: ["click"] }
  };
  var SUPPORT_PROXIES = {
    load: ["load"],
    manual: ["manual"],
    enter: ["enter"],
    leave: ["enter"],
    hover: ["hover"],
    unhover: ["hover"],
    focus: ["focus"],
    blur: ["focus"],
    click: ["click"]
  };
  var EVENT_DRIVEN = ["hover", "focus", "click"];
  var KNOWN_EVENTS = [
    "click",
    "dblclick",
    "auxclick",
    "contextmenu",
    "pointerdown",
    "pointerup",
    "pointerenter",
    "pointerleave",
    "pointerover",
    "pointerout",
    "pointermove",
    "pointercancel",
    "gotpointercapture",
    "lostpointercapture",
    "mousedown",
    "mouseup",
    "mouseenter",
    "mouseleave",
    "mouseover",
    "mouseout",
    "mousemove",
    "focusin",
    "focusout",
    "focus",
    "blur",
    "keydown",
    "keyup",
    "keypress",
    "input",
    "beforeinput",
    "change",
    "submit",
    "reset",
    "invalid",
    "select",
    "search",
    "touchstart",
    "touchend",
    "touchmove",
    "touchcancel",
    "wheel",
    "scroll",
    "scrollend",
    "dragstart",
    "drag",
    "dragend",
    "dragenter",
    "dragover",
    "dragleave",
    "drop",
    "animationstart",
    "animationend",
    "animationiteration",
    "animationcancel",
    "transitionstart",
    "transitionend",
    "transitionrun",
    "transitioncancel",
    "play",
    "playing",
    "pause",
    "ended",
    "timeupdate",
    "seeked",
    "volumechange",
    "ratechange",
    "loadeddata",
    "loadedmetadata",
    "canplay",
    "canplaythrough",
    "waiting",
    "stalled",
    "toggle",
    "beforetoggle",
    "close",
    "cancel",
    "copy",
    "cut",
    "paste",
    "load",
    "error",
    "abort",
    "resize",
    "fullscreenchange"
  ];
  var EVENT_NAME_RE = /^[A-Za-z][A-Za-z0-9._:-]*$/;
  var SUGGESTION_DISTANCE = 2;
  function isNamedActivation(name) {
    return Object.hasOwn(NAMED_TRIGGERS, name);
  }
  function triggerFor(name) {
    if (isNamedActivation(name)) return NAMED_TRIGGERS[name];
    return { kind: "events", types: [name] };
  }
  function resolveActivationSpec(activation) {
    const names = String(activation).split(PAIR_SEPARATOR);
    const [start = "", end] = names;
    return {
      source: activation,
      names,
      start: triggerFor(start),
      ...end === void 0 ? {} : { end: triggerFor(end) }
    };
  }
  function validateActivation(value) {
    const names = value.split(PAIR_SEPARATOR);
    if (names.length > 2) {
      return [
        `activation "${value}" has more than one "${PAIR_SEPARATOR}" \u2014 expected "start${PAIR_SEPARATOR}end"`
      ];
    }
    const malformed = names.filter((name) => !EVENT_NAME_RE.test(name));
    if (malformed.length > 0) {
      return [`activation "${value}" is not an event name or a "start${PAIR_SEPARATOR}end" pair`];
    }
    const end = names[1];
    if (end !== void 0 && (end === "load" || end === "manual")) {
      return [`activation "${value}" cannot end on "${end}" \u2014 an exit needs an event to fire on`];
    }
    return [];
  }
  function startKindOf(activation) {
    return resolveActivationSpec(activation).start.kind;
  }
  function isOneShot(spec) {
    return spec.end === void 0 && spec.start.kind === "observed";
  }
  function authorisingActivations(name) {
    return isNamedActivation(name) ? SUPPORT_PROXIES[name] : EVENT_DRIVEN;
  }
  function isKnownEventType(type) {
    if (/[-:.]/.test(type)) return true;
    return KNOWN_EVENTS.includes(type);
  }
  function suggestActivation(name) {
    let best;
    let bestDistance = SUGGESTION_DISTANCE + 1;
    for (const candidate of [...Object.keys(NAMED_TRIGGERS), ...KNOWN_EVENTS]) {
      const distance3 = editDistance(name, candidate);
      if (distance3 >= bestDistance) continue;
      bestDistance = distance3;
      best = candidate;
    }
    return bestDistance <= SUGGESTION_DISTANCE && bestDistance * 2 < name.length ? best : void 0;
  }
  function editDistance(a, b) {
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const row = [i];
      for (let j = 1; j <= b.length; j++) {
        const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
        row.push(Math.min(previous[j] + 1, row[j - 1] + 1, substitution));
      }
      previous = row;
    }
    return previous[b.length];
  }
  var NOOP = () => {
  };
  var RATIO_EPSILON2 = 1e-6;
  function meetsThreshold(entry, ratio) {
    if (!entry.isIntersecting) return false;
    if (ratio <= 0) return true;
    return entry.intersectionRatio >= ratio - RATIO_EPSILON2;
  }
  function deliverEntry(binding, entry, ratio, arrivedFrom) {
    checkThresholdReachability(binding, entry, ratio);
    if (binding.onCross) return deliverCrossing(binding, entry, ratio, arrivedFrom);
    const inside = meetsThreshold(entry, ratio);
    if (inside === binding.entered) return;
    binding.entered = inside;
    const side = inside ? binding.onEnter : binding.onLeave;
    if (!side) return;
    side();
    if (binding.oneShot) binding.release();
  }
  function deliverCrossing(binding, entry, ratio, arrivedFrom) {
    const side = sideOf(entry);
    if (!meetsThreshold(entry, ratio)) return deliverLeaving(binding, side, arrivedFrom);
    if (binding.entered) return;
    const crossing = (arrivedFrom ?? binding.outside) === "before" ? "enter-back" : "enter";
    binding.entered = true;
    binding.outside = void 0;
    binding.onCross?.(crossing);
    if (binding.oneShot) binding.release();
  }
  function deliverLeaving(binding, side, arrivedFrom) {
    if (side) binding.outside = side;
    if (!binding.entered) return;
    binding.entered = false;
    const leavingTo = side ?? oppositeSide(arrivedFrom);
    binding.onCross?.(leavingTo === "after" ? "leave-back" : "leave");
  }
  function oppositeSide(side) {
    if (!side) return void 0;
    return side === "after" ? "before" : "after";
  }
  function sideOf(entry) {
    const root = entry.rootBounds;
    const box = entry.boundingClientRect;
    if (!root || !box) return void 0;
    if (box.bottom <= root.top || box.right <= root.left) return "before";
    if (box.top >= root.bottom || box.left >= root.right) return "after";
    return void 0;
  }
  function createActivationBinder(options = {}) {
    const observers = /* @__PURE__ */ new Map();
    const callbacks = /* @__PURE__ */ new WeakMap();
    const eventBindings = createEventSourceBindings();
    const createObserver = options.createObserver ?? defaultObserverFactory();
    const travel = createTravelTracker();
    const reporter = options.reporter;
    function observerFor(threshold) {
      if (!createObserver) return void 0;
      const ratio = toThresholdRatio(threshold);
      const key = String(ratio);
      const existing = observers.get(key);
      if (existing) return { key, shared: existing };
      const observer = createObserver(
        (entries) => {
          for (const entry of entries) {
            const binding = callbacks.get(entry.target);
            if (binding) deliverEntry(binding, entry, ratio, travel.arrivedFrom(entry.time));
          }
        },
        { threshold: ratio }
      );
      const shared = { observer, count: 0 };
      observers.set(key, shared);
      return { key, shared };
    }
    function bindObserved(el, spec, request) {
      const binding = observerFor(request.threshold);
      if (!binding) {
        if (spec.failOpen) request.activate();
        return NOOP;
      }
      const { key, shared } = binding;
      const tracksTravel = Boolean(spec.onCross);
      if (tracksTravel) travel.retain();
      let active = true;
      const release = () => {
        if (!active) return;
        active = false;
        if (tracksTravel) travel.release();
        callbacks.delete(el);
        shared.observer.unobserve(el);
        shared.count--;
        if (shared.count > 0) return;
        shared.observer.disconnect();
        observers.delete(key);
      };
      callbacks.set(el, {
        onEnter: spec.onEnter,
        onLeave: spec.onLeave,
        ...spec.onCross ? { onCross: spec.onCross } : {},
        oneShot: spec.oneShot,
        release,
        entered: false,
        reporter,
        sawIntersecting: false,
        thresholdWarned: false
      });
      shared.count++;
      shared.observer.observe(el);
      return release;
    }
    return {
      bind(el, activation, request) {
        const spec = resolveActivationSpec(activation);
        const sides = sidesOf(spec, request);
        const cleanups = [];
        let eventSources;
        const observed = observedSides(sides);
        if (observed) {
          const failOpen = spec.start.kind === "observed";
          const crossing = request.cross;
          cleanups.push(
            bindObserved(
              el,
              {
                ...observed,
                ...crossing ? { onCross: crossing } : {},
                oneShot: crossing ? false : isOneShot(spec),
                failOpen
              },
              request
            )
          );
        }
        for (const side of sides) {
          const { trigger } = side;
          if (trigger.kind === "events") {
            eventSources ??= resolveEventSources({ el, from: request.from, reporter });
            cleanups.push(eventBindings.bind({ sources: eventSources, types: trigger.types, run: side.run }));
          } else if (trigger.kind === "immediate") side.run();
        }
        return cleanups.length === 0 ? NOOP : () => {
          for (const cleanup of cleanups) cleanup();
        };
      },
      destroy() {
        for (const { observer } of observers.values()) observer.disconnect();
        observers.clear();
        eventBindings.destroy();
        travel.reset();
      }
    };
  }
  function sidesOf(spec, request) {
    const sides = [{ trigger: spec.start, run: () => request.activate() }];
    const deactivate = request.deactivate;
    if (spec.end && deactivate) sides.push({ trigger: spec.end, run: () => deactivate() });
    return sides;
  }
  function observedSides(sides) {
    const observed = {};
    let found = false;
    for (const side of sides) {
      if (side.trigger.kind !== "observed") continue;
      found = true;
      if (side.trigger.when === "enter") observed.onEnter = side.run;
      else observed.onLeave = side.run;
    }
    return found ? observed : void 0;
  }
  function toThresholdRatio(raw) {
    const value = Number.parseFloat(raw);
    if (Number.isNaN(value)) return 0;
    const ratio = raw.includes("%") ? value / 100 : value;
    return Math.min(1, Math.max(0, ratio));
  }
  function defaultObserverFactory() {
    if (typeof IntersectionObserver === "undefined") return void 0;
    return (callback, init) => new IntersectionObserver(callback, init);
  }
  function warnAboutActivation(request) {
    warnUnsupported(request);
    warnUnknownEvents(request);
  }
  function warnUnsupported({ el, spec, supported, reporter }) {
    if (supported.length === 0) return;
    for (const name of spec.names) {
      if (authorisingActivations(name).some((named) => supported.includes(named))) continue;
      reporter.warn(
        `activation "${name}" is not supported by this effect (supports: ${supported.join(", ")})`,
        el
      );
    }
  }
  function warnUnknownEvents({ el, spec, reporter }) {
    if (!("onclick" in el)) return;
    for (const name of spec.names) {
      if (isNamedActivation(name) || isKnownEventType(name) || `on${name}` in el) continue;
      const suggestion = suggestActivation(name);
      const hint = suggestion ? `; did you mean "${suggestion}"?` : "";
      const problem = `no DOM event named "${name}" \u2014 data-kui-on binds it anyway, so nothing will start it`;
      reporter.warn(`${problem}${hint}`, el);
    }
  }

  // src/core/attrs.ts
  var ATTR = {
    /** Authored. The rich grammar. */
    source: "data-kui",
    /**
     * Authored. Names the composition in this element's {@link source} so other elements can reuse
     * it by name. An element carrying it is a definition — data, never animated. See `core/bundles.ts`.
     */
    define: "data-kui-define",
    /** Library-owned and unstable: normalized effect names, for CSS hooks and debugging. */
    normalized: "data-kui-fx",
    state: "data-kui-state",
    on: "data-kui-on",
    timeline: "data-kui-timeline",
    threshold: "data-kui-threshold",
    stagger: "data-kui-stagger",
    cloak: "data-kui-cloak",
    /** Reduced-motion policy, stamped from the primitive so the CSS layer can act on it. */
    rm: "data-kui-rm"
  };

  // src/core/breakpoints.ts
  var BREAKPOINTS = {
    sm: "40rem",
    md: "48rem",
    lg: "64rem",
    xl: "80rem",
    "2xl": "96rem"
  };
  var BREAKPOINT_NAMES = Object.keys(BREAKPOINTS);
  var GATE_AXES = [
    ["above", "below"],
    ["wide", "narrow"]
  ];
  function axisOf(direction) {
    return GATE_AXES.find((axis) => axis.includes(direction));
  }
  function isBreakpoint(value) {
    return Object.hasOwn(BREAKPOINTS, value);
  }
  function breakpointRank(name) {
    return BREAKPOINT_NAMES.indexOf(name);
  }
  function gateProperty(direction, breakpoint) {
    return `--kui-${direction}-${breakpoint}`;
  }
  function breakpointQuery(breakpoint) {
    return `(min-width: ${BREAKPOINTS[breakpoint]})`;
  }
  function gatedAnimationName(keyframes, gate) {
    if (!gate) return keyframes;
    let expression = keyframes;
    if (gate.narrow) expression = `var(${gateProperty("narrow", gate.narrow)}, ${expression})`;
    if (gate.wide) expression = `var(${gateProperty("wide", gate.wide)}, ${expression})`;
    if (gate.below) expression = `var(${gateProperty("below", gate.below)}, ${expression})`;
    if (gate.above) expression = `var(${gateProperty("above", gate.above)}, ${expression})`;
    return expression;
  }
  function gateMatches(gate, win) {
    if (!gate) return true;
    if (typeof win?.matchMedia !== "function") return true;
    const atLeast = (breakpoint) => win.matchMedia(breakpointQuery(breakpoint)).matches;
    if (gate.above && !atLeast(gate.above)) return false;
    if (gate.below && atLeast(gate.below)) return false;
    return true;
  }
  function gatesOverlap(a, b) {
    if (!a || !b) return true;
    const span = (gate, [upper, lower]) => [
      gate[upper] ? breakpointRank(gate[upper]) : -1,
      gate[lower] ? breakpointRank(gate[lower]) : BREAKPOINT_NAMES.length
    ];
    const overlapsOn = (axis) => {
      const [aStart, aEnd] = span(a, axis);
      const [bStart, bEnd] = span(b, axis);
      return aStart < bEnd && bStart < aEnd;
    };
    return GATE_AXES.every(overlapsOn);
  }
  function breakpointsIn(gates) {
    const named = /* @__PURE__ */ new Set();
    for (const gate of gates) {
      if (gate.above) named.add(gate.above);
      if (gate.below) named.add(gate.below);
    }
    return [...named];
  }
  function createGateWatcher(win, onChange) {
    const watched = /* @__PURE__ */ new Map();
    const bound = /* @__PURE__ */ new Map();
    function bind(breakpoint) {
      if (typeof win?.matchMedia !== "function" || bound.has(breakpoint)) return;
      const query = win.matchMedia(breakpointQuery(breakpoint));
      if (typeof query.addEventListener !== "function") return;
      const handler = () => {
        for (const [el, names] of [...watched]) {
          if (names.includes(breakpoint)) onChange(el);
        }
      };
      query.addEventListener("change", handler);
      bound.set(breakpoint, () => query.removeEventListener("change", handler));
    }
    return {
      watch(el, breakpoints) {
        if (breakpoints.length === 0) {
          watched.delete(el);
          return;
        }
        watched.set(el, [...breakpoints]);
        for (const breakpoint of breakpoints) bind(breakpoint);
      },
      unwatch(el) {
        watched.delete(el);
      },
      destroy() {
        for (const unbind of bound.values()) unbind();
        bound.clear();
        watched.clear();
      }
    };
  }

  // src/core/spring.ts
  var DEFAULT_SPRING = {
    stiffness: 180,
    damping: 24,
    mass: 1,
    restVelocity: 0.05,
    restDisplacement: 0.05
  };
  var SUBSTEP = 1 / 240;
  var MAX_STEP = 0.25;
  function stepSpring(state, target, config, dt) {
    let { value, velocity } = state;
    let remaining = Math.min(Math.max(dt, 0), MAX_STEP);
    while (remaining > 0) {
      const step = Math.min(SUBSTEP, remaining);
      const force = -config.stiffness * (value - target) - config.damping * velocity;
      velocity += force / config.mass * step;
      value += velocity * step;
      remaining -= step;
    }
    return { value, velocity };
  }
  function isSettled(state, target, config) {
    return Math.abs(state.velocity) < config.restVelocity && Math.abs(state.value - target) < config.restDisplacement;
  }
  var MAX_SETTLE_MS = 1e4;
  function createSpringRunner(config, onChange, deps) {
    const safeConfig = validConfig(config) ? config : DEFAULT_SPRING;
    if (safeConfig !== config) deps.warn?.("invalid spring configuration; using defaults");
    let state = { value: 0, velocity: 0 };
    let target = 0;
    let handle = null;
    let lastTime = 0;
    let startedAt = 0;
    function frame(time2) {
      handle = null;
      const dt = (time2 - lastTime) / 1e3;
      lastTime = time2;
      state = stepSpring(state, target, safeConfig, dt);
      if (!finiteState(state) || !Number.isFinite(target)) {
        abortRun("spring produced non-finite state");
        return;
      }
      if (time2 - startedAt >= MAX_SETTLE_MS) {
        abortRun(`spring exceeded ${MAX_SETTLE_MS}ms settle budget`);
        return;
      }
      if (isSettled(state, target, safeConfig)) {
        state = { value: target, velocity: 0 };
        onChange(state.value, true);
        return;
      }
      onChange(state.value, false);
      schedule();
    }
    function schedule() {
      if (handle !== null) return;
      handle = deps.requestFrame(frame);
    }
    function start() {
      startedAt = deps.now();
      if (handle === null) lastTime = startedAt;
      schedule();
    }
    function abortRun(message) {
      state = { value: Number.isFinite(target) ? target : 0, velocity: 0 };
      deps.warn?.(message);
      onChange(state.value, true);
    }
    return {
      to(next, velocity) {
        target = next;
        if (velocity !== void 0) state = { ...state, velocity };
        start();
      },
      set(value, velocity = 0) {
        state = { value, velocity };
      },
      current: () => ({ ...state }),
      stop() {
        if (handle !== null) deps.cancelFrame(handle);
        handle = null;
      }
    };
  }
  function validConfig(config) {
    return Object.values(config).every(Number.isFinite) && config.stiffness > 0 && config.damping > 0 && config.mass > 0 && config.restVelocity > 0 && config.restDisplacement > 0;
  }
  function finiteState(state) {
    return Number.isFinite(state.value) && Number.isFinite(state.velocity);
  }
  function defaultSpringDeps() {
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf !== "function") {
      return {
        requestFrame: (callback) => globalThis.setTimeout(() => callback(Date.now()), 16),
        cancelFrame: (handle) => globalThis.clearTimeout(handle),
        now: () => Date.now()
      };
    }
    return {
      requestFrame: (callback) => raf(callback),
      cancelFrame: (handle) => globalThis.cancelAnimationFrame(handle),
      now: () => performance.now()
    };
  }

  // src/core/easing.ts
  var NATIVE_EASINGS = /* @__PURE__ */ new Set([
    "linear",
    "ease",
    "ease-in",
    "ease-out",
    "ease-in-out",
    "step-start",
    "step-end"
  ]);
  var SPRING_PREFIX = "spring(";
  var DEFAULT_RATIO = 2 / 3;
  var DEFAULT_STIFFNESS = 180;
  var DEFAULT_MASS = 1;
  var DEFAULT_DAMPING = 2 * DEFAULT_RATIO * Math.sqrt(DEFAULT_STIFFNESS * DEFAULT_MASS);
  var MIN_RATIO = 0.15;
  var MAX_RATIO = 4;
  var MAX_BOUNCE = 1 - MIN_RATIO;
  var PHYSICS_KEYS = ["stiffness", "damping", "mass"];
  var SPRING_KEYS = ["bounce", ...PHYSICS_KEYS];
  var SIM_STEP = 1 / 240;
  var MAX_SIM_STEPS = 4e4;
  var REST_DISPLACEMENT = 1e-3;
  var REST_VELOCITY = 1e-3;
  var MIN_SAMPLES = 16;
  var MAX_SAMPLES = 64;
  var SAMPLES_PER_PERIOD = 10;
  var PRECISION = 1e3;
  function isSpringToken(token) {
    return token.startsWith(SPRING_PREFIX) && token.endsWith(")");
  }
  function cssEasingValue(easing) {
    if (NATIVE_EASINGS.has(easing)) return easing;
    if (isSpringToken(easing)) return springLinearCurve(springDampingRatio(easing));
    if (easing.includes("(")) return easing;
    return `var(--kui-ease-${easing}, ease-out)`;
  }
  var WAAPI_FALLBACK = "ease-out";
  function waapiEasingValue(easing, el, warn) {
    if (!easing) return void 0;
    if (NATIVE_EASINGS.has(easing)) return easing;
    if (isSpringToken(easing)) return springLinearCurve(springDampingRatio(easing));
    if (easing.includes("(")) return easing;
    const defined = customEasing(easing, el);
    if (defined) return defined;
    warn(`easing "${easing}" has no --kui-ease-${easing} definition \u2014 using ${WAAPI_FALLBACK}`);
    return WAAPI_FALLBACK;
  }
  function customEasing(name, el) {
    const view = el.ownerDocument.defaultView;
    if (!view) return "";
    return view.getComputedStyle(el).getPropertyValue(`--kui-ease-${name}`).trim();
  }
  function springTokenProblems(token) {
    if (!isSpringToken(token)) return [];
    const { values, problems } = readArguments(token);
    resolveRatio(values, problems);
    return problems;
  }
  function springDampingRatio(token) {
    const { values, problems } = readArguments(token);
    return resolveRatio(values, problems);
  }
  function readArguments(token) {
    const values = /* @__PURE__ */ new Map();
    const problems = [];
    const body = token.slice(SPRING_PREFIX.length, -1).trim();
    if (body) {
      for (const part of body.split(/\s+/)) readArgument(part, values, problems);
    }
    return { values, problems };
  }
  function readArgument(part, values, problems) {
    const colon = part.indexOf(":");
    const key = colon < 0 ? part : part.slice(0, colon);
    const raw = colon < 0 ? "" : part.slice(colon + 1);
    if (!SPRING_KEYS.includes(key)) {
      problems.push(`unknown spring parameter "${part}" \u2014 expected ${SPRING_KEYS.join(", ")}`);
      return;
    }
    const numeric = Number(raw);
    if (raw === "" || !Number.isFinite(numeric) || numeric < 0) {
      problems.push(`spring "${key}" expects a non-negative number \u2014 got "${raw}"`);
      return;
    }
    if (values.has(key)) problems.push(`duplicate spring parameter "${key}"`);
    values.set(key, numeric);
  }
  function resolveRatio(values, problems) {
    const bounce = values.get("bounce");
    const hasPhysics = PHYSICS_KEYS.some((key) => values.has(key));
    if (bounce !== void 0) {
      if (hasPhysics) {
        problems.push(
          `spring "bounce" and "${PHYSICS_KEYS.join('"/"')}" describe the same curve two ways \u2014 "bounce" wins`
        );
      }
      return 1 - clampBounce(bounce, problems);
    }
    if (!hasPhysics) return DEFAULT_RATIO;
    const stiffness = values.get("stiffness") ?? DEFAULT_STIFFNESS;
    const mass = values.get("mass") ?? DEFAULT_MASS;
    const damping = values.get("damping") ?? DEFAULT_DAMPING;
    return clampRatio(damping / (2 * Math.sqrt(stiffness * mass)), problems);
  }
  function clampBounce(bounce, problems) {
    if (bounce <= MAX_BOUNCE) return bounce;
    problems.push(
      `spring "bounce:${bounce}" is past ${MAX_BOUNCE} \u2014 a spring that bouncy never settles inside one animation, so it is capped at ${MAX_BOUNCE}`
    );
    return MAX_BOUNCE;
  }
  function clampRatio(ratio, problems) {
    if (!Number.isFinite(ratio)) {
      problems.push("spring constants do not describe a spring \u2014 using the default curve");
      return DEFAULT_RATIO;
    }
    if (ratio >= MIN_RATIO && ratio <= MAX_RATIO) return ratio;
    const clamped = Math.min(Math.max(ratio, MIN_RATIO), MAX_RATIO);
    problems.push(
      `spring damping ratio ${round(ratio)} is outside ${MIN_RATIO}\u2013${MAX_RATIO} \u2014 clamped to ${round(clamped)} so the curve settles`
    );
    return clamped;
  }
  var curves = /* @__PURE__ */ new Map();
  function springLinearCurve(dampingRatio) {
    const key = Math.round(dampingRatio * PRECISION);
    const cached2 = curves.get(key);
    if (cached2 !== void 0) return cached2;
    const curve = buildCurve(key / PRECISION);
    curves.set(key, curve);
    return curve;
  }
  function buildCurve(ratio) {
    const trajectory = simulate(ratio);
    const count = sampleCount(ratio, (trajectory.length - 1) * SIM_STEP);
    const stops = [];
    for (let index = 0; index <= count; index++) {
      stops.push(String(round(sampleAt(trajectory, index / count))));
    }
    stops[0] = "0";
    stops[count] = "1";
    return `linear(${stops.join(", ")})`;
  }
  function simulate(ratio) {
    const config = {
      stiffness: 1,
      damping: 2 * ratio,
      mass: 1,
      restVelocity: REST_VELOCITY,
      restDisplacement: REST_DISPLACEMENT
    };
    const values = [0];
    let state = { value: 0, velocity: 0 };
    for (let step = 0; step < MAX_SIM_STEPS; step++) {
      state = stepSpring(state, 1, config, SIM_STEP);
      values.push(state.value);
      if (isSettled(state, 1, config)) break;
    }
    return values;
  }
  function sampleCount(ratio, settleTime) {
    if (ratio >= 1) return MIN_SAMPLES;
    const period = 2 * Math.PI / Math.sqrt(1 - ratio * ratio);
    const stops = MIN_SAMPLES + Math.round(SAMPLES_PER_PERIOD * settleTime / period);
    return Math.min(stops, MAX_SAMPLES);
  }
  function sampleAt(values, fraction) {
    const position = fraction * (values.length - 1);
    const low = Math.floor(position);
    const high = Math.min(low + 1, values.length - 1);
    const start = values[low];
    return start + (values[high] - start) * (position - low);
  }
  function round(value) {
    return Math.round(value * PRECISION) / PRECISION;
  }

  // src/core/repeat.ts
  var INFINITE = "infinite";
  var COUNT_RE = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
  var PROGRESS_DRIVEN = /* @__PURE__ */ new Set(["view", "scroll", "pin"]);
  var PLAYBACK_KEYS = /* @__PURE__ */ new Set(["repeat", "yoyo"]);
  function isPlaybackKey(key) {
    return PLAYBACK_KEYS.has(key);
  }
  function applyPlayback(spec, key, value, context) {
    if (spec[key] !== void 0) {
      context.warn(`duplicate parameter "${key}" in "${context.segment}"`);
    }
    if (key === "yoyo") applyYoyo(spec, value, context);
    else applyRepeat(spec, value, context);
  }
  function applyRepeat(spec, value, context) {
    if (value === INFINITE) {
      spec.repeat = INFINITE;
      return;
    }
    if (!COUNT_RE.test(value)) {
      context.warn(countRefusal(value, context.segment));
      return;
    }
    if (Number(value) === 0) {
      context.warn(
        `"repeat:0" in "${context.segment}" means the effect never plays \u2014 with animation-fill-mode: both it jumps straight to its end state. Write "repeat:1" to play it once, or drop the key.`
      );
    }
    spec.repeat = value;
  }
  function applyYoyo(spec, value, context) {
    if (value !== "true" && value !== "false") {
      context.warn(
        `"yoyo:${value}" in "${context.segment}" is not a boolean \u2014 expected yoyo:true or yoyo:false`
      );
      return;
    }
    spec.yoyo = value === "true";
  }
  function countRefusal(value, segment) {
    if (value.startsWith("-")) {
      return `"repeat:${value}" in "${segment}" is negative \u2014 a play count cannot be. Write "repeat:infinite" to loop forever, or a non-negative number such as repeat:3.`;
    }
    return `"repeat:${value}" in "${segment}" is not a play count \u2014 expected a non-negative number such as repeat:3, or repeat:infinite`;
  }
  function resolvePlayback(input) {
    const warnings = [];
    if (input.repeat === void 0 && input.yoyo === void 0) return { warnings };
    if (input.renderer !== "css-keyframes") return { warnings: [rendererRefusal(input)] };
    if (input.repeat === INFINITE && PROGRESS_DRIVEN.has(input.timeline)) {
      warnings.push(infiniteTimelineRefusal(input.name, input.timeline));
      return { yoyo: input.yoyo, warnings };
    }
    const hidden = endsHidden(input);
    if (hidden) warnings.push(hidden);
    return { repeat: input.repeat, yoyo: input.yoyo, warnings };
  }
  function endsHidden(input) {
    if (!input.cloak || input.yoyo !== true) return null;
    const count = repeatCount(input.repeat);
    if (count === void 0 || count === 0 || count % 2 !== 0) return null;
    return `"${input.name}" with yoyo:true and an even repeat:${input.repeat} ends on a reversed iteration, and this effect's from-state is one the visitor is not meant to see \u2014 the element finishes hidden. Use an odd count (repeat:${count + 1}) to end at the rest state.`;
  }
  function rendererRefusal(input) {
    const authored = [
      input.repeat === void 0 ? "" : `repeat:${input.repeat}`,
      input.yoyo === void 0 ? "" : `yoyo:${input.yoyo}`
    ].filter(Boolean).join(" and ");
    return `"${input.name}" is rendered in JavaScript and compiles no animation-iteration-count, so ${authored} does nothing \u2014 it plays once. Repeat is a CSS-keyframes capability; a JS-rendered effect that loops does it through a parameter of its own (typewriter's "loop:"), if it has one.`;
  }
  function infiniteTimelineRefusal(name, timeline) {
    const because = timeline === "pin" ? `a pin scrubs a single playthrough with a negative animation-delay, so no iteration past the first is ever reachable` : `a "${timeline}" timeline is a finite range driven by scroll position rather than a clock, and an infinite iteration count collapses the animation's active duration to zero there \u2014 the element renders frozen at its end state`;
    return `"${name}" has repeat:infinite on a "${timeline}" timeline: ${because}. Dropping the repeat, so it plays once across the range \u2014 put an infinite loop on a "time" timeline instead.`;
  }
  function repeatCount(repeat) {
    if (repeat === void 0 || repeat === INFINITE) return void 0;
    return Number(repeat);
  }
  function isInfiniteRepeat(repeat) {
    return repeat === INFINITE;
  }
  function directionValue(yoyo) {
    return yoyo ? "alternate" : "normal";
  }
  function playbackExpression(duration, repeat) {
    const count = repeatCount(repeat);
    if (count === void 0 || count === 1) return duration;
    return `${duration} * ${count}`;
  }

  // src/core/toggle-actions.ts
  var CROSSINGS = ["enter", "leave", "enter-back", "leave-back"];
  var VERBS = /* @__PURE__ */ new Set([
    "play",
    "pause",
    "resume",
    "reverse",
    "reset",
    "restart",
    "complete",
    "none"
  ]);
  var PLAYHEAD_VERBS = /* @__PURE__ */ new Set([
    "pause",
    "resume",
    "reset",
    "restart",
    "complete"
  ]);
  var SEPARATOR = "/";
  function parseToggleActions(value, warnings = []) {
    const parts = value.split(SEPARATOR);
    if (parts.length > CROSSINGS.length) {
      warnings.push(
        `"actions:${value}" has ${String(parts.length)} verbs \u2014 there are four crossings (${CROSSINGS.join(SEPARATOR)}), so the extras are ignored`
      );
    }
    const actions = {
      "enter": "none",
      "leave": "none",
      "enter-back": "none",
      "leave-back": "none"
    };
    for (const [index, crossing] of CROSSINGS.entries()) {
      const raw = parts[index]?.trim();
      if (raw === void 0 || raw === "") continue;
      actions[crossing] = toVerb(raw, crossing, warnings);
    }
    return actions;
  }
  function toVerb(raw, crossing, warnings) {
    if (VERBS.has(raw)) return raw;
    warnings.push(
      `unrecognised action "${raw}" for the "${crossing}" crossing \u2014 expected ${[...VERBS].join(", ")}`
    );
    return "none";
  }
  function validateToggleActions(value) {
    const warnings = [];
    parseToggleActions(value, warnings);
    return warnings;
  }
  function usesPlayhead(actions) {
    for (const crossing of CROSSINGS) {
      if (PLAYHEAD_VERBS.has(actions[crossing])) return actions[crossing];
    }
    return void 0;
  }
  function warnAboutToggleActions(request) {
    if (!request.observed) {
      return [
        `"actions:" describes the four crossings of a scroll trigger, but this element activates on "${request.activation}" \u2014 nothing here is ever reached. Use on:enter or on:enter/leave`
      ];
    }
    const verb = usesPlayhead(request.actions);
    if (verb === void 0) return [];
    const warnings = [];
    if (request.progressDriven) {
      warnings.push(
        `"actions:" asks to ${verb} an element whose progress is driven by scroll position rather than by a clock \u2014 its playhead belongs to the scroller and would be overwritten on the next frame`
      );
    }
    const js = request.jsEffectNames;
    if (js.length > 0) {
      const one = js.length === 1;
      warnings.push(
        `"actions:" asks to ${verb}, which needs a playhead, and "${js.join(" ")}" ${one ? "is" : "are"} rendered in JavaScript and expose${one ? "s" : ""} none \u2014 that crossing does nothing for ${one ? "it" : "them"}`
      );
    }
    return warnings;
  }
  function applyToggleVerb(verb, target) {
    if (verb === "play") target.activate();
    else if (verb === "reverse") target.reverse();
    else if (PLAYHEAD_VERBS.has(verb)) applyPlayheadVerb(verb, target);
  }
  function applyPlayheadVerb(verb, target) {
    if (!target.started) {
      if (startsIt(verb)) target.activate();
      return;
    }
    if (verb === "restart" || verb === "complete") target.activate();
    for (const control2 of target.controls) applyToPlayhead(verb, control2);
  }
  function startsIt(verb) {
    return verb === "resume" || verb === "restart" || verb === "complete";
  }
  function applyToPlayhead(verb, control2) {
    if (verb === "pause") control2.pause();
    else if (verb === "resume") control2.resume();
    else if (verb === "complete") control2.seek(1);
    else {
      control2.seek(0);
      if (verb === "reset") control2.pause();
      else control2.resume();
    }
  }

  // src/core/parse.ts
  var TIME_RE = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:ms|s)$/;
  var EASING_FUNCTIONS = ["cubic-bezier(", "steps(", "linear(", "spring("];
  var EASING_KEYWORDS = /* @__PURE__ */ new Set([
    "linear",
    "ease",
    "ease-in",
    "ease-out",
    "ease-in-out",
    "step-start",
    "step-end",
    "expo-in",
    "expo-out",
    "expo-in-out",
    "back-in",
    "back-out",
    "back-in-out",
    "quart-out",
    "circ-out",
    "spring",
    "bounce"
  ]);
  function splitTopLevel(input, delimiter, warnings = []) {
    const parts = [];
    const scanner = { depth: 0, quote: null, escaped: false };
    let buffer = "";
    for (const char of input) {
      if (isSeparator(char, delimiter, scanner)) {
        if (buffer.trim()) parts.push(buffer.trim());
        buffer = "";
        continue;
      }
      buffer += char;
    }
    if (buffer.trim()) parts.push(buffer.trim());
    if (scanner.quote) warnings.push(`unterminated ${scanner.quote} quote in "${input}"`);
    else if (scanner.depth > 0) warnings.push(`unclosed "(" in "${input}"`);
    return parts;
  }
  function isSeparator(char, delimiter, scanner) {
    if (scanner.quote) return advanceQuote(char, scanner);
    if (char === '"' || char === "'") {
      scanner.quote = char;
      return false;
    }
    if (char === "(") scanner.depth++;
    else if (char === ")") scanner.depth = Math.max(0, scanner.depth - 1);
    if (scanner.depth !== 0) return false;
    return delimiter === " " ? /\s/.test(char) : char === delimiter;
  }
  function advanceQuote(char, scanner) {
    if (scanner.escaped) scanner.escaped = false;
    else if (char === "\\") scanner.escaped = true;
    else if (char === scanner.quote) scanner.quote = null;
    return false;
  }
  function splitPair(token) {
    let depth = 0;
    for (let i = 0; i < token.length; i++) {
      const char = token[i];
      if (char === "(") depth++;
      else if (char === ")") depth = Math.max(0, depth - 1);
      else if (char === ":" && depth === 0) {
        const key = token.slice(0, i).trim();
        const value = unquote(token.slice(i + 1).trim());
        return key && value ? [key, value] : null;
      }
    }
    return null;
  }
  function unquote(value) {
    const first = value[0];
    if ((first === '"' || first === "'") && value.endsWith(first) && value.length > 1) {
      return value.slice(1, -1).replaceAll(`\\${first}`, first);
    }
    return value;
  }
  function parseActivationAttribute(input) {
    const warnings = [];
    const tokens = splitTopLevel(input ?? "", " ", warnings);
    const [activation, ...options] = tokens;
    if (!activation) return { warnings };
    warnings.push(...validateActivation(activation));
    let from;
    for (const option of options) {
      const pair = splitPair(option);
      if (!pair || pair[0] !== "from") {
        warnings.push(`unrecognised activation option "${option}"`);
        continue;
      }
      if (from !== void 0) {
        warnings.push(`duplicate activation option "from" in "${input}"`);
        continue;
      }
      from = pair[1];
    }
    if (warnings.length > 0) return { warnings };
    return { activation, ...from === void 0 ? {} : { from }, warnings };
  }
  function classify(token) {
    const pair = splitPair(token);
    if (pair) return { kind: "pair", key: pair[0], value: pair[1] };
    if (TIME_RE.test(token)) return { kind: "time", value: token };
    if (isEasing(token)) return { kind: "easing", value: token };
    return { kind: "unknown", value: token };
  }
  function isEasing(token) {
    if (EASING_KEYWORDS.has(token)) return true;
    return EASING_FUNCTIONS.some((fn) => token.startsWith(fn) && token.endsWith(")"));
  }
  function parse(input) {
    const result = { specs: [], warnings: [] };
    for (const segment of splitTopLevel(input ?? "", ",", result.warnings)) {
      const spec = parseSegment(segment, result);
      if (spec) result.specs.push(spec);
    }
    return result;
  }
  function parseSegment(segment, result) {
    const tokens = splitTopLevel(segment, " ", result.warnings);
    const name = tokens.shift();
    if (splitPair(name)) {
      if (applyGroupOnlySegment(name, tokens, result)) return null;
      result.warnings.push(`effect name expected, got "${name}"`);
      return null;
    }
    const spec = { name, params: {} };
    let timeCount = 0;
    for (const raw of tokens) {
      const token = classify(raw);
      if (token.kind === "time") timeCount = applyTime(spec, token.value, timeCount, result.warnings);
      else applyToken(token, spec, segment, result);
    }
    return spec;
  }
  function applyGroupOnlySegment(first, rest, result) {
    const pairs = [];
    for (const token of [first, ...rest]) {
      const pair = splitPair(token);
      if (!pair || !GROUP_ONLY_HOISTS.has(pair[0]) || !Object.hasOwn(HOISTS, pair[0])) return false;
      pairs.push(pair);
    }
    for (const [key, value] of pairs) HOISTS[key](result, value);
    return true;
  }
  var GROUP_ONLY_HOISTS = /* @__PURE__ */ new Set([
    "cascade",
    "spread",
    "order",
    "cols",
    "along"
  ]);
  function applyTime(spec, value, seen, warnings) {
    if (seen === 0) spec.duration = value;
    else if (seen === 1) spec.delay = value;
    else warnings.push(`third time value "${value}" ignored (expected duration then delay)`);
    return seen + 1;
  }
  function applyToken(token, spec, segment, result) {
    if (token.kind === "easing") {
      applyEasing(token.value, spec, segment, result);
      return;
    }
    if (token.kind === "unknown") {
      result.warnings.push(
        `unrecognised token "${token.value}" in "${segment}" \u2014 expected [duration] [delay] [easing] or key:value`
      );
      return;
    }
    if (applyLifted(token.key, token.value, spec, { segment, result })) return;
    if (Object.hasOwn(HOISTS, token.key)) {
      HOISTS[token.key](result, token.value);
      return;
    }
    if (token.key in spec.params) {
      result.warnings.push(`duplicate parameter "${token.key}" in "${segment}"`);
    }
    spec.params[token.key] = token.value;
  }
  function applyEasing(value, spec, segment, result) {
    if (spec.easing) result.warnings.push(`duplicate easing "${value}" in "${segment}"`);
    for (const problem of springTokenProblems(value)) {
      result.warnings.push(`${problem} in "${segment}"`);
    }
    spec.easing = value;
  }
  function applyLifted(key, value, spec, context) {
    const { segment, result } = context;
    if (key === "at") {
      if (spec.at !== void 0) result.warnings.push(`duplicate parameter "at" in "${segment}"`);
      spec.at = value;
      return true;
    }
    if (isGateDirection(key)) {
      applyGate(spec, key, value, context);
      return true;
    }
    if (isPlaybackKey(key)) {
      applyPlayback(spec, key, value, {
        segment,
        warn: (message) => result.warnings.push(message)
      });
      return true;
    }
    return false;
  }
  var GATE_DIRECTIONS = /* @__PURE__ */ new Set(["above", "below", "wide", "narrow"]);
  function isGateDirection(key) {
    return GATE_DIRECTIONS.has(key);
  }
  function applyGate(spec, direction, value, context) {
    const { segment, result } = context;
    if (!isBreakpoint(value)) {
      result.warnings.push(
        `unknown breakpoint "${value}" in "${segment}" \u2014 expected one of ${BREAKPOINT_NAMES.join(", ")}`
      );
      return;
    }
    const gate = spec.gate ??= {};
    if (gate[direction] !== void 0) {
      result.warnings.push(`duplicate parameter "${direction}" in "${segment}"`);
    }
    gate[direction] = value;
    warnOnEmptyBand(gate, axisOf(direction), segment, result);
  }
  function warnOnEmptyBand(gate, axis, segment, result) {
    const [upperName, lowerName] = axis;
    const upperValue = gate[upperName];
    const lowerValue = gate[lowerName];
    if (!upperValue || !lowerValue || breakpointRank(upperValue) < breakpointRank(lowerValue)) return;
    result.warnings.push(
      `"${upperName}:${upperValue} ${lowerName}:${lowerValue}" in "${segment}" can never match \u2014 "${upperName}" must name a smaller breakpoint than "${lowerName}"`
    );
  }
  var RM_POLICIES = /* @__PURE__ */ new Set(["shorten", "crossfade", "disable"]);
  var HOISTS = {
    /**
     * The activation list is open: any event type `addEventListener` accepts starts an animation,
     * and `start/end` pairs it with an exit. So this no longer checks the value against a closed set
     * of six names — `on:input` and `on:cart:updated` are both legitimate and unguessable from here.
     *
     * What it still rejects is text that cannot be an event type at all, because that is where the
     * open list would otherwise turn a typo into silence rather than a warning. The complementary
     * check — "this document has never heard of that event" — needs an element and lives in
     * `animator.ts`.
     */
    on(result, value) {
      const problems = validateActivation(value);
      if (problems.length > 0) {
        result.warnings.push(...problems);
        return;
      }
      assignOnce(result, "activation", value, "activations");
    },
    timeline(result, value) {
      assignOnce(result, "timeline", value, "timelines");
    },
    /**
     * What to do at each of a scroll trigger's four crossings —
     * `actions:play/pause/resume/reset`, in the order enter, leave, enter-back, leave-back.
     *
     * Element-scoped for `on:`'s reason and then some: it *refines* `on:`, and an element has one
     * activation to refine. Validated here against the closed verb set, exactly as `rm:` is and for
     * the same reason — there is nothing a later stage could know about the word `pasue` that this
     * one does not. The checks that need the element's compiled plan (is this activation even
     * observed? can these effects be paused at all?) live in `toggle-actions.ts` and run from
     * `animator.ts`.
     */
    actions(result, value) {
      const problems = validateToggleActions(value);
      if (problems.length > 0) {
        result.warnings.push(...problems);
        return;
      }
      assignOnce(result, "actions", value, "crossing actions");
    },
    threshold(result, value) {
      assignOnce(result, "threshold", value, "thresholds");
    },
    /**
     * Deliberately unvalidated here. `data-kui-stagger` has always written its step straight into
     * `--kui-stagger`, which is what makes `var(--speed)` and `calc(90ms * 2)` work today, and the
     * two spellings have to accept the same values or "move it into `data-kui`" would silently be a
     * narrowing. `stagger.ts` owns the one screen both spellings get.
     */
    cascade(result, value) {
      warnStepMode(result, "spread", "cascade", value);
      assignOnce(result, "cascade", value, "stagger steps");
    },
    /**
     * The total-time spelling of the same setting — GSAP's `stagger.amount` beside `cascade`'s
     * `stagger.each`. `cascade:50ms` on a 200-item list takes ten seconds; `spread:600ms` takes six
     * hundred milliseconds however many items there are, because `stagger.ts` divides the budget by
     * the group's largest rank.
     *
     * Unvalidated here for exactly `cascade`'s reason: the value is divided inside a `calc()` and
     * written to `--kui-stagger`, so `var(--speed)` and `calc(1s - 200ms)` have to survive.
     */
    spread(result, value) {
      warnStepMode(result, "cascade", "spread", value);
      assignOnce(result, "spread", value, "stagger budgets");
    },
    /**
     * Also unvalidated here, for a different reason: the legal set depends on the *group size*
     * (`order:7` is in range for eight children and clamped for three), which only `stagger.ts`
     * knows. Validating the keyword half here and the index half there would split one diagnostic
     * across two modules.
     */
    order(result, value) {
      assignOnce(result, "order", value, "stagger orders");
    },
    /**
     * The group's column count, which is what makes `order:center` mean the middle *cell* rather than
     * the middle *index*. Unvalidated here for `order`'s reason: `cols:auto` is only resolvable
     * against a laid-out group, and the count that is legal depends on the group size, so the whole
     * diagnostic lives in `stagger.ts` where both are known.
     */
    cols(result, value) {
      assignOnce(result, "cols", value, "stagger column counts");
    },
    /**
     * The axis a grid stagger is restricted to.
     *
     * Spelled `along:` rather than GSAP's `axis:` for the same reason `order:` is not `from:`: `axis`
     * is a parameter on four primitives (`parallax`, `slat-assemble`, and both draggables) and a
     * hoisted key never reaches `spec.params`, so lifting the word element-wide would make
     * `data-kui="parallax-y axis:x"` unwritable. `data-kui-stagger` accepts both spellings.
     */
    along(result, value) {
      assignOnce(result, "along", value, "stagger axes");
    },
    /**
     * The one hoist that is not a move.
     *
     * `data-kui-rm` is *output*, not input: `style-plan.ts` stamps it from `plan.reducedMotion`,
     * which `compile.ts` folds out of the composed primitives' own declared policies, and ~40
     * selectors in `base.css` key on it. No author has ever written it, so there was nothing to
     * hoist — what this adds is the ability to *choose* the policy, which the library had no
     * spelling for at all. The stamped attribute keeps its exact meaning ("the policy in force
     * here"), so every one of those selectors is untouched.
     *
     * Validated against the closed set here rather than in `compile.ts`, so a typo (`rm:disabled`)
     * is named at the point the author's text is read, next to every other grammar diagnostic.
     */
    rm(result, value) {
      if (!RM_POLICIES.has(value)) {
        result.warnings.push(
          `unrecognised "rm:${value}" \u2014 expected ${[...RM_POLICIES].join(", ")}`
        );
        return;
      }
      assignOnce(result, "rm", value, "reduced-motion policies");
    },
    /**
     * The name of a global function to call when this element's effects finish.
     *
     * Element-scoped for the same reason `on:` is: one element has one lifecycle, so a second,
     * different `func:` across the comma list would be describing a completion this element only
     * reaches once. `assignOnce` names that conflict rather than letting token order pick a winner.
     *
     * Unvalidated here, and there is nothing useful to validate. `window['my-fn'] = …` is legal
     * JavaScript, so an identifier-shaped regex would reject working names; and whether the name
     * resolves at all depends on script order at *runtime*, which this module cannot see. `callback.ts`
     * owns the lookup, the `typeof` check, and the one diagnostic — see the security note at the top
     * of that file before putting `func:` anywhere a CMS field can reach.
     */
    func(result, value) {
      assignOnce(result, "func", value, "callbacks");
    }
  };
  function warnStepMode(result, other, key, value) {
    const written = result[other];
    if (written === void 0) return;
    result.warnings.push(
      `"${other}:${written}" and "${key}:${value}" are two ways to set one stagger step \u2014 the total budget ("spread:") wins`
    );
  }
  function assignOnce(result, key, value, label) {
    const current = result[key];
    if (current === void 0) {
      result[key] = value;
      return;
    }
    if (current !== value) {
      result.warnings.push(`conflicting ${label} "${String(current)}" and "${String(value)}"`);
    }
  }

  // src/core/registry.ts
  var Registry = class {
    primitives = /* @__PURE__ */ new Map();
    presets = /* @__PURE__ */ new Map();
    /** Sorted-name key → preset that renders that combination as one tested keyframe. */
    combos = /* @__PURE__ */ new Map();
    registerPrimitive(primitive) {
      if (this.primitives.has(primitive.id)) {
        throw new Error(`kuinetic: primitive "${primitive.id}" is already registered`);
      }
      this.primitives.set(primitive.id, namespaceTiming(primitive));
      return this;
    }
    registerPreset(preset) {
      if (this.presets.has(preset.name)) {
        throw new Error(`kuinetic: effect "${preset.name}" is already registered`);
      }
      if (!this.primitives.has(preset.primitive)) {
        throw new Error(
          `kuinetic: effect "${preset.name}" references unknown primitive "${preset.primitive}"`
        );
      }
      for (const segment of preset.transitions ?? []) {
        if (segment.property === "all" || segment.property === "none") {
          throw new Error(
            `kuinetic: effect "${preset.name}" declares a transition on "${segment.property}", which would swallow every other preset's segment in the merged transition list \u2014 name the real property instead`
          );
        }
      }
      this.presets.set(preset.name, preset);
      return this;
    }
    registerPresets(presets) {
      for (const preset of presets) this.registerPreset(preset);
      return this;
    }
    registerPrimitives(primitives) {
      for (const primitive of primitives) this.registerPrimitive(primitive);
      return this;
    }
    /**
     * Declare that a set of effect names has a purpose-built single-keyframe implementation.
     * Checked before channel conflict analysis, so `fade-up` + `blur-in` can resolve to the
     * tested `fade-blur-up` rather than being rejected for both writing `opacity`.
     */
    registerCombo(names, presetName) {
      this.combos.set(comboKey(names), presetName);
      return this;
    }
    resolve(name) {
      const preset = this.presets.get(name);
      if (!preset) return void 0;
      const primitive = this.primitives.get(preset.primitive);
      return { preset, primitive };
    }
    findCombo(names) {
      const comboName = this.combos.get(comboKey(names));
      return comboName ? this.resolve(comboName) : void 0;
    }
    has(name) {
      return this.presets.has(name);
    }
    /** All registered effect names, for docs generation and dev-mode "did you mean" hints. */
    names() {
      return [...this.presets.keys()].sort((a, b) => a.localeCompare(b));
    }
    getPrimitive(id) {
      return this.primitives.get(id);
    }
  };
  var TIMING_PARAMS = ["duration", "delay", "ease"];
  function timingProperty(primitiveId, name) {
    return `--kui-${primitiveId}-${name}`;
  }
  function namespaceTiming(primitive) {
    const parameters = { ...primitive.parameters };
    for (const name of TIMING_PARAMS) {
      const spec = parameters[name];
      if (spec) parameters[name] = { ...spec, cssProperty: timingProperty(primitive.id, name) };
    }
    return { ...primitive, parameters };
  }
  function comboKey(names) {
    return [...names].sort((a, b) => a.localeCompare(b)).join("+");
  }
  function suggest(name, candidates) {
    let best;
    let bestScore = Infinity;
    for (const candidate of candidates) {
      const score = distance(name, candidate);
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return bestScore <= Math.max(2, Math.floor(name.length / 3)) ? best : void 0;
  }
  function distance(a, b) {
    const rows = a.length + 1;
    const cols = b.length + 1;
    let prev = Array.from({ length: cols }, (_, i) => i);
    for (let i = 1; i < rows; i++) {
      const curr = [i, ...Array(cols - 1).fill(0)];
      for (let j = 1; j < cols; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      }
      prev = curr;
    }
    return prev[cols - 1];
  }

  // src/core/bundles.ts
  var HOIST_KEYS = ["activation", "timeline", "threshold", "rm", "func"];
  var HOIST_LABELS = {
    activation: "on",
    timeline: "timeline",
    threshold: "threshold",
    rm: "rm",
    func: "func"
  };
  var BundleTable = class {
    /**
     * @param registry - Consulted for name collisions only; a bundle never enters it.
     */
    constructor(registry) {
      this.registry = registry;
    }
    bundles = /* @__PURE__ */ new Map();
    /**
     * Register every definition in a subtree, including the subtree root itself.
     *
     * @returns How many *new* names were registered, so the caller can decide whether anything it
     *   already compiled deserves a second chance.
     * @complexity O(n) time in the subtree's element count; O(d) space in definition count.
     * @overallScore 100
     */
    collect(root, reporter) {
      let added = 0;
      for (const el of definitionsIn(root)) {
        if (this.define(el, reporter)) added++;
      }
      return added;
    }
    /**
     * Rewrite bundle references into the segments they stand for.
     *
     * @returns A new `ParsedValue`; the argument is returned untouched when nothing is defined.
     * @complexity O(s) time in the total segment count across the bundles reached; O(s) space.
     * @overallScore 100
     */
    expand(parsed) {
      if (this.bundles.size === 0) return parsed;
      const sink = { warnings: [...parsed.warnings], hoists: {} };
      const specs = this.expandList(parsed.specs, [], sink);
      const result = { ...parsed, specs, warnings: sink.warnings };
      for (const key of HOIST_KEYS) absorbHoist(result, sink.hoists, key);
      return result;
    }
    /**
     * Register one definition element.
     *
     * @returns Whether this call added a name the table did not have.
     * @complexity O(n) time in the body's length; O(e) space in its segment count.
     * @overallScore 100
     */
    define(el, reporter) {
      const name = el.getAttribute(ATTR.define).trim();
      const source = el.getAttribute(ATTR.source) ?? "";
      const problem = this.nameProblem(name);
      if (problem) {
        reporter.warn(problem, el);
        return false;
      }
      const existing = this.bundles.get(name);
      if (existing) {
        if (existing.source !== source) {
          reporter.warn(`bundle "${name}" is already defined \u2014 the first definition wins`, el);
        }
        return false;
      }
      if (el.localName !== "template") {
        reporter.warn(
          `bundle "${name}" is defined on <${el.localName}> \u2014 a definition is data, so it is never animated; use <template>`,
          el
        );
      }
      this.bundles.set(name, readBundle(name, source, el, reporter));
      return true;
    }
    /**
     * Refuse a name that cannot work, with the reason.
     *
     * @returns The diagnostic, or `undefined` when the name is usable.
     * @complexity O(n) time in the name's length; O(1) space.
     * @overallScore 100
     */
    nameProblem(name) {
      if (!name) return `${ATTR.define} needs a name \u2014 an empty one defines nothing`;
      if (/[\s,:()"']/.test(name)) {
        return `bundle name "${name}" cannot contain whitespace, a comma, a colon, parentheses or quotes \u2014 those are grammar, so a name carrying them could never be written in ${ATTR.source}`;
      }
      if (this.registry.has(name)) {
        return `bundle "${name}" is already the name of a registered effect \u2014 the effect wins and this definition is ignored`;
      }
      return void 0;
    }
    /**
     * Expand one comma list, recursing through bundles that name other bundles.
     *
     * @param trail - Bundle names currently being expanded, innermost last. Both the cycle guard and
     *   its diagnostic read it, so it is a list rather than a set.
     * @complexity O(s) time in the total segment count across the bundles reached; O(s) space.
     * @overallScore 100
     */
    expandList(specs, trail, sink) {
      const out = [];
      for (const spec of specs) {
        const bundle = this.bundles.get(spec.name);
        if (!bundle) {
          out.push(spec);
          this.noteNearMiss(spec.name, sink.warnings);
          continue;
        }
        if (trail.includes(spec.name)) {
          sink.warnings.push(cycleWarning(trail, spec.name));
          continue;
        }
        takeHoists(bundle, spec.name, sink);
        const inner = this.expandList(bundle.specs, [...trail, spec.name], sink);
        warnOnFlattenedOffsets(spec, inner, sink.warnings);
        for (const member of inner) out.push(overlay(member, spec));
      }
      return out;
    }
    /**
     * Name an unregistered effect that is one typo away from a bundle.
     *
     * `compile.ts` already reports every unknown name, with a suggestion drawn from the catalog — a
     * misspelled *bundle* is invisible in that list, so this adds the one fact that message cannot
     * carry. Only for names the registry does not know, or a real effect one edit away from a badly
     * chosen bundle name would be reported as a mistake.
     *
     * @complexity O(b·n) time in bundle count and name length; O(n) space.
     * @overallScore 100
     */
    noteNearMiss(name, warnings) {
      if (this.registry.has(name)) return;
      const hit = suggest(name, [...this.bundles.keys()]);
      if (hit) {
        warnings.push(`"${name}" is not a registered effect \u2014 did you mean the bundle "${hit}"?`);
      }
    }
  };
  function readBundle(name, source, el, reporter) {
    const parsed = parse(source);
    for (const warning of parsed.warnings) reporter.warn(`in bundle "${name}": ${warning}`, el);
    if (parsed.specs.length === 0) {
      reporter.warn(`bundle "${name}" names no effect \u2014 elements that use it animate nothing`, el);
    }
    const group = ["cascade", "spread", "order", "cols", "along"].filter((key) => parsed[key] !== void 0).map((key) => `"${key}:"`).join(" and ");
    if (group) {
      reporter.warn(
        `bundle "${name}" declares ${group} \u2014 a stagger group is read from the group element's own attribute, which never sees a bundle, so it is dropped; write it on the group element itself`,
        el
      );
    }
    return { source, specs: parsed.specs, hoists: parsed };
  }
  function takeHoists(bundle, name, sink) {
    for (const key of HOIST_KEYS) {
      if (absorbHoist(sink.hoists, bundle.hoists, key) !== "clash") continue;
      const label = HOIST_LABELS[key];
      const kept = String(sink.hoists[key]);
      sink.warnings.push(
        `bundle "${name}" sets "${label}:${String(bundle.hoists[key])}", which conflicts with "${label}:${kept}" from an earlier bundle \u2014 the first wins`
      );
    }
  }
  function cycleWarning(trail, name) {
    const path2 = [...trail, name].join(" \u2192 ");
    return `bundle "${name}" is defined in terms of itself (${path2}) \u2014 the reference is dropped`;
  }
  function definitionsIn(root) {
    const selector = `[${ATTR.define}]`;
    const found = [...root.querySelectorAll(selector)];
    const self = root.nodeType === 1 ? root : null;
    if (self?.matches(selector)) found.unshift(self);
    return found;
  }
  function absorbHoist(into, from, key) {
    const value = from[key];
    if (value === void 0) return "kept";
    const current = into[key];
    if (current === void 0) {
      into[key] = value;
      return "taken";
    }
    return current === value ? "kept" : "clash";
  }
  function overlay(member, ref) {
    return {
      ...member,
      duration: ref.duration ?? member.duration,
      delay: ref.delay ?? member.delay,
      easing: ref.easing ?? member.easing,
      at: ref.at ?? member.at,
      gate: ref.gate ?? member.gate,
      repeat: ref.repeat ?? member.repeat,
      yoyo: ref.yoyo ?? member.yoyo,
      params: { ...member.params, ...ref.params }
    };
  }
  function warnOnFlattenedOffsets(ref, inner, warnings) {
    if (ref.at === void 0 || !inner.some((member) => member.at !== void 0)) return;
    warnings.push(
      `"at:${ref.at}" on "${ref.name}" overrides the offsets the bundle sets on its own segments \u2014 they now all start at the same position`
    );
  }

  // src/core/play.ts
  function resolveTargets(target, root) {
    if (typeof target === "string") return [...root.querySelectorAll(target)];
    if (target instanceof Element) return [target];
    return [...target];
  }
  function time(value) {
    if (value === void 0) return void 0;
    return typeof value === "number" ? `${value}ms` : value;
  }
  var STRUCTURAL_RE = /[\s,()"']/;
  function quoteIfNeeded(value) {
    if (!STRUCTURAL_RE.test(value)) return value;
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  function hasTopLevelColon(value) {
    let depth = 0;
    for (const char of value) {
      if (char === "(") depth++;
      else if (char === ")") depth = Math.max(0, depth - 1);
      else if (char === ":" && depth === 0) return true;
    }
    return false;
  }
  function assertBareToken(label, value) {
    const warnings = [];
    const bySpace = splitTopLevel(value, " ", warnings);
    const byComma = splitTopLevel(value, ",", warnings);
    const isSingleToken = bySpace.length === 1 && bySpace[0] === value;
    const safe = warnings.length === 0 && isSingleToken && byComma.length === 1 && !hasTopLevelColon(value);
    if (!safe) {
      throw new Error(
        `play(): ${label} "${value}" cannot be serialized \u2014 it contains a space, comma, colon, quote, or unbalanced parenthesis the parser cannot read back as one token`
      );
    }
  }
  function toAttributeValue(effect, options = {}) {
    assertBareToken("effect", effect);
    const { duration, delay, ease, ...rest } = options;
    delete rest.stagger;
    const parts = [effect];
    const resolvedDelay = time(delay);
    const resolvedDuration = time(duration);
    if (resolvedDuration) {
      assertBareToken("duration", resolvedDuration);
      parts.push(resolvedDuration);
    }
    if (resolvedDelay) {
      assertBareToken("delay", resolvedDelay);
      parts.push(resolvedDuration ? resolvedDelay : `delay:${resolvedDelay}`);
    }
    if (ease) {
      assertBareToken("easing", ease);
      parts.push(ease);
    }
    for (const [key, value] of Object.entries(rest)) {
      if (value === void 0) continue;
      assertBareToken("parameter name", key);
      parts.push(`${key}:${quoteIfNeeded(String(value))}`);
    }
    return parts.join(" ");
  }
  function play(request, options = {}) {
    const { animator, root, target, effect } = request;
    const elements = resolveTargets(target, root);
    const stagger = time(options.stagger);
    const source = toAttributeValue(effect, options);
    for (const [index, el] of elements.entries()) {
      if (stagger) {
        ;
        el.style.setProperty("--kui-stagger", stagger);
        el.style.setProperty("--kui-i", String(index));
      }
      animator.reset(el);
      if (!el.hasAttribute(ATTR.on)) el.setAttribute(ATTR.on, "manual");
      el.setAttribute(ATTR.source, source);
      animator.process(el);
      animator.activate(el);
    }
    const instancesOf = (el) => animator.stateOf(el)?.instances ?? [];
    const finished = Promise.all(
      elements.flatMap((el) => instancesOf(el).map((instance) => instance.finished))
    ).then(() => void 0);
    return {
      elements,
      finished,
      cancel() {
        for (const el of elements) animator.cancel(el);
      },
      finish() {
        for (const el of elements) for (const instance of instancesOf(el)) instance.finish();
      }
    };
  }

  // src/core/control.ts
  var MEASURABLE_SPAN_MS = 0;
  function clamp01(value) {
    return Math.min(1, Math.max(0, value));
  }
  function finiteMs(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }
  function endTimeOf(animation) {
    return finiteMs(animation.effect?.getComputedTiming?.().endTime);
  }
  function spanOf(animations) {
    let span = MEASURABLE_SPAN_MS;
    for (const animation of animations) span = Math.max(span, endTimeOf(animation));
    return span;
  }
  function mergePlayStates(states) {
    if (states.length === 0) return "idle";
    if (states.includes("running")) return "running";
    if (states.includes("paused")) return "paused";
    return states.every((state) => state === "finished") ? "finished" : "idle";
  }
  function quietly(operation) {
    try {
      operation();
    } catch {
    }
  }
  function createCssControl(animations, ledger) {
    return {
      pause() {
        ledger.set("animation-play-state", "paused");
      },
      resume() {
        ledger.set("animation-play-state", "running");
      },
      /**
       * Flip this instance's playback rate and keep running — "turn around", whichever way it was
       * going.
       *
       * No longer the route `ControlHandle.reverse()` takes, and deliberately so: that call is about
       * the *element's* direction of travel, which only the animator owns, and it needs the absolute
       * "play out to the from-state" of `EffectInstance.reverse` rather than this relative flip.
       * Retained because `InstanceControl` is a published interface and this is the honest meaning of
       * `reverse` at the level of one playhead — a caller holding a single instance's control has no
       * element-wide direction to speak of.
       */
      reverse() {
        for (const animation of animations()) quietly(() => animation.reverse());
        ledger.set("animation-play-state", "running");
      },
      seek(progress) {
        const list = animations();
        const span = spanOf(list);
        if (span === MEASURABLE_SPAN_MS) return;
        const at = clamp01(progress) * span;
        for (const animation of list) {
          quietly(() => {
            animation.currentTime = Math.min(at, endTimeOf(animation));
          });
        }
      },
      rate(playbackRate) {
        for (const animation of animations()) animation.playbackRate = playbackRate;
      },
      get progress() {
        const list = animations();
        const span = spanOf(list);
        if (span === MEASURABLE_SPAN_MS) return 0;
        let at = 0;
        for (const animation of list) at = Math.max(at, finiteMs(animation.currentTime));
        return clamp01(at / span);
      },
      get playState() {
        return mergePlayStates(animations().map((animation) => animation.playState));
      }
    };
  }
  function bindElement(animator, el) {
    const state = animator.stateOf(el);
    if (!state) {
      return {
        el,
        controls: [],
        unreachable: [],
        refused: true,
        note: "no kUInetic effect is installed on this element \u2014 it has no playhead to control"
      };
    }
    if (state.progressDriven) {
      return {
        el,
        controls: [],
        unreachable: [...state.fxNames],
        refused: true,
        note: `"${state.fxNames.join(" ")}" is driven by scroll position rather than a clock, so its playhead belongs to the scroller \u2014 pausing or seeking it would be overwritten on the next frame`
      };
    }
    const controls = state.instances.map((instance) => instance.control).filter((control2) => control2 !== void 0);
    const unreachable = [...state.jsEffectNames];
    if (unreachable.length === 0) return { el, controls, unreachable };
    return {
      el,
      controls,
      unreachable,
      note: `"${unreachable.join(" ")}" ${unreachable.length === 1 ? "is" : "are"} rendered in JavaScript and expose${unreachable.length === 1 ? "s" : ""} no playhead, so pause, seek and timeScale do not reach ${unreachable.length === 1 ? "it" : "them"}`
    };
  }
  function control(request) {
    const { animator, root, target } = request;
    const elements = resolveTargets(target, root);
    const bounds = elements.map((el) => bindElement(animator, el));
    for (const [index, bound] of bounds.entries()) {
      if (bound.note) animator.reporter.warn(`control(): ${bound.note}`, elements[index]);
    }
    const each = (operation) => {
      for (const bound of bounds) for (const instance of bound.controls) operation(instance);
      return handle;
    };
    const reject2 = (call, value) => {
      animator.reporter.warn(`control(): ${call} ignored \u2014 ${String(value)} is not a finite number`);
      return handle;
    };
    const reverseAll = () => {
      for (const bound of bounds) if (!bound.refused) animator.reverseFrom(bound.el);
      return handle;
    };
    const handle = {
      elements,
      get uncontrolled() {
        return bounds.flatMap((bound) => bound.unreachable);
      },
      pause: () => each((instance) => instance.pause()),
      play: () => each((instance) => instance.resume()),
      reverse: () => reverseAll(),
      seek: (progress) => Number.isFinite(progress) ? each((instance) => instance.seek(progress)) : reject2("seek()", progress),
      timeScale: (rate) => Number.isFinite(rate) ? each((instance) => instance.rate(rate)) : reject2("timeScale()", rate),
      get progress() {
        let lowest = 1;
        let found = false;
        for (const bound of bounds) {
          for (const instance of bound.controls) {
            lowest = Math.min(lowest, instance.progress);
            found = true;
          }
        }
        return found ? lowest : 0;
      },
      get state() {
        return mergePlayStates(
          bounds.flatMap((bound) => bound.controls.map((instance) => instance.playState))
        );
      }
    };
    return handle;
  }
  var KUI_EVENT = {
    /** The element's effects have started. Fires once per activation. */
    start: "kui:start",
    /** Every finite effect on the element has completed. */
    finish: "kui:finish",
    /**
     * The element has finished playing *backwards* and is sitting at its from-state again.
     *
     * A separate name rather than a second `kui:finish` with a different `reason`, because the
     * commonest thing an author does with `kui:finish` is chain the next reveal off it, and a
     * listener that has to remember to re-check `event.detail.reason` before doing so is a trap
     * rather than an API — the one time they forget, a hover-out plays the next section in. Filtering
     * by *name* is what `addEventListener` is for, and it is what a delegated document-level listener
     * can do without reading the detail at all.
     *
     * The exit half of a paired activation (`data-kui-on="pointerenter/pointerleave"`) settles here,
     * and so does a programmatic `control(el).reverse()`. Before this existed, a completed reverse
     * dispatched nothing whatsoever, which left "the element is back where it started" the one
     * lifecycle moment an author could only discover by polling `data-kui-state`.
     */
    reverseFinish: "kui:reverse-finish",
    /** The element's effects were torn down or cancelled before completing. */
    cancel: "kui:cancel"
  };
  function emitLifecycle(el, type, detail) {
    const Ctor = el.ownerDocument?.defaultView?.CustomEvent ?? globalThis.CustomEvent;
    if (typeof Ctor !== "function") return;
    el.dispatchEvent(new Ctor(type, { detail, bubbles: true, composed: true }));
  }

  // src/core/callback.ts
  function bindCallback(request) {
    const { el, name, reporter, signal } = request;
    const handler = (event) => {
      if (event.target !== el) return;
      const fn = resolveGlobalFunction(el, name);
      if (!fn) {
        reporter.warn(
          `func:${name} \u2014 no global function named "${name}". A function declaration (\`function ${name}() {}\`) or an explicit \`window.${name} = \u2026\` creates one; \`const\` and \`let\` deliberately do not, and neither does a bundled or \`type="module"\` script.`,
          el
        );
        return;
      }
      Reflect.apply(fn, el, [event]);
    };
    el.addEventListener(KUI_EVENT.finish, handler);
    signal.addEventListener("abort", () => el.removeEventListener(KUI_EVENT.finish, handler));
  }
  function resolveGlobalFunction(el, name) {
    const scope = el.ownerDocument?.defaultView ?? globalThis;
    if (!Object.hasOwn(scope, name)) return void 0;
    const candidate = scope[name];
    return typeof candidate === "function" ? candidate : void 0;
  }

  // src/core/capabilities.ts
  function supports(property2, value) {
    if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return false;
    try {
      return CSS.supports(property2, value);
    } catch {
      return false;
    }
  }
  var cached;
  function detect(force = false) {
    if (cached && !force) return cached;
    cached = {
      viewTimeline: supports("animation-timeline", "view()"),
      scrollTimeline: supports("animation-timeline", "scroll()"),
      animationRange: supports("animation-range", "entry 0% cover 30%"),
      // `translate`/`rotate`/`scale` as independent properties is what makes the channel model
      // possible at all — under the `transform` shorthand every effect would collide.
      individualTransforms: supports("translate", "0 10px") && supports("scale", "1.1"),
      scrollTimelineName: supports("scroll-timeline-name", "--x"),
      viewTransitions: typeof document !== "undefined" && "startViewTransition" in document,
      intersectionObserver: typeof IntersectionObserver !== "undefined",
      reducedMotion: typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches,
      motionPath: supports("offset-path", 'path("M 0 0")')
    };
    return cached;
  }
  var CHANNEL_REQUIREMENTS = [
    {
      channel: "offset",
      capability: "motionPath",
      message: "this browser does not support CSS Motion Path (offset-path), so the element will not travel \u2014 the animation still runs and completes, it just has no path to follow"
    }
  ];
  function unsupportedChannelWarnings(channels, capabilities) {
    return CHANNEL_REQUIREMENTS.filter(
      (entry) => channels.includes(entry.channel) && !capabilities[entry.capability]
    ).map((entry) => entry.message);
  }

  // src/core/channels.ts
  var INDEPENDENT_PHASES = /* @__PURE__ */ new Set(["entrance|state", "exit|state"]);
  function phasePair(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }
  function independentPhases(a, b) {
    if (!a.phase || !b.phase) return false;
    return INDEPENDENT_PHASES.has(phasePair(a.phase, b.phase));
  }
  var CHANNEL_COMPOSITION = {
    translate: "add"
  };
  function additiveChannels(channels) {
    return channels.length > 0 && channels.every((channel) => CHANNEL_COMPOSITION[channel] === "add");
  }
  function additiveResolution(claims, conflicts) {
    if (conflicts.some((conflict) => conflict.effects[0] === conflict.effects[1])) return void 0;
    const contested = new Set(conflicts.map((conflict) => conflict.channel));
    const involved = /* @__PURE__ */ new Set();
    claims.forEach((claim2, index) => {
      if (claim2.channels.some((channel) => contested.has(channel))) involved.add(index);
    });
    for (const index of involved) if (!claims[index].additive) return void 0;
    return involved;
  }
  function findConflicts(claims) {
    const conflicts = [];
    const seen = /* @__PURE__ */ new Map();
    for (const claim2 of claims) {
      for (const channel of claim2.channels) {
        const claimants = seen.get(channel) ?? [];
        const clash = claimants.find(
          // Same effect name twice in one list claims the channel against itself; still a conflict,
          // and a more likely author typo than a deliberate choice. Phase cannot exempt that pair
          // either, because a phase is only ever independent of a *different* one.
          (other) => gatesOverlap(other.gate, claim2.gate) && !independentPhases(other, claim2)
        );
        if (clash) conflicts.push({ channel, effects: [clash.name, claim2.name] });
        claimants.push(claim2);
        seen.set(channel, claimants);
      }
    }
    return conflicts;
  }
  function deliveryClobbers(claims) {
    const stylesheet = claims.filter((claim2) => claim2.delivery === "stylesheet-animation");
    if (stylesheet.length === 0) return [];
    const inline = claims.find((claim2) => claim2.inlineAnimation && !claim2.delivery);
    if (!inline) return [];
    return stylesheet.map(
      (claim2) => `"${inline.name}" writes an inline animation, which outranks the stylesheet rule "${claim2.name}" delivers its motion from`
    );
  }
  function describeConflicts(conflicts) {
    return conflicts.map((c) => `"${c.effects[0]}" and "${c.effects[1]}" both animate ${c.channel}`).join("; ");
  }

  // src/core/params.ts
  var DANGEROUS = /[;<]|\/\*|url\s*\(|expression\s*\(|@import|image-set\s*\(/i;
  var ABSOLUTE_OR_PROTOCOL_RELATIVE = /^(?:[a-z][a-z0-9+.-]*:|[/\\]{2})/i;
  var MAX_VALUE_LENGTH = 200;
  var MAX_PATH_LENGTH = 2e3;
  var PATH_DATA = /^[MmZzLlHhVvCcSsQqTtAa0-9eE.,+\-\s]+$/;
  var NUM = String.raw`-?(?:\d+(?:\.\d+)?|\.\d+)`;
  var LENGTH_UNITS = "px|rem|em|vh|vw|vmin|vmax|ch|ex|cm|mm|in|pt|pc|q|%";
  var PATTERNS = {
    length: new RegExp(`^(?:0|${NUM}(?:${LENGTH_UNITS}))$`, "i"),
    time: new RegExp(`^${NUM}(?:ms|s)$`, "i"),
    number: new RegExp(`^${NUM}$`),
    percentage: new RegExp(`^${NUM}%$`),
    angle: new RegExp(`^${NUM}(?:deg|rad|turn|grad)$`, "i")
  };
  var BARE_ANGLE = new RegExp(`^(${NUM})d?$`, "i");
  function withAngleUnit(value) {
    const match = BARE_ANGLE.exec(value);
    return match ? `${match[1]}deg` : value;
  }
  var BARE_NUMBER = /^([+-]?)(\d+(?:\.\d+)?|\.\d+)(?:e([+-]?\d+))?$/i;
  var HEX_COLOR = /^#[0-9a-f]{3,8}$/i;
  var COLOR_FUNCTIONS = /^(?:rgba?|hsla?|okl(?:ch|ab)|l(?:ch|ab)|color)\([^()]*\)$/i;
  var COLOR_KEYWORDS = /* @__PURE__ */ new Set([
    // Lowercase throughout, matching how the only reader spells the lookup: `value.toLowerCase()`.
    // CSS keywords are ASCII case-insensitive, so `Canvas`, `canvas` and `CANVAS` are one value.
    "accentcolor",
    "accentcolortext",
    "activetext",
    "buttonborder",
    "buttonface",
    "buttontext",
    "canvas",
    "canvastext",
    "field",
    "fieldtext",
    "graytext",
    "highlight",
    "highlighttext",
    "linktext",
    "mark",
    "marktext",
    "selecteditem",
    "selecteditemtext",
    "visitedtext",
    "transparent",
    "currentcolor",
    "aliceblue",
    "antiquewhite",
    "aqua",
    "aquamarine",
    "azure",
    "beige",
    "bisque",
    "black",
    "blanchedalmond",
    "blue",
    "blueviolet",
    "brown",
    "burlywood",
    "cadetblue",
    "chartreuse",
    "chocolate",
    "coral",
    "cornflowerblue",
    "cornsilk",
    "crimson",
    "cyan",
    "darkblue",
    "darkcyan",
    "darkgoldenrod",
    "darkgray",
    "darkgreen",
    "darkgrey",
    "darkkhaki",
    "darkmagenta",
    "darkolivegreen",
    "darkorange",
    "darkorchid",
    "darkred",
    "darksalmon",
    "darkseagreen",
    "darkslateblue",
    "darkslategray",
    "darkslategrey",
    "darkturquoise",
    "darkviolet",
    "deeppink",
    "deepskyblue",
    "dimgray",
    "dimgrey",
    "dodgerblue",
    "firebrick",
    "floralwhite",
    "forestgreen",
    "fuchsia",
    "gainsboro",
    "ghostwhite",
    "gold",
    "goldenrod",
    "gray",
    "green",
    "greenyellow",
    "grey",
    "honeydew",
    "hotpink",
    "indianred",
    "indigo",
    "ivory",
    "khaki",
    "lavender",
    "lavenderblush",
    "lawngreen",
    "lemonchiffon",
    "lightblue",
    "lightcoral",
    "lightcyan",
    "lightgoldenrodyellow",
    "lightgray",
    "lightgreen",
    "lightgrey",
    "lightpink",
    "lightsalmon",
    "lightseagreen",
    "lightskyblue",
    "lightslategray",
    "lightslategrey",
    "lightsteelblue",
    "lightyellow",
    "lime",
    "limegreen",
    "linen",
    "magenta",
    "maroon",
    "mediumaquamarine",
    "mediumblue",
    "mediumorchid",
    "mediumpurple",
    "mediumseagreen",
    "mediumslateblue",
    "mediumspringgreen",
    "mediumturquoise",
    "mediumvioletred",
    "midnightblue",
    "mintcream",
    "mistyrose",
    "moccasin",
    "navajowhite",
    "navy",
    "oldlace",
    "olive",
    "olivedrab",
    "orange",
    "orangered",
    "orchid",
    "palegoldenrod",
    "palegreen",
    "paleturquoise",
    "palevioletred",
    "papayawhip",
    "peachpuff",
    "peru",
    "pink",
    "plum",
    "powderblue",
    "purple",
    "rebeccapurple",
    "red",
    "rosybrown",
    "royalblue",
    "saddlebrown",
    "salmon",
    "sandybrown",
    "seagreen",
    "seashell",
    "sienna",
    "silver",
    "skyblue",
    "slateblue",
    "slategray",
    "slategrey",
    "snow",
    "springgreen",
    "steelblue",
    "tan",
    "teal",
    "thistle",
    "tomato",
    "turquoise",
    "violet",
    "wheat",
    "white",
    "whitesmoke",
    "yellow",
    "yellowgreen"
  ]);
  var EASING_KEYWORD = /^(?:linear|ease|step-start|step-end|spring|bounce|[a-z]+-(?:in|out|in-out))$/i;
  var EASING_FUNCTION = /^(?:cubic-bezier|steps|linear|spring)\([^()]*\)$/i;
  var UNION_GRAMMARS = {
    "number|percentage": ["number", "percentage"],
    "length|percentage": ["length", "percentage"],
    "angle|keyword": ["angle"]
  };
  function grammarsFor(type) {
    return UNION_GRAMMARS[type] ?? [type];
  }
  var CALC_TYPES = /* @__PURE__ */ new Set(["length", "percentage", "number"]);
  var BOUNDED_TYPES = /* @__PURE__ */ new Set(["number", "number|percentage"]);
  var CALC_CHARACTER = /^[\d.\s+\-*/%a-z,]$/i;
  var CUSTOM_PROPERTY_NAME = /^--[\w-]+$/;
  function validate(raw, spec) {
    const value = raw.trim();
    const rejection = screen(value, spec);
    if (rejection) return rejection;
    const word = checkKeywordHalf(value, spec);
    if (word) return word;
    if (spec.type === "text") return { value, ok: true };
    if (spec.type === "path") return checkPath(value, spec);
    const typed = normalise(value, spec.type);
    if (isAcceptable(typed, spec.type)) return checkNumericConstraints(typed, spec);
    return reject(spec, `not a valid ${describeType(spec)}`);
  }
  function checkKeywordHalf(value, spec) {
    if (spec.type !== "keyword" && spec.type !== "angle|keyword") return null;
    if (spec.keywords?.includes(value)) return { value, ok: true };
    if (spec.type !== "keyword") return null;
    return reject(spec, `expected one of ${spec.keywords?.join(", ") || "(none declared)"}`);
  }
  function normalise(value, type) {
    if (type === "angle" || type === "angle|keyword") return withAngleUnit(value);
    if (type === "number|percentage") return withoutPercentage(value);
    return value;
  }
  function withoutPercentage(value) {
    if (!PATTERNS.percentage.test(value)) return value;
    return decimalNumber(value.slice(0, -1), -2) ?? value;
  }
  function decimalNumber(raw, shift = 0) {
    const match = BARE_NUMBER.exec(raw);
    if (!match || raw.length > MAX_VALUE_LENGTH) return void 0;
    const [, sign, coefficient, exponent] = match;
    const digits = coefficient.replace(".", "");
    const dot = coefficient.indexOf(".");
    const position = (dot < 0 ? digits.length : dot) + Number(exponent ?? 0) + shift;
    if (Math.abs(position) + digits.length > 190) return void 0;
    const padded = "0".repeat(Math.max(0, -position)) + digits + "0".repeat(Math.max(0, position - digits.length));
    const split = Math.max(0, position);
    const integer = padded.slice(0, split).replace(/^0+/, "") || "0";
    const fraction = fractionalPart(padded, split);
    return `${sign === "-" ? "-" : ""}${integer}${fraction}`;
  }
  function fractionalPart(digits, start) {
    let end = digits.length;
    while (end > start && digits[end - 1] === "0") end--;
    return end > start ? "." + digits.slice(start, end) : "";
  }
  function isSafeCssValue(value) {
    return value.length <= MAX_VALUE_LENGTH && !DANGEROUS.test(value);
  }
  function checkPath(value, spec) {
    if (!PATH_DATA.test(value)) return reject(spec, "path data contains an unsupported character");
    if (!/^[Mm]/.test(value)) return reject(spec, "path data must start with a moveto (M or m)");
    return { value: `"${value}"`, ok: true };
  }
  function screen(value, spec) {
    if (!value) return reject(spec, "empty value");
    const limit = spec.type === "path" ? MAX_PATH_LENGTH : MAX_VALUE_LENGTH;
    if (value.length > limit) {
      return reject(spec, `value exceeds ${limit} characters`);
    }
    if (DANGEROUS.test(value)) return reject(spec, "value contains disallowed CSS syntax");
    return null;
  }
  function isAcceptable(value, type) {
    if (type === "color") return isColor(value);
    if (type === "easing") return EASING_KEYWORD.test(value) || EASING_FUNCTION.test(value);
    const grammars = grammarsFor(type);
    if (grammars.some((grammar) => PATTERNS[grammar]?.test(value))) return true;
    if (!grammars.some((grammar) => CALC_TYPES.has(grammar))) return false;
    return isSafeCalc(value) && isWellFormedCalc(value);
  }
  function describeType(spec) {
    if (spec.type === "angle|keyword") {
      return `angle or one of ${spec.keywords?.join(", ") || "(none declared)"}`;
    }
    return spec.type.replace("|", " or ");
  }
  function isColor(value) {
    return HEX_COLOR.test(value) || COLOR_FUNCTIONS.test(value) || COLOR_KEYWORDS.has(value.toLowerCase());
  }
  function isSameOriginPath(value) {
    return !ABSOLUTE_OR_PROTOCOL_RELATIVE.test(value);
  }
  function checkNumericConstraints(value, spec) {
    if (!BOUNDED_TYPES.has(spec.type)) return { value, ok: true };
    const numeric = Number(value);
    if (spec.finite && !Number.isFinite(numeric)) return reject(spec, "expected a finite number");
    if (spec.integer && !Number.isInteger(numeric)) return reject(spec, "expected an integer");
    if (spec.minimum !== void 0 && numeric < spec.minimum) {
      return reject(spec, `expected at least ${spec.minimum}`);
    }
    if (spec.maximum !== void 0 && numeric > spec.maximum) {
      return reject(spec, `expected at most ${spec.maximum}`);
    }
    return { value, ok: true };
  }
  function reject(spec, reason) {
    return { value: spec.default, ok: false, reason };
  }
  function isSafeCalc(value) {
    if (!value.startsWith("calc(") || !value.endsWith(")")) return false;
    const end = value.length - 1;
    let index = "calc(".length;
    while (index < end) {
      index = nextCalcToken(value, index, end);
      if (index < 0) return false;
    }
    return true;
  }
  function nextCalcToken(value, index, end) {
    if (value.startsWith("var(", index)) return consumeVar(value, index, end);
    return CALC_CHARACTER.test(value[index]) ? index + 1 : -1;
  }
  function consumeVar(value, start, end) {
    const close = value.indexOf(")", start + "var(".length);
    if (close < 0 || close >= end) return -1;
    const name = value.slice(start + "var(".length, close);
    return CUSTOM_PROPERTY_NAME.test(name) ? close + 1 : -1;
  }
  function isWellFormedCalc(value) {
    const body = value.slice("calc(".length, -1).trim();
    return body !== "" && !/[+\-*/]$/.test(body);
  }
  function resolveParams(authored, schema, warn) {
    const out = {};
    for (const [key, raw] of Object.entries(authored)) {
      const spec = Object.hasOwn(schema, key) ? schema[key] : void 0;
      if (!spec) {
        warn(`unknown parameter "${key}" (known: ${Object.keys(schema).join(", ") || "none"})`);
        continue;
      }
      if (spec.type === "text") continue;
      const result = validate(raw, spec);
      if (!result.ok) {
        warn(`parameter "${key}": ${result.reason} \u2014 got "${raw}", using default "${spec.default}"`);
        continue;
      }
      out[spec.cssProperty] = cssValueFor(result.value, spec, key, warn);
    }
    return out;
  }
  function cssValueFor(value, spec, key, warn) {
    if (spec.type !== "easing") return value;
    for (const problem of springTokenProblems(value)) warn(`parameter "${key}": ${problem}`);
    return cssEasingValue(value);
  }

  // src/core/js-params.ts
  var ABSOLUTE_BASIS = {
    viewportWidth: 0,
    viewportHeight: 0,
    percentBasis: 0,
    fontSize: 16,
    rootFontSize: 16
  };
  var STATIC_UNITS = {
    px: 1,
    cm: 96 / 2.54,
    mm: 96 / 25.4,
    q: 96 / 101.6,
    in: 96,
    pt: 96 / 72,
    pc: 16
  };
  var BASIS_UNITS = {
    vh: (b) => b.viewportHeight / 100,
    vw: (b) => b.viewportWidth / 100,
    vmin: (b) => Math.min(b.viewportWidth, b.viewportHeight) / 100,
    vmax: (b) => Math.max(b.viewportWidth, b.viewportHeight) / 100,
    "%": (b) => b.percentBasis / 100,
    em: (b) => b.fontSize,
    rem: (b) => b.rootFontSize,
    ch: (b) => b.fontSize * 0.5,
    ex: (b) => b.fontSize * 0.5
  };
  var NUMBER_WITH_UNIT = /^(-?(?:\d+(?:\.\d+)?|\.\d+))([a-z%]*)$/i;
  function readParams(authored, schema, warn) {
    const out = {};
    for (const [name, spec] of Object.entries(schema)) out[name] = spec.default;
    for (const [name, raw] of Object.entries(authored)) {
      const spec = Object.hasOwn(schema, name) ? schema[name] : void 0;
      if (!spec) {
        warn(`unknown parameter "${name}" (known: ${Object.keys(schema).join(", ") || "none"})`);
        continue;
      }
      const result = validate(raw, spec);
      out[name] = result.value;
      if (!result.ok) {
        warn(`parameter "${name}": ${result.reason} \u2014 got "${raw}", using default "${spec.default}"`);
      }
    }
    return out;
  }
  function toMilliseconds(value, fallback = 0) {
    const parts = NUMBER_WITH_UNIT.exec(value.trim());
    if (!parts) return fallback;
    const amount = Number.parseFloat(parts[1]);
    const unit = parts[2].toLowerCase();
    if (unit === "ms") return amount;
    if (unit === "s") return amount * 1e3;
    return fallback;
  }
  function toPixels(value, basis, fallback = 0) {
    const parts = NUMBER_WITH_UNIT.exec(value.trim());
    if (!parts) return fallback;
    const amount = Number.parseFloat(parts[1]);
    const unit = parts[2].toLowerCase();
    if (unit === "") return amount === 0 ? 0 : fallback;
    const staticFactor = STATIC_UNITS[unit];
    if (staticFactor !== void 0) return amount * staticFactor;
    const basisFactor = BASIS_UNITS[unit];
    return basisFactor ? amount * basisFactor(basis) : fallback;
  }
  function toNumber(value, fallback = 0) {
    const parts = NUMBER_WITH_UNIT.exec(value.trim());
    if (!parts) return fallback;
    const amount = Number.parseFloat(parts[1]);
    const unit = parts[2];
    if (unit === "") return amount;
    if (unit === "%") return amount / 100;
    return fallback;
  }
  var EASING_SPEC = { type: "easing", default: "", cssProperty: "--kui-ease" };
  function timingMs(raw, label, warn) {
    if (raw === void 0) return void 0;
    const ms = toMilliseconds(raw, Number.NaN);
    if (Number.isFinite(ms)) return ms;
    warn(`${label} "${raw}" is not a valid time \u2014 ignored`);
    return void 0;
  }
  function timingEasing(raw, warn) {
    if (raw === void 0) return void 0;
    const result = validate(raw, EASING_SPEC);
    if (result.ok) return result.value;
    warn(`easing "${raw}": ${result.reason} \u2014 ignored`);
    return void 0;
  }
  function readEffectTiming(spec, warn) {
    return {
      durationMs: timingMs(spec.duration, "duration", warn),
      delayMs: timingMs(spec.delay, "delay", warn),
      easing: timingEasing(spec.easing, warn)
    };
  }
  function effectDurationMs(params, fallback) {
    return params.timing.durationMs ?? params.ms("duration", fallback);
  }
  function createParams(values, timing3 = {}) {
    return {
      text: (name, fallback = "") => values[name] ?? fallback,
      ms: (name, fallback = 0) => toMilliseconds(values[name] ?? "", fallback),
      num: (name, fallback = 0) => toNumber(values[name] ?? "", fallback),
      is: (name, value = "true") => (values[name] ?? "") === value,
      timing: timing3
    };
  }
  function readEffectParams(authored, schema, warn, timing3 = {}) {
    return createParams(readParams(authored, schema, warn), timing3);
  }

  // src/core/sequence.ts
  var DURATION_FALLBACK = "600ms";
  var DELAY_FALLBACK = "0ms";
  function durationExpression(duration, primitiveId) {
    return duration ?? `var(${timingProperty(primitiveId, "duration")}, ${DURATION_FALLBACK})`;
  }
  function delayExpression(delay, primitiveId) {
    return delay ?? `var(${timingProperty(primitiveId, "delay")}, ${DELAY_FALLBACK})`;
  }
  var AT_ANCHOR = /^(with|after)/i;
  var AT_OFFSET = /^([+-])(\d+(?:\.\d+)?|\.\d+)(ms|s)$/i;
  var BARE_TIME = /^(?:\d+(?:\.\d+)?|\.\d+)(?:ms|s)$/i;
  var PROGRESS_DRIVEN2 = /* @__PURE__ */ new Set(["view", "scroll"]);
  function parsePosition(raw) {
    const value = raw.trim();
    const named = AT_ANCHOR.exec(value);
    const anchor = named?.[1]?.toLowerCase() === "with" ? "start" : "end";
    const offset = named ? value.slice(named[0].length) : value;
    if (offset === "") {
      if (!named) return { ok: false, reason: refusalReason(value) };
      return { ok: true, position: { anchor, offsetMs: 0, term: "" } };
    }
    const parts = AT_OFFSET.exec(offset);
    if (!parts) return { ok: false, reason: refusalReason(value) };
    const [, sign, amount, unit] = parts;
    const time2 = `${amount}${unit}`;
    const magnitude = toMilliseconds(time2, 0);
    return {
      ok: true,
      position: {
        anchor,
        offsetMs: sign === "-" ? -magnitude : magnitude,
        // Spaces around the operator are required by `calc()`, not decoration: `calc(600ms -200ms)`
        // is a syntax error, and a browser drops the whole declaration rather than reporting it.
        term: ` ${sign} ${time2}`
      }
    };
  }
  function refusalReason(value) {
    if (BARE_TIME.test(value)) {
      return `at:"${value}" is an absolute position, which is only another spelling of delay:${value} \u2014 write at:+${value} to start that long after the previous effect ends, at:-${value} to overlap it by that much, or at:with to start alongside it`;
    }
    return `at:"${value}" is not a position \u2014 expected at:with, at:after, or a signed time such as at:-200ms, at:+100ms or at:with+150ms`;
  }
  function resolveSequence(members, timeline, warn) {
    const chain = { members, steps: [], warn };
    let warnedAboutTimeline = false;
    for (const [index, member] of members.entries()) {
      if (member.at === void 0) {
        chain.steps.push(unsequenced(member));
        continue;
      }
      if (!warnedAboutTimeline && PROGRESS_DRIVEN2.has(timeline)) {
        warnedAboutTimeline = true;
        warn(timelineRefusal(timeline));
      }
      chain.steps.push(place(chain, index));
    }
    return chain.steps;
  }
  function unsequenced(member) {
    return {
      delayExpr: delayExpression(member.delay, member.primitiveId),
      // Falls back to the same `0ms` the compiled `var()` does. An unreadable delay can only reach
      // here from a direct caller — `compile` screens its candidates with `isReadableTime`, and a
      // positional delay was already matched against the parser's own time pattern.
      delayMs: timeMs(member.delay ?? member.cascadeDelay ?? DELAY_FALLBACK) ?? 0,
      sequenced: false
    };
  }
  function place(chain, index) {
    const member = chain.members[index];
    const own = unsequenced(member);
    const parsed = parsePosition(member.at);
    if (!parsed.ok) {
      chain.warn(`"${member.name}": ${parsed.reason}`);
      return own;
    }
    const refused = refusalFor(chain, index);
    if (refused) {
      chain.warn(refused);
      return own;
    }
    if (member.delay !== void 0) {
      chain.warn(
        `"${member.name}" has both a positional delay (${member.delay}) and at:"${member.at}" \u2014 the delay is ignored, because at: positions the effect itself`
      );
    }
    return follow(chain, index, parsed.position, own);
  }
  function refusalFor(chain, index) {
    const member = chain.members[index];
    if (index === 0) {
      return `"${member.name}" is the first effect in the list, so at:"${member.at}" has nothing to be relative to \u2014 using its own delay instead`;
    }
    if (!member.positionable) {
      return `"${member.name}" is rendered in JavaScript and declares no "delay", so at:"${member.at}" cannot position it \u2014 it starts with the rest of the list`;
    }
    return null;
  }
  function follow(chain, index, position, own) {
    const previous = chain.members[index - 1];
    const anchor = chain.steps[index - 1];
    if (position.anchor === "start") {
      return {
        delayExpr: `${anchor.delayExpr}${position.term}`,
        delayMs: anchor.delayMs + position.offsetMs,
        sequenced: true
      };
    }
    if (isInfiniteRepeat(previous.repeat)) return refuseEndless(chain, index, own);
    const durationMs = timeMs(previous.duration ?? previous.cascadeDuration ?? "");
    if (durationMs === void 0) {
      return refuseUnmeasurable(chain, index, own);
    }
    const played = playbackExpression(
      durationExpression(previous.duration, previous.primitiveId),
      previous.repeat
    );
    return {
      delayExpr: `${anchor.delayExpr} + ${played}${position.term}`,
      delayMs: anchor.delayMs + durationMs * (repeatCount(previous.repeat) ?? 1) + position.offsetMs,
      sequenced: true
    };
  }
  function refuseUnmeasurable(chain, index, own) {
    const member = chain.members[index];
    const previous = chain.members[index - 1];
    chain.warn(
      `cannot start "${member.name}" relative to the end of "${previous.name}": "${previous.name}" has no readable duration, so it has no end to measure from \u2014 give it an explicit duration, or use at:with to start alongside it instead`
    );
    return own;
  }
  function refuseEndless(chain, index, own) {
    const member = chain.members[index];
    const previous = chain.members[index - 1];
    chain.warn(
      `cannot start "${member.name}" relative to the end of "${previous.name}": "${previous.name}" has repeat:infinite, so it never ends \u2014 use at:with to start alongside it, or give it a finite repeat count`
    );
    return own;
  }
  function timelineRefusal(timeline) {
    return `at: compiles to an animation-delay, and a "${timeline}" timeline is driven by scroll position rather than a clock, so it ignores one \u2014 position a scroll-driven effect with a range instead (the trailing tokens of data-kui-timeline, e.g. data-kui-timeline="${timeline} entry 0% cover 60%"). The delay still applies where the browser has no scroll-driven animations and the effect degrades to a clock.`;
  }
  function timeMs(value) {
    const ms = toMilliseconds(value, Number.NaN);
    return Number.isFinite(ms) ? ms : void 0;
  }
  function isReadableTime(value) {
    return timeMs(value) !== void 0;
  }

  // src/core/declarations.ts
  function emptyTracks() {
    return {
      names: [],
      keyframes: [],
      durations: [],
      delays: [],
      ends: [],
      easings: [],
      iterationCounts: [],
      directions: [],
      compositions: []
    };
  }
  function keyframesFor(entry) {
    const { preset } = entry.resolved;
    return entry.variant?.keyframes ?? [preset.keyframes ?? `kui-${preset.name}`];
  }
  function iterationCountProperty(presetName) {
    return `--kui-fx-${presetName}-iterations`;
  }
  function pushTrack(tracks, entry, step) {
    const { spec, resolved } = entry;
    const id = resolved.primitive.id;
    const duration = durationExpression(spec.duration, id);
    const delay = staggerDelay(step.delayExpr);
    const end = `${step.delayExpr} + ${playbackExpression(duration, spec.repeat)}`;
    const easing = easingValue(spec.easing, id);
    const iterations = spec.repeat ?? `var(${iterationCountProperty(resolved.preset.name)}, 1)`;
    const direction = directionValue(spec.yoyo);
    const composition = entry.composite ?? "replace";
    for (const name of keyframesFor(entry)) {
      tracks.names.push(gatedAnimationName(name, spec.gate));
      tracks.keyframes.push(name);
      tracks.durations.push(duration);
      tracks.delays.push(delay);
      tracks.ends.push(end);
      tracks.easings.push(easing);
      tracks.iterationCounts.push(iterations);
      tracks.directions.push(direction);
      tracks.compositions.push(composition);
    }
  }
  function pushTransitions(segments, owners, entry, warnings) {
    const { spec, resolved } = entry;
    const { preset, primitive } = resolved;
    for (const segment of preset.transitions ?? []) {
      const previousOwner = owners.get(segment.property);
      if (previousOwner !== void 0 && previousOwner !== preset.name) {
        warnings.push(
          `"${previousOwner}" and "${preset.name}" both transition ${segment.property} \u2014 "${preset.name}" wins (last in the list)`
        );
      }
      owners.set(segment.property, preset.name);
      const duration = segment.duration ?? durationExpression(spec.duration, primitive.id);
      const easing = segment.easing ?? easingValue(spec.easing, primitive.id);
      const delay = `var(--kui-tx-delay-${preset.name}, 0ms)`;
      segments.push(`${segment.property} ${duration} ${easing} ${delay}`);
    }
  }
  function declarationsFor(tracks, timeline) {
    if (tracks.names.length === 0) return {};
    const delays = timeline === "pin" ? pinnedDelays(tracks) : tracks.delays.map(wrapped);
    const declarations = {
      "animation-name": tracks.names.join(", "),
      "animation-duration": tracks.durations.join(", "),
      "animation-delay": delays.join(", "),
      "animation-timing-function": tracks.easings.join(", "),
      "animation-iteration-count": tracks.iterationCounts.join(", "),
      "animation-fill-mode": tracks.names.map(() => "both").join(", ")
    };
    if (tracks.directions.some((value) => value !== "normal")) {
      declarations["animation-direction"] = tracks.directions.join(", ");
    }
    if (tracks.compositions.some((value) => value !== "replace")) {
      declarations["animation-composition"] = tracks.compositions.join(", ");
    }
    return declarations;
  }
  function staggerDelay(base) {
    return `${base} + var(--kui-i, 0) * var(--kui-stagger, 0ms)`;
  }
  function wrapped(sum) {
    return `calc(${sum})`;
  }
  function pinnedDelays(tracks) {
    const ends = [...new Set(tracks.ends)];
    const span = ends.length === 1 ? ends[0] : `max(${ends.join(", ")})`;
    const head = `${span} + (var(--kui-stagger-count, 1) - 1) * var(--kui-stagger, 0ms)`;
    return tracks.delays.map((delay) => wrapped(`${delay} - var(--kui-progress, 0) * (${head})`));
  }
  function easingValue(easing, primitiveId) {
    if (!easing) return `var(${timingProperty(primitiveId, "ease")}, ease-out)`;
    return cssEasingValue(easing);
  }

  // src/core/host-facts.ts
  var RM_RANK = { shorten: 0, crossfade: 1, disable: 2 };
  function resolveDefaultActivation(claims) {
    const declared = claims.map((claim2) => claim2.defaultActivation);
    const firstWins = declared.find((value) => value !== void 0);
    const entrance = claims.findIndex((claim2) => claim2.phase === "entrance");
    if (firstWins === void 0 || entrance === -1) return firstWins;
    return declared[entrance] ?? "enter";
  }
  function mergeHostFacts(targets, defaultActivation) {
    let reducedMotion = "shorten";
    let activations;
    let timelines;
    const channels = /* @__PURE__ */ new Set();
    for (const { plan } of targets) {
      reducedMotion = strictestPolicy(reducedMotion, plan.reducedMotion);
      activations = intersect(activations, plan.supportedActivations);
      timelines = intersect(timelines, plan.supportedTimelines);
      for (const channel of plan.channels) channels.add(channel);
    }
    const mergedChannels = [...channels];
    for (const { plan } of targets) {
      plan.reducedMotion = reducedMotion;
      plan.supportedActivations = activations ?? [];
      plan.supportedTimelines = timelines ?? [];
      plan.defaultActivation = defaultActivation;
      plan.channels = mergedChannels;
    }
  }
  function resolvedPolicy(declared, authored, warnings) {
    if (authored === void 0) return declared;
    if (RM_RANK[authored] < RM_RANK[declared]) {
      warnings.push(
        `"rm:${authored}" is weaker than the "${declared}" these effects declare \u2014 keeping "${declared}" (rm: may only strengthen the reduced-motion policy)`
      );
      return declared;
    }
    return authored;
  }
  function intersect(accumulated, supported) {
    if (!accumulated) return [...supported];
    return accumulated.filter((value) => supported.includes(value));
  }
  function strictestPolicy(a, b) {
    return RM_RANK[b] > RM_RANK[a] ? b : a;
  }

  // src/core/compile.ts
  function channelsFor(entry) {
    const declared = entry.resolved.primitive.channels;
    if (!entry.variant?.channels) return declared;
    return [...declared, ...entry.variant.channels];
  }
  function authoredParams(entry) {
    return entry.variant?.params ?? entry.spec.params;
  }
  function schemaFor(entry) {
    const extra = entry.variant?.schema;
    if (!extra) return entry.resolved.primitive.parameters;
    return { ...entry.resolved.primitive.parameters, ...extra };
  }
  function compileTargets(parsed, registry, timeline) {
    const warnings = [...parsed.warnings];
    const { entries, unknown } = resolveEntries(parsed.specs, registry, warnings);
    if (entries.length === 0) {
      return { targets: [{ selector: "", scope: "self", plan: emptyPlan(unknown, []) }], warnings };
    }
    const sanitized = entries.map(
      (entry) => refusePlayback(refuseContainerGate(entry, warnings), timeline, warnings)
    );
    const steps = resolveSequence(sanitized.map(memberFor), timeline, (m) => warnings.push(m));
    const sequenced = sanitized.map((entry, index) => ({ ...entry, step: steps[index] }));
    const composedEntries = [];
    const targets = partitionByTarget(sequenced).map(({ selector, scope, entries: group }) => {
      const groupWarnings = [];
      const composed = resolveComposition(group, registry, groupWarnings);
      composedEntries.push(...composed);
      return { selector, scope, plan: buildPlan(composed, timeline, unknown, groupWarnings) };
    });
    const activationClaims = composedEntries.map((entry) => ({
      phase: phaseOf(entry),
      defaultActivation: entry.resolved.primitive.defaultActivation
    }));
    mergeHostFacts(targets, resolveDefaultActivation(activationClaims));
    const reducedMotion = resolvedPolicy(targets[0].plan.reducedMotion, parsed.rm, warnings);
    for (const target of targets) target.plan.reducedMotion = reducedMotion;
    return { targets, warnings };
  }
  function partitionByTarget(entries) {
    const byKey = /* @__PURE__ */ new Map();
    const order = [];
    for (const entry of entries) {
      const selector = entry.target ?? "";
      const scope = entry.scope ?? "self";
      const key = `${scope} ${selector}`;
      let group = byKey.get(key);
      if (!group) {
        group = { selector, scope, entries: [] };
        byKey.set(key, group);
        order.push(group);
      }
      group.entries.push(entry);
    }
    const hostIndex = order.findIndex((group) => group.selector === "");
    if (hostIndex > 0) {
      const [host] = order.splice(hostIndex, 1);
      order.unshift(host);
    }
    return order;
  }
  function emptyPlan(unknown, warnings) {
    return {
      fxNames: [],
      vars: {},
      declarations: {},
      keyframeNames: [],
      jsEffects: [],
      unknown,
      reducedMotion: "shorten",
      supportedActivations: [],
      supportedTimelines: [],
      channels: [],
      warnings
    };
  }
  function resolveEntries(specs, registry, warnings) {
    const entries = [];
    const unknown = [];
    for (const spec of specs) {
      const resolved = registry.resolve(spec.name);
      if (!resolved) {
        unknown.push(spec.name);
        warnUnknownEffect(spec.name, registry, warnings);
        continue;
      }
      entries.push(entryFor(spec, resolved, warnings));
    }
    return { entries, unknown };
  }
  function entryFor(spec, resolved, warnings) {
    const lifted = liftTarget(spec, resolved, warnings);
    const variant = resolved.primitive.variantFor?.(lifted.spec, (m) => warnings.push(m));
    const entry = variant ? { spec: lifted.spec, resolved, variant } : { spec: lifted.spec, resolved };
    if (lifted.target !== void 0) {
      entry.target = lifted.target;
      entry.scope = lifted.scope;
    }
    return entry;
  }
  function warnUnknownEffect(name, registry, warnings) {
    const hint = suggest(name, registry.names());
    const suffix = hint ? ` \u2014 did you mean "${hint}"?` : "";
    warnings.push(`unknown effect "${name}"${suffix}`);
  }
  function liftTarget(spec, resolved, warnings) {
    if (Object.hasOwn(resolved.primitive.parameters, "target")) return { spec };
    const target = spec.params.target;
    if (!target) return { spec };
    const rest = { ...spec.params };
    const authoredScope = rest.scope;
    delete rest.target;
    delete rest.scope;
    const stripped = { ...spec, params: rest };
    if (resolved.preset.requiresOwnSubtree) {
      warnings.push(
        `"${resolved.preset.name}" cannot be retargeted \u2014 its CSS reaches past the animated element itself, so "target:${target}" is dropped and it stays on the host`
      );
      return { spec: stripped };
    }
    const scope = authoredScope === "page" ? "page" : "self";
    return { spec: stripped, target, scope };
  }
  function refuseContainerGate(entry, warnings) {
    const { spec, resolved } = entry;
    if (resolved.primitive.renderer === "css-keyframes") return entry;
    if (!spec.gate?.wide && !spec.gate?.narrow) return entry;
    warnings.push(
      `"${spec.name}" ignores "wide:"/"narrow:" \u2014 container gates are not supported on JavaScript-rendered effects yet, so it runs unconditionally`
    );
    const { above, below } = spec.gate;
    const gate = above || below ? { above, below } : void 0;
    return { ...entry, spec: { ...spec, gate } };
  }
  function refusePlayback(entry, timeline, warnings) {
    const { spec, resolved } = entry;
    if (spec.repeat === void 0 && spec.yoyo === void 0) return entry;
    const { repeat, yoyo, warnings: raised } = resolvePlayback({
      name: resolved.preset.name,
      renderer: resolved.primitive.renderer,
      cloak: resolved.preset.cloak,
      timeline,
      repeat: spec.repeat,
      yoyo: spec.yoyo
    });
    warnings.push(...raised);
    return { ...entry, spec: { ...spec, repeat, yoyo } };
  }
  function phaseOf(entry) {
    if (entry.spec.repeat === "infinite") return "idle";
    const { preset } = entry.resolved;
    if (preset.phase) return preset.phase;
    if (preset.transitions?.length) return "state";
    return void 0;
  }
  function additivelyComposable(entry) {
    if (entry.resolved.primitive.renderer !== "css-keyframes") return false;
    if (entry.variant?.keyframes) return false;
    return additiveChannels(channelsFor(entry));
  }
  function resolveComposition(entries, registry, warnings) {
    if (entries.length <= 1) return entries;
    const claims = entries.map((e) => ({
      name: e.spec.name,
      channels: channelsFor(e),
      gate: e.spec.gate,
      phase: phaseOf(e),
      additive: additivelyComposable(e),
      delivery: e.resolved.preset.delivery,
      // "Writes `animation-name` inline" needs no declaration of its own: `buildPlan` sends exactly
      // the `css-keyframes` entries to `pushTrack`, and `declarations.ts` emits the longhands from
      // the tracks. Only the losing side of a delivery clobber has to say what it is.
      inlineAnimation: e.resolved.primitive.renderer === "css-keyframes"
    }));
    const conflicts = findConflicts(claims);
    const clobbers = deliveryClobbers(claims);
    if (conflicts.length === 0 && clobbers.length === 0) return entries;
    if (clobbers.length === 0) {
      const additive = additiveResolution(claims, conflicts);
      if (additive) return entries.map((e, i) => additive.has(i) ? { ...e, composite: "add" } : e);
    }
    const combo = registry.findCombo(entries.map((e) => e.spec.name));
    const remedy = combo ? `Use the "${combo.preset.name}" effect instead.` : "Apply them to nested elements, or register a combined effect.";
    const kept = entries[0].spec.name;
    const dropped = entries.slice(1).map((entry) => `"${entry.spec.name}"`);
    const loss = `Dropped ${dropped.join(", ")} \u2014 only "${kept}" will run.`;
    const diagnosis = [...conflicts.length > 0 ? [describeConflicts(conflicts)] : [], ...clobbers];
    warnings.push(`cannot compose: ${diagnosis.join("; ")}. ${loss} ${remedy}`);
    return [entries[0]];
  }
  function buildPlan(entries, timeline, unknown, warnings) {
    const plan = emptyPlan(unknown, warnings);
    const tracks = emptyTracks();
    const channels = /* @__PURE__ */ new Set();
    const transitionSegments = [];
    const transitionOwners = /* @__PURE__ */ new Map();
    let activations;
    let timelines;
    for (const entry of entries) {
      const { preset, primitive } = entry.resolved;
      const step = entry.step;
      plan.fxNames.push(preset.name);
      plan.reducedMotion = strictestPolicy(plan.reducedMotion, primitive.reducedMotion);
      activations = intersect(activations, primitive.supportedActivations);
      timelines = intersect(timelines, primitive.supportedTimelines);
      for (const channel of channelsFor(entry)) channels.add(channel);
      warnUnsupportedTimeline(preset.name, primitive.supportedTimelines, timeline, warnings);
      Object.assign(
        plan.vars,
        resolveParams(authoredParams(entry), schemaFor(entry), (m) => warnings.push(m))
      );
      if (primitive.renderer === "css-keyframes") pushTrack(tracks, entry, step);
      else plan.jsEffects.push(positioned(entry, step));
      pushTransitions(transitionSegments, transitionOwners, entry, warnings);
    }
    Object.assign(plan.declarations, declarationsFor(tracks, timeline));
    plan.keyframeNames = tracks.keyframes;
    if (transitionSegments.length > 0) plan.transition = transitionSegments.join(", ");
    plan.supportedActivations = activations;
    plan.supportedTimelines = timelines;
    plan.channels = [...channels];
    return plan;
  }
  function memberFor(entry) {
    const { spec, resolved } = entry;
    const { preset, primitive } = resolved;
    const authored = authoredParams(entry);
    return {
      name: preset.name,
      primitiveId: primitive.id,
      at: spec.at,
      delay: spec.delay,
      duration: spec.duration,
      cascadeDelay: cascadeValue(authored, preset, primitive.parameters, "delay"),
      cascadeDuration: cascadeValue(authored, preset, primitive.parameters, "duration"),
      repeat: spec.repeat,
      // A `css-keyframes` segment is always positionable — it compiles to an `animation-delay` and
      // the browser honours it. A JavaScript-rendered one is positionable only if it declares the
      // parameter, which is the single compile-time signal that it reads a delay at all.
      positionable: primitive.renderer === "css-keyframes" || Object.hasOwn(primitive.parameters, "delay")
    };
  }
  function cascadeValue(authored, preset, schema, name) {
    const candidates = [authored[name], preset.params?.[name], schema[name]?.default];
    return candidates.find((value) => value !== void 0 && isReadableTime(value));
  }
  function positioned(entry, step) {
    if (!step.sequenced) return entry;
    return { ...entry, sequencedDelayMs: step.delayMs };
  }
  function warnUnsupportedTimeline(name, supported, timeline, warnings) {
    if (supported.includes(timeline)) return;
    warnings.push(
      `"${name}" does not support timeline "${timeline}" (supports: ${supported.join(", ")})`
    );
  }

  // src/core/dom-watcher.ts
  var WORK_BUDGET = 100;
  function createDomWatcher(options) {
    const { root, onElementAdded, onElementRemoved, onAttributeChanged } = options;
    const schedule = options.schedule ?? scheduleFrame;
    const createObserver = options.createObserver ?? defaultObserverFactory2();
    const added = /* @__PURE__ */ new Set();
    const removed = /* @__PURE__ */ new Set();
    const changed = /* @__PURE__ */ new Set();
    let observer;
    let scheduled = false;
    let destroyed = false;
    function collect(record) {
      if (record.type === "attributes") {
        const target = asElement(record.target);
        if (target) changed.add(target);
        return;
      }
      for (const node of record.addedNodes) queueRoot(added, asElement(node));
      for (const node of record.removedNodes) queueRoot(removed, asElement(node));
    }
    function queueWork(records) {
      for (const record of records) collect(record);
      if (scheduled) return;
      scheduled = true;
      schedule(flush);
    }
    const install = whileAttached(root, onElementAdded);
    const recompile = whileAttached(root, onAttributeChanged);
    function flush() {
      scheduled = false;
      if (destroyed) return;
      let remaining = WORK_BUDGET;
      remaining = drain(removed, onElementRemoved, remaining);
      remaining = drain(added, install, remaining);
      drain(changed, recompile, remaining);
      if (added.size + removed.size + changed.size > 0) {
        scheduled = true;
        schedule(flush);
      }
    }
    return {
      watch() {
        if (!createObserver) return;
        destroyed = false;
        observer = createObserver(queueWork);
        observer.observe(root, {
          subtree: true,
          childList: true,
          attributes: true,
          // `ATTR.stagger` is watched for the same reason `ATTR.source` is: both spell a stagger
          // group, and an edit to either has to re-rank the group. Its absence here meant editing
          // `data-kui-stagger` produced no record at all — not a missed handler, no mutation.
          attributeFilter: [ATTR.source, ATTR.on, ATTR.timeline, ATTR.threshold, ATTR.stagger]
        });
      },
      destroy() {
        destroyed = true;
        observer?.disconnect();
        added.clear();
        removed.clear();
        changed.clear();
      }
    };
  }
  function whileAttached(root, work) {
    return (el) => {
      if (root.contains(el)) work(el);
    };
  }
  function queueRoot(roots, candidate) {
    if (!candidate) return;
    for (const root of roots) {
      if (root.contains(candidate)) return;
      if (candidate.contains(root)) roots.delete(root);
    }
    roots.add(candidate);
  }
  function drain(roots, callback, budget) {
    for (const root of roots) {
      if (budget === 0) break;
      roots.delete(root);
      callback(root);
      budget--;
    }
    return budget;
  }
  function asElement(node) {
    return node.nodeType === 1 ? node : null;
  }
  function scheduleFrame(callback) {
    const requestFrame = globalThis.requestAnimationFrame;
    if (typeof requestFrame === "function") requestFrame(() => callback());
    else queueMicrotask(callback);
  }
  function defaultObserverFactory2() {
    if (typeof MutationObserver === "undefined") return void 0;
    return (callback) => new MutationObserver(callback);
  }

  // src/core/element-config.ts
  var TIMELINES = /* @__PURE__ */ new Set(["time", "view", "scroll", "pointer", "pin"]);
  function readAttributes(el) {
    return {
      source: el.getAttribute(ATTR.source) ?? "",
      on: el.getAttribute(ATTR.on),
      timeline: el.getAttribute(ATTR.timeline),
      threshold: el.getAttribute(ATTR.threshold)
    };
  }
  function resolveConfig(attributes, parsed) {
    const rawTimeline = parsed.timeline ?? attributes.timeline ?? "time";
    const [head = "time", ...rest] = rawTimeline.trim().split(/\s+/);
    const longhand = parseActivationAttribute(attributes.on);
    const authored = parsed.activation ?? longhand.activation;
    return {
      activation: authored ?? "enter",
      activationAuthored: authored !== void 0,
      ...sourceFromLonghand({ parsed, longhand }),
      // Re-parsed rather than threaded down, and its warnings dropped: `parse.ts` has already
      // reported every one of them against this same element through `validateToggleActions`, so
      // forwarding them would double each diagnostic. There is no longhand attribute to merge with —
      // `actions:` refines `on:` and has only the inline spelling.
      ...parsed.actions === void 0 ? {} : { actions: parseToggleActions(parsed.actions) },
      timeline: TIMELINES.has(head) ? head : "time",
      range: rest.join(" "),
      threshold: parsed.threshold ?? attributes.threshold ?? "0%"
    };
  }
  function sourceFromLonghand({
    parsed,
    longhand
  }) {
    if (parsed.activation !== void 0 || longhand.from === void 0) return {};
    return { activationSource: longhand.from };
  }

  // src/core/js-effect-preparer.ts
  function sequencedTiming(entry, warn) {
    const timing3 = readEffectTiming(entry.spec, warn);
    if (entry.sequencedDelayMs !== void 0) timing3.delayMs = entry.sequencedDelayMs;
    return timing3;
  }
  function createJsEffectPreparer(options) {
    const { scheduler, rootResolver, capabilities, reporter, respectReducedMotion } = options;
    function contextFor(el, signal, ledger) {
      const doc = el.ownerDocument;
      return {
        doc,
        win: doc.defaultView ?? globalThis,
        scheduler,
        rootFor: rootResolver,
        capabilities,
        invalidate: () => scheduler.invalidate(),
        warn: (message) => reporter.warn(message, el),
        reducedMotion: respectReducedMotion && capabilities.reducedMotion,
        signal,
        style: ledger
      };
    }
    return {
      prepare({ el, plan, signal, ledger }) {
        const instances = [];
        if (plan.jsEffects.length === 0) return instances;
        const ctx = contextFor(el, signal, ledger);
        for (const entry of plan.jsEffects) {
          const { spec, resolved } = entry;
          const prepare = resolved.primitive.prepare;
          if (!prepare) continue;
          const warn = (message) => reporter.warn(message, el);
          const params = readEffectParams(
            { ...resolved.preset.params, ...authoredParams(entry) },
            resolved.primitive.parameters,
            warn,
            sequencedTiming(entry, warn)
          );
          try {
            instances.push(prepare(el, params, ctx));
          } catch (error) {
            reporter.warn(`"${spec.name}" failed to initialise: ${String(error)}`, el);
          }
        }
        return instances;
      }
    };
  }

  // src/core/scroll-scheduler.ts
  function defaultDeps() {
    const raf = globalThis.requestAnimationFrame;
    if (typeof raf !== "function") {
      return {
        requestFrame: (callback) => globalThis.setTimeout(callback, 16),
        cancelFrame: (handle) => globalThis.clearTimeout(handle)
      };
    }
    return {
      requestFrame: (callback) => raf(callback),
      cancelFrame: (handle) => globalThis.cancelAnimationFrame(handle)
    };
  }
  function createScrollScheduler(deps = defaultDeps()) {
    const entries = /* @__PURE__ */ new Map();
    let epoch = 0;
    let pending = null;
    function schedule(entry) {
      if (entry) entry.dirty = true;
      else for (const other of entries.values()) other.dirty = true;
      if (pending !== null) return;
      pending = deps.requestFrame(runFrame);
    }
    function runFrame() {
      pending = null;
      for (const entry of entries.values()) {
        if (!entry.dirty || entry.subscribers.size === 0) continue;
        entry.dirty = false;
        const frame = { metrics: entry.root.metrics(), epoch };
        for (const subscriber of [...entry.subscribers]) subscriber(frame);
      }
    }
    function attach(root) {
      const existing = entries.get(root.key);
      if (existing) return existing;
      const entry = { root, subscribers: /* @__PURE__ */ new Set(), detach: [], dirty: false };
      entry.detach.push(root.onScroll(() => schedule(entry)));
      entry.detach.push(
        root.onResize(() => {
          epoch++;
          schedule();
        })
      );
      entries.set(root.key, entry);
      return entry;
    }
    function release(entry) {
      if (entry.subscribers.size > 0) return;
      for (const detach of entry.detach) detach();
      entries.delete(entry.root.key);
    }
    return {
      subscribe(root, onFrame) {
        const entry = attach(root);
        entry.subscribers.add(onFrame);
        schedule(entry);
        return () => {
          entry.subscribers.delete(onFrame);
          release(entry);
        };
      },
      invalidate() {
        epoch++;
        schedule();
      },
      rootCount: () => entries.size,
      destroy() {
        if (pending !== null) deps.cancelFrame(pending);
        pending = null;
        for (const entry of entries.values()) {
          entry.subscribers.clear();
          for (const detach of entry.detach) detach();
        }
        entries.clear();
      }
    };
  }
  function windowScrollRoot(win) {
    return {
      key: "window",
      metrics: () => ({
        scrollTop: win.scrollY,
        scrollLeft: win.scrollX,
        viewportWidth: win.innerWidth,
        viewportHeight: win.innerHeight,
        viewportTop: 0,
        viewportLeft: 0
      }),
      onScroll: (handler) => listen(win, "scroll", handler),
      /*
       * The document's own height counts as a resize, not just the window's.
       *
       * `elementScrollRoot` has observed its element's size since it was written, for the reason
       * stated three doc comments down: "images loading, fonts swapping, a container changing size,
       * or content being inserted". Every one of those applies at least as strongly to the page
       * itself, and the page root was the one that only listened for `window.resize` — so on any
       * document with lazy-loaded media below the fold, every cached content offset silently drifted
       * by however much the page grew after it was measured, with no epoch bump to correct it.
       *
       * Measured on `demo/scroll.html` (32,000px of lazy screenshots): the horizontal track's stage
       * moved ~840px between page load and reaching it, which is a third of that effect's whole
       * scroll range. Nothing was wrong with the maths; the number it was doing the maths on was
       * taken before forty images existed.
       */
      onResize: (handler) => observeSize(win.document.documentElement, win, handler)
    };
  }
  function elementScrollRoot(el, win) {
    return {
      key: `el:${rootId(el)}`,
      metrics: () => {
        const rect = el.getBoundingClientRect();
        return {
          scrollTop: el.scrollTop,
          scrollLeft: el.scrollLeft,
          viewportWidth: el.clientWidth,
          viewportHeight: el.clientHeight,
          viewportTop: rect.top,
          viewportLeft: rect.left
        };
      },
      onScroll: (handler) => listen(el, "scroll", handler),
      // Window resize alone misses the cases that actually invalidate a nested scroller: images
      // loading, fonts swapping, a container changing size, or content being inserted.
      onResize: (handler) => observeSize(el, win, handler)
    };
  }
  function listen(target, type, handler) {
    target.addEventListener(type, handler, { passive: true });
    return () => target.removeEventListener(type, handler);
  }
  function observeSize(el, win, handler) {
    const stopWindow = listen(win, "resize", handler);
    if (typeof ResizeObserver === "undefined") return stopWindow;
    const observer = new ResizeObserver(handler);
    observer.observe(el);
    return () => {
      stopWindow();
      observer.disconnect();
    };
  }
  var nextRootId = 0;
  var rootIds = /* @__PURE__ */ new WeakMap();
  function rootId(el) {
    const existing = rootIds.get(el);
    if (existing) return existing;
    const id = String(++nextRootId);
    rootIds.set(el, id);
    return id;
  }
  function createRootResolver(options) {
    const { win } = options;
    const isScrollable = options.isScrollable ?? defaultIsScrollable(win);
    const windowRoot = windowScrollRoot(win);
    return (el) => {
      for (let node = el.parentElement; node; node = node.parentElement) {
        if (isScrollable(node)) return elementScrollRoot(node, win);
      }
      return windowRoot;
    };
  }
  var SCROLLABLE_OVERFLOW = /* @__PURE__ */ new Set(["auto", "scroll", "overlay"]);
  function defaultIsScrollable(win) {
    return (el) => {
      const style = win.getComputedStyle(el);
      const vertical = SCROLLABLE_OVERFLOW.has(style.overflowY) && el.scrollHeight > el.clientHeight;
      const horizontal = SCROLLABLE_OVERFLOW.has(style.overflowX) && el.scrollWidth > el.clientWidth;
      return vertical || horizontal;
    };
  }
  function clamp012(value) {
    if (Number.isNaN(value)) return 0;
    return Math.min(1, Math.max(0, value));
  }
  function createMeasureCache(measure) {
    let cachedEpoch = -1;
    let cached2;
    return {
      read(epoch) {
        if (cachedEpoch !== epoch || cached2 === void 0) {
          cached2 = measure();
          cachedEpoch = epoch;
        }
        return cached2;
      },
      clear() {
        cachedEpoch = -1;
        cached2 = void 0;
      }
    };
  }

  // src/core/reporter.ts
  function consoleReporter() {
    return {
      warn(message, subject) {
        if (subject === void 0) console.warn(`[kuinetic] ${message}`);
        else console.warn(`[kuinetic] ${message}`, subject);
      }
    };
  }
  function silentReporter() {
    return { warn() {
    } };
  }
  function collectingReporter() {
    const messages = [];
    return {
      messages,
      warn(message) {
        messages.push(message);
      }
    };
  }

  // src/core/instances.ts
  function animationsOf(el) {
    const getAnimations = el.getAnimations;
    return typeof getAnimations === "function" ? getAnimations.call(el) : [];
  }
  function ownedAnimationsOf(el, names) {
    return animationsOf(el).filter((animation) => {
      const name = animation.animationName;
      return typeof name === "string" && names.has(name);
    });
  }
  function flushComputedAnimationName(el) {
    return getComputedStyle(el).animationName;
  }
  function restartCssAnimation(el, ledger) {
    const name = el.style.getPropertyValue("animation-name");
    ledger.set("animation-name", "none");
    flushComputedAnimationName(el);
    ledger.set("animation-name", name);
  }
  function watchCompletion(animations, settle2) {
    if (animations.length === 0) {
      settle2();
      return;
    }
    void Promise.all(animations.map((a) => a.finished.catch(() => void 0))).then(() => settle2());
  }
  function createCssInstance(el, ledger, animationNames, scrubbed = false) {
    const ownedNames = new Set(animationNames);
    let settle2;
    let finished = new Promise((resolve) => {
      settle2 = resolve;
    });
    let activatedBefore = false;
    const watch = (animations) => watchCompletion(animations, () => settle2?.());
    function drive(rate) {
      if (scrubbed) return;
      const animations = ownedAnimationsOf(el, ownedNames);
      finished = new Promise((resolve) => {
        settle2 = resolve;
      });
      for (const animation of animations) {
        animation.playbackRate = rate;
        animation.play();
      }
      ledger.set("animation-play-state", "running");
      watch(animations);
    }
    return {
      // Attached unconditionally, including for a scrubbed instance. Whether control is *allowed*
      // here is a policy question about the element's timeline, not a capability question about this
      // instance — a scrubbed animation has a perfectly real playhead, it just belongs to the
      // scroller. Keeping that decision in one place (`InstanceState.progressDriven`, read by
      // `control.ts`) beats splitting it across both files and letting them drift.
      control: createCssControl(() => ownedAnimationsOf(el, ownedNames), ledger),
      activate() {
        finished = new Promise((resolve) => {
          settle2 = resolve;
        });
        if (scrubbed) {
          settle2?.();
          return;
        }
        let animations = ownedAnimationsOf(el, ownedNames);
        if (!activatedBefore) {
          restartCssAnimation(el, ledger);
          ledger.set("animation-play-state", "running");
          animations = ownedAnimationsOf(el, ownedNames);
        } else {
          const stale = animations.filter((a) => a.playState === "finished");
          if (stale.length > 0) {
            for (const animation of stale) animation.reverse();
          } else {
            ledger.set("animation-play-state", "running");
          }
        }
        activatedBefore = true;
        watch(animations);
      },
      play() {
        drive(1);
      },
      reverse() {
        drive(-1);
      },
      cancel() {
        for (const animation of ownedAnimationsOf(el, ownedNames)) animation.cancel();
        settle2?.();
      },
      finish() {
        for (const animation of ownedAnimationsOf(el, ownedNames)) animation.finish();
        settle2?.();
      },
      get finished() {
        return finished;
      },
      destroy() {
        settle2?.();
      }
    };
  }
  function continuousSetup(cleanup) {
    return { cleanup, continuous: true };
  }
  function cleanupOf(result) {
    if (result === void 0) return void 0;
    return typeof result === "function" ? result : result.cleanup;
  }
  function deferredInstance(setup) {
    let running;
    let settle2;
    let finished = Promise.resolve();
    const teardown = () => {
      cleanupOf(running)?.();
      running = void 0;
      settle2?.();
    };
    return createJsInstance({
      activate() {
        if (running !== void 0) teardown();
        running = setup();
        if (typeof running === "function" || "continuous" in running) return;
        const work = running.finished;
        finished = new Promise((resolve) => {
          settle2 = resolve;
        });
        void work.then(() => settle2?.());
      },
      cancel: teardown,
      finish() {
        if (typeof running === "object" && "finish" in running) running.finish?.();
        settle2?.();
      },
      destroy: teardown,
      finished: () => finished,
      // Only an explicit marker counts. A bare `Cleanup` deliberately does not — see
      // `ContinuousSetup` above for why the two cannot be told apart by shape.
      continuous: () => typeof running === "object" && "continuous" in running
    });
  }
  function deferPrepare(setup) {
    return (...args) => deferredInstance(() => setup(...args));
  }
  function createJsInstance(hooks) {
    let active = false;
    let run = 0;
    return {
      activate() {
        if (active) return;
        hooks.activate();
        active = true;
        const id = ++run;
        if (hooks.continuous?.()) return;
        void (hooks.finished?.() ?? Promise.resolve()).then(() => {
          if (id === run) active = false;
        });
      },
      cancel() {
        hooks.cancel?.();
        active = false;
      },
      finish() {
        hooks.finish?.();
      },
      get finished() {
        return hooks.finished?.() ?? Promise.resolve();
      },
      get continuous() {
        return hooks.continuous?.() ?? false;
      },
      destroy() {
        active = false;
        hooks.destroy();
      }
    };
  }

  // src/core/owned-styles.ts
  function createStyleLedger(el) {
    const style = el.style;
    const previous = /* @__PURE__ */ new Map();
    const authoredStyleAttribute = el.hasAttribute("style");
    function remember(property2) {
      if (previous.has(property2)) return;
      const existing = style.getPropertyValue(property2);
      previous.set(
        property2,
        existing === "" ? void 0 : { value: existing, priority: style.getPropertyPriority(property2) }
      );
    }
    return {
      set(property2, value) {
        remember(property2);
        style.setProperty(property2, value);
      },
      claim: remember,
      restore() {
        for (const [property2, previousValue] of previous) {
          if (previousValue === void 0) style.removeProperty(property2);
          else style.setProperty(property2, previousValue.value, previousValue.priority);
        }
        previous.clear();
        if (!authoredStyleAttribute && style.length === 0 && !el.getAttribute("style"))
          el.removeAttribute("style");
      },
      owned: () => [...previous.keys()]
    };
  }
  function createAttributeLedger(el) {
    const previous = /* @__PURE__ */ new Map();
    return {
      set(name, value) {
        if (!previous.has(name)) previous.set(name, el.getAttribute(name));
        el.setAttribute(name, value);
      },
      restore() {
        for (const [name, value] of previous) {
          if (value === null) el.removeAttribute(name);
          else el.setAttribute(name, value);
        }
        previous.clear();
      }
    };
  }
  function createLedgerSet(host) {
    const styles = /* @__PURE__ */ new Map();
    const attributes = /* @__PURE__ */ new Map();
    function memoise(cache, el, make) {
      let ledger = cache.get(el);
      if (!ledger) {
        ledger = make(el);
        cache.set(el, ledger);
      }
      return ledger;
    }
    function restoreOne(el) {
      styles.get(el)?.restore();
      attributes.get(el)?.restore();
    }
    return {
      style: (el) => memoise(styles, el, createStyleLedger),
      attributes: (el) => memoise(attributes, el, createAttributeLedger),
      restore() {
        for (const el of /* @__PURE__ */ new Set([...styles.keys(), ...attributes.keys()])) {
          if (el !== host) restoreOne(el);
        }
        restoreOne(host);
        styles.clear();
        attributes.clear();
      },
      elements() {
        const all = /* @__PURE__ */ new Set([host]);
        for (const el of styles.keys()) all.add(el);
        for (const el of attributes.keys()) all.add(el);
        return [...all];
      }
    };
  }

  // src/core/stagger-config.ts
  var FROM_KEYWORDS = /* @__PURE__ */ new Set(["start", "end", "center", "edges", "random"]);
  var ORDER_KEYS = /* @__PURE__ */ new Set(["from", "order"]);
  var SPREAD_KEY = "spread";
  var COLS_KEY = "cols";
  var AXIS_KEYS = /* @__PURE__ */ new Set(["axis", "along"]);
  var AXIS_VALUES = /* @__PURE__ */ new Set(["x", "y"]);
  var ORIGIN_RE = /^(\d+(?:\.\d+)?|\.\d+)\/(\d+(?:\.\d+)?|\.\d+)$/;
  var COLS_RE = /^\d{1,9}$/;
  var PAIR_RE = /^([a-zA-Z-]+):(.*)$/;
  var INDEX_RE = /^-?\d{1,9}$/;
  function parseStaggerTokens(value, warnings) {
    const config = { from: "start" };
    const seen = { from: false, spread: false, cols: false, along: false };
    for (const token of splitTopLevel(value, " ", warnings)) {
      const pair = PAIR_RE.exec(token);
      if (pair) applyStaggerPair(pair[1] ?? "", pair[2] ?? "", { config, seen, warnings });
      else config.step = keepFirstStep(config.step, token, warnings);
    }
    return { config, sawFrom: seen.from };
  }
  function applyStaggerPair(key, raw, state) {
    const slot = slotFor(key);
    if (slot === void 0) {
      state.warnings.push(
        `unrecognised key "${key}" in data-kui-stagger \u2014 expected a time step, "spread:", "cols:", "along:", "from:" or "order:"`
      );
      return;
    }
    if (claim(slot, raw, state, key)) ASSIGN[slot](raw, state, key);
  }
  function slotFor(key) {
    if (key === SPREAD_KEY) return "spread";
    if (key === COLS_KEY) return "cols";
    if (AXIS_KEYS.has(key)) return "along";
    if (ORDER_KEYS.has(key)) return "from";
    return void 0;
  }
  var ASSIGN = {
    spread: (raw, state) => {
      state.config.spread = raw.trim();
    },
    cols: (raw, state) => {
      state.config.cols = parseCols(raw, state.warnings);
    },
    along: (raw, state, key) => {
      state.config.along = parseAxis(raw, state.warnings, key);
    },
    from: (raw, state, key) => {
      state.config.from = parseFrom(raw, state.warnings, key);
    }
  };
  function claim(slot, raw, state, spelling) {
    if (state.seen[slot]) {
      state.warnings.push(`duplicate "${spelling}:" in data-kui-stagger \u2014 "${raw}" ignored`);
      return false;
    }
    state.seen[slot] = true;
    return true;
  }
  function parseCols(raw, warnings) {
    const value = raw.trim();
    if (value === "auto") return "auto";
    if (COLS_RE.test(value) && Number(value) > 0) return Number(value);
    warnings.push(`unrecognised "cols:${raw}" \u2014 expected a column count or "auto"`);
    return void 0;
  }
  function parseAxis(raw, warnings, key) {
    const value = raw.trim();
    if (AXIS_VALUES.has(value)) return value;
    warnings.push(`unrecognised "${key}:${raw}" \u2014 expected x or y`);
    return void 0;
  }
  function resolveStaggerConfig(attribute, source, warnings = []) {
    const inline = inlineGroupKeys(source);
    if (attribute === null && inline === void 0) return void 0;
    const { config: longhand, sawFrom } = parseStaggerTokens(attribute ?? "", warnings);
    return oneStepMode(screenStep(mergeInline(longhand, sawFrom, inline ?? {}, warnings), warnings), warnings);
  }
  function oneStepMode(config, warnings) {
    if (config.spread === void 0 || config.step === void 0) return config;
    warnings.push(
      `stagger step "${config.step}" is ignored \u2014 "spread:${config.spread}" already budgets the whole group, and the step is what it divides out`
    );
    const budgeted = { ...config };
    delete budgeted.step;
    return budgeted;
  }
  function inlineGroupKeys(source) {
    if (!hasGroupKey(source)) return void 0;
    const { cascade, spread, order, cols, along } = parse(source);
    const keys = { cascade, spread, order, cols, along };
    return Object.values(keys).some((value) => value !== void 0) ? keys : void 0;
  }
  function screenStep(config, warnings) {
    const screened = { ...config };
    if (!keepValue("step", config.step, warnings)) delete screened.step;
    if (!keepValue("spread", config.spread, warnings)) delete screened.spread;
    return screened;
  }
  function keepValue(label, value, warnings) {
    if (value === void 0) return false;
    if (isSafeCssValue(value)) return true;
    warnings.push(`stagger ${label} "${value}" contains disallowed CSS syntax \u2014 ignored`);
    return false;
  }
  function mergeInline(longhand, sawFrom, inline, warnings) {
    const config = { ...longhand };
    if (inline.cascade !== void 0) {
      warnOverride("stagger step", longhand.step, inline.cascade, warnings);
      config.step = inline.cascade;
    }
    if (inline.spread !== void 0) {
      warnOverride("stagger budget", longhand.spread, inline.spread, warnings);
      config.spread = inline.spread;
    }
    mergeInlineGrid(config, longhand, inline, warnings);
    if (inline.order !== void 0) {
      const order = parseFrom(inline.order, warnings, "order");
      warnOverride("stagger order", sawFrom ? longhand.from : void 0, order, warnings);
      config.from = order;
    }
    return config;
  }
  function mergeInlineGrid(config, longhand, inline, warnings) {
    if (inline.cols !== void 0) {
      const cols = parseCols(inline.cols, warnings);
      warnOverride("stagger columns", longhand.cols, cols, warnings);
      if (cols !== void 0) config.cols = cols;
    }
    if (inline.along !== void 0) {
      const along = parseAxis(inline.along, warnings, "along");
      warnOverride("stagger axis", longhand.along, along, warnings);
      if (along !== void 0) config.along = along;
    }
  }
  function hasGroupKey(source) {
    return GROUP_KEY_PREFIXES.some((prefix) => source.includes(prefix));
  }
  var GROUP_KEY_PREFIXES = [
    "cascade:",
    "spread:",
    "order:",
    "cols:",
    "along:"
  ];
  function warnOverride(label, previous, next, warnings) {
    if (previous === void 0 || next === void 0 || previous === next) return;
    warnings.push(
      `conflicting ${label}: data-kui-stagger says "${String(previous)}", data-kui says "${String(next)}" \u2014 data-kui wins`
    );
  }
  function keepFirstStep(current, token, warnings) {
    if (current === void 0) return token;
    warnings.push(`extra token "${token}" in data-kui-stagger (expected one time step)`);
    return current;
  }
  function parseFrom(raw, warnings, key = "from") {
    const value = raw.trim();
    if (FROM_KEYWORDS.has(value)) return value;
    if (INDEX_RE.test(value)) return Number(value);
    const origin = ORIGIN_RE.exec(value);
    if (origin) return { x: clamp013(Number(origin[1]), value, warnings), y: clamp013(Number(origin[2]), value, warnings) };
    warnings.push(
      `unrecognised "${key}:${raw}" \u2014 expected start, end, center, edges, random, a child index, or an "x/y" point in a grid`
    );
    return "start";
  }
  function clamp013(value, source, warnings) {
    if (value >= 0 && value <= 1) return value;
    warnings.push(`stagger order "${source}" is outside the grid (0 to 1 on each axis) \u2014 clamped`);
    return Math.min(Math.max(value, 0), 1);
  }

  // src/core/stagger.ts
  var RANK_PRECISION = 1e3;
  var RANDOM_SALT = 2654435761;
  var COUNT_SALT = 2246822507;
  var MIX_A = 569420461;
  var MIX_B = 1935289751;
  function resolveStep(config, maxRank) {
    if (config.spread === void 0) return config.step;
    if (maxRank <= 0) return "0ms";
    return `calc((${config.spread}) / ${String(maxRank)})`;
  }
  function staggerRanks(count, from, warnings = [], layout) {
    if (count <= 0) return [];
    if (from === "random") return randomRanks(count);
    if (layout) return gridRanks(count, from, layout, warnings);
    if (typeof from === "object") {
      warnings.push(
        `stagger order "${String(from.x)}/${String(from.y)}" is a point in a grid, but this group has no "cols:" \u2014 add one, or name an edge with start/end/center/edges`
      );
      return staggerRanks(count, "start", warnings);
    }
    const last = count - 1;
    if (from === "edges") {
      return Array.from({ length: count }, (_, index) => Math.min(index, last - index));
    }
    const origin = originOf(from, last, warnings);
    return Array.from({ length: count }, (_, index) => Math.floor(Math.abs(index - origin)));
  }
  function originOf(from, last, warnings) {
    if (from === "start") return 0;
    if (from === "end") return last;
    if (from === "center") return last / 2;
    return clampIndex(from, last, warnings);
  }
  function clampIndex(index, last, warnings) {
    if (index < 0 || index > last) {
      warnings.push(`stagger order "${String(index)}" is outside the group (0 to ${String(last)}) \u2014 clamped`);
    }
    return Math.min(Math.max(index, 0), last);
  }
  function gridRanks(count, from, layout, warnings) {
    const cols = Math.min(Math.max(1, layout.cols), count);
    const rows = Math.ceil(count / cols);
    if (from === "edges") {
      const inward = gridRanks(count, "center", layout, warnings);
      let furthest = 0;
      for (const rank of inward) furthest = Math.max(furthest, rank);
      return inward.map((rank) => round2(furthest - rank));
    }
    const origin = gridOrigin(from, { cols, rows, last: count - 1 }, warnings);
    return Array.from({ length: count }, (_, index) => {
      const dx = index % cols - origin.x;
      const dy = Math.floor(index / cols) - origin.y;
      if (layout.along === "x") return round2(Math.abs(dx));
      if (layout.along === "y") return round2(Math.abs(dy));
      return round2(Math.hypot(dx, dy));
    });
  }
  function gridOrigin(from, grid, warnings) {
    const { cols, rows, last } = grid;
    if (typeof from === "object") return { x: from.x * (cols - 1), y: from.y * (rows - 1) };
    if (from === "start") return { x: 0, y: 0 };
    if (from === "end") return { x: cols - 1, y: rows - 1 };
    if (from === "center") return { x: (cols - 1) / 2, y: (rows - 1) / 2 };
    const index = clampIndex(from, last, warnings);
    return { x: index % cols, y: Math.floor(index / cols) };
  }
  function round2(value) {
    return Math.round(value * RANK_PRECISION) / RANK_PRECISION;
  }
  function randomRanks(count) {
    const order = Array.from({ length: count }, (_, index) => index);
    order.sort((a, b) => scatterKey(a, count) - scatterKey(b, count) || a - b);
    const ranks = new Array(count);
    for (const [rank, index] of order.entries()) ranks[index] = rank;
    return ranks;
  }
  function scatterKey(index, count) {
    let hash = (Math.imul(index, RANDOM_SALT) ^ Math.imul(count, COUNT_SALT)) >>> 0;
    hash ^= hash >>> 16;
    hash = Math.imul(hash, MIX_A) >>> 0;
    hash ^= hash >>> 15;
    hash = Math.imul(hash, MIX_B) >>> 0;
    hash ^= hash >>> 15;
    return hash >>> 0;
  }
  function indexStaggerGroup(group, reporter) {
    const warnings = [];
    const ledgers = reopenLedger(group);
    const config = resolveStaggerConfig(
      group.getAttribute(ATTR.stagger),
      group.getAttribute(ATTR.source) ?? "",
      warnings
    ) ?? { from: "start" };
    const children = animatedChildren(group);
    const ranks = staggerRanks(children.length, config.from, warnings, resolveLayout(config, children, warnings));
    let maxRank = 0;
    for (const [index, child] of children.entries()) {
      const rank = ranks[index] ?? 0;
      ledgers.style(child).set("--kui-i", String(rank));
      GROUP_OF_CHILD.set(child, group);
      if (rank > maxRank) maxRank = rank;
    }
    const step = resolveStep(config, maxRank);
    if (step) ledgers.style(group).set("--kui-stagger", step);
    ledgers.style(group).set("--kui-stagger-count", String(round2(maxRank + 1)));
    for (const warning of warnings) reporter?.warn(warning, group);
  }
  var GROUP_LEDGERS = /* @__PURE__ */ new WeakMap();
  var GROUP_OF_CHILD = /* @__PURE__ */ new WeakMap();
  function restageAfterRemoval(removed, reporter) {
    const groups = /* @__PURE__ */ new Set();
    for (const el of removed) {
      const group = GROUP_OF_CHILD.get(el);
      if (group) groups.add(group);
    }
    for (const group of groups) indexStaggerGroup(group, reporter);
  }
  function reopenLedger(group) {
    GROUP_LEDGERS.get(group)?.restore();
    const ledgers = createLedgerSet(group);
    GROUP_LEDGERS.set(group, ledgers);
    return ledgers;
  }
  function releaseStaggerGroup(group) {
    GROUP_LEDGERS.get(group)?.restore();
    GROUP_LEDGERS.delete(group);
  }
  function releaseStagger(root) {
    const selector = `[${ATTR.stagger}], [${ATTR.source}]`;
    if (root instanceof Element && root.matches(selector)) releaseStaggerGroup(root);
    for (const el of root.querySelectorAll(selector)) releaseStaggerGroup(el);
  }
  function restageAround(el, reporter) {
    restageOne(el, reporter);
    const parent = el.parentElement;
    if (parent) restageOne(parent, reporter);
  }
  function restageOne(el, reporter) {
    if (declaresGroup(el)) indexStaggerGroup(el, reporter);
    else releaseStaggerGroup(el);
  }
  function indexTargetGroup(host, matches, ledgers, reporter) {
    const warnings = [];
    const config = resolveStaggerConfig(
      host.getAttribute(ATTR.stagger),
      host.getAttribute(ATTR.source) ?? "",
      warnings
    ) ?? { from: "start" };
    const maxRank = rankBuckets(bucketByParent(matches), config, ledgers, warnings);
    const step = resolveStep(config, maxRank);
    if (step) ledgers.style(host).set("--kui-stagger", step);
    ledgers.style(host).set("--kui-stagger-count", String(round2(maxRank + 1)));
    for (const warning of warnings) reporter?.warn(warning, host);
  }
  function bucketByParent(matches) {
    const byParent = /* @__PURE__ */ new Map();
    for (const match of matches) {
      const siblings = byParent.get(match.parentElement);
      if (siblings) siblings.push(match);
      else byParent.set(match.parentElement, [match]);
    }
    return byParent;
  }
  function rankBuckets(byParent, config, ledgers, warnings) {
    let maxRank = 0;
    for (const siblings of byParent.values()) {
      const layout = resolveLayout(config, siblings, warnings);
      const ranks = staggerRanks(siblings.length, config.from, warnings, layout);
      for (const [index, match] of siblings.entries()) {
        const rank = ranks[index] ?? 0;
        ledgers.style(match).set("--kui-i", String(rank));
        if (rank > maxRank) maxRank = rank;
      }
    }
    return maxRank;
  }
  function resolveLayout(config, members, warnings) {
    if (config.cols === void 0) {
      if (config.along !== void 0) {
        warnings.push(
          `"along:${config.along}" names an axis of a grid this group has not declared \u2014 add "cols:" (a column count, or "auto")`
        );
      }
      return void 0;
    }
    const cols = config.cols === "auto" ? measureColumns(members, warnings) : config.cols;
    if (cols === void 0) return void 0;
    return config.along === void 0 ? { cols } : { cols, along: config.along };
  }
  function measureColumns(members, warnings) {
    if (members.length < 2) return 1;
    const lefts = [];
    let laidOut = false;
    for (const member of members) {
      const box = member.getBoundingClientRect();
      if (box.width !== 0 || box.height !== 0) laidOut = true;
      lefts.push(box.left);
    }
    if (!laidOut) {
      warnings.push(
        `"cols:auto" could not measure this group \u2014 none of its children have been laid out yet (display:none, or detached), so the stagger falls back to DOM order`
      );
      return void 0;
    }
    const direction = Math.sign(lefts[1] - lefts[0]);
    if (direction === 0) return 1;
    let cols = 1;
    for (let index = 1; index < lefts.length; index++) {
      if (Math.sign(lefts[index] - lefts[index - 1]) !== direction) break;
      cols = index + 1;
    }
    return cols;
  }
  function animatedChildren(group) {
    const children = [];
    for (const child of group.children) {
      if (child.hasAttribute(ATTR.source)) children.push(child);
    }
    return children;
  }
  function applyStagger(root, reporter) {
    const selector = `[${ATTR.stagger}], [${ATTR.source}]`;
    if (root instanceof Element && root.matches(selector)) restageOne(root, reporter);
    for (const group of root.querySelectorAll(selector)) restageOne(group, reporter);
  }
  function declaresGroup(el) {
    if (el.hasAttribute(ATTR.define)) return false;
    if (el.hasAttribute(ATTR.stagger)) return true;
    return resolveStaggerConfig(null, el.getAttribute(ATTR.source) ?? "") !== void 0;
  }

  // src/core/style-plan.ts
  function planStyles(input) {
    const { plan, config, capabilities, respectReducedMotion } = input;
    const reduce = respectReducedMotion && capabilities.reducedMotion;
    const { scrubbed, useNativeTimeline } = timelineMode(plan, config, capabilities);
    const properties = { ...plan.vars, ...plan.declarations };
    Object.assign(properties, transitionProperty(plan));
    Object.assign(properties, timelineProperties(config, capabilities, useNativeTimeline));
    const hasCssAnimation = Object.keys(plan.declarations).length > 0;
    const elementHasCssAnimation = input.elementHasCssAnimation ?? hasCssAnimation;
    const gate = resolveGate({
      useNativeTimeline,
      scrubbed: scrubbed && elementHasCssAnimation,
      reduce,
      activation: config.activation,
      // JS effects are gated too. They emit no `animation` declaration, so only the play-state
      // write is skipped — the activation itself still has to be bound, or `on:enter` and
      // `on:click` would silently do nothing for every pinned, dragged, or morphing element.
      hasWork: elementHasCssAnimation || plan.jsEffects.length > 0,
      hasCssAnimation,
      // A browser lacking standalone translate/rotate/scale support silently ignores any
      // `@keyframes` step written in those properties — the animation never visibly completes. An
      // effect deferred on that promise would sit paused (or, for an entrance reveal, invisible)
      // forever, so it must reach its final state immediately instead, the same fail-open rule
      // already applied under reduced motion.
      unsupportedTransform: needsIndividualTransforms(plan.channels, capabilities)
    });
    if (gate === "deferred" || gate === "scrubbed") properties["animation-play-state"] = "paused";
    return {
      properties,
      attributes: {
        [ATTR.normalized]: plan.fxNames.join(" "),
        [ATTR.rm]: plan.reducedMotion,
        [ATTR.state]: "ready"
      },
      gate,
      activation: gate === "deferred" ? effectiveActivation(config) : null
    };
  }
  function timelineMode(plan, config, capabilities) {
    const scrubbed = config.timeline === "pin" && plan.supportedTimelines.includes("pin");
    const useNativeTimeline = !scrubbed && supportsTimeline(config.timeline, capabilities) && plan.supportedTimelines.includes(config.timeline);
    return { scrubbed, useNativeTimeline };
  }
  function transitionProperty(plan) {
    return plan.transition ? { "--kui-transition": plan.transition } : {};
  }
  function timelineProperties(config, capabilities, useNativeTimeline) {
    if (!useNativeTimeline) return {};
    const properties = {
      "animation-timeline": config.timeline === "scroll" ? "scroll()" : "view()"
    };
    if (capabilities.animationRange) {
      properties["animation-range"] = config.range || (config.timeline === "scroll" ? "0% 100%" : "entry 0% cover 60%");
    }
    return properties;
  }
  function resolveGate(input) {
    if (input.useNativeTimeline) return "native-timeline";
    if (input.scrubbed) return "scrubbed";
    if (!input.hasWork) return "immediate";
    if (input.reduce || startKindOf(input.activation) === "immediate" || input.unsupportedTransform) {
      return "immediate";
    }
    return "deferred";
  }
  function needsIndividualTransforms(channels, capabilities) {
    if (capabilities.individualTransforms) return false;
    return channels.some((c) => c === "translate" || c === "rotate" || c === "scale");
  }
  function supportsTimeline(timeline, capabilities) {
    if (timeline === "view") return capabilities.viewTimeline;
    if (timeline === "scroll") return capabilities.scrollTimeline;
    return false;
  }
  function effectiveActivation(config) {
    const observed = "enter";
    if (config.timeline !== "time" && startKindOf(config.activation) === "manual") return observed;
    return config.activation;
  }

  // src/core/animator.ts
  var CLOAK_WATCHDOG_MS = 3e3;
  function fingerprintOf(attributes) {
    return [attributes.source, attributes.on, attributes.timeline, attributes.threshold].join("\0");
  }
  function isElementNode(node) {
    return typeof Element !== "undefined" && node instanceof Element;
  }
  var Animator = class {
    registry;
    capabilities;
    /**
     * Public alongside `registry` and `capabilities`, and for the same reason: `control()` is a free
     * function in its own module (mirroring `play()`), and an author-facing diagnostic it emits has
     * to reach the same sink every other diagnostic on this animator does. Routing it through a
     * second, private channel would mean `consoleReporter()` silenced half the library's warnings.
     */
    reporter;
    root;
    /**
     * Author-defined bundles found in this animator's root. Per-animator, not per-module: two
     * animators on two roots must not see each other's definitions.
     */
    bundles;
    binder;
    scheduler;
    rootResolver;
    jsEffectPreparer;
    respectReducedMotion;
    shouldObserve;
    /** Runtime truth. Attributes are for CSS and debugging; they make a poor state machine. */
    states = /* @__PURE__ */ new WeakMap();
    /** Iterable lifecycle index; the WeakMap remains the fast state lookup. */
    liveElements = /* @__PURE__ */ new Set();
    /**
     * Which run is current for one element's `InstanceState`, so a completion that resolves after
     * being superseded can tell it is stale even when `status` and `direction` do not say so.
     *
     * `state.direction` cannot serve as that identifier on its own — it only ever holds `'forward'`
     * or `'reverse'`, so an element whose activation flips back and forth (a hover-driven card flip,
     * `pointerenter`/`pointerleave` firing repeatedly) revisits the same direction many times over
     * its life. A cancelled run's completion settling late would then match a much later run headed
     * the same way, by coincidence rather than by being the same run. Keyed on `InstanceState` rather
     * than `Element` so a `release()`-then-reinstall — a fresh state object — starts with no
     * history, the same reason `settleWhen` already re-checks `this.states.get(el) !== state`.
     */
    currentRun = /* @__PURE__ */ new WeakMap();
    /**
     * Whether the element's current run has a settle gate that will eventually write its final
     * status, or whether nothing is ever going to report on it.
     *
     * `settleWhen` declines to arm a gate when every instance it was handed is `continuous` — see
     * the reasoning there, which is right: a pin that is still pinned should read `running`. But
     * "nobody will ever write this status" was left as an unrecorded fact known only inside that
     * one early return, and `cancel()` had no way to ask. So a cancelled pin kept `status =
     * 'running'` for the rest of the element's life and `activate()`'s own `running` guard locked it
     * out of every future activation. Measured on `<div data-kui="pin-section">`, the documented
     * form: cancel left `data-kui-state="running"`, and the next `activate()` emitted no `kui:start`
     * at all.
     *
     * Recorded here rather than re-derived in `cancel()` from `state.instances`, because the two
     * would not be asking the same question. `settleWhen` decides on the instances that actually
     * *started* this run; an instance whose setup threw is excluded there, and by cancel time it is
     * indistinguishable from a timed one (`continuous` reads from the setup result, which a failed
     * or torn-down instance no longer has). The gate's own answer is the only one that matches the
     * gate's own behaviour.
     *
     * Keyed on `InstanceState` for the same reason `currentRun` is: a `release()`-then-reinstall
     * mints a fresh state object, which must start with no history.
     */
    settleArmed = /* @__PURE__ */ new WeakMap();
    /** Built lazily by `watch()` when not injected, so nothing observes until `start()` needs it. */
    domWatcher;
    /**
     * Built lazily by `watchGates()`, and only for an element carrying a viewport gate on a
     * JavaScript-rendered effect — see `applyViewportGates` for why that is the only case that needs
     * one. Stays `undefined` on a page whose gates are all on CSS-rendered effects, which binds no
     * `MediaQueryList` listener anywhere.
     */
    gateWatcher;
    started = false;
    constructor(options = {}) {
      const resolved = resolveCollaborators(options);
      this.registry = resolved.registry;
      this.bundles = new BundleTable(resolved.registry);
      this.capabilities = resolved.capabilities;
      this.root = resolved.root;
      this.reporter = resolved.reporter;
      this.binder = resolved.binder;
      this.scheduler = resolved.scheduler;
      this.rootResolver = resolved.rootResolver;
      this.jsEffectPreparer = resolved.jsEffectPreparer;
      this.domWatcher = resolved.domWatcher;
      this.respectReducedMotion = resolved.respectReducedMotion;
      this.shouldObserve = resolved.shouldObserve;
    }
    /**
     * Explicit entry point. Importing the library never touches the document, which keeps SSR,
     * hydration, and tests deterministic.
     *
     * @complexity O(n) time in the number of elements scanned.
     * @overallScore 100
     */
    start() {
      if (this.started) return this;
      this.started = true;
      const watchdog = globalThis.setTimeout(() => this.uncloak(), CLOAK_WATCHDOG_MS);
      try {
        this.scan(this.root);
        if (this.shouldObserve) this.watch();
      } finally {
        globalThis.clearTimeout(watchdog);
        this.uncloak();
      }
      return this;
    }
    /**
     * Process every unprocessed element in a subtree, including the root.
     *
     * `querySelectorAll` excludes the root, but an inserted subtree very often carries the
     * attribute on its top node — skipping it silently drops those animations.
     *
     * Two passes, and the order is the feature. Every `data-kui-define` in the subtree is registered
     * before any element in it is compiled, so a `<template>` at the bottom of the document is
     * already known to the card at the top that names it. Making forward references work by
     * construction rather than by handling is the point — see `core/bundles.ts`.
     *
     * @param root - Subtree to scan. Defaults to the animator's root.
     * @complexity O(n) time in the subtree size; O(1) extra space.
     * @overallScore 100
     */
    scan(root = this.root) {
      if (!root) return this;
      const defined = this.bundles.collect(root, this.reporter);
      const selector = `[${ATTR.source}]`;
      if (isElementNode(root) && root.matches(selector)) this.process(root);
      for (const el of root.querySelectorAll(selector)) this.process(el);
      applyStagger(root, this.reporter);
      if (defined > 0 && root !== this.root) this.retryPending();
      return this;
    }
    /**
     * Recompile every element that stalled on a name the library did not know.
     *
     * `pending` is stamped for any unresolved name, not only an undefined bundle, so this can retry
     * an element that will fail again. That is deliberate: the alternative is an index of which
     * element is waiting on which name, and the cost of being wrong here is one wasted compile on a
     * page that already has a warning about it.
     *
     * @complexity O(p) time in the number of pending elements.
     * @overallScore 100
     */
    retryPending() {
      for (const el of this.root.querySelectorAll(`[${ATTR.state}="pending"]`)) this.process(el);
    }
    /**
     * Compile and install one element's effects, recompiling if its attribute changed.
     *
     * @param el - Element carrying `data-kui`.
     * @complexity O(e) time in the number of composed effects; O(e) space for the plan.
     * @overallScore 100
     */
    process(el) {
      if (el.hasAttribute(ATTR.define)) return;
      const attributes = readAttributes(el);
      const fingerprint = fingerprintOf(attributes);
      const existing = this.states.get(el);
      if (existing?.fingerprint === fingerprint) return;
      if (existing) this.release(el);
      const parsed = this.bundles.expand(parse(attributes.source));
      const config = resolveConfig(attributes, parsed);
      const document2 = compileTargets(parsed, this.registry, config.timeline);
      const facts = document2.targets[0].plan;
      this.applyViewportGates(el, document2);
      config.activation = this.resolveActivation(el, config, facts);
      this.reportCompiled(el, document2);
      if (document2.targets.every((target) => target.plan.fxNames.length === 0)) {
        el.setAttribute(ATTR.state, facts.unknown.length > 0 ? "pending" : "failed");
        return;
      }
      this.install({ el, fingerprint, parsed, config, document: document2 });
    }
    /**
     * Report everything a finished compile has to say about one element.
     *
     * Three sources, one place. The third is separate from the plan's own warnings because `compile`
     * is pure and environment-free by design — it is handed a registry and a timeline, never the
     * browser it is running in. "This browser cannot render that channel" is only answerable here,
     * where the detected capabilities live, and `targets[0]`'s channel union is the merged one, so it
     * runs once per element rather than once per `target:` group.
     *
     * @complexity O(w) time in the total warning count; O(1) space.
     * @overallScore 100
     */
    reportCompiled(el, document2) {
      for (const warning of document2.warnings) this.reporter.warn(warning, el);
      for (const target of document2.targets) {
        for (const warning of target.plan.warnings) this.reporter.warn(warning, el);
      }
      const channels = document2.targets[0].plan.channels;
      for (const warning of unsupportedChannelWarnings(channels, this.capabilities)) {
        this.reporter.warn(warning, el);
      }
    }
    /**
     * Apply a compiled plan and bind its activation.
     *
     * @complexity O(e) time in composed effects; O(e) space for retained cleanups.
     * @overallScore 100
     */
    /**
     * Choose the activation, letting a primitive's preference fill in only when the author named
     * none, and reporting whatever looks wrong about one the author did name.
     *
     * Declared capability metadata was previously never checked anywhere, which made
     * `supportedActivations` documentation rather than a contract. The checks themselves live in
     * `activation.ts`'s diagnostics half — they grew a good deal when the list opened, and they
     * decide nothing, so keeping them here would have made this class the place where "which
     * activation" and "is that a real event" were the same paragraph.
     *
     * @complexity O(a) time in supported activations; O(1) space.
     * @overallScore 100
     */
    resolveActivation(el, config, plan) {
      if (!config.activationAuthored) return plan.defaultActivation ?? config.activation;
      warnAboutActivation({
        el,
        spec: resolveActivationSpec(config.activation),
        supported: plan.supportedActivations,
        reporter: this.reporter
      });
      return config.activation;
    }
    /**
     * Resolve the viewport gates (`above:` / `below:`) on this element's JavaScript-rendered effects.
     *
     * CSS-rendered segments are deliberately absent from this method. Their gate is compiled into the
     * `animation-name` declaration as a `var()` the browser re-resolves on every resize with no
     * script involved (see `core/breakpoints.ts`), which is the entire reason this feature does not
     * need the teardown machinery `gsap.matchMedia()` is built around. A JavaScript-rendered effect
     * has no `animation-name` for a stylesheet to neutralise, so it is the one case that has to be
     * decided here — and, having been decided once, has to be re-decided when the viewport crosses
     * the breakpoint it was decided at.
     *
     * @complexity O(e) time in JS-rendered effects; O(b) space, bounded by the scale's five names.
     * @overallScore 100
     */
    applyViewportGates(el, document2) {
      const gates = document2.targets.flatMap((target) => target.plan.jsEffects).map((entry) => entry.spec.gate).filter((gate) => gate !== void 0);
      if (gates.length === 0) {
        this.gateWatcher?.unwatch(el);
        return;
      }
      const win = el.ownerDocument.defaultView ?? void 0;
      for (const target of document2.targets) {
        target.plan.jsEffects = target.plan.jsEffects.filter((entry) => gateMatches(entry.spec.gate, win));
      }
      this.watchGates(el, win, breakpointsIn(gates));
    }
    /**
     * Arm live re-evaluation for one element, building the watcher on first use.
     *
     * Lazy so that a page with no JavaScript-rendered gate — which is most pages, since the catalog
     * is overwhelmingly `css-keyframes` — binds no `MediaQueryList` listener at all.
     *
     * @complexity O(b) time in the element's breakpoints; O(1) amortised space.
     * @overallScore 100
     */
    watchGates(el, win, breakpoints) {
      this.gateWatcher ??= createGateWatcher(win, (target) => this.regate(target));
      this.gateWatcher.watch(el, breakpoints);
    }
    /**
     * Rebuild one element because the viewport crossed a breakpoint its JS effects depend on.
     *
     * `release` then `process`, rather than a partial update, and rather than `process` alone:
     * `process` short-circuits on an unchanged fingerprint, and the fingerprint is a hash of
     * *attributes*, which have not changed — the viewport has. Releasing first is also what makes the
     * transition safe mid-animation: it aborts the activation binding, runs each JS effect's own
     * `destroy()`, and unwinds both ledgers, so the element is back at the author's own markup before
     * the new plan touches it. That is the same path an attribute edit takes, so there is one
     * teardown implementation rather than two.
     *
     * There is deliberately no "is this element still live?" guard. Every path that stops tracking an
     * element goes through `release`, and `release` unwatches — so an element that reaches here is
     * one the watcher still holds, which is one `release` has not run on, which is one that is live.
     * A guard would be unreachable code pretending to be caution, the same call `positioned()` in
     * `compile.ts` makes about its own missing branch.
     *
     * @complexity O(e) time in the element's composed effects; O(1) space.
     * @overallScore 100
     */
    regate(el) {
      this.release(el);
      this.process(el);
    }
    install(request) {
      const { el, fingerprint, parsed, config, document: document2 } = request;
      const groups = document2.targets.map((target) => ({ target, matches: this.resolveGroupMatches(el, target) })).filter((group) => group.matches.length > 0);
      if (groups.length === 0) {
        el.setAttribute(ATTR.state, "failed");
        return;
      }
      const ledgers = createLedgerSet(el);
      const ledger = ledgers.style(el);
      const attributes = ledgers.attributes(el);
      const controller = new AbortController();
      this.bindAuthorCallback(el, parsed, controller.signal);
      const elementHasCssAnimation = document2.targets.some(
        (target) => Object.keys(target.plan.declarations).length > 0
      );
      const elementStylePlan = planStyles({
        plan: groups[0].target.plan,
        config,
        capabilities: this.capabilities,
        respectReducedMotion: this.respectReducedMotion,
        elementHasCssAnimation
      });
      const state = {
        fingerprint,
        specs: parsed.specs,
        activation: config.activation,
        timeline: config.timeline,
        fxNames: document2.targets.flatMap((target) => target.plan.fxNames),
        jsEffectNames: document2.targets.flatMap(
          (target) => target.plan.jsEffects.map((entry) => entry.spec.name)
        ),
        progressDriven: elementStylePlan.gate === "scrubbed" || elementStylePlan.gate === "native-timeline",
        instances: [],
        ledger,
        attributes,
        ledgers,
        controller,
        status: "ready"
      };
      this.states.set(el, state);
      this.liveElements.add(el);
      attributes.set(ATTR.state, "ready");
      const context = {
        el,
        state,
        ledgers,
        config,
        signal: controller.signal,
        elementHasCssAnimation
      };
      for (const group of groups) this.installGroup(group, context);
      this.openGate({ el, state, stylePlan: elementStylePlan, config, plan: groups[0].target.plan });
    }
    /**
     * Apply one `target:` group's compiled plan to every element its selector resolved to.
     *
     * Its own `planStyles` call, not the element-wide one `install` already made: `declarations` are
     * per group, so `fade-up target:h2, pin` writes different properties to the `h2` than to the host
     * even though both share one gate, one activation and one reduced-motion policy (which is exactly
     * what `elementHasCssAnimation` carries in from the caller).
     *
     * @complexity O(m * p) time in the group's matches and the plan's properties; O(p) space.
     * @overallScore 100
     */
    installGroup(group, context) {
      const { target, matches } = group;
      const stylePlan = planStyles({
        plan: target.plan,
        config: context.config,
        capabilities: this.capabilities,
        respectReducedMotion: this.respectReducedMotion,
        elementHasCssAnimation: context.elementHasCssAnimation
      });
      const hasCssAnimation = Object.keys(stylePlan.properties).some(
        (property2) => property2.startsWith("animation-")
      );
      const writes = { target, stylePlan, hasCssAnimation };
      for (const match of matches) this.installMatch(match, writes, context);
      if (target.selector !== "") {
        indexTargetGroup(context.el, matches, context.ledgers, this.reporter);
      }
    }
    /**
     * Write one group's plan onto one of its matched elements, and register the instances that plan
     * produced there.
     *
     * Every write goes through `context.ledgers`, never `match.style`/`match.setAttribute` directly:
     * under `scope:page` a match need not be a descendant of the host at all, so the ledger set is
     * the only thing that knows to unwind it on `release()`.
     *
     * @complexity O(p) time in the plan's property count; O(1) space beyond the instances pushed.
     * @overallScore 100
     */
    installMatch(match, writes, context) {
      const { target, stylePlan, hasCssAnimation } = writes;
      const { state, ledgers } = context;
      const matchLedger = ledgers.style(match);
      const matchAttributes = ledgers.attributes(match);
      for (const [property2, value] of Object.entries(stylePlan.properties)) {
        matchLedger.set(property2, value);
      }
      matchAttributes.set(ATTR.normalized, stylePlan.attributes[ATTR.normalized]);
      matchAttributes.set(ATTR.rm, stylePlan.attributes[ATTR.rm]);
      matchLedger.claim("animation-play-state");
      if (hasCssAnimation) {
        const scrubbed = stylePlan.gate === "scrubbed";
        state.instances.push(
          createCssInstance(match, matchLedger, target.plan.keyframeNames, scrubbed)
        );
      }
      state.instances.push(
        ...this.jsEffectPreparer.prepare({
          el: match,
          plan: target.plan,
          signal: context.signal,
          ledger: matchLedger
        })
      );
    }
    /**
     * Wire an authored `func:` to this element's completion.
     *
     * Registered as an ordinary `kui:finish` listener rather than called from a dispatch site, so it
     * can never fire at a moment the event does not — the key is sugar for that listener, and is
     * implemented as literally that listener. It detaches with every other binding on
     * `controller.abort()`.
     *
     * Called from `install` *before* `openGate`, and the order is load-bearing: the one `kui:finish`
     * an element can receive during install is the synchronous `reduced-motion` one, and the visitor
     * who asked for reduced motion is the last one whose chained step should silently be dropped.
     *
     * See `callback.ts` for the lookup rules, and for why this key must never be built from
     * untrusted input.
     *
     * @complexity O(1) time and space.
     * @overallScore 100
     */
    bindAuthorCallback(el, parsed, signal) {
      if (parsed.func === void 0) return;
      bindCallback({ el, name: parsed.func, reporter: this.reporter, signal });
    }
    /**
     * Validate and resolve one `CompiledTarget`'s selector against the live document.
     *
     * `resolveTarget`'s document-wide/invalid rejection — the same rule the six built-in
     * `target:`-declaring primitives apply inside their own `prepare` — has to run again here for
     * every *other* primitive: a CSS-rendered retargeted effect never calls `prepare` at all, so
     * compile-to-install time is the only point at which this element has a real `Document` to
     * validate the selector against. `compileTargets` itself is pure and DOM-free by design and
     * cannot do this check.
     *
     * @param el - The host. The search root under `'self'`, and the only "match" for the host group
     *   (`target.selector === ''`), which is never queried at all.
     * @returns The matches, in document order. Empty when the selector was invalid, too broad, or
     *   simply matched nothing — every case already warned by name.
     * @complexity O(1) for the host group; O(n) in document size otherwise, the query itself being
     *   the DOM's.
     * @overallScore 100
     */
    resolveGroupMatches(el, target) {
      if (target.selector === "") return [el];
      const doc = el.ownerDocument;
      const names = target.plan.fxNames.join(", ");
      const breadth = selectorBreadth(target.selector, doc);
      if (breadth !== "ok") {
        const reason = breadth === "invalid" ? "is not a valid selector" : "matches the whole document";
        this.reporter.warn(`target "${target.selector}" (${names}) ${reason} and will be ignored`, el);
        return [];
      }
      const matches = queryScoped(el, { doc }, target.selector, target.scope);
      if (matches.length === 0) {
        this.reporter.warn(`target "${target.selector}" (${names}) matched nothing`, el);
      }
      return matches;
    }
    /**
     * Decide whether, and when, the effects on this element are allowed to start.
     *
     * The single place any effect begins. Routing both renderers through it is what makes
     * `on:enter`, `on:click`, `manual`, and `reducedMotion: 'disable'` mean the same thing for a
     * pinned section as for a fade — previously JS effects started during `prepare` and honoured
     * none of them.
     *
     * @complexity O(n) time in the number of instances; O(1) space.
     * @overallScore 100
     */
    openGate(request) {
      const { el, state, stylePlan, config, plan } = request;
      const reduce = this.respectReducedMotion && this.capabilities.reducedMotion;
      if (reduce && plan.reducedMotion === "disable") {
        state.status = "finished";
        state.attributes.set(ATTR.state, "finished");
        this.emit(el, state, KUI_EVENT.finish, "reduced-motion");
        return;
      }
      const actions = config.actions;
      if (actions) {
        this.warnAboutCrossings(el, state, stylePlan.activation ?? config.activation, actions);
      }
      if (stylePlan.gate !== "deferred") {
        this.activate(el);
        return;
      }
      const activation = stylePlan.activation;
      const releaseBinding = this.binder.bind(el, activation, {
        threshold: config.threshold,
        from: config.activationSource,
        activate: () => this.activate(el),
        deactivate: () => this.deactivate(el),
        // Only when the author asked for the four-way reading. Absent, the binder keeps its two-way
        // delivery and its one-shot release, which is what every piece of existing markup depends on.
        ...actions ? { cross: (crossing) => this.applyCrossing(el, crossing, actions) } : {}
      });
      let released = false;
      const releaseOnce = () => {
        if (released) return;
        released = true;
        releaseBinding();
      };
      state.controller.signal.addEventListener("abort", releaseOnce);
      if (!actions && isOneShot(resolveActivationSpec(activation))) {
        state.releaseActivation = releaseOnce;
      }
    }
    /**
     * Report every way an authored `actions:` cannot do what it says, once, at bind time.
     *
     * At bind time rather than per crossing, and that is the whole reason this is a separate method:
     * a crossing fires on every scroll pass, and a diagnostic repeated on each one is a diagnostic
     * nobody reads. It is the same discipline `control.ts` applies — warn once at construction, even
     * for a caller who only meant to read.
     *
     * @complexity O(1) time and space.
     * @overallScore 100
     */
    warnAboutCrossings(el, state, activation, actions) {
      const spec = resolveActivationSpec(activation);
      const problems = warnAboutToggleActions({
        actions,
        observed: spec.start.kind === "observed" || spec.end?.kind === "observed",
        activation: String(activation),
        jsEffectNames: state.jsEffectNames,
        progressDriven: state.progressDriven
      });
      for (const problem of problems) this.reporter.warn(problem, el);
    }
    /**
     * Do whatever this element's `actions:` names for the crossing that just happened.
     *
     * A pure dispatch, and deliberately nothing more. `toggle-actions.ts` owns what each verb means,
     * `activation.ts` owns which crossing it was, and this method's only contribution is the two
     * things neither of them can reach: the element's own directional transitions, and its instances'
     * playheads. If anything resembling animation logic ever appears here, it is in the wrong file.
     *
     * @complexity O(n) time in the element's instances; O(n) space.
     * @overallScore 100
     */
    applyCrossing(el, crossing, actions) {
      const state = this.states.get(el);
      if (!state) return;
      applyToggleVerb(actions[crossing], {
        // `ready` is the only status that has not started; `finished` and `failed` both have, and a
        // `resume` on either of those is a resume rather than a fresh activation.
        started: state.status !== "ready",
        controls: state.instances.map((instance) => instance.control).filter((control2) => control2 !== void 0),
        activate: () => this.activate(el),
        reverse: () => this.reverseFrom(el)
      });
    }
    /**
     * Start a deferred animation.
     *
     * A JS-rendered effect's real setup work is postponed until this call — `deferPrepare` in
     * `instances.ts` only wires up an inert instance during `prepare` — so a broken primitive (a bad
     * selector, a malformed param) first throws here, not while the plan was being built. `scan()`
     * reaches this synchronously for every `on:load` element, inside the very loop that processes
     * every other element on the page; an uncaught throw here previously unwound that loop and
     * silently orphaned every element after the broken one — the same blast radius the `__proto__`
     * scan-crash fix closed for a different door. Each instance is isolated so one effect's failure
     * can neither strand a sibling effect on the same element nor abort the rest of the scan.
     *
     * @complexity O(n) time in composed instances; O(1) space.
     * @overallScore 100
     */
    activate(el) {
      const state = this.states.get(el);
      if (!state) return;
      if (state.status === "running" && state.direction === "reverse") {
        this.turnAround(el, state);
        return;
      }
      if (state.status === "running") return;
      state.releaseActivation?.();
      state.releaseActivation = void 0;
      state.status = "running";
      state.direction = "forward";
      state.attributes.set(ATTR.state, "running");
      const run = this.beginRun(state);
      const started = state.instances.filter((instance) => this.startInstance(instance, el));
      if (started.length === 0 && state.instances.length > 0) {
        state.status = "failed";
        state.attributes.set(ATTR.state, "failed");
        return;
      }
      this.emit(el, state, KUI_EVENT.start, "activated");
      this.settleWhen({ el, state, run }, started, "finished");
    }
    /**
     * Play an element's effects back out.
     *
     * The exit half of a paired activation — `data-kui-on="pointerenter/pointerleave"`,
     * `data-kui-on="enter/leave"` — routed through one method for the same reason `activate` is: it
     * is the single place an effect ever runs backwards, so what an exit means does not have to be
     * re-decided per activation.
     *
     * **CSS-rendered effects reverse; JS-rendered ones do not, and say so.** A CSS effect has a real
     * `Animation` handle whose playback rate can simply be negated, landing on the from-state that
     * `animation-fill-mode: both` is already holding. A JS-rendered effect has no playhead at all —
     * `getAnimations()` returns `[]` for it (see `play.ts`) — and there is no honest general shim
     * for "half a `split-flap`, backwards". Rather than invent one that misbehaves differently per
     * primitive, an instance that cannot reverse is named in a warning; the author learns their
     * pointerleave does nothing *here* instead of discovering it in a browser. On an element
     * composing both renderers the CSS half still reverses and the warning names what did not.
     *
     * @param el - Element whose effects should play out.
     * @complexity O(n) time in the number of instances; O(1) space.
     * @overallScore 100
     */
    deactivate(el) {
      const state = this.states.get(el);
      if (!state) return;
      if (state.status !== "running" && state.status !== "finished") return;
      if (state.direction === "reverse") return;
      const reversible = state.instances.filter(isDirectional);
      if (reversible.length < state.instances.length) {
        this.reporter.warn(
          "effect cannot play backwards, so the exit half of this activation does nothing for it (JS-rendered effects have no playhead \u2014 see EffectInstance.reverse)",
          el
        );
      }
      this.reverseFrom(el);
    }
    /**
     * Turn an element's playhead around and settle it back at the from-state it started from.
     *
     * The single owner of `state.direction === 'reverse'`, and it exists as its own method because
     * for a while there were two owners and neither knew about the other. `deactivate()` — the exit
     * half of a paired activation — flipped the direction and re-armed the settle gate;
     * `control(el).reverse()` reached straight past the state machine into the raw `Animation`
     * handles through `InstanceControl.reverse`. Both moved the same playheads, only one of them said
     * so, and an animator that believed a reversing element was still travelling forwards got three
     * things wrong at once: a later `deactivate()` sailed through its "an exit already in flight must
     * not restart" guard and began a *second* reverse; `activate()` could never turn the playhead
     * around, because it looks for `'reverse'` and never saw it; and the forward `settleWhen` left
     * over from the entrance stayed pending until it stamped `data-kui-state="finished"` onto an
     * element sitting at its from-state.
     *
     * So the transition lives here and both entry points call it. What `deactivate()` keeps is only
     * what is true of an *activation* exit specifically. A programmatic reverse is not one — an
     * author calling `control().reverse()` has not had a pointer leave anything — so it inherits
     * none of that, and in particular is not told that the effects it cannot reach make "the exit
     * half of this activation" do nothing. `control.ts` has already named those for it.
     *
     * Resuming forward travel is `activate()`'s job, not a second method here: an element left in
     * `'reverse'` is turned around by `turnAround`, which is reachable from every route that
     * activates — a pointer coming back, `play()`, `kui.activate()`.
     *
     * @param el - Element whose effects should run backwards. Unknown elements are ignored, exactly
     *   as they are by `activate` and `deactivate`.
     * @complexity O(n) time in the number of instances; O(1) space.
     * @overallScore 100
     */
    reverseFrom(el) {
      const state = this.states.get(el);
      if (!state) return;
      if (state.status !== "running" && state.status !== "finished") return;
      if (state.direction === "reverse") return;
      const reversible = state.instances.filter(isDirectional);
      if (reversible.length === 0) return;
      state.status = "running";
      state.direction = "reverse";
      state.attributes.set(ATTR.state, "running");
      const run = this.beginRun(state);
      for (const instance of reversible) instance.reverse();
      this.settleWhen({ el, state, run }, reversible, "ready");
    }
    /**
     * Resume forward playback on an element whose exit is still in flight.
     *
     * Separate from `activate`'s main path because none of that path applies: the instances are
     * already started, the activation is already spent, and the state is already `running`. All that
     * changes is the direction of travel.
     *
     * @complexity O(n) time in the number of instances; O(1) space.
     * @overallScore 100
     */
    turnAround(el, state) {
      const playable = state.instances.filter(isDirectional);
      state.direction = "forward";
      const run = this.beginRun(state);
      for (const instance of playable) instance.play();
      this.settleWhen({ el, state, run }, playable, "finished");
    }
    /**
     * Write an element's final state once the instances driving it have finished.
     *
     * The reported state has to become truthful eventually, or `data-kui-state` codifies a lie that
     * tests then assert against. It also has to stay truthful when a run is superseded mid-flight: a
     * reverse that is turned around leaves its own `finished` promise pending, and letting that
     * promise write `ready` over the forward run that replaced it is how an element ends up claiming
     * it is back at its from-state while visibly finishing its entrance. Capturing the direction at
     * the time of the call and re-checking it on resolution is what makes the stale promise a no-op
     * in the ordinary case — turned-around and reversed-again runs, which is why that comment and
     * check are kept even though `run` below also covers them.
     *
     * `run` is the check `direction` cannot be: `direction` only ever holds two values, so a run
     * that flips back and forth several times (a hover-driven card flip, `pointerenter`/
     * `pointerleave` firing repeatedly) revisits the same direction repeatedly, and a stale run's
     * belated completion could otherwise be mistaken for a much later one simply travelling the same
     * way. `beginRun` mints one identity per run; only the run that is still current when its own
     * promise resolves gets to report anything.
     *
     * @param target - The element, its state, and this run's identity — see {@link SettleTarget}.
     * @param instances - The instances this particular run started; a run only waits on its own.
     * @param next - State to report when they are all done.
     * @complexity O(n) time in the instances; O(n) space for the pending promises.
     * @overallScore 100
     */
    settleWhen(target, instances, next) {
      const { el, state, run } = target;
      const timed = instances.filter((instance) => !instance.continuous);
      if (timed.length === 0 && instances.length > 0) {
        this.settleArmed.set(state, false);
        return;
      }
      this.settleArmed.set(state, true);
      const direction = state.direction;
      void Promise.all(timed.map((instance) => instance.finished)).then(() => {
        if (this.states.get(el) !== state || state.status !== "running") return;
        if (state.direction !== direction) return;
        if (this.currentRun.get(state) !== run) return;
        state.status = next;
        state.attributes.set(ATTR.state, next);
        if (state.cancelled) return;
        if (next === "finished") this.emit(el, state, KUI_EVENT.finish, "complete");
        else this.emit(el, state, KUI_EVENT.reverseFinish, "reversed");
      });
    }
    /**
     * Mark the start of a new run — a forward activation, a reversal, or a turnaround out of one —
     * and clear the mark a previous run's cancellation left behind.
     *
     * The two things a fresh run does are bound together deliberately: `cancelled` describes *this*
     * run, not the element for life, so every place that begins one must also disown whatever the
     * run before it was marked with, or that run's cancellation would silently apply to a completion
     * it had nothing to do with — see `InstanceState.cancelled`'s own doc comment for the contract
     * this keeps. Doing both here, in one call, is what stops a caller resetting one without the
     * other; three call sites each remembering to write two lines in the right order was exactly
     * this bug's shape the first time.
     *
     * @returns This run's identity, to be threaded through to the `settleWhen` call that will
     *   eventually report on it.
     * @complexity O(1) time, O(1) space.
     * @overallScore 100
     */
    beginRun(state) {
      const run = Symbol("kui-run");
      this.currentRun.set(state, run);
      state.cancelled = false;
      return run;
    }
    /**
     * Dispatch one lifecycle event for an element, filling in the identity every listener needs.
     *
     * Centralised here rather than inside each instance because the animator is the only place that
     * knows the *element's* lifecycle — an element composing three effects starts once and finishes
     * once, not three times, and only this class sees all three instances at the same moment.
     *
     * @complexity O(n) time in listeners on the propagation path; O(1) space.
     * @overallScore 100
     */
    emit(el, state, type, reason) {
      emitLifecycle(el, type, {
        effects: state.fxNames,
        activation: state.activation,
        timeline: state.timeline,
        reason
      });
    }
    /**
     * Stop one element's effects where they are, leaving it mid-animation.
     *
     * The counterpart to `activate()`, and the reason it exists rather than callers reaching into
     * `stateOf(el).instances` themselves (which is what `play()`'s handle used to do): cancellation
     * has an observable consequence — `kui:cancel`, and the suppression of the `kui:finish` that
     * would otherwise follow it — and that consequence has to be applied wherever cancellation
     * happens, not only where it happens to be convenient.
     *
     * @param el - Element whose effects should stop.
     * @complexity O(n) time in the element's instances; O(1) space.
     * @overallScore 100
     */
    cancel(el) {
      const state = this.states.get(el);
      if (!state) return;
      const wasRunning = state.status === "running";
      state.cancelled = true;
      for (const instance of state.instances) runQuietly(() => instance.cancel());
      if (wasRunning && this.settleArmed.get(state) === false) {
        state.status = "finished";
        state.attributes.set(ATTR.state, "finished");
      }
      if (wasRunning) this.emit(el, state, KUI_EVENT.cancel, "cancelled");
    }
    /**
     * Runtime control over a selection's playheads — pause, resume, reverse, seek, re-speed.
     *
     * Selection-shaped rather than single-element, so it matches `play()` and so one call covers a
     * staggered group. `control.ts` builds a per-element handle underneath and the returned handle
     * composes them.
     *
     * @param target - Selector, element, or iterable of elements.
     * @complexity O(n) time in selected elements and their instances; O(n) space.
     * @overallScore 100
     */
    control(target) {
      return control({ animator: this, root: this.root, target });
    }
    /**
     * Activate one instance, isolating a throw from its (possibly deferred) setup.
     *
     * @returns Whether the instance actually started — a failed instance is excluded from the
     * `finished` gate in `activate()`, since something that never started can never legitimately
     * finish (see `EffectInstance.finished`'s "resolves, never rejects" contract in `types.ts`).
     * @complexity O(1) time, O(1) space.
     * @overallScore 100
     */
    startInstance(instance, el) {
      try {
        instance.activate();
        return true;
      } catch (error) {
        this.reporter.warn(`effect failed to activate: ${String(error)}`, el);
        return false;
      }
    }
    /**
     * Programmatic entry point. Accepts a selector, an Element, a NodeList, or any iterable, so
     * `getElementById`, `getElementsByClassName`, and `querySelectorAll` all work directly.
     *
     * @complexity O(n) time in selected elements.
     * @overallScore 100
     */
    play(target, effect, options = {}) {
      return play({ animator: this, root: this.root, target, effect }, options);
    }
    /**
     * Remove the opt-in cloak so a stalled or failed initialisation can never leave a page hidden.
     *
     * @complexity O(1) time, O(1) space.
     * @overallScore 100
     */
    uncloak() {
      const doc = isElementNode(this.root) ? this.root.ownerDocument : this.root;
      doc?.documentElement?.removeAttribute(ATTR.cloak);
    }
    stateOf(el) {
      return this.states.get(el);
    }
    /**
     * Tear an element's effects down so the next `process()` reinstalls from scratch.
     *
     * Needed for replay: `process()` short-circuits when the configuration fingerprint is
     * unchanged, so playing the same effect twice was previously a no-op.
     *
     * @complexity O(c) time in retained instances; O(1) space.
     * @overallScore 100
     */
    reset(el) {
      this.release(el);
    }
    /**
     * Tear down one element's effects and clear its library-owned attributes.
     *
     * @complexity O(c) time in retained cleanups; O(1) extra space.
     * @overallScore 100
     */
    release(el) {
      const state = this.states.get(el);
      if (!state) return;
      const wasRunning = state.status === "running";
      state.cancelled = true;
      state.controller.abort();
      for (const instance of state.instances) runQuietly(() => instance.destroy());
      this.states.delete(el);
      this.liveElements.delete(el);
      this.gateWatcher?.unwatch(el);
      state.ledgers.restore();
      if (wasRunning) this.emit(el, state, KUI_EVENT.cancel, "reset");
    }
    /**
     * Tear down every tracked element inside a removed subtree.
     *
     * Scoped to `node`'s own descendants rather than re-scanning `liveElements` against the whole
     * page, so a removal event costs O(removed subtree), not O(every animated element alive
     * anywhere) — `dom-watcher.ts` can queue up to 100 removed roots per frame, and `liveElements`
     * only shrinks on release, so it stays large on a scroll-reveal-heavy page.
     *
     * Membership is checked against `liveElements` (the ground truth) rather than re-querying
     * `[${ATTR.source}]` the way `scan()` does: `dom-watcher.ts`'s `flush()` drains removed roots
     * before attribute-change roots, so if calling code strips `data-kui` and removes the element in
     * the same tick, a selector-based query would already miss it here and leak its teardown.
     *
     * `node` is typed `Element`, not `ParentNode`: `dom-watcher.ts`'s `onElementRemoved` — this
     * method's only caller — is itself typed `(el: Element) => void`, so there is no runtime case
     * where `node` is a `Document`/`DocumentFragment` to guard against.
     *
     * `restageAfterRemoval` runs over every candidate visited, not only the ones actually released:
     * a removed stagger member is exactly the case this closes, and whether it was "live" by
     * `liveElements`' definition is a question `GROUP_OF_CHILD` (in `stagger.ts`) answers on its own
     * terms. Without it, removing one item from a staggered group left every later sibling holding
     * the rank an index computed for a group one element larger — the stale-after-*edit* half of the
     * same defect `3d57ff7` already closed for an attribute change, left open for a removal.
     *
     * @complexity O(s) time in the removed subtree's element count; O(1) per candidate via the
     * `liveElements` Set lookup, plus stagger re-ranking bounded by the surviving groups' own sizes.
     * @overallScore 100
     */
    releaseTree(node) {
      const candidates = [node, ...node.querySelectorAll("*")];
      for (const el of candidates) {
        if (this.liveElements.has(el)) this.release(el);
      }
      restageAfterRemoval(candidates, this.reporter);
    }
    destroy() {
      this.domWatcher?.destroy();
      releaseStagger(this.root);
      for (const el of [...this.liveElements]) this.release(el);
      this.gateWatcher?.destroy();
      this.binder.destroy();
      this.scheduler.destroy();
      this.started = false;
    }
    /**
     * Start watching for DOM insertions, removals, and attribute changes.
     *
     * Attribute changes recompile in place; insertions scan; removals tear down so listeners and
     * observers do not outlive their elements.
     *
     * @complexity O(1) time and space to build and start; the watcher's own callback runs O(n) time
     * in the nodes one mutation record carries.
     * @overallScore 100
     */
    watch() {
      this.domWatcher ??= createDomWatcher({
        root: this.root,
        onElementAdded: (el) => this.scan(el),
        onElementRemoved: (el) => this.releaseTree(el),
        onAttributeChanged: (el) => {
          this.process(el);
          restageAround(el, this.reporter);
        }
      });
      this.domWatcher.watch();
    }
  };
  function createAnimator(options = {}) {
    return new Animator(options);
  }
  function resolveCollaborators(options) {
    const root = options.root ?? globalThis.document;
    const capabilities = options.capabilities ?? detect();
    const reporter = options.reporter ?? silentReporter();
    const scheduler = options.scheduler ?? createScrollScheduler();
    const rootResolver = options.rootResolver ?? defaultRootResolver(root);
    const respectReducedMotion = (options.reducedMotion ?? "respect") === "respect";
    return {
      registry: options.registry ?? new Registry(),
      capabilities,
      root,
      reporter,
      binder: options.binder ?? createActivationBinder({ reporter }),
      scheduler,
      rootResolver,
      jsEffectPreparer: resolveJsEffectPreparer(options.jsEffectPreparer, {
        scheduler,
        rootResolver,
        capabilities,
        reporter,
        respectReducedMotion
      }),
      // Not defaulted here (unlike the other collaborators above): building the real watcher needs
      // `this.scan`/`this.process`/`this.releaseTree`, which don't exist yet inside this free
      // function. `Animator.watch()` builds it lazily instead, so nothing observes — and no
      // `MutationObserver` is ever constructed — unless `shouldObserve` is true and `start()` runs.
      domWatcher: options.domWatcher,
      respectReducedMotion,
      shouldObserve: options.observe ?? false
    };
  }
  function resolveJsEffectPreparer(provided, deps) {
    return provided ?? createJsEffectPreparer(deps);
  }
  function defaultRootResolver(root) {
    const doc = isElementNode(root) ? root.ownerDocument : root;
    const win = doc?.defaultView ?? globalThis;
    return createRootResolver({ win });
  }
  function isDirectional(instance) {
    return instance.play !== void 0 && instance.reverse !== void 0;
  }
  function runQuietly(cleanup) {
    try {
      cleanup();
    } catch {
    }
  }

  // src/core/types.ts
  var CHANNEL = {
    opacity: "opacity",
    translate: "translate",
    scale: "scale",
    rotate: "rotate",
    filter: "filter",
    clip: "clip",
    background: "background",
    color: "color",
    stroke: "stroke",
    text: "text",
    /**
     * Skew is the one transform CSS never gave an independent property to — there is no `skew:`
     * beside `translate:`/`rotate:`/`scale:`, so it can only be written through the `transform`
     * shorthand. That makes it its own channel: anything writing `transform` clobbers the whole
     * shorthand, so every primitive that does is on this channel, whatever the transform is for.
     * `scroll-skew` is one member; `flip-face` (`effects/three-d`) and `flip-3d`
     * (`effects/catalog/core`, the `flip-in-*`/`flip-out-*` family) are the other two — both need
     * the `perspective()` transform *function* for an element to have depth on itself, which
     * likewise only exists inside `transform`.
     */
    skew: "skew"
  };
  function inertInstance(destroy = () => {
  }) {
    return {
      activate() {
      },
      cancel() {
      },
      finish() {
      },
      finished: Promise.resolve(),
      destroy
    };
  }

  // src/effects/shared.ts
  var TRIGGER_DELAY_PARAM = {
    delay: { type: "time", default: "0ms", cssProperty: "--kui-delay" }
  };
  var ALL_TIMING_TOKENS = ["duration", "delay", "ease"];
  function authoredTiming(params, token) {
    if (token === "ease") return params.timing.easing;
    const ms = token === "duration" ? params.timing.durationMs : params.timing.delayMs;
    return ms === void 0 ? void 0 : `${ms}ms`;
  }
  function warnUnhonouredTiming(id, contract, params, warn) {
    const honours = contract.honours ?? [];
    for (const token of ALL_TIMING_TOKENS) {
      if (honours.includes(token)) continue;
      if (authoredTiming(params, token) === void 0) continue;
      const supported = honours.length > 0 ? honours.join(", ") : "no timing parameters";
      warn(`"${id}" cannot honour ${token}: ${contract.because} (honours: ${supported})`);
    }
  }
  function effectDelayMs(params, fallback = 0) {
    return params.timing.delayMs ?? params.ms("delay", fallback);
  }
  function effectEasing(params, fallback = "") {
    return params.timing.easing ?? params.text("ease", fallback);
  }
  function mirrorTimingToCss(id, honours, params, ctx) {
    for (const token of honours) {
      const value = authoredTiming(params, token);
      if (value !== void 0) ctx.style.set(timingProperty(id, token), value);
    }
  }
  function withTimingContract(id, contract, prepare) {
    return (el, params, ctx) => {
      warnUnhonouredTiming(id, contract, params, ctx.warn);
      return prepare(el, params, ctx);
    };
  }
  function stylesheetTimingPrepare(id, contract) {
    return (el, params, ctx) => {
      warnUnhonouredTiming(id, contract, params, ctx.warn);
      return deferredInstance(() => {
        mirrorTimingToCss(id, contract.honours ?? [], params, ctx);
        return () => {
        };
      });
    };
  }
  var TIMELINE_AGNOSTIC = ["time", "view", "scroll", "pin"];
  var COMMON = {
    duration: { type: "time", default: "600ms", cssProperty: "--kui-duration" },
    ...TRIGGER_DELAY_PARAM,
    ease: { type: "easing", default: "ease-out", cssProperty: "--kui-ease" },
    stagger: { type: "time", default: "0ms", cssProperty: "--kui-stagger" }
  };
  function cssPrimitive(id, channels, options = {}) {
    return {
      id,
      renderer: "css-keyframes",
      channels,
      parameters: { ...COMMON, ...options.parameters },
      supportedTimelines: options.timelines ?? ["time"],
      supportedActivations: options.activations ?? [
        "load",
        "enter",
        "hover",
        "focus",
        "click",
        "manual"
      ],
      perfClass: options.perfClass ?? "compositor",
      reducedMotion: options.reducedMotion ?? "shorten",
      ...options.defaultActivation ? { defaultActivation: options.defaultActivation } : {}
    };
  }

  // src/effects/catalog/ambient.ts
  var drift = {
    duration: { type: "time", default: "10s", cssProperty: "--kui-duration" },
    ease: { type: "easing", default: "ease-in-out", cssProperty: "--kui-ease" },
    from: { type: "color", default: "", cssProperty: "--kui-ambient-c1" },
    to: { type: "color", default: "", cssProperty: "--kui-ambient-c2" }
  };
  var tint = {
    duration: { type: "time", default: "10s", cssProperty: "--kui-duration" },
    ease: { type: "easing", default: "ease-in-out", cssProperty: "--kui-ease" },
    from: { type: "color", default: "", cssProperty: "--kui-ambient-c1" }
  };
  var float = {
    duration: { type: "time", default: "4s", cssProperty: "--kui-duration" },
    ease: { type: "easing", default: "ease-in-out", cssProperty: "--kui-ease" },
    distance: { type: "length", default: "14px", cssProperty: "--kui-distance" }
  };
  var orbit = {
    duration: { type: "time", default: "3.5s", cssProperty: "--kui-duration" },
    // `linear` by default, unlike every other ambient primitive: a continuous rotation that eases
    // visibly stutters once per revolution, because the ease restarts at each iteration boundary.
    ease: { type: "easing", default: "linear", cssProperty: "--kui-ease" },
    angle: { type: "angle", default: "360deg", cssProperty: "--kui-to-angle" }
  };
  var pulse = {
    duration: { type: "time", default: "2.2s", cssProperty: "--kui-duration" },
    ease: { type: "easing", default: "ease-in-out", cssProperty: "--kui-ease" },
    scale: { type: "number", default: "1.15", cssProperty: "--kui-pulse-scale", finite: true, minimum: 1 }
  };
  var AMBIENT_PRIMITIVES = [
    cssPrimitive("ambient-gradient", [CHANNEL.background], {
      parameters: drift,
      defaultActivation: "load",
      reducedMotion: "disable",
      perfClass: "continuous"
    }),
    /*
     * `gradient-rotate-border` and `gradient-border` are not background fills, and a second
     * primitive is how this catalog says so — the same reason `ambient-tint` exists beside
     * `ambient-gradient` above. Channels are per-primitive, so a different channel set means a
     * different primitive; folding these into `ambient-gradient` would make `gradient-mesh` and
     * `aurora` claim a mask and a box they never touch, and `aurora, pin` would start reporting a
     * conflict that isn't there.
     *
     * What the ring rules actually write (`ambient.css`) beyond the gradient: `mask` +
     * `mask-composite`, which subtract the element's own content box to leave a ring — the same
     * physical property `media-mask` claims under the `'mask'` channel — and `position: relative`
     * plus a `padding` that *is* the ring's thickness, which is a claim on the host's box in the
     * sense `pin` and `background-media` already use `'layout'` for. Declared only as
     * `background`, a `gradient-border, pin-section` pair composed silently while both decided the
     * host's `position`, and `gradient-border, mask-reveal` while both wrote `mask`.
     */
    cssPrimitive("ambient-gradient-ring", [CHANNEL.background, "mask", "layout"], {
      parameters: drift,
      defaultActivation: "load",
      reducedMotion: "disable",
      perfClass: "continuous"
    }),
    cssPrimitive("ambient-tint", [CHANNEL.background], {
      parameters: tint,
      defaultActivation: "load",
      reducedMotion: "disable",
      perfClass: "continuous"
    }),
    cssPrimitive("ambient-float", [CHANNEL.translate], {
      parameters: float,
      defaultActivation: "load",
      reducedMotion: "disable",
      perfClass: "continuous"
    }),
    cssPrimitive("ambient-orbit", [CHANNEL.rotate], {
      parameters: orbit,
      defaultActivation: "load",
      reducedMotion: "disable",
      perfClass: "continuous"
    }),
    cssPrimitive("ambient-pulse", [CHANNEL.scale, CHANNEL.opacity], {
      parameters: pulse,
      defaultActivation: "load",
      reducedMotion: "disable",
      perfClass: "continuous"
    })
  ];
  var AMBIENT_PRESETS = [
    { name: "gradient-mesh", phase: "idle", primitive: "ambient-gradient", keyframes: "kui-gradient-mesh" },
    { name: "aurora", phase: "idle", primitive: "ambient-gradient", keyframes: "kui-aurora" },
    {
      name: "gradient-rotate-border",
      phase: "idle",
      primitive: "ambient-gradient-ring",
      keyframes: "kui-gradient-rotate-border",
      params: { duration: "6s", ease: "linear" }
    },
    {
      // Not `gradient`: this rule masks its own content box away (`mask-composite: exclude`) to leave
      // a ring, so putting the name on real content deletes the content. `-border` says that out loud,
      // matching `gradient-rotate-border` and `beam-border`.
      name: "gradient-border",
      phase: "idle",
      primitive: "ambient-gradient-ring",
      keyframes: "kui-gradient-border",
      params: { duration: "6s", ease: "linear" }
    },
    // Cut 2026-08-26, human call — the rewritten version wasn't useful. Commented out, not
    // deleted, so it can be revived: uncomment this row, the matching rule + @keyframes in
    // ambient.css, restore the docs/catalog.md entry, and regenerate presets.generated.css.
    // {
    //   name: 'noise-overlay',
    //   primitive: 'ambient-tint',
    //   keyframes: 'kui-noise-overlay',
    //   params: { duration: '650ms', ease: 'steps(6)' },
    // },
    {
      name: "scanline",
      phase: "idle",
      primitive: "ambient-tint",
      keyframes: "kui-scanline",
      params: { duration: "3.5s", ease: "linear" }
    },
    {
      name: "dot-grid-drift",
      phase: "idle",
      primitive: "ambient-tint",
      keyframes: "kui-dot-grid-drift",
      params: { duration: "16s", ease: "linear" }
    },
    {
      name: "line-grid-drift",
      phase: "idle",
      primitive: "ambient-tint",
      keyframes: "kui-line-grid-drift",
      params: { duration: "16s", ease: "linear" }
    },
    {
      name: "starfield",
      phase: "idle",
      primitive: "ambient-tint",
      keyframes: "kui-starfield",
      params: { duration: "40s", ease: "linear" }
    },
    {
      name: "spotlight-follow",
      phase: "idle",
      primitive: "ambient-tint",
      keyframes: "kui-spotlight-follow",
      params: { duration: "9s" }
    },
    {
      name: "wave-blob",
      phase: "idle",
      primitive: "ambient-tint",
      keyframes: "kui-wave-blob",
      params: { duration: "12s" }
    },
    { name: "float", phase: "idle", primitive: "ambient-float", keyframes: "kui-float" },
    {
      name: "bob",
      phase: "idle",
      primitive: "ambient-float",
      keyframes: "kui-bob",
      params: { duration: "2s", distance: "8px" }
    },
    {
      name: "floating-shapes",
      phase: "idle",
      primitive: "ambient-float",
      keyframes: "kui-floating-shapes",
      params: { duration: "6s", distance: "10px" }
    },
    { name: "orbit", phase: "idle", primitive: "ambient-orbit", keyframes: "kui-orbit" },
    { name: "glow-pulse", phase: "idle", primitive: "ambient-pulse", keyframes: "kui-glow-pulse" }
  ];
  function registerAmbient(registry) {
    return registry.registerPrimitives(AMBIENT_PRIMITIVES).registerPresets(AMBIENT_PRESETS);
  }

  // src/effects/catalog/discrete.ts
  var discreteTiming = {
    duration: { type: "time", default: "240ms", cssProperty: "--kui-duration" },
    ...TRIGGER_DELAY_PARAM,
    ease: { type: "easing", default: "ease-out", cssProperty: "--kui-ease" }
  };
  var PINNED_REASON = "discrete.css pins that value on this effect";
  function scaleParam(cssProperty, defaultValue) {
    return { scale: { type: "number", default: defaultValue, cssProperty, finite: true, minimum: 0 } };
  }
  function distanceParam(cssProperty, defaultValue) {
    return { distance: { type: "length", default: defaultValue, cssProperty } };
  }
  function discretePrimitive(id, channels, extraParams = {}) {
    return {
      id,
      renderer: "javascript",
      channels,
      parameters: { ...discreteTiming, ...extraParams },
      supportedTimelines: ["time"],
      supportedActivations: ["manual"],
      defaultActivation: "manual",
      perfClass: "compositor",
      // Not 'disable': an open/close transition on a menu or panel is a brief, functional state
      // change, not a vestibular trigger the way parallax or an infinite ambient loop is — same
      // reasoning `hoverPrimitive` gives interaction.ts's family.
      reducedMotion: "shorten",
      prepare: stylesheetTimingPrepare(id, { honours: ALL_TIMING_TOKENS, because: PINNED_REASON })
    };
  }
  var DISCRETE_BASE = [{ property: "display" }, { property: "overlay" }];
  var DISCRETE_PRIMITIVES = [
    discretePrimitive("fade-open", ["opacity", "discrete"]),
    // Opacity + scale together, matching the real-world "popover/toast" pop-in — the plan's own
    // worked example. `scale-open` below is the scale-only sibling for an element that should grow
    // into place without also fading, the same split `core.ts` draws between `fade-in` and `zoom-in`.
    discretePrimitive("pop-open", ["opacity", "scale", "discrete"], scaleParam("--kui-pop-open-scale", "0.92")),
    discretePrimitive("scale-open", ["scale", "discrete"], scaleParam("--kui-scale-open-scale", "0.85")),
    // A small upward-then-settle drop, the conventional dropdown-menu entrance. Radix/Headless UI
    // default to roughly half this, but they animate a menu against a page that is holding still;
    // at 8px here the travel was swamped by the fade and the effect was indistinguishable from
    // `fade-open`. Still deliberately smaller than the slide pair below.
    discretePrimitive(
      "drop-open",
      ["opacity", "translate", "discrete"],
      distanceParam("--kui-drop-open-distance", "12px")
    ),
    // "-up"/"-down" name the direction of travel, the same convention `core.ts`'s `fade-up`/
    // `fade-down` use: `slide-open-up` starts below rest and arrives travelling upward.
    discretePrimitive(
      "slide-open-up",
      ["opacity", "translate", "discrete"],
      distanceParam("--kui-slide-open-up-distance", "16px")
    ),
    discretePrimitive(
      "slide-open-down",
      ["opacity", "translate", "discrete"],
      distanceParam("--kui-slide-open-down-distance", "16px")
    )
  ];
  var DISCRETE_PRESETS = [
    { name: "fade-open", primitive: "fade-open", transitions: [{ property: "opacity" }, ...DISCRETE_BASE] },
    {
      name: "pop-open",
      primitive: "pop-open",
      transitions: [{ property: "opacity" }, { property: "scale" }, ...DISCRETE_BASE]
    },
    { name: "scale-open", primitive: "scale-open", transitions: [{ property: "scale" }, ...DISCRETE_BASE] },
    {
      name: "drop-open",
      primitive: "drop-open",
      transitions: [{ property: "opacity" }, { property: "translate" }, ...DISCRETE_BASE]
    },
    {
      name: "slide-open-up",
      primitive: "slide-open-up",
      transitions: [{ property: "opacity" }, { property: "translate" }, ...DISCRETE_BASE]
    },
    {
      name: "slide-open-down",
      primitive: "slide-open-down",
      transitions: [{ property: "opacity" }, { property: "translate" }, ...DISCRETE_BASE]
    }
  ];
  function registerDiscrete(registry) {
    return registry.registerPrimitives(DISCRETE_PRIMITIVES).registerPresets(DISCRETE_PRESETS);
  }

  // src/effects/catalog/feedback.ts
  var loop = {
    duration: { type: "time", default: "1.6s", cssProperty: "--kui-duration" },
    ease: { type: "easing", default: "linear", cssProperty: "--kui-ease" }
  };
  var spin = {
    duration: { type: "time", default: "900ms", cssProperty: "--kui-duration" },
    ease: { type: "easing", default: "linear", cssProperty: "--kui-ease" }
  };
  var dotPulse = {
    duration: { type: "time", default: "1.2s", cssProperty: "--kui-duration" },
    ease: { type: "easing", default: "ease-in-out", cssProperty: "--kui-ease" },
    dotSize: { type: "length", default: "8px", cssProperty: "--kui-dot-size" }
  };
  var progressTrack = {
    duration: { type: "time", default: "1.4s", cssProperty: "--kui-duration" },
    ease: { type: "easing", default: "ease-in-out", cssProperty: "--kui-ease" }
  };
  var toast = {
    duration: { type: "time", default: "420ms", cssProperty: "--kui-duration" },
    ease: { type: "easing", default: "back-out", cssProperty: "--kui-ease" },
    distance: { type: "length", default: "24px", cssProperty: "--kui-distance" }
  };
  var shake = {
    duration: { type: "time", default: "500ms", cssProperty: "--kui-duration" },
    ease: { type: "easing", default: "linear", cssProperty: "--kui-ease" }
  };
  var pop = {
    duration: { type: "time", default: "420ms", cssProperty: "--kui-duration" },
    ease: { type: "easing", default: "back-out", cssProperty: "--kui-ease" },
    scale: { type: "number", default: "1.18", cssProperty: "--kui-pop-scale", finite: true, minimum: 1 }
  };
  var ripple = {
    duration: { type: "time", default: "600ms", cssProperty: "--kui-duration" },
    ease: { type: "easing", default: "ease-out", cssProperty: "--kui-ease" },
    extent: { type: "number", default: "4", cssProperty: "--kui-ripple-scale", finite: true, minimum: 1 },
    // Empty default, the `ambient.ts` convention: unauthored means absent from the resolved output,
    // so the stylesheet's own `currentColor` fallback stays in force and no existing page changes.
    color: { type: "color", default: "", cssProperty: "--kui-ripple-color" },
    // How opaque the disc is at its brightest. `number|percentage` so `strength:60%` and
    // `strength:0.6` both work and both land in `[0,1]` — `normalise` turns the percentage into the
    // number before `maximum` bounds it, which is the whole reason that union type exists.
    strength: {
      type: "number|percentage",
      default: "0.6",
      cssProperty: "--kui-ripple-opacity",
      finite: true,
      minimum: 0,
      maximum: 1
    },
    // Where the disc starts, as a fraction of the element it covers. Worth a knob because it is what
    // separates a ripple that grows from a point from one that starts already covering the button.
    startScale: { type: "number", default: "0.2", cssProperty: "--kui-ripple-start", finite: true, minimum: 0 }
  };
  var burst = {
    ...pop,
    // How far the furthest particle travels, defaulting to a *percentage* of the host rather than a
    // fixed length. A background layer is clipped to the element that paints it, so a fixed `34px`
    // would be almost entirely off-box on the 18px dot the demo page celebrates with and a timid
    // twitch in the middle of a 400px card — the same number cannot be right for both. At `45%` the
    // furthest particle lands just inside the edge whatever the host's size is. `length|percentage`
    // rather than `length` so the declaration says a percentage is a supported reading here, not an
    // accident of the unit list (see `ParamType` in core/types.ts); `distance:40px` still validates.
    distance: { type: "length|percentage", default: "45%", cssProperty: "--kui-confetti-distance" },
    // Horizontal reach only, so the same `distance` covers a narrow fountain (`fan:0.3`) and a full
    // circular pop (`fan:1.6`) without any particle changing how far it flies.
    fan: { type: "number", default: "1", cssProperty: "--kui-confetti-fan", finite: true, minimum: 0 },
    size: { type: "length", default: "6px", cssProperty: "--kui-confetti-size" },
    // How far the particle box overhangs the host on every side. A background layer is clipped to
    // the box that paints it, so this is what decides whether the burst can leave the button at all.
    spill: { type: "length", default: "24px", cssProperty: "--kui-confetti-spill" },
    // Empty defaults, the same convention `ambient.ts` uses and for the same reason: unauthored
    // means absent from the resolved output, so each gradient's own hardcoded fallback stays in
    // force and no existing page changes colour.
    color1: { type: "color", default: "", cssProperty: "--kui-confetti-c1" },
    color2: { type: "color", default: "", cssProperty: "--kui-confetti-c2" },
    color3: { type: "color", default: "", cssProperty: "--kui-confetti-c3" },
    color4: { type: "color", default: "", cssProperty: "--kui-confetti-c4" },
    color5: { type: "color", default: "", cssProperty: "--kui-confetti-c5" }
  };
  var confirm = {
    duration: { type: "time", default: "1400ms", cssProperty: "--kui-duration" },
    ease: { type: "easing", default: "linear", cssProperty: "--kui-ease" }
  };
  var pull = {
    distance: { type: "length", default: "36px", cssProperty: "--kui-pull-distance" }
  };
  var FEEDBACK_PRIMITIVES = [
    cssPrimitive("feedback-shimmer", [CHANNEL.background], {
      parameters: loop,
      defaultActivation: "load",
      reducedMotion: "disable",
      perfClass: "continuous"
    }),
    cssPrimitive("feedback-fade", [CHANNEL.opacity], {
      defaultActivation: "manual"
    }),
    // `'discrete'` alongside `rotate`: `spinner`/`spinner-ring`'s unconditional rule also pins
    // `display: inline-block` so the ring sizes to its own box instead of running full-width as a
    // bare `<div>` would. Unrelated to `catalog/discrete.ts`'s show/hide use of the same channel —
    // `display` itself is one physical property regardless of which value a primitive sets it to,
    // so both uses have to share the channel `channels.ts` polices it under. See that channel's own
    // doc comment in `test/support/channel-properties.ts`.
    cssPrimitive("feedback-spin", [CHANNEL.rotate, "discrete"], {
      parameters: spin,
      defaultActivation: "load",
      reducedMotion: "disable",
      perfClass: "continuous"
    }),
    // Declares every channel the preset's CSS actually paints, not just what the shared keyframe
    // animates: spinner-dots' `[data-kui-fx~='spinner-dots']` rule also sets `background:
    // currentColor` (the dot itself), `box-shadow` (the other two dots), and `display: inline-block`
    // (same sizing reason as `feedback-spin` above), entirely outside `@keyframes kui-spinner-dots`.
    // Declaring only [scale, opacity] let a composed `background`-writing effect (e.g. gradient-mesh)
    // pass channel-collision detection and then have its gradient silently overwritten by this rule —
    // see css-invariants.test.ts's "CSS static rules" describe block, which now catches this class of
    // omission directly.
    cssPrimitive(
      "feedback-dot-pulse",
      [CHANNEL.scale, CHANNEL.opacity, CHANNEL.background, "shadow", "discrete"],
      {
        parameters: dotPulse,
        defaultActivation: "load",
        reducedMotion: "disable",
        perfClass: "continuous"
      }
    ),
    // Same shape as feedback-dot-pulse above: `[data-kui-fx~='progress-indeterminate']` sets
    // `background: currentColor` unconditionally for the bar itself, outside the keyframe. It also
    // pins `transform-origin: 0% 50%` there, undeclared until channel-properties.ts gained an entry
    // for it — the same structurally-invisible gap `background` was closed for above.
    cssPrimitive(
      "feedback-progress-track",
      [CHANNEL.translate, CHANNEL.scale, CHANNEL.background, "transform-origin"],
      {
        parameters: progressTrack,
        defaultActivation: "load",
        reducedMotion: "disable",
        perfClass: "continuous"
      }
    ),
    cssPrimitive("feedback-toast", [CHANNEL.opacity, CHANNEL.translate], {
      parameters: toast,
      defaultActivation: "manual"
    }),
    cssPrimitive("feedback-shake", [CHANNEL.translate], {
      parameters: shake,
      defaultActivation: "manual"
    }),
    cssPrimitive("feedback-wobble", [CHANNEL.translate, CHANNEL.rotate], {
      defaultActivation: "click"
    }),
    /**
     * Every channel this primitive now touches is on its own `::after`, not on the host.
     *
     * It used to declare `background` and `transform-origin` because the disc *was* the host —
     * `[data-kui-fx~='ripple']` painted `background: currentColor` and pinned `transform-origin`
     * straight onto the authored element. Now that the disc is a pseudo-element the host rule writes
     * neither, so declaring them would refuse compositions that no longer clash: `data-kui=
     * "gradient-mesh, ripple"` paints a mesh on the element and a ripple over it, which is exactly
     * what an author asking for both means.
     *
     * `sweep` is the ownership token for "this preset paints its own `::after`". `shine-sweep` is
     * this channel's other member and `channel-properties.ts` documents it as deliberately covering
     * no host property — a box marker rather than a property set, kept as "a home to grow into if
     * the pseudo-element audit ever gets extended to check that box directly". This is that growth:
     * `::after` is one physical box per element, so two presets that both paint it cannot compose,
     * and sharing a channel is how the compiler is told. Without it the pair would instead land in
     * `test/css-composition-invariants.test.ts`'s enumerated list of collisions it can only *report*.
     * `scale`/`opacity` stay declared for the same box — `underline-slide` declares `scale` for a
     * transform that also lives entirely on its `::after`, which is the existing convention.
     *
     * The name is wrong for a ripple and worth renaming to something like `pseudo-after` once
     * someone can touch `interaction.ts` and `channel-properties.ts` in the same change.
     */
    cssPrimitive("feedback-ripple", [CHANNEL.scale, CHANNEL.opacity, "sweep"], {
      parameters: ripple,
      defaultActivation: "click"
    }),
    cssPrimitive("feedback-pop", [CHANNEL.scale], {
      parameters: pop,
      defaultActivation: "manual"
    }),
    /**
     * `confetti-burst` only now. `heart-burst` used to share this primitive — same shared `burst`
     * keyframe family, same host `scale` pop — and inherited the `sweep` claim below along with it,
     * which made it refuse to compose with `shine-sweep` even though it paints no pseudo-element at
     * all: `[data-kui-fx~='heart-burst']` in `feedback.css` sets `color` on the host and nothing
     * else. That was a real false positive, not a defensible over-declaration, so `heart-burst` was
     * split onto its own primitive (`feedback-heart-burst`, below) that declares only the channels
     * it actually paints. See `test/catalog-feedback.test.ts` for the regression coverage: the
     * composition that used to be wrongly refused, and the one that is still correctly refused.
     *
     * `sweep` is the `::after` ownership token — see `feedback-ripple` above for what it means and
     * why it is spelled that way. `confetti-burst` genuinely paints its five gradients there, so the
     * claim is real for this primitive now that it no longer speaks for `heart-burst` too.
     *
     * `background` stays declared even though the host rule no longer paints one. That is a
     * deliberate over-declaration rather than a leftover: it keeps `gradient-mesh, confetti-burst`
     * refused, which `test/compile.test.ts` asserts as the regression that made this primitive's
     * channels honest in the first place, and refusing a pair that no longer clashes is the safe
     * direction to be wrong in. `opacity` likewise — a composed fade would take the whole element,
     * pseudo-element and all.
     *
     * `color` is gone: only `heart-burst` ever painted it, and it left with `heart-burst`.
     */
    cssPrimitive("feedback-burst", [CHANNEL.scale, CHANNEL.opacity, CHANNEL.background, "sweep"], {
      parameters: burst,
      defaultActivation: "click"
    }),
    /**
     * `heart-burst`'s own primitive, split off `feedback-burst` above so its declared channels match
     * what it actually paints: `[data-kui-fx~='heart-burst']` in `feedback.css` sets `color` on the
     * host, and `@keyframes kui-heart-burst` animates the host's own `scale` — nothing else, no
     * pseudo-element, no `sweep` claim. Sharing `feedback-burst` made it inherit that primitive's
     * `sweep` channel and wrongly refuse to compose with `shine-sweep`; this primitive cannot make
     * that mistake because it never declares a channel it does not use.
     *
     * Parameters are bare `pop` — `duration`, `ease`, `scale` — rather than the fuller `burst` object
     * `feedback-burst` carries. `distance`/`fan`/`size`/`spill`/`color1..5` never reached any CSS for
     * `heart-burst` even while it shared that primitive (its host rule never reads
     * `--kui-confetti-*`), so exposing them here would just be a second copy of the dead-parameter
     * trap `ambient.ts` documents for a shared `to:` — a value that validates and does nothing.
     */
    cssPrimitive("feedback-heart-burst", [CHANNEL.scale, CHANNEL.color], {
      parameters: pop,
      defaultActivation: "click"
    }),
    cssPrimitive("feedback-confirm", [CHANNEL.opacity], {
      parameters: confirm,
      defaultActivation: "click"
    }),
    cssPrimitive("feedback-pull", [CHANNEL.translate], {
      parameters: pull,
      defaultActivation: "manual"
    })
  ];
  var FEEDBACK_PRESETS = [
    { name: "skeleton-shimmer", phase: "idle", primitive: "feedback-shimmer", keyframes: "kui-skeleton-shimmer" },
    { name: "skeleton-to-content", primitive: "feedback-fade", keyframes: "kui-skeleton-to-content" },
    { name: "spinner", phase: "idle", primitive: "feedback-spin", keyframes: "kui-spinner-spin" },
    { name: "spinner-dots", phase: "idle", primitive: "feedback-dot-pulse", keyframes: "kui-spinner-dots" },
    { name: "spinner-ring", phase: "idle", primitive: "feedback-spin", keyframes: "kui-spinner-ring-spin" },
    {
      name: "progress-indeterminate",
      phase: "idle",
      primitive: "feedback-progress-track",
      keyframes: "kui-progress-indeterminate"
    },
    { name: "toast-slide-in", primitive: "feedback-toast", keyframes: "kui-toast-slide-in" },
    {
      name: "toast-slide-out",
      primitive: "feedback-toast",
      keyframes: "kui-toast-slide-out",
      params: { ease: "ease-in" }
    },
    { name: "shake-error", primitive: "feedback-shake", keyframes: "kui-shake-error" },
    {
      name: "wobble",
      primitive: "feedback-wobble",
      keyframes: "kui-wobble",
      params: { duration: "600ms", ease: "ease-in-out" }
    },
    { name: "ripple", primitive: "feedback-ripple", keyframes: "kui-ripple" },
    { name: "badge-pop", primitive: "feedback-pop", keyframes: "kui-badge-pop" },
    {
      name: "count-bump",
      primitive: "feedback-pop",
      keyframes: "kui-count-bump",
      params: { duration: "280ms", scale: "1.3" }
    },
    {
      name: "heart-burst",
      primitive: "feedback-heart-burst",
      keyframes: "kui-heart-burst",
      params: { duration: "700ms", scale: "1.4" }
    },
    {
      name: "confetti-burst",
      primitive: "feedback-burst",
      keyframes: "kui-confetti-burst",
      params: { duration: "900ms", scale: "1.15" }
    },
    { name: "copy-confirm", primitive: "feedback-confirm", keyframes: "kui-copy-confirm" },
    {
      name: "pull-to-refresh",
      primitive: "feedback-pull",
      keyframes: "kui-pull-to-refresh",
      params: { duration: "900ms", ease: "ease-out" }
    }
  ];
  function registerFeedback(registry) {
    return registry.registerPrimitives(FEEDBACK_PRIMITIVES).registerPresets(FEEDBACK_PRESETS);
  }

  // src/effects/catalog/interaction-shared.ts
  function centeredOffset(point, size) {
    return {
      x: size.width > 0 ? point.x / size.width - 0.5 : 0,
      y: size.height > 0 ? point.y / size.height - 0.5 : 0
    };
  }
  function tiltAngles(point, size, maxAngleDeg) {
    const centered = centeredOffset(point, size);
    return { rotateY: centered.x * maxAngleDeg * 2, rotateX: -centered.y * maxAngleDeg * 2 };
  }
  function parallaxOffset(point, size, strengthPx) {
    const centered = centeredOffset(point, size);
    return { x: centered.x * strengthPx * 2, y: centered.y * strengthPx * 2 };
  }
  function supportsFineHover(win) {
    return win.matchMedia?.("(hover: hover) and (pointer: fine)").matches ?? true;
  }
  var HOVER_TRANSITIONS = {
    lift: [{ property: "translate" }],
    pop: [{ property: "scale" }],
    "lift-shadow": [{ property: "translate" }, { property: "box-shadow" }],
    "border-draw": [{ property: "--kui-border-pct" }],
    "border-glow": [{ property: "box-shadow" }]
  };
  var STYLESHEET_ANIMATED_HOVERS = ["icon-bounce", "icon-spin", "icon-wiggle", "split-flap"];
  var BEAM_PARAMS = {
    color: { type: "color", default: "", cssProperty: "--kui-beam-border-c1" },
    outset: { type: "length", default: "", cssProperty: "--kui-beam-border-outset" },
    /**
     * How many degrees of the ring carry colour; the rest is transparent. Small values read as a
     * short bright dash chasing the perimeter, large ones as a full glowing ring.
     *
     * `angle`, so `arc:100`, `arc:100d` and `arc:100deg` are one value (`core/params.ts`'s
     * `BARE_ANGLE`), and `0.28turn` works too.
     */
    arc: { type: "angle", default: "100deg", cssProperty: "--kui-beam-border-arc" },
    /**
     * What fraction of the arc is spent fading up from transparent to the first colour. `0` is a
     * hard leading edge; `0.9` is an arc that is almost entirely fade, which is the soft specular
     * rim the glass family reaches for.
     *
     * `'number|percentage'` so `softness:0.6` and `softness:60%` are the same request — the union
     * normalises to the number, which is what keeps the bounds below meaningful for both spellings.
     */
    softness: {
      type: "number|percentage",
      default: "0.22",
      cssProperty: "--kui-beam-border-softness",
      finite: true,
      minimum: 0,
      maximum: 0.9
    }
  };
  var SHINE_PARAMS = {
    color: { type: "color", default: "", cssProperty: "--kui-shine-sweep-color" },
    /** Rake of the band. `115deg` is the shipped default — steeper than a diagonal, which is what
     *  stops it reading as a corner-to-corner wipe. */
    angle: { type: "angle", default: "115deg", cssProperty: "--kui-shine-sweep-angle" },
    /**
     * Band width as a fraction of the gradient's own span, centred on the midpoint. `0.2` is the
     * shipped 40%→60% band; `1` is a full-width wash with no transparent margin left.
     *
     * `'number|percentage'`, bounded 0..1, for the same reason `softness` above is: `width:40%` and
     * `width:0.4` are the same request, and normalising to the number is what keeps the bounds
     * honest for both.
     */
    width: {
      type: "number|percentage",
      default: "0.2",
      cssProperty: "--kui-shine-sweep-width",
      finite: true,
      minimum: 0,
      maximum: 1
    }
  };
  var COLOR_PARAMS = {
    borderDraw: { color: { type: "color", default: "", cssProperty: "--kui-border-draw-color" } },
    borderGlow: { color: { type: "color", default: "", cssProperty: "--kui-border-glow-color" } },
    underlineSlide: { color: { type: "color", default: "", cssProperty: "--kui-underline-slide-color" } },
    underlineCenter: { color: { type: "color", default: "", cssProperty: "--kui-underline-center-color" } }
  };
  var BORDER_DRAW_PARAMS = {
    ...COLOR_PARAMS.borderDraw,
    width: { type: "length", default: "2px", cssProperty: "--kui-border-draw-width" },
    outset: { type: "length", default: "0px", cssProperty: "--kui-border-draw-outset" }
  };

  // src/effects/catalog/interaction-states.ts
  function stateTiming(duration) {
    return {
      duration: { type: "time", default: duration, cssProperty: "--kui-duration" },
      ...TRIGGER_DELAY_PARAM,
      ease: { type: "easing", default: "ease-out", cssProperty: "--kui-ease" }
    };
  }
  function statePrimitive(id, channels, duration, extraParams) {
    return {
      id,
      renderer: "javascript",
      channels,
      parameters: { ...stateTiming(duration), ...extraParams },
      supportedTimelines: ["time"],
      supportedActivations: ["load"],
      defaultActivation: "load",
      perfClass: "compositor",
      reducedMotion: "shorten",
      prepare: stylesheetTimingPrepare(id, {
        honours: ALL_TIMING_TOKENS,
        because: "interaction.css pins that value on this effect"
      })
    };
  }
  var pressParams = {
    scale: {
      type: "number",
      default: "0.96",
      cssProperty: "--kui-press-scale",
      finite: true,
      minimum: 0
    },
    depth: { type: "length", default: "2px", cssProperty: "--kui-press-shadow-depth" },
    color: { type: "color", default: "", cssProperty: "--kui-press-shadow-color" }
  };
  var groupParams = {
    opacity: {
      type: "number|percentage",
      default: "0.4",
      cssProperty: "--kui-group-dim-opacity",
      finite: true,
      minimum: 0,
      maximum: 1
    }
  };
  var PRESS_PRIMITIVES = [
    statePrimitive("press", ["scale", "shadow"], "120ms", pressParams)
  ];
  var PRESS_PRESETS = [
    {
      name: "press-depth",
      primitive: "press",
      /*
       * Through `Preset.transitions`, never a bare `transition:` in the stylesheet. A `transition`
       * shorthand resets every longhand it covers, so two composed presets each carrying their own
       * would fight over one declaration and the earlier one would vanish outright — the exact bug
       * `data-kui="lift, border-glow"` had. The compiler merges these segments into the single
       * `--kui-transition` custom property `base.css`'s `:where([data-kui-fx])` rule consumes;
       * `css-composition-invariants.test.ts` asserts no preset has gone back to the old spelling.
       */
      transitions: [{ property: "scale" }, { property: "box-shadow" }]
    }
  ];
  var GROUP_PRIMITIVES = [
    statePrimitive("group-dim", ["group"], "260ms", groupParams)
  ];
  var GROUP_PRESETS = [
    /*
     * No `transitions` field, unlike `press-depth` above. `Preset.transitions` describes properties
     * this preset eases *on its own host box*, and the compiler spends them on the one
     * `--kui-transition` property `base.css` applies to the element carrying `data-kui-fx` — which
     * here is the container, which does not move. The children's `opacity` transition is authored
     * directly on their own rule in `interaction.css`, the same way the form family's satellite
     * rules carry their own, and it is safe there for a reason the host box's is not: nothing else
     * can ever write a transition on `[data-kui-fx~='group-dim'] > *`, because a second effect that
     * did would have to be on this channel and would be refused before it got there.
     */
    { name: "group-dim", phase: "state", primitive: "group-dim", requiresOwnSubtree: true }
  ];
  var STATE_PRIMITIVES = [...PRESS_PRIMITIVES, ...GROUP_PRIMITIVES];
  var STATE_PRESETS = [...PRESS_PRESETS, ...GROUP_PRESETS];

  // src/effects/catalog/interaction-reveal.ts
  function revealPrimitive(id, channels, parameters, perfClass = "compositor") {
    return {
      id,
      renderer: "javascript",
      channels,
      parameters,
      supportedTimelines: ["time"],
      supportedActivations: ["load"],
      defaultActivation: "load",
      perfClass,
      reducedMotion: "shorten",
      prepare: stylesheetTimingPrepare(id, {
        honours: ALL_TIMING_TOKENS,
        because: "interaction.css pins that value on this effect"
      })
    };
  }
  var labelSwapParams = {
    duration: { type: "time", default: "320ms", cssProperty: "--kui-duration" },
    delay: { type: "time", default: "0ms", cssProperty: "--kui-delay" },
    ease: { type: "easing", default: "ease-out", cssProperty: "--kui-ease" },
    distance: {
      type: "length|percentage",
      default: "100%",
      cssProperty: "--kui-label-swap-distance"
    }
  };
  var LABEL_SWAP_PRIMITIVES = [
    revealPrimitive("label-swap", ["discrete", "label-swap"], labelSwapParams)
  ];
  var LABEL_SWAP_PRESETS = [
    // `phase: 'state'` on all three, declared rather than inferred.
    //
    // `phaseOf` (`core/compile.ts:700`) resolves a preset to `state` on its own when it declares
    // `transitions` — and these deliberately do not, for the reason written at the top of this
    // file. So without this line they resolve to *undeclared*, and an undeclared phase conflicts
    // with everything: `fade-up, masked-label-swap` would be refused and the swap silently dropped,
    // which is the exact failure `Preset.phase` was added to end. A label swap is a response to a
    // hover or focus, never a thing that plays on arrival, so `state` is the honest claim.
    { name: "masked-label-swap", phase: "state", primitive: "label-swap" },
    { name: "masked-label-swap-x", phase: "state", primitive: "label-swap" },
    { name: "masked-label-swap-diagonal", phase: "state", primitive: "label-swap" }
  ];
  var hoverIntentParams = {
    duration: { type: "time", default: "160ms", cssProperty: "--kui-duration" },
    delay: { type: "time", default: "1000ms", cssProperty: "--kui-delay" },
    ease: { type: "easing", default: "ease-out", cssProperty: "--kui-ease" },
    distance: { type: "length", default: "4px", cssProperty: "--kui-hover-intent-distance" }
  };
  var HOVER_INTENT_PRIMITIVES = [
    revealPrimitive("hover-intent", ["hint"], hoverIntentParams)
  ];
  var HOVER_INTENT_PRESETS = [
    { name: "hover-intent", phase: "state", primitive: "hover-intent" }
  ];
  var anchoredPreviewParams = {
    duration: { type: "time", default: "220ms", cssProperty: "--kui-duration" },
    delay: { type: "time", default: "0ms", cssProperty: "--kui-delay" },
    ease: { type: "easing", default: "ease-out", cssProperty: "--kui-ease" },
    distance: { type: "length", default: "10px", cssProperty: "--kui-anchored-preview-distance" },
    gap: { type: "length", default: "10px", cssProperty: "--kui-anchored-preview-gap" },
    scale: {
      type: "number",
      default: "0.85",
      cssProperty: "--kui-anchored-preview-scale",
      finite: true,
      minimum: 0,
      maximum: 1
    }
  };
  var ANCHORED_PREVIEW_PRIMITIVES = [
    revealPrimitive("anchored-preview", ["preview"], anchoredPreviewParams)
  ];
  var ANCHORED_PREVIEW_PRESETS = [
    { name: "anchored-preview", phase: "state", primitive: "anchored-preview" },
    { name: "anchored-preview-bottom", phase: "state", primitive: "anchored-preview" },
    { name: "anchored-preview-left", phase: "state", primitive: "anchored-preview" },
    { name: "anchored-preview-right", phase: "state", primitive: "anchored-preview" }
  ];
  var searchExpandParams = {
    duration: { type: "time", default: "260ms", cssProperty: "--kui-duration" },
    delay: { type: "time", default: "0ms", cssProperty: "--kui-delay" },
    ease: { type: "easing", default: "ease-out", cssProperty: "--kui-ease" },
    collapsed: {
      type: "length|percentage",
      default: "2.5em",
      cssProperty: "--kui-search-expand-collapsed"
    },
    width: { type: "length|percentage", default: "240px", cssProperty: "--kui-search-expand-width" }
  };
  var SEARCH_EXPAND_PRIMITIVES = [
    revealPrimitive(
      "search-expand",
      ["expand", "discrete", "search-field"],
      searchExpandParams,
      "layout"
    )
  ];
  var SEARCH_EXPAND_PRESETS = [
    {
      name: "search-expand",
      primitive: "search-expand",
      // Through `Preset.transitions`, never a bare `transition:` in the stylesheet — see the primitive
      // doc comment above for why a raw shorthand here would be the exact bug `lift`/`border-glow` had.
      transitions: [{ property: "inline-size" }]
    }
  ];
  var REVEAL_PRIMITIVES = [
    ...LABEL_SWAP_PRIMITIVES,
    ...HOVER_INTENT_PRIMITIVES,
    ...ANCHORED_PREVIEW_PRIMITIVES,
    ...SEARCH_EXPAND_PRIMITIVES
  ];
  var REVEAL_PRESETS = [
    ...LABEL_SWAP_PRESETS,
    ...HOVER_INTENT_PRESETS,
    ...ANCHORED_PREVIEW_PRESETS,
    ...SEARCH_EXPAND_PRESETS
  ];

  // src/effects/catalog/interaction.ts
  var hoverTiming = {
    duration: { type: "time", default: "220ms", cssProperty: "--kui-duration" },
    // A hover state has a start moment — the pointer arrives, or focus lands — so "wait 200ms
    // before lifting" is a coherent request even though nothing here plays on a clock at load.
    // interaction.css spends it as `transition-delay`/`animation-delay` on the `:hover` and
    // `:focus-visible` rules *only*, never on the base rule, so it delays entering the state and
    // never leaving it: an author asking for hover-intent does not also want the button to hang in
    // the air for 200ms after the pointer has gone.
    ...TRIGGER_DELAY_PARAM,
    ease: { type: "easing", default: "ease-out", cssProperty: "--kui-ease" }
  };
  var LINEAR_HOVER = {
    honours: ["duration", "delay"],
    because: "it is a continuous rotation and interaction.css runs it linear, so a curve would visibly stutter at the seam of every revolution"
  };
  var PINNED_REASON2 = "interaction.css pins that value on this effect";
  var liftParams = {
    distance: { type: "length", default: "6px", cssProperty: "--kui-lift-distance" }
  };
  var popParams = {
    scale: { type: "number", default: "1.06", cssProperty: "--kui-pop-scale", finite: true, minimum: 0 }
  };
  function hoverTimingFor(honours) {
    return Object.fromEntries(
      Object.entries(hoverTiming).filter(([name]) => honours.includes(name))
    );
  }
  function hoverPrimitive(id, channels, extraParams = {}, timing3 = { honours: ALL_TIMING_TOKENS, because: PINNED_REASON2 }) {
    const honours = timing3.honours ?? [];
    return {
      id,
      renderer: "javascript",
      channels,
      parameters: { ...hoverTimingFor(honours), ...extraParams },
      supportedTimelines: ["time"],
      supportedActivations: ["load"],
      defaultActivation: "load",
      perfClass: "compositor",
      // Not 'disable': a translate/box-shadow/rotate hover micro-interaction at this scale is not a
      // vestibular trigger the way parallax or continuous ambient motion is. The real motion lives in
      // CSS transitions and `:hover`-scoped pseudo-element animations rather than this primitive's
      // (here unused) compiled `animation-*` path, so the policy layer shortens it via the
      // `transition-duration` and `::before`/`::after` rules in base.css.
      reducedMotion: "shorten",
      // Not `inertInstance()` any more. The rule this primitive stands in for reads
      // `--kui-<id>-duration`/`-delay`/`-ease`, and `resolveParams` only ever writes those from the
      // `key:value` spelling — so `lift 400ms` reached nothing while `lift duration:400ms` worked.
      // See `stylesheetTimingPrepare`.
      prepare: stylesheetTimingPrepare(id, timing3)
    };
  }
  var HOVER_PRIMITIVES = [
    hoverPrimitive("lift", ["translate"], liftParams),
    hoverPrimitive("pop", ["scale"], popParams),
    hoverPrimitive("lift-shadow", ["translate", "shadow"], liftParams),
    hoverPrimitive("shine-sweep", ["sweep"], SHINE_PARAMS),
    // `'skew'`, not `'rotate'`: `@keyframes kui-split-flap` writes the `transform` *shorthand*
    // (`perspective(...) translateZ(...) rotateX(...)`), not the standalone `rotate:` property —
    // `perspective()` only affects an element's own depth from inside `transform`, so the flip has
    // no other spelling. `skew` is this catalog's name for "claims the whole `transform` shorthand"
    // (see `channel-properties.ts`); `scroll-skew`, `flip-face` and `flip-3d` are the other members.
    // While this said `rotate`, `split-flap, scroll-skew` and `split-flap, card-flip-y` looked
    // disjoint to the conflict detector and composed into a silent clobber of `transform`.
    // `'discrete'` alongside `skew`: the unconditional rule also pins `display: inline-block` for
    // sizing, the same reason `feedback-spin` declares it — unrelated to `catalog/discrete.ts`'s
    // show/hide use of the same physical property, but `display` is tracked as one channel
    // regardless of the value a primitive writes into it.
    hoverPrimitive("split-flap", ["skew", "discrete"]),
    /*
     * `pseudo-before` is the ownership token for "this preset paints its own `::before`", the exact
     * mirror of `feedback.ts`'s `sweep` for `::after` — read that primitive's comment for the full
     * argument, which applies here word for word. `::before` is one physical box per host element, so
     * two presets that both paint it cannot compose, and a shared channel is how the compiler is told
     * to refuse the pair instead of letting the later rule in source order silently win the box.
     *
     * `border-draw` joined that box when its ring moved off `border-image` (see `interaction.css`),
     * and choosing which box to move it *to* was the decision, not an implementation detail. The two
     * candidates were not equally priced:
     *
     * - **`::after`** is painted by `shine-sweep` (this file), `underline-slide`/`underline-center`
     *   (this file), and `ripple`/`confetti-burst` (`feedback.ts`). Landing there would newly refuse
     *   five pairs, and three of them — `border-draw, shine-sweep`, `border-draw, ripple`,
     *   `border-draw, confetti-burst` — are the ordinary furniture of a single button. A button that
     *   draws its border on hover and ripples on click is not an exotic composition; it is the
     *   default one.
     * - **`::before`** is painted by `beam-border`/`beam-border-auto` (this file), `cursor-spotlight`
     *   (this file), and `redaction-reveal` (`text.css`, another cluster's file). Two of those four
     *   cost *nothing*: both beam presets already share `border-draw`'s `border` channel, so the
     *   compiler has always refused them against it — a second ring on one box was never composable.
     *   That leaves two genuinely new refusals, `border-draw, cursor-spotlight` and `border-draw,
     *   redaction-reveal`, neither of which is a pattern anything in this repository writes.
     *
     * So `::before` costs two marginal pairs where `::after` costs three load-bearing ones, and the
     * ring goes on `::before`. The channel is added to `beam-border`, `beam-border-auto` and
     * `cursor-spotlight` in the same change rather than to `border-draw` alone, because a channel
     * with one member refuses nothing: declaring it only on the new arrival would have documented the
     * ownership without enforcing it, which is the failure mode the whole channel model exists to
     * avoid. `redaction-reveal` is the one `::before` painter left out, for the mundane reason that
     * `catalog/text.ts` belongs to another cluster in this change — so `border-draw +
     * redaction-reveal` lands in `css-composition-invariants.test.ts`'s enumerated
     * "known reachable collision" list rather than being refused. Adding `pseudo-before` there is the
     * one-line follow-up that closes it.
     *
     * Net effect on that enumerated list: two entries leave it (`beam-border + cursor-spotlight`,
     * `beam-border-auto + cursor-spotlight` are now refused outright) and one joins it.
     */
    hoverPrimitive("border-draw", ["border", "pseudo-before"], BORDER_DRAW_PARAMS),
    hoverPrimitive("border-glow", ["shadow"], COLOR_PARAMS.borderGlow),
    hoverPrimitive("beam-border", ["border", "pseudo-before"], BEAM_PARAMS, LINEAR_HOVER),
    hoverPrimitive("underline-slide", ["scale"], COLOR_PARAMS.underlineSlide),
    hoverPrimitive("underline-center", ["scale"], COLOR_PARAMS.underlineCenter),
    hoverPrimitive("icon-wiggle", ["rotate"]),
    hoverPrimitive("icon-spin", ["rotate"], {}, LINEAR_HOVER),
    hoverPrimitive("icon-bounce", ["translate"])
  ];
  var HOVER_PRESETS = HOVER_PRIMITIVES.map((primitive) => ({
    name: primitive.id,
    primitive: primitive.id,
    ...HOVER_TRANSITIONS[primitive.id] ? { transitions: HOVER_TRANSITIONS[primitive.id] } : {},
    ...STYLESHEET_ANIMATED_HOVERS.includes(primitive.id) ? { delivery: "stylesheet-animation" } : {}
  }));
  var CONTINUOUS_BORDER_PRIMITIVES = [
    {
      id: "beam-border-auto",
      renderer: "javascript",
      // `pseudo-before` for the same reason its hover twin carries it — the two share one `::before`
      // rule in `interaction.css`. See the block comment on `border-draw` in `HOVER_PRIMITIVES`.
      channels: ["border", "pseudo-before"],
      // `duration` only, of the three. Unlike its hover twin this one has no start moment at all —
      // it is `animation: ... infinite` with no `:hover` gate, running from the moment the rule
      // lands — so there is nothing for a delay to be relative to; and it spins linear for the same
      // seam reason `icon-spin` does. `duration` still means something: one revolution.
      parameters: { duration: hoverTiming.duration, ...BEAM_PARAMS },
      supportedTimelines: ["time"],
      supportedActivations: ["load"],
      defaultActivation: "load",
      perfClass: "compositor",
      reducedMotion: "disable",
      prepare: stylesheetTimingPrepare("beam-border-auto", {
        honours: ["duration"],
        because: "it is an always-on linear loop with no start moment and no curve"
      })
    }
  ];
  var CONTINUOUS_BORDER_PRESETS = [{ name: "beam-border-auto", primitive: "beam-border-auto" }];
  var springParams = {
    stiffness: {
      type: "number",
      default: "260",
      cssProperty: "--kui-stiffness",
      finite: true,
      minimum: 1,
      maximum: 1e4
    },
    damping: {
      type: "number",
      default: "26",
      cssProperty: "--kui-damping",
      finite: true,
      minimum: 0.1,
      maximum: 1e3
    },
    mass: {
      type: "number",
      default: "1",
      cssProperty: "--kui-mass",
      finite: true,
      minimum: 0.1
    }
  };
  function pointerPrimitive(id, channels, parameters, prepare) {
    return {
      id,
      renderer: "javascript",
      channels,
      parameters,
      supportedTimelines: ["time", "pointer"],
      supportedActivations: ["load", "manual"],
      defaultActivation: "load",
      perfClass: "continuous",
      // A tilt or cursor-follow effect only exists while the pointer is present; there is no
      // meaningful "shortened" version of tracking a position. `prepare` itself checks
      // `supportsFineHover` and no-ops on touch, which is the coarse-pointer half of this rule.
      reducedMotion: "disable",
      // None of the three timing tokens has anything to bite on here: a tilt is a pure function of
      // where the pointer is *right now*, and the cursor dots are springs chasing it, so there is no
      // instant an authored delay could be measured from and no fixed span a duration could set.
      // Refused out loud — `tilt-3d 400ms` otherwise parses, installs, and discards the number in
      // silence, which is indistinguishable from a broken effect.
      prepare: withTimingContract(
        id,
        {
          because: "it tracks pointer position continuously, so it has no start moment and no fixed span"
        },
        prepare
      )
    };
  }
  function springFrom(params) {
    return {
      ...DEFAULT_SPRING,
      stiffness: params.num("stiffness", DEFAULT_SPRING.stiffness),
      damping: params.num("damping", DEFAULT_SPRING.damping),
      mass: params.num("mass", DEFAULT_SPRING.mass)
    };
  }
  function springDepsFor(ctx) {
    return { ...defaultSpringDeps(), warn: ctx.warn };
  }
  function prepareTilt3d(el, params, ctx) {
    if (!supportsFineHover(ctx.win)) return () => {
    };
    const node = el;
    const maxAngle = params.num("maxAngle", 14);
    const perspective = params.text("perspective", "800px");
    function writeAngles(rotateX, rotateY, transitionMs) {
      ctx.style.set("transition", `transform ${transitionMs}ms ease-out`);
      ctx.style.set(
        "transform",
        `perspective(${perspective}) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`
      );
    }
    function onMove(event) {
      const rect = node.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const { rotateX, rotateY } = tiltAngles(point, rect, maxAngle);
      writeAngles(rotateX, rotateY, 100);
    }
    function reset() {
      writeAngles(0, 0, 400);
    }
    function onFocus() {
      writeAngles(-maxAngle / 2, maxAngle / 2, 250);
    }
    node.addEventListener("pointermove", onMove, { passive: true });
    node.addEventListener("pointerleave", reset, { passive: true });
    node.addEventListener("focus", onFocus);
    node.addEventListener("blur", reset);
    return () => {
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", reset);
      node.removeEventListener("focus", onFocus);
      node.removeEventListener("blur", reset);
    };
  }
  function collectParallaxLayers(node) {
    return [...node.querySelectorAll("[data-depth]")].map((layer) => ({
      ledger: createStyleLedger(layer),
      depth: Number(layer.dataset.depth) || 0
    }));
  }
  function writeParallaxLayers(layers, x, y, transitionMs) {
    for (const layer of layers) {
      layer.ledger.set("transition", `translate ${transitionMs}ms ease-out`);
      layer.ledger.set("translate", `${(x * layer.depth).toFixed(2)}px ${(y * layer.depth).toFixed(2)}px`);
    }
  }
  function prepareTiltParallax(el, params, ctx) {
    if (!supportsFineHover(ctx.win)) return () => {
    };
    const node = el;
    const strength = params.num("strength", 24);
    const layers = collectParallaxLayers(node);
    function onMove(event) {
      const rect = node.getBoundingClientRect();
      const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const offset = parallaxOffset(point, rect, strength);
      writeParallaxLayers(layers, offset.x, offset.y, 120);
    }
    function reset() {
      writeParallaxLayers(layers, 0, 0, 400);
    }
    node.addEventListener("pointermove", onMove, { passive: true });
    node.addEventListener("pointerleave", reset, { passive: true });
    node.addEventListener("focus", reset);
    node.addEventListener("blur", reset);
    return () => {
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", reset);
      node.removeEventListener("focus", reset);
      node.removeEventListener("blur", reset);
      for (const layer of layers) layer.ledger.restore();
    };
  }
  function writeDotPosition(dot, x, y) {
    dot.style.translate = `${x.toFixed(1)}px ${y.toFixed(1)}px`;
  }
  function createCursorDot(doc, dotClass, labelText) {
    const dot = doc.createElement("span");
    dot.className = `kui-cursor-dot ${dotClass}`;
    dot.setAttribute("aria-hidden", "true");
    if (labelText) dot.textContent = labelText;
    doc.body.append(dot);
    return dot;
  }
  function createCursorRunners(dot, config, deps) {
    const position = { x: 0, y: 0 };
    const onAxis = (axis) => (value) => {
      position[axis] = value;
      writeDotPosition(dot, position.x, position.y);
    };
    return {
      x: createSpringRunner(config, onAxis("x"), deps),
      y: createSpringRunner(config, onAxis("y"), deps)
    };
  }
  function prepareCursorDot(el, params, ctx, dotClass) {
    if (!supportsFineHover(ctx.win)) return () => {
    };
    const doc = el.ownerDocument;
    const node = el;
    const dot = createCursorDot(doc, dotClass, params.text("label", ""));
    const runners = createCursorRunners(dot, springFrom(params), springDepsFor(ctx));
    function show() {
      dot.classList.add("kui-cursor-dot-active");
    }
    function hide() {
      dot.classList.remove("kui-cursor-dot-active");
    }
    function onMove(event) {
      show();
      runners.x.to(event.clientX);
      runners.y.to(event.clientY);
    }
    function onFocus() {
      const rect = node.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      show();
      runners.x.set(cx);
      runners.y.set(cy);
      writeDotPosition(dot, cx, cy);
    }
    node.addEventListener("pointermove", onMove, { passive: true });
    node.addEventListener("pointerleave", hide, { passive: true });
    node.addEventListener("focus", onFocus);
    node.addEventListener("blur", hide);
    return () => {
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", hide);
      node.removeEventListener("focus", onFocus);
      node.removeEventListener("blur", hide);
      runners.x.stop();
      runners.y.stop();
      dot.remove();
    };
  }
  function prepareSpotlight(el, params, ctx) {
    if (!supportsFineHover(ctx.win)) return () => {
    };
    const node = el;
    if (ctx.win.getComputedStyle(node).position === "static") ctx.style.set("position", "relative");
    function writeSpot(x, y, on) {
      ctx.style.set("--kui-x", x);
      ctx.style.set("--kui-y", y);
      ctx.style.set("--kui-spotlight-opacity", on ? "1" : "0");
    }
    function onMove(event) {
      const rect = node.getBoundingClientRect();
      writeSpot(`${(event.clientX - rect.left).toFixed(1)}px`, `${(event.clientY - rect.top).toFixed(1)}px`, true);
    }
    function hide() {
      writeSpot("50%", "50%", false);
    }
    function onFocus() {
      writeSpot("50%", "50%", true);
    }
    node.addEventListener("pointermove", onMove, { passive: true });
    node.addEventListener("pointerleave", hide, { passive: true });
    node.addEventListener("focus", onFocus);
    node.addEventListener("blur", hide);
    return () => {
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", hide);
      node.removeEventListener("focus", onFocus);
      node.removeEventListener("blur", hide);
    };
  }
  var tiltParams = {
    maxAngle: { type: "number", default: "14", cssProperty: "--kui-max-angle" },
    perspective: { type: "length", default: "800px", cssProperty: "--kui-perspective" }
  };
  var parallaxParams = {
    strength: { type: "number", default: "24", cssProperty: "--kui-strength" }
  };
  var cursorDotParams = {
    ...springParams,
    label: { type: "text", default: "", cssProperty: "--kui-label" }
  };
  var POINTER_PRIMITIVES = [
    pointerPrimitive("tilt-3d", ["rotate"], tiltParams, deferPrepare(prepareTilt3d)),
    pointerPrimitive("tilt-parallax", ["translate"], parallaxParams, deferPrepare(prepareTiltParallax)),
    pointerPrimitive("cursor-follow", ["translate"], cursorDotParams, deferPrepare(prepareCursorFollow)),
    pointerPrimitive("cursor-lag", ["translate"], cursorDotParams, deferPrepare(prepareCursorLag)),
    pointerPrimitive("cursor-label", ["translate"], cursorDotParams, deferPrepare(prepareCursorLabel)),
    pointerPrimitive("cursor-invert", ["translate"], cursorDotParams, deferPrepare(prepareCursorInvert)),
    // `pseudo-before`: the glow overlay is a `::before` rule in `interaction.css`, so this primitive
    // owns that box the same way the border family does. See `border-draw`'s comment in
    // `HOVER_PRIMITIVES` for what the token means and why it was added here in the same change.
    pointerPrimitive("cursor-spotlight", ["spotlight", "pseudo-before"], {}, deferPrepare(prepareSpotlight))
  ];
  function prepareCursorFollow(el, params, ctx) {
    return prepareCursorDot(el, params, ctx, "kui-cursor-dot-follow");
  }
  function prepareCursorLag(el, params, ctx) {
    return prepareCursorDot(el, params, ctx, "kui-cursor-dot-lag");
  }
  function prepareCursorLabel(el, params, ctx) {
    return prepareCursorDot(el, params, ctx, "kui-cursor-dot-label");
  }
  function prepareCursorInvert(el, params, ctx) {
    return prepareCursorDot(el, params, ctx, "kui-cursor-dot-invert");
  }
  var POINTER_PRESETS = [
    { name: "tilt-3d", primitive: "tilt-3d" },
    { name: "tilt-parallax", primitive: "tilt-parallax" },
    { name: "cursor-follow", primitive: "cursor-follow", params: { stiffness: "300", damping: "30" } },
    { name: "cursor-lag", primitive: "cursor-lag", params: { stiffness: "80", damping: "14" } },
    { name: "cursor-label", primitive: "cursor-label", params: { stiffness: "260", damping: "26", label: "View" } },
    { name: "cursor-spotlight", primitive: "cursor-spotlight" },
    { name: "cursor-invert", primitive: "cursor-invert", params: { stiffness: "260", damping: "26" } }
  ];
  var INTERACTION_PRIMITIVES = [
    ...HOVER_PRIMITIVES,
    ...POINTER_PRIMITIVES,
    ...CONTINUOUS_BORDER_PRIMITIVES,
    ...STATE_PRIMITIVES,
    ...REVEAL_PRIMITIVES
  ];
  var INTERACTION_PRESETS = [
    ...HOVER_PRESETS,
    ...POINTER_PRESETS,
    ...CONTINUOUS_BORDER_PRESETS,
    ...STATE_PRESETS,
    ...REVEAL_PRESETS
  ];
  function registerInteraction(registry) {
    return registry.registerPrimitives(INTERACTION_PRIMITIVES).registerPresets(INTERACTION_PRESETS);
  }

  // src/effects/catalog/interaction-proximity.ts
  function prepareProximityField(el, params, ctx) {
    if (!supportsFineHover(ctx.win)) return () => {
    };
    const node = el;
    function onMove(event) {
      ctx.style.set("--kui-proximity-x", `${event.clientX}px`);
      ctx.style.set("--kui-proximity-y", `${event.clientY}px`);
      ctx.style.set("--kui-proximity-opacity", "1");
    }
    function hide() {
      ctx.style.set("--kui-proximity-opacity", "0");
    }
    node.addEventListener("pointermove", onMove, { passive: true });
    node.addEventListener("pointerleave", hide, { passive: true });
    return () => {
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", hide);
    };
  }
  var PROXIMITY_FIELD_PRIMITIVES = [
    {
      id: "proximity-field",
      renderer: "javascript",
      // Paints nothing of its own; see the file comment for why this channel exists anyway.
      channels: ["proximity"],
      parameters: {},
      supportedTimelines: ["time", "pointer"],
      supportedActivations: ["load", "manual"],
      defaultActivation: "load",
      perfClass: "continuous",
      // Continuous pointer tracking with no meaningful "shortened" form, the same policy
      // `catalog/interaction.ts`'s `pointerPrimitive` gives `tilt-3d`/`cursor-spotlight`/etc.
      reducedMotion: "disable",
      prepare: withTimingContract(
        "proximity-field",
        {
          because: "it tracks pointer position continuously across a container, so it has no start moment and no fixed span"
        },
        deferPrepare(prepareProximityField)
      )
    }
  ];
  var PROXIMITY_FIELD_PRESETS = [
    { name: "proximity-field", phase: "state", primitive: "proximity-field" }
  ];
  var proximityGlowParams = {
    duration: { type: "time", default: "200ms", cssProperty: "--kui-duration" },
    ease: { type: "easing", default: "ease-out", cssProperty: "--kui-ease" },
    color: { type: "color", default: "", cssProperty: "--kui-proximity-glow-color" },
    radius: { type: "length", default: "220px", cssProperty: "--kui-proximity-glow-radius" },
    width: { type: "length", default: "1px", cssProperty: "--kui-proximity-glow-width" },
    outset: { type: "length", default: "0px", cssProperty: "--kui-proximity-glow-outset" }
  };
  var PROXIMITY_GLOW_PRIMITIVES = [
    {
      id: "proximity-glow",
      renderer: "javascript",
      // `pseudo-before`: joins the existing `::before` ownership token rather than minting a new one
      // — see the file comment's cost analysis for exactly what that refuses and what it still leaves
      // reachable.
      channels: ["pseudo-before"],
      parameters: proximityGlowParams,
      supportedTimelines: ["time"],
      supportedActivations: ["load"],
      defaultActivation: "load",
      perfClass: "paint",
      reducedMotion: "shorten",
      prepare: stylesheetTimingPrepare("proximity-glow", {
        // `delay` refused by name: this ring is ambient chrome fed by an ancestor `proximity-field`,
        // not a response to its own trigger, so there is no start moment on *this* element to delay.
        honours: ["duration", "ease"],
        because: "the ring is ambient chrome fed by an ancestor proximity-field and has no discrete start moment of its own to delay"
      })
    }
  ];
  var PROXIMITY_GLOW_PRESETS = [
    { name: "proximity-glow", phase: "state", primitive: "proximity-glow" }
  ];
  var INTERACTION_PROXIMITY_PRIMITIVES = [
    ...PROXIMITY_FIELD_PRIMITIVES,
    ...PROXIMITY_GLOW_PRIMITIVES
  ];
  var INTERACTION_PROXIMITY_PRESETS = [
    ...PROXIMITY_FIELD_PRESETS,
    ...PROXIMITY_GLOW_PRESETS
  ];
  function registerInteractionProximity(registry) {
    return registry.registerPrimitives(INTERACTION_PROXIMITY_PRIMITIVES).registerPresets(INTERACTION_PROXIMITY_PRESETS);
  }

  // src/effects/catalog/materials.ts
  var UNSET = "";
  var glassParams = {
    /**
     * Backdrop blur radius.
     *
     * `length`, not `'length|percentage'`: a percentage in `blur()` is not valid CSS at all, so
     * declaring the union would advertise a spelling the browser drops on the floor.
     *
     * **Unbounded, knowingly.** `blur:400px` is accepted, and on a large panel it is genuinely
     * expensive — see this primitive's `perfClass` note. There is no way to bound it in the schema:
     * `maximum` applies only to `BOUNDED_TYPES` (`number` and `number|percentage`), because a length
     * has no single scale to compare against, and re-typing this as a unitless number to gain the
     * bound would break the one spelling every author already knows. Documented in
     * `docs/catalog.md` instead, which is where the cost belongs anyway.
     */
    blur: { type: "length", default: "16px", cssProperty: "--kui-glass-blur" },
    /**
     * Backdrop saturation multiplier. `1` leaves the backdrop's colour alone; the `1.6` default
     * pushes it back up because the blur above has just averaged it toward grey.
     *
     * `minimum: 0` and no maximum: `saturate()` is defined for any non-negative value and the
     * over-driven look (`saturate:3`) is a legitimate one. Negative is not — CSS clamps it silently,
     * which is exactly the kind of accepted-then-ignored value the schema exists to name out loud.
     */
    saturate: {
      type: "number|percentage",
      default: "1.6",
      cssProperty: "--kui-glass-saturate",
      finite: true,
      minimum: 0
    },
    /**
     * How opaque the tint is. Bounded to 0..1 because it is an alpha, and `glass.css` spends it as
     * the mix percentage in a `color-mix()` — a value outside the range would clamp there anyway,
     * silently, which is worse than a warning naming the parameter.
     */
    opacity: {
      type: "number|percentage",
      default: "0.12",
      cssProperty: "--kui-glass-opacity",
      finite: true,
      minimum: 0,
      maximum: 1
    },
    /**
     * The colour the tint is mixed from — the glass itself, before {@link glassParams.opacity}
     * decides how much of it shows. White on a dark page, near-black on a light one.
     */
    tint: { type: "color", default: UNSET, cssProperty: "--kui-glass-tint" },
    /**
     * The hairline rim colour, which is also the sheen's colour by fallback — one light source lights
     * both, so `rim:silver` recolours the edge and the highlight together. `glass.css`'s
     * `--kui-glass-sheen-color` is the hand-set property for anyone who wants them to disagree.
     *
     * Its own `var()` fallback carries an alpha (`rgb(255 255 255 / 0.22)`), so an author writing a
     * bare keyword — `rim:silver` — gets a fully opaque hairline. That is the literal request and is
     * left alone rather than second-guessed with a `color-mix`; an author who wants it faint writes
     * the alpha themselves, which the `color` type accepts in every CSS spelling.
     */
    rim: { type: "color", default: UNSET, cssProperty: "--kui-glass-rim" },
    /** Hairline thickness. Its own parameter rather than folded into `rim:`, because there is no
     *  colour type that carries a width and inventing one would mean parsing the `border` grammar. */
    "rim-width": { type: "length", default: "1px", cssProperty: "--kui-glass-rim-width" },
    /**
     * Strength of the top-weighted sheen gradient, as an alpha on the rim colour. `0` removes it and
     * leaves a flat tinted panel, which is the right base for a surface that composes `shine-sweep`
     * for its highlight instead.
     */
    sheen: {
      type: "number|percentage",
      default: "0.16",
      cssProperty: "--kui-glass-sheen",
      finite: true,
      minimum: 0,
      maximum: 1
    },
    /**
     * Corner radius. `'length|percentage'` because both are real readings here and neither can be
     * normalised into the other — `radius:50%` resolves against a box this code has not measured.
     *
     * This is what makes one primitive cover both halves of the reference: `glass` is a
     * panel, and `glass radius:999px` is a pill. A second preset for the pill would be a
     * near-duplicate name for a one-value difference, which is the thing this catalog's
     * one-primitive-many-names shape exists to avoid.
     *
     * {@link UNSET} rather than `'16px'` for the reason that constant documents: an authored value
     * becomes an *inline* custom property, and defaulting it would put the library's opinion in
     * front of a page that already set its own `border-radius`. Unauthored, `glass.css`'s own 16px
     * fallback applies from inside `@layer kui.effects`, which any unlayered page rule beats.
     */
    radius: { type: "length|percentage", default: UNSET, cssProperty: "--kui-glass-radius" }
  };
  function prepareGlass() {
    return continuousSetup(() => {
    });
  }
  var MATERIALS_PRIMITIVES = [
    {
      id: "glass",
      // `javascript`, like the whole of section I and section Q, and for the same reason: there is no
      // keyframe to compile. A `css-keyframes` renderer would push an empty `animation-*` track and
      // then have `pushTrack` write declarations for a track with nothing in it.
      renderer: "javascript",
      channels: ["background", "backdrop"],
      parameters: glassParams,
      // An abstention rather than a claim — this primitive never reads `Timeline` at all, so naming
      // `['time']` would needlessly narrow what a scrubbed neighbour on the same element may request.
      // Same constant, same reasoning, as `rotate-static` and `background-media`.
      supportedTimelines: TIMELINE_AGNOSTIC,
      // `'load'` as the default so a panel already on screen at page load, sitting in a background
      // tab, or still zero-area is not waiting on an `IntersectionObserver` that may never fire to be
      // given the surface it is supposed to be *made of*. `'enter'` and `'manual'` stay available for
      // an author who deliberately wants the glass to arrive later.
      supportedActivations: ["load", "enter", "manual"],
      defaultActivation: "load",
      /*
       * `perfClass: 'paint'` — chosen, not defaulted, and the honest upper bound of a vocabulary that
       * has no exact word for what `backdrop-filter` costs.
       *
       * What the five classes mean here. `'compositor'` is a lie outright: a backdrop filter is not
       * GPU-cheap layer work, it forces the browser to snapshot everything painted behind the element
       * into a texture, run a separable blur over it, and composite the result — extra render passes
       * per frame, which is the exact opposite of the "transform and opacity only" budget that class
       * stands for. `'layout'` is wrong in the other direction: nothing here reads or writes geometry.
       * `'continuous'` was the closest fit on one axis and was rejected: in this catalog it means
       * "runs a clock forever" (ambient loops, pointer tracking), and a reader checking whether an
       * effect needs a reduced-motion story or a `finished` promise would be misled by it. `'paint'`
       * says "this element repaints rather than merely re-composites", which is true.
       *
       * What `'paint'` under-states, and why it is written down rather than left to be discovered:
       * an ordinary repaint costs when *this element* changes. A backdrop filter costs when *anything
       * behind it* changes — scrolling a page under a fixed glass header re-runs the blur every frame
       * while the header itself is perfectly static. And the cost scales with the panel's **area**,
       * not its complexity, which is why the dangerous case is a full-bleed glass hero on a phone and
       * not a glass button anywhere. Two or more overlapping glass surfaces multiply it, because each
       * one's backdrop includes the one below.
       *
       * The mitigations are real and are documented on the effect rather than hidden here: keep the
       * blurred area small, do not stack glass on glass, and `blur:0px` turns the pass off entirely
       * while leaving the tint, rim and sheen — a legible non-glass fallback an author can gate on a
       * media query themselves. If a perf-budget harness ever lands, this primitive wants a bound of
       * its own rather than the generic `'paint'` one; that is the note this comment exists to leave.
       */
      perfClass: "paint",
      /*
       * `'shorten'`, for the reason `transforms.ts` argues at length rather than because a glass
       * panel is exempt from anything. Nothing in `glass.css` moves, so there is no motion to reduce;
       * `'shorten'` is what `mergeHostFacts` seeds the fold with, which makes it the identity element
       * of `strictestPolicy` and therefore this primitive's way of saying "I impose no reduced-motion
       * constraint of my own". `'disable'` would be actively wrong: it is a fact about the *element*,
       * so `glass, count-up` would leave the counter reading zero forever.
       *
       * The user preference a translucent blurred surface actually engages is
       * `prefers-reduced-transparency`, which is a different query and is unhandled catalog-wide —
       * see `glass.css`'s own note.
       */
      reducedMotion: "shorten",
      /*
       * No timing tokens, refused out loud. A material has no start moment for a `delay` to push, no
       * span for a `duration` to stretch, and no curve for an `ease` to bend — so `glass
       * 400ms` warns by name instead of parsing cleanly and doing nothing, which is
       * indistinguishable from a broken effect. This is what puts `glass` on
       * `js-effect-timing-parity.test.ts`'s `TIMING_REFUSALS` side of the ledger.
       */
      prepare: withTimingContract(
        "glass",
        { because: "it paints a resting surface rather than animating, so there is no motion to time" },
        deferPrepare(prepareGlass)
      )
    }
  ];
  var MATERIALS_PRESETS = [{ name: "glass", primitive: "glass" }];
  function registerMaterials(registry) {
    return registry.registerPrimitives(MATERIALS_PRIMITIVES).registerPresets(MATERIALS_PRESETS);
  }

  // src/effects/catalog/background-media.ts
  var VIDEO_EXTENSIONS = /* @__PURE__ */ new Set(["mp4", "webm", "mov", "m4v", "ogv"]);
  var VIDEO_PAGE_HOSTS = /* @__PURE__ */ new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
    "youtu.be",
    "www.youtu.be"
  ]);
  function normalizeUrl(value) {
    const stripped = value.replace(/[\t\n\r]/g, "");
    let start = 0;
    while (start < stripped.length && stripped.charCodeAt(start) <= 32) start += 1;
    return stripped.slice(start);
  }
  function hostOf(value) {
    const withoutScheme = normalizeUrl(value).replace(/^[a-z][a-z0-9+.-]*:/i, "").replace(/^\/\//, "");
    const end = withoutScheme.search(/[/?#]/);
    const authority = end === -1 ? withoutScheme : withoutScheme.slice(0, end);
    return authority.slice(authority.lastIndexOf("@") + 1).toLowerCase();
  }
  function isVideoPageUrl(value) {
    return VIDEO_PAGE_HOSTS.has(hostOf(value));
  }
  var FOCAL_POINTS = {
    center: "50% 50%",
    top: "50% 0%",
    bottom: "50% 100%",
    left: "0% 50%",
    right: "100% 50%",
    "top-left": "0% 0%",
    "top-right": "100% 0%",
    "bottom-left": "0% 100%",
    "bottom-right": "100% 100%"
  };
  var FOCAL_POINT_NAMES = Object.keys(FOCAL_POINTS);
  function focalPosition(focus) {
    return FOCAL_POINTS[focus] ?? FOCAL_POINTS.center;
  }
  function paintsOverlay(options) {
    return options.overlay !== "transparent" && options.overlayOpacity > 0;
  }
  function isVideoSource(src) {
    const path2 = src.split("?")[0].split("#")[0];
    const dot = path2.lastIndexOf(".");
    if (dot <= path2.lastIndexOf("/")) return false;
    return VIDEO_EXTENSIONS.has(path2.slice(dot + 1).toLowerCase());
  }
  var ALLOWED_SCHEMES = /* @__PURE__ */ new Set(["http", "https"]);
  function schemeOf(value) {
    const match = /^([a-z][a-z0-9+.-]*):/i.exec(normalizeUrl(value));
    return match ? match[1].toLowerCase() : "";
  }
  function mediaSource(authored, name, ctx) {
    if (!authored) return authored;
    if (isVideoPageUrl(authored)) {
      ctx.warn(
        `background-media "${name}": "${authored}" is a video *page*, not a media file \u2014 a YouTube URL cannot be played by <video> and needs an iframe embed instead. Point "${name}" at an .mp4/.webm file, or use a YouTube facade alongside this effect.`
      );
      return "";
    }
    const scheme = schemeOf(authored);
    if (!scheme || ALLOWED_SCHEMES.has(scheme)) return authored;
    ctx.warn(
      `background-media "${name}": "${scheme}:" URLs are not allowed \u2014 use https:, http:, or a path such as "/media/hero.mp4".`
    );
    return "";
  }
  function styleLayer(node) {
    const { style } = node;
    style.setProperty("position", "absolute");
    style.setProperty("top", "0");
    style.setProperty("left", "0");
    style.setProperty("width", "100%");
    style.setProperty("height", "100%");
    style.setProperty("border-radius", "inherit");
    style.setProperty("pointer-events", "none");
    style.setProperty("z-index", "-1");
  }
  function createOverlay(doc, options) {
    const scrim = doc.createElement("div");
    styleLayer(scrim);
    scrim.style.setProperty("background", options.overlay);
    scrim.style.setProperty("opacity", String(options.overlayOpacity));
    scrim.setAttribute("aria-hidden", "true");
    return scrim;
  }
  function createVideo(doc, options) {
    const video = doc.createElement("video");
    video.muted = true;
    video.setAttribute("muted", "");
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.loop = options.loop;
    video.defaultPlaybackRate = options.rate;
    video.playbackRate = options.rate;
    video.preload = "metadata";
    if (options.poster) video.poster = options.poster;
    video.src = options.src;
    return video;
  }
  function play2(video) {
    const started = video.play();
    if (started) void started.catch(() => {
    });
  }
  function startPlayback(video, win, options) {
    if (options.reducedMotion || options.autoplay === "never") return () => {
    };
    if (options.autoplay === "always") {
      play2(video);
      return () => {
        if (!video.paused) video.pause();
      };
    }
    return autoplayInView(video, win);
  }
  function createImage(doc, options) {
    const image = doc.createElement("img");
    image.alt = "";
    image.decoding = "async";
    image.src = options.src;
    return image;
  }
  function autoplayInView(video, win) {
    const Observer = win.IntersectionObserver;
    if (!Observer) return () => {
    };
    const observer = new Observer(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) play2(video);
          else if (!video.paused) video.pause();
        }
      },
      { threshold: 0 }
    );
    observer.observe(video);
    return () => {
      observer.disconnect();
      if (!video.paused) video.pause();
    };
  }
  function installBackgroundMedia(el, ctx, options) {
    const doc = el.ownerDocument;
    const video = isVideoSource(options.src) ? createVideo(doc, options) : null;
    const node = video ?? createImage(doc, options);
    styleLayer(node);
    node.style.setProperty("object-fit", options.fit);
    node.style.setProperty("object-position", options.position);
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("data-kui-background", "");
    el.append(node);
    const overlay2 = paintsOverlay(options) ? createOverlay(doc, options) : null;
    if (overlay2) {
      overlay2.setAttribute("data-kui-background-overlay", "");
      el.append(overlay2);
    }
    const stopPlayback = video ? startPlayback(video, ctx.win, options) : () => {
    };
    return {
      remove: () => {
        stopPlayback();
        node.remove();
        overlay2?.remove();
      }
    };
  }

  // src/effects/catalog/media-shared.ts
  var AXIS_DEGREES = { vertical: 0, horizontal: 90 };
  var UNIT_DEGREES = { deg: 1, d: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };
  var BAND_OVERLAP_PX = 1;
  var STAGE_CLASS = "kui-slat-stage";
  var SLAT_CLASS = "kui-slat-item";
  var GOLDEN_RATIO_CONJUGATE = 0.6180339887498949;
  function slatOrder(index, count, from) {
    if (count <= 1) return 0;
    switch (from) {
      case "start":
        return index;
      case "end":
        return count - 1 - index;
      case "edges":
        return Math.min(index, count - 1 - index);
      case "random-ish":
        return Math.floor(index * GOLDEN_RATIO_CONJUGATE % 1 * count);
      case "alternate":
      default:
        return zigzagRank(index, count);
    }
  }
  function zigzagRank(index, count) {
    const fromStart = index;
    const fromEnd = count - 1 - index;
    const pair = Math.min(fromStart, fromEnd);
    return fromStart <= fromEnd ? pair * 2 : pair * 2 + 1;
  }
  function slatAngleDegrees(authored, axis) {
    const trimmed = authored.trim();
    if (!trimmed) return AXIS_DEGREES[axis];
    const match = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(deg|d|rad|grad|turn)?$/.exec(trimmed);
    if (!match) return AXIS_DEGREES[axis];
    const value = Number(match[1]);
    if (!Number.isFinite(value)) return AXIS_DEGREES[axis];
    const unit = match[2] ?? "deg";
    const degrees = value * UNIT_DEGREES[unit];
    return (degrees % 180 + 180) % 180;
  }
  function slatTravelVector(angleDegrees) {
    const theta = angleDegrees * Math.PI / 180;
    return { x: -Math.sin(theta), y: Math.cos(theta) };
  }
  function slatBandClip(index, count, angleDegrees, box) {
    const { width, height } = box;
    const theta = angleDegrees * Math.PI / 180;
    const nx = Math.cos(theta);
    const ny = Math.sin(theta);
    const { x: dx, y: dy } = slatTravelVector(angleDegrees);
    const span = Math.abs(nx) * width + Math.abs(ny) * height;
    const centreX = width / 2;
    const centreY = height / 2;
    const step = span / count;
    const near = index * step - span / 2 - BAND_OVERLAP_PX;
    const far = (index + 1) * step - span / 2 + BAND_OVERLAP_PX;
    const reach = width + height;
    const corner = (along, across) => `${(centreX + along * nx + across * dx).toFixed(2)}px ${(centreY + along * ny + across * dy).toFixed(2)}px`;
    return `polygon(${corner(near, reach)}, ${corner(near, -reach)}, ${corner(far, -reach)}, ${corner(far, reach)})`;
  }
  function axisLabel(angleDegrees) {
    if (angleDegrees === 0) return "vertical";
    if (angleDegrees === 90) return "horizontal";
    return "diagonal";
  }
  function syncStageToImage(stage, img, bands) {
    const { slats, angleDegrees } = bands;
    const width = img.offsetWidth;
    const height = img.offsetHeight;
    stage.style.top = `${img.offsetTop}px`;
    stage.style.left = `${img.offsetLeft}px`;
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    slats.forEach((slat, index) => {
      slat.style.clipPath = slatBandClip(index, slats.length, angleDegrees, { width, height });
    });
  }
  function watchImageBox(stage, img, win, bands) {
    const handler = () => syncStageToImage(stage, img, bands);
    win.addEventListener("resize", handler, { passive: true });
    const stopWindow = () => win.removeEventListener("resize", handler);
    const ResizeObserverCtor = win.ResizeObserver;
    if (!ResizeObserverCtor) return stopWindow;
    const observer = new ResizeObserverCtor(handler);
    observer.observe(img);
    return () => {
      stopWindow();
      observer.disconnect();
    };
  }
  function imagePaintStyle(img, win) {
    const computed = win.getComputedStyle(img);
    const position = computed.objectPosition || "50% 50%";
    const fit = computed.objectFit;
    if (fit === "cover") return { size: "cover", position };
    if (fit === "contain" || fit === "scale-down") return { size: "contain", position };
    if (fit === "none") return { size: "auto", position };
    return { size: "100% 100%", position };
  }
  function installSlatStage(el, doc, win, options) {
    const img = el.querySelector("img");
    if (!img) return null;
    const url = img.currentSrc || img.getAttribute("src") || "";
    if (!url) return null;
    const { count, angleDegrees, from, fold } = options;
    const travel = slatTravelVector(angleDegrees);
    const stage = doc.createElement("div");
    stage.className = STAGE_CLASS;
    stage.setAttribute("aria-hidden", "true");
    stage.dataset.kuiSlatAxis = axisLabel(angleDegrees);
    stage.dataset.kuiSlatAngle = String(angleDegrees);
    stage.dataset.kuiSlatFold = String(fold);
    stage.style.setProperty("--kui-slat-count", String(count));
    stage.style.setProperty("--kui-slat-dx", travel.x.toFixed(4));
    stage.style.setProperty("--kui-slat-dy", travel.y.toFixed(4));
    const paint = imagePaintStyle(img, win);
    const slats = [];
    for (let index = 0; index < count; index++) {
      const slat = doc.createElement("div");
      slat.className = SLAT_CLASS;
      slat.style.setProperty("--kui-slat-index", String(index));
      slat.style.setProperty("--kui-i", String(slatOrder(index, count, from)));
      slat.style.backgroundImage = `url("${url}")`;
      slat.style.backgroundSize = paint.size;
      slat.style.backgroundPosition = paint.position;
      stage.append(slat);
      slats.push(slat);
    }
    el.append(stage);
    const bands = { slats, angleDegrees };
    syncStageToImage(stage, img, bands);
    const stopWatching = watchImageBox(stage, img, win, bands);
    const imageStyles = createStyleLedger(img);
    imageStyles.set("visibility", "hidden");
    return {
      stage,
      slats,
      restore: () => {
        stopWatching();
        imageStyles.restore();
        stage.remove();
      }
    };
  }
  function applySlatTimingVars(stage, params) {
    const { durationMs, delayMs, easing } = params.timing;
    const duration = durationMs === void 0 ? params.text("duration", "500ms") : `${durationMs}ms`;
    const delay = delayMs === void 0 ? params.text("delay", "0ms") : `${delayMs}ms`;
    stage.style.setProperty("--kui-duration", duration);
    stage.style.setProperty("--kui-delay", delay);
    stage.style.setProperty("--kui-ease", cssEasingValue(easing ?? params.text("ease", "ease-out")));
    stage.style.setProperty("--kui-stagger", params.text("stagger", "60ms"));
  }
  function slatAssembleFinishMs(params, count) {
    if (count === 0) return 0;
    const durationMs = params.timing.durationMs ?? params.ms("duration", 500);
    const delayMs = params.timing.delayMs ?? params.ms("delay", 0);
    const staggerMs = params.ms("stagger", 60);
    return delayMs + (count - 1) * staggerMs + durationMs;
  }

  // src/effects/catalog/media.ts
  var geometry = {
    distance: { type: "length", default: "24px", cssProperty: "--kui-distance" },
    scale: { type: "number", default: "1.12", cssProperty: "--kui-to-scale" }
  };
  var MEDIA_CSS_PRIMITIVES = [
    cssPrimitive("media-wipe", [CHANNEL.clip]),
    cssPrimitive("media-mask", ["mask"], { perfClass: "paint" }),
    // Not `reducedMotion: 'disable'` — that policy means "no finite duration would make sense,
    // because the animation never ends" (see `ambient.ts`/`feedback.ts`), and a Ken Burns pan/zoom
    // is the opposite of that: a one-shot cinematic move with a real, shortenable duration. The demo
    // authors it as `ken-burns 9000ms` (a still image, one slow zoom, then it holds) and
    // `ken-burns 3000ms on:hover` (zooms in while hovered), and its complement `ken-burns-out` is a
    // second one-shot preset for the reverse move — not a `-loop` variant the way `typewriter-loop`
    // or `marquee`/`marquee-scroll-linked` are. `kui-ken-burns`'s keyframe (`scale: 1` to `1.12`,
    // no loop-safe midpoint) is shaped for exactly that: run once, land on the zoomed frame, stay
    // there. `'disable'` here previously looked like the same missing-`--kui-fx-*-iterations` bug as
    // `marquee`/`gradient-shimmer`, but the actual defect was this policy — the default `'shorten'`
    // is correct, so no `--kui-fx-ken-burns-iterations` is needed at all.
    cssPrimitive("media-ken-burns", [CHANNEL.translate, CHANNEL.scale], {
      parameters: geometry
    }),
    cssPrimitive("media-filter", [CHANNEL.filter], {
      defaultActivation: "hover",
      perfClass: "paint"
    }),
    // `geometry.distance` only, not `...geometry`: `kui-blur-up` (media.css) reads `--kui-distance`
    // and `--kui-blur` but never `--kui-to-scale` — this primitive doesn't even declare
    // `CHANNEL.scale`. Spreading the whole shared object used to expose `scale:` as an
    // apparently-valid, silently-inert parameter, the same shape `flip-3d`'s dead `perspective`
    // parameter was (`entrance.css`'s comment on `kui-flip-in-x`).
    cssPrimitive("media-blur-up", [CHANNEL.translate, CHANNEL.filter], {
      parameters: {
        distance: geometry.distance,
        blur: { type: "length", default: "16px", cssProperty: "--kui-blur" }
      },
      perfClass: "paint"
    }),
    // No `defaultActivation` — same convention `core.ts`'s `parallax`/`parallax-scale`/
    // `parallax-rotate`/`scroll-fade`/`desaturate`/`skew`/`progress`/`progress-stroke` already use
    // for every other `timelines: ['view', 'scroll', ...]` primitive. `resolveActivation`
    // (`animator.ts`) only consults `defaultActivation` when the author named no activation, and
    // falls through to `element-config.ts`'s hardcoded `'enter'` when a primitive declares none.
    // Setting it to `'manual'` here (matching `activations: ['manual']`) looked like the obviously
    // correct pairing, but it is what actually broke the effect: `effectiveActivation`
    // (`style-plan.ts`) only converts a stuck `'manual'` into `'enter'` when `config.timeline !==
    // 'time'` — i.e. only once the author has actually written `timeline:view`/`timeline:scroll`.
    // Authored bare (no `timeline:`, the sweep's own probe and the likely first thing anyone
    // tries), `config.timeline` stays the default `'time'`, that conversion never fires, and the
    // element sits at `data-kui-state="ready"` forever — which is also the state
    // `entrance.css`'s `[data-kui-state='ready'] { --kui-distance: 0px !important; }` targets, so
    // every sample read the same permanently-zeroed `--kui-distance`: not a paused animation, a
    // zeroed one. `timeline:view`/`timeline:scroll` usage is unaffected either way, since a native
    // timeline resolves to the `'native-timeline'` gate before activation is even consulted.
    // `geometry.distance` only: `kui-image-parallax-frame` never reads `--kui-to-scale` and this
    // primitive doesn't declare `CHANNEL.scale` — same dead-parameter shape as `media-blur-up` above.
    cssPrimitive("media-parallax-frame", [CHANNEL.translate], {
      parameters: { distance: geometry.distance },
      timelines: ["view", "scroll"],
      activations: ["manual"],
      reducedMotion: "disable"
    }),
    // Its own `scale` parameter, not `geometry`: `kui-lightbox-open` opens from a fixed 0.92, never
    // reading `--kui-to-scale` (or any `distance`, since this primitive doesn't animate position at
    // all) — the whole shared object was dead weight here. Unlike `media-blur-up`/
    // `media-parallax-frame`, this primitive *does* declare `CHANNEL.scale`, so the fix is to wire
    // the keyframe up to a real parameter rather than remove the promise: `--kui-from-scale`, the
    // same name and "starts at this scale, animates to 1" meaning `scale`/`scale-move`
    // (`catalog/core.ts`) already use, so `lightbox-open scale:0.8` now does what it looks like it
    // should. See `kui-lightbox-open` in `media.css`.
    cssPrimitive("media-lightbox", [CHANNEL.opacity, CHANNEL.scale], {
      parameters: { scale: { type: "number", default: "0.92", cssProperty: "--kui-from-scale" } }
    })
  ];
  var MEDIA_CSS_PRESETS = [
    { name: "wipe-up", primitive: "media-wipe", keyframes: "kui-wipe-up", cloak: true },
    { name: "wipe-down", primitive: "media-wipe", keyframes: "kui-wipe-down", cloak: true },
    { name: "wipe-left", primitive: "media-wipe", keyframes: "kui-wipe-left", cloak: true },
    { name: "wipe-right", primitive: "media-wipe", keyframes: "kui-wipe-right", cloak: true },
    { name: "wipe-circle", primitive: "media-wipe", keyframes: "kui-wipe-circle", cloak: true },
    { name: "wipe-diagonal", primitive: "media-wipe", keyframes: "kui-wipe-diagonal", cloak: true },
    { name: "mask-reveal", primitive: "media-mask", keyframes: "kui-mask-reveal", cloak: true },
    { name: "curtain-reveal", primitive: "media-wipe", keyframes: "kui-curtain-reveal", cloak: true },
    { name: "ken-burns", primitive: "media-ken-burns", keyframes: "kui-ken-burns" },
    { name: "ken-burns-out", primitive: "media-ken-burns", keyframes: "kui-ken-burns-out" },
    { name: "blur-up", primitive: "media-blur-up", keyframes: "kui-blur-up", cloak: true },
    /*
     * The three `media-filter` hovers below are deliberately **unphased**, and the reason is worth
     * writing down because they briefly were not.
     *
     * They carried `phase: 'state'` on the argument that a hover is a condition the visitor drives
     * and un-drives, held at whichever end it currently rests on. That is a true description of
     * *when* the channel is held, and it is not the question `INDEPENDENT_PHASES` (`core/channels.ts`)
     * is really asking. The `entrance|state` exemption is sound only when the state half is delivered
     * as a **transition or a normal declaration** — the cascade *beneath* the entrance, which a
     * from-only entrance keyframe resolves its missing endpoint against and which shows through the
     * moment the entrance has played. `media-filter` is `renderer: 'css-keyframes'`, so a `state`
     * declaration here does not put anything beneath the entrance; it puts a second `@keyframes`
     * track beside it, on the same element, on the same channel.
     *
     * Measured, before this was reverted — `data-kui="blur-in, duotone-hover"` compiled to
     * `animation-name: kui-blur-in, kui-duotone-hover` with `animation-fill-mode: both, both`, no
     * `animation-composition`, and **zero warnings**. `@keyframes kui-duotone-hover` is two-ended, so
     * it is not an underlying value for `kui-blur-in`'s open endpoint to resolve against: it is later
     * in the list, wins `filter` outright, and `fill-mode: both` clamps its `filter: none` there
     * permanently. The entrance is deleted and the hover is spent before the pointer ever arrives.
     * The explicit `to` that the previous note here called "irrelevant to this phase" was in fact the
     * whole mechanism.
     *
     * So `blur-in, grayscale-hover` goes back to being refused loudly, which is the honest answer: a
     * loud drop the author can see beats a silent clobber they cannot. Reaching the composition again
     * needs delivery mechanism modelled as its own axis beside `phase` — see `channels.ts`'s
     * `INDEPENDENT_PHASES`. Found by three of four auditors in the 2026-09-08 catalog review.
     */
    { name: "duotone-hover", primitive: "media-filter", keyframes: "kui-duotone-hover" },
    { name: "grayscale-hover", primitive: "media-filter", keyframes: "kui-grayscale-hover" },
    { name: "saturate-hover", primitive: "media-filter", keyframes: "kui-saturate-hover" },
    /*
     * `image-parallax-frame` stays unphased: it is scroll/view-timeline-scrubbed (`media-parallax-frame`
     * declares `timelines: ['view', 'scroll']`), the same precedent `catalog/core.ts`'s `parallax-y`
     * already sets for a continuously-scrubbed effect — there is no "turn" to take with a neighbour,
     * because progress never stops being read off the scrollport.
     *
     * `bg`/`background` also stay unphased: `background-media` is a permanent backdrop material, held
     * unconditionally from `load` for as long as the element exists (see its own `continuousSetup`
     * above) — it fits none of the four phases, and should keep conflicting with any other primitive
     * that claims the same channel unconditionally, which is what "permanent" means here.
     */
    {
      name: "image-parallax-frame",
      primitive: "media-parallax-frame",
      keyframes: "kui-image-parallax-frame"
    },
    // `ken-burns`/`ken-burns-out`/`before-after-wipe`/`lightbox-open` are NOT touched here even though
    // they look like the three hovers above at a glance. All four close their keyframe block with an
    // explicit `to` (`kui-ken-burns`, `kui-ken-burns-out`, `kui-before-after-wipe`, `kui-lightbox-open`
    // in `media.css`) and none is hover-toggled — they are one-shot plays, not a visitor-held
    // condition, so `state` would misdescribe them. They are the same closed-keyframe shape as the ten
    // `cloak: true` presets this file already excludes from `entrance`, but — unlike those ten — they
    // are not yet in `test/composition-phase.test.ts`'s `excluded` list. That is a fact about a file
    // this task does not own; left for whoever does.
    { name: "before-after-wipe", primitive: "media-wipe", keyframes: "kui-before-after-wipe" },
    { name: "lightbox-open", primitive: "media-lightbox", keyframes: "kui-lightbox-open" }
  ];
  var slatParams = {
    slats: {
      type: "number",
      default: "8",
      cssProperty: "--kui-slats",
      minimum: 2,
      maximum: 24,
      integer: true
    },
    axis: {
      type: "keyword",
      default: "vertical",
      cssProperty: "--kui-axis",
      keywords: ["vertical", "horizontal"]
    },
    /*
     * The general form of `axis:`, in degrees: `0deg` is `axis:vertical`, `90deg` is
     * `axis:horizontal`, and anything between cuts the picture into diagonal bands. An authored
     * angle wins; leaving it off reads `axis:`, so every existing attribute keeps its meaning.
     *
     * `text`, not `angle`, for one reason: `readParams` pre-fills every declared parameter with its
     * schema default, so a typed default is indistinguishable from an authored value and there would
     * be no way to tell `angle:0deg` from "no angle, use the axis". An empty default is only possible
     * on a type that is never written to a stylesheet, which is exactly what `text` is for — and this
     * value never reaches CSS anyway. `slatAngleDegrees` does the parsing and the range clamp.
     */
    angle: { type: "text", default: "", cssProperty: "--kui-slat-angle" },
    from: {
      type: "keyword",
      default: "alternate",
      cssProperty: "--kui-from",
      keywords: ["alternate", "start", "end", "edges", "random-ish"]
    },
    fold: { type: "keyword", default: "false", cssProperty: "--kui-fold", keywords: ["true", "false"] },
    duration: { type: "time", default: "500ms", cssProperty: "--kui-duration" },
    ...TRIGGER_DELAY_PARAM,
    ease: { type: "easing", default: "ease-out", cssProperty: "--kui-ease" },
    stagger: { type: "time", default: "60ms", cssProperty: "--kui-stagger" }
  };
  function prepareSlatAssemble(el, params, ctx) {
    const doc = el.ownerDocument;
    const count = Math.min(24, Math.max(2, Math.round(params.num("slats", 8))));
    const axis = params.text("axis", "vertical");
    const angleDegrees = slatAngleDegrees(params.text("angle", ""), axis);
    const from = params.text("from", "alternate");
    const fold = params.is("fold");
    const node = el;
    if (ctx.win.getComputedStyle(node).position === "static") ctx.style.set("position", "relative");
    const built = installSlatStage(el, doc, ctx.win, { count, angleDegrees, from, fold });
    if (!built) return () => {
    };
    const { stage } = built;
    applySlatTimingVars(stage, params);
    stage.classList.add("kui-slat-animating");
    let settle2;
    const finished = new Promise((resolve) => {
      settle2 = resolve;
    });
    let landed = false;
    const land = () => {
      if (landed) return;
      landed = true;
      stage.classList.remove("kui-slat-animating");
      built.restore();
      settle2();
    };
    const timer = ctx.win.setTimeout(land, slatAssembleFinishMs(params, count));
    return {
      cleanup: () => {
        ctx.win.clearTimeout(timer);
        if (landed) return;
        landed = true;
        built.restore();
      },
      finished,
      finish: () => {
        ctx.win.clearTimeout(timer);
        land();
      }
    };
  }
  var backgroundMediaParams = {
    /*
     * `text`, and same-origin-checked at the point of use rather than by the type — identical
     * shape and identical reasoning to `media-scrub`'s own `src` (`scroll-mechanics/primitives.ts`).
     * A URL has no lexical shape to validate against, and `type: 'text'` is the one type that never
     * reaches a stylesheet, which is what makes accepting arbitrary path characters safe.
     */
    src: { type: "text", default: "", cssProperty: "--kui-src" },
    /*
     * The still a `<video>` shows before its first frame decodes. Not optional polish: without it a
     * background clip paints as an empty box for as long as the network takes, and that box is the
     * backdrop to the author's text — the one place on the page where a flash of nothing is most
     * visible. Every background video in this repo's own demo pages is authored with one.
     */
    poster: { type: "text", default: "", cssProperty: "--kui-poster" },
    /*
     * `fill`, `none` and `scale-down` are deliberately absent. `fill` is the only `object-fit` value
     * that distorts — it stretches the picture to the box rather than cropping it — and the standing
     * rule for imagery in this project is to crop, never stretch. The other two leave the media at
     * its intrinsic size inside a box sized to something else, which for a *backdrop* is a gap, not
     * a layout. Adding them would be offering three ways to get a broken background.
     */
    fit: {
      type: "keyword",
      default: "cover",
      cssProperty: "--kui-fit",
      keywords: ["cover", "contain"]
    },
    /*
     * Which part of the picture a `cover` crop keeps. Nine named points rather than a free
     * `object-position` string, because a free string would have to be `type: 'text'` — the one type
     * that is explicitly never written to a stylesheet (see `core/params.ts`) — and this value is
     * written to one. A keyword list is validated against its own `values`, so the author gets real
     * focal control and the CSS surface stays closed.
     */
    focus: {
      type: "keyword",
      default: "center",
      cssProperty: "--kui-focus",
      keywords: FOCAL_POINT_NAMES
    },
    /*
     * The scrim. This is the parameter that makes the whole effect usable, because the point of a
     * backdrop here is animated text on top of it, and text over unmodified footage is illegible
     * about half the time — a light frame arrives and the headline vanishes for those seconds.
     *
     * `type: 'color'` so it goes through the same validator every other colour does. `transparent`
     * as the default rather than an empty string for the same reason: `''` is not a colour, and a
     * default that its own type would reject is a lie the schema cannot catch. It is also the honest
     * spelling of "no scrim", and no scrim node is created for it.
     */
    overlay: { type: "color", default: "transparent", cssProperty: "--kui-overlay" },
    /*
     * Separate from the colour rather than folded into it. `overlay:rgb(0 0 0 / 45%)` does parse —
     * the tokenizer is paren-aware — but `overlay:black overlay-opacity:45%` is the spelling someone
     * reaches for while tuning legibility, and tuning is exactly what this value is for.
     */
    "overlay-opacity": { type: "percentage", default: "100%", cssProperty: "--kui-overlay-opacity" },
    /*
     * The opt-out for the play-while-visible behaviour. `in-view` pairs the clip with the viewport
     * and is right for a long section. `always` is for a short hero clip that must never be caught
     * mid-stall by a visibility heuristic. `never` installs the clip and leaves it on its poster,
     * which is also where any mode lands under a reduced-motion preference.
     */
    autoplay: {
      type: "keyword",
      default: "in-view",
      cssProperty: "--kui-autoplay",
      keywords: ["in-view", "always", "never"]
    },
    /*
     * Bounded at both ends: `0` is a clip that is loaded, decoding, and permanently frozen — worse
     * than `autoplay:never`, which at least says so — and browsers stop honouring rates past roughly
     * 4 anyway, so a larger number is a silent no-op rather than a faster clip.
     */
    rate: {
      type: "number",
      default: "1",
      cssProperty: "--kui-rate",
      finite: true,
      minimum: 0.25,
      maximum: 4
    },
    loop: { type: "keyword", default: "true", cssProperty: "--kui-loop", keywords: ["true", "false"] }
    /*
     * There is deliberately no `controls:`. The layer this primitive builds paints at `z-index: -1`
     * behind the author's own children, so a native control bar there is focusable by keyboard and
     * occluded by whatever the page happens to put over it — a player you can tab into and cannot
     * see. A clip meant to be controlled is a content `<video controls>` the author writes, not a
     * background one.
     */
  };
  function prepareBackgroundMedia(el, params, ctx) {
    const authored = params.text("src");
    if (!authored) {
      ctx.warn('background-media needs a "src:" \u2014 nothing installed');
      return () => {
      };
    }
    const src = mediaSource(authored, "src", ctx);
    if (!src) return () => {
    };
    const node = el;
    if (ctx.win.getComputedStyle(node).position === "static") ctx.style.set("position", "relative");
    ctx.style.set("isolation", "isolate");
    const layer = installBackgroundMedia(el, ctx, {
      src,
      poster: mediaSource(params.text("poster"), "poster", ctx),
      fit: params.is("fit", "contain") ? "contain" : "cover",
      position: focalPosition(params.text("focus", "center")),
      overlay: params.text("overlay", "transparent"),
      // `num` returns a percentage as a 0–1 ratio, which is exactly what `opacity` takes.
      overlayOpacity: Math.min(1, Math.max(0, params.num("overlay-opacity", 1))),
      autoplay: params.text("autoplay", "in-view"),
      rate: params.num("rate", 1),
      // `!is('loop', 'false')`, not `is('loop')`. Every other read here names its own fallback, and
      // this one has to as well: `is()` takes no fallback argument, so a bare `is('loop')` is only
      // true when something already filled the schema default in. That holds on the animator's path
      // (`readEffectParams` pre-fills every declared parameter) and not on `createParams`, so the
      // positive spelling silently defaulted a true-by-default parameter to false for any caller
      // handing over raw values. Reading it as "loop unless explicitly told not to" states the
      // default at the point of use, where it cannot drift.
      loop: !params.is("loop", "false"),
      reducedMotion: ctx.reducedMotion
    });
    return continuousSetup(layer.remove);
  }
  var MEDIA_JS_PRIMITIVES = [
    {
      id: "slat-assemble",
      renderer: "javascript",
      channels: [CHANNEL.opacity, CHANNEL.translate, CHANNEL.rotate],
      parameters: slatParams,
      supportedTimelines: ["time"],
      supportedActivations: ["load", "enter", "hover", "focus", "click", "manual"],
      defaultActivation: "enter",
      perfClass: "dom-transform",
      // Same reasoning as every JS-rendered primitive in `text.ts`: nothing here declares a CSS
      // `animation-duration` the reduced-motion policy layer could shorten, and `disable` is what
      // stops `installSlatStage`'s DOM surgery from ever running at all under reduced motion — the
      // animator never calls `activate()`, so the wrapped `<img>` is simply left exactly as authored.
      reducedMotion: "disable",
      // Land()ing hands the picture back to the real `<img>` and tears down every slat — see
      // `prepareSlatAssemble`'s `land()`. Declared, not assumed: see `restoresOnFinish`'s own comment
      // in `core/types.ts` for why the catalog's default is the opposite of this.
      restoresOnFinish: true,
      prepare: deferPrepare(prepareSlatAssemble)
    },
    {
      id: "background-media",
      /*
       * `media` is the same word `media-scrub` uses for "this effect owns what the element shows",
       * and it is what makes `background-media, video-scrub` on one element a reported conflict
       * rather than two effects silently fighting over the same picture.
       *
       * `layout` is claimed for the same reason `pin` claims it: preparation writes `position` and
       * `isolation` on the *host*, which is a stacking-context claim on someone else's element. Left
       * undeclared, `background-media, pin-section` composed silently while both decided what
       * `position` the host has — the conflict detector cannot report a claim it was never told about.
       */
      channels: ["media", "layout"],
      renderer: "javascript",
      parameters: backgroundMediaParams,
      // Not a claim to support four timelines — an abstention. A backdrop is not driven by progress
      // of any kind and this primitive never reads `Timeline`; the list exists only so that
      // `data-kui="background-media src:/hero.mp4, parallax"` plus a `timeline:view` survives
      // `compile.ts`'s `intersect`. See `TIMELINE_AGNOSTIC` (`effects/shared.ts`), shared with the
      // scroll-mechanics drivers, which abstain for the same reason.
      supportedTimelines: TIMELINE_AGNOSTIC,
      supportedActivations: ["load", "enter", "manual"],
      /*
       * `'load'`, not the catalog's usual `'enter'`, and this is the difference between working and
       * not. A backdrop is the element's appearance, so gating it on an IntersectionObserver means a
       * section that is already on screen at page load, one in a background tab (no IO callbacks
       * fire at all until the tab is foregrounded), or one whose own box is still zero-area waits an
       * unbounded time to have any background — and unlike a missed reveal, that is a visibly broken
       * page. An author who *wants* a heavy clip deferred can still write `on:enter`.
       */
      defaultActivation: "load",
      perfClass: "paint",
      /*
       * `'shorten'`, unlike every other JS-rendered primitive in this file and in `text.ts`, and
       * deliberately so. `'disable'` means the animator never calls `activate()` under a reduced
       * motion preference, which for an animation is exactly right and for this is not: it would
       * leave the element with no backdrop at all rather than a calmer one. There is no CSS duration
       * here for `'shorten'` to shorten, so the policy is inert and the effect installs normally;
       * `ctx.reducedMotion` is then read inside, where it suppresses the one genuinely motion-y part
       * — a clip's autoplay — and leaves the poster frame standing. See `autoplayInView`.
       */
      reducedMotion: "shorten",
      /*
       * No timing tokens at all, and this is the one member of the refusing group whose reason is
       * not "it is driven by a position". A backdrop is not an animation: it paints a picture or a
       * clip behind the element's content and then stays there. There is no motion to start late,
       * to run for a set span, or to bend along a curve — the clip's own playback is the media
       * element's, and `autoplay:` is the knob for that. `background-media 600ms` is an author
       * reaching for a shape this effect does not have, and being told so beats being ignored.
       */
      prepare: withTimingContract(
        "background-media",
        { because: "it paints a backdrop rather than animating, so there is no motion to time" },
        deferPrepare(prepareBackgroundMedia)
      )
    }
  ];
  var MEDIA_JS_PRESETS = [
    { name: "slat-assemble", primitive: "slat-assemble", cloak: true },
    /*
     * Two names, one primitive — the alias shape the catalog already uses everywhere (`pin-until`,
     * `pin-spacer` and `stacking-cards` are three names over the one `pin` primitive; six `wipe-*`
     * names share `media-wipe`). A preset row is the alias mechanism, so a second spelling costs a
     * table entry and nothing else: no duplicated implementation to keep in sync, and both names
     * resolve to the same `prepare`.
     *
     * No `cloak` on either: the pre-JS cloak rule hides an element until the runtime installs the
     * effect's from-state, and this element is the author's own content. Cloaking it would blank
     * their text for as long as the bundle takes to arrive, to hide a backdrop that has no
     * from-state at all.
     */
    { name: "bg", primitive: "background-media" },
    { name: "background", primitive: "background-media" }
  ];
  var MEDIA_PRIMITIVES = [...MEDIA_CSS_PRIMITIVES, ...MEDIA_JS_PRIMITIVES];
  var MEDIA_PRESETS = [...MEDIA_CSS_PRESETS, ...MEDIA_JS_PRESETS];
  function registerMedia(registry) {
    return registry.registerPrimitives(MEDIA_PRIMITIVES).registerPresets(MEDIA_PRESETS);
  }

  // src/effects/catalog/subtree-capture.ts
  function captureChildren(el) {
    const authored = Array.from(el.childNodes);
    return () => {
      el.replaceChildren(...authored);
    };
  }

  // src/effects/catalog/numbers-shared.ts
  var SR_ONLY_CLASS = "kui-sr-only";
  var DECORATIVE_CLASS = "kui-count-decorative";
  function installCountLayers(el, doc) {
    const restoreChildren = captureChildren(el);
    const decorative = doc.createElement("span");
    decorative.setAttribute("aria-hidden", "true");
    decorative.className = DECORATIVE_CLASS;
    const srOnly = doc.createElement("span");
    srOnly.className = SR_ONLY_CLASS;
    srOnly.setAttribute("aria-live", "polite");
    el.textContent = "";
    el.append(decorative, srOnly);
    return {
      decorative,
      srOnly,
      restore: restoreChildren
    };
  }
  function easeOutCubic(t) {
    const clamped = Math.min(Math.max(t, 0), 1);
    return 1 - (1 - clamped) ** 3;
  }
  function tweenValue(t, from, to) {
    return from + (to - from) * t;
  }
  function cubicBezier(x1, y1, x2, y2) {
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
    const sampleY = (t) => ((ay * t + by) * t + cy) * t;
    const slopeX = (t) => (3 * ax * t + 2 * bx) * t + cx;
    function solveT(x) {
      let t = x;
      for (let i = 0; i < 8; i++) {
        const slope = slopeX(t);
        if (Math.abs(slope) < 1e-6) break;
        const next = t - (sampleX(t) - x) / slope;
        if (Math.abs(sampleX(next) - x) < 1e-6) return next;
        t = next;
      }
      let lo = 0;
      let hi = 1;
      t = x;
      while (hi - lo > 1e-6) {
        if (sampleX(t) < x) lo = t;
        else hi = t;
        t = (lo + hi) / 2;
      }
      return t;
    }
    return (t) => sampleY(solveT(Math.min(Math.max(t, 0), 1)));
  }
  var EASING_KEYWORDS2 = {
    ease: [0.25, 0.1, 0.25, 1],
    "ease-in": [0.42, 0, 1, 1],
    "ease-out": [0, 0, 0.58, 1],
    "ease-in-out": [0.42, 0, 0.58, 1],
    "expo-in": [0.7, 0, 0.84, 0],
    "expo-out": [0.16, 1, 0.3, 1],
    "expo-in-out": [0.87, 0, 0.13, 1],
    "back-in": [0.36, 0, 0.66, -0.56],
    "back-out": [0.34, 1.56, 0.64, 1],
    "back-in-out": [0.68, -0.6, 0.32, 1.6],
    "quart-out": [0.25, 1, 0.5, 1],
    "circ-out": [0, 0.55, 0.45, 1]
  };
  var CUBIC_BEZIER_FN = /^cubic-bezier\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/i;
  function resolveEasing(easing, warn) {
    if (easing === void 0) return easeOutCubic;
    if (easing === "linear") return (t) => Math.min(Math.max(t, 0), 1);
    const keyword = EASING_KEYWORDS2[easing];
    if (keyword) return cubicBezier(...keyword);
    const fn = CUBIC_BEZIER_FN.exec(easing);
    if (fn) return cubicBezier(Number(fn[1]), Number(fn[2]), Number(fn[3]), Number(fn[4]));
    warn(`easing "${easing}" has no JS equivalent for a JS-driven tween \u2014 using the default ease-out`);
    return easeOutCubic;
  }
  var COMPACT_OPTIONS = { notation: "compact", maximumFractionDigits: 1 };
  function formatCount(value, options) {
    const { format, decimals, currency } = options;
    if (format === "currency") {
      return new Intl.NumberFormat(void 0, {
        style: "currency",
        currency,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(value);
    }
    if (format === "percent") {
      return new Intl.NumberFormat(void 0, {
        style: "percent",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(value);
    }
    if (format === "compact") {
      return new Intl.NumberFormat(void 0, COMPACT_OPTIONS).format(value);
    }
    return new Intl.NumberFormat(void 0, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value);
  }
  function paddedDigits(value, width) {
    return Math.round(Math.max(0, value)).toString().padStart(width, "0");
  }
  function groupDigits(digits) {
    const groups = [];
    for (let end = digits.length; end > 0; end -= 3) {
      groups.unshift(digits.slice(Math.max(0, end - 3), end));
    }
    return groups.join(",");
  }
  function odometerTokens(grouped) {
    return [...grouped].map((char) => ({ char, digit: char >= "0" && char <= "9" }));
  }

  // src/effects/catalog/numbers.ts
  var COUNT_STEP_MS = 16;
  var REDUCED_MOTION_DURATION_MS = 1;
  var countParams = {
    duration: { type: "time", default: "1600ms", cssProperty: "--kui-duration" },
    ...TRIGGER_DELAY_PARAM,
    from: { type: "number", default: "0", cssProperty: "--kui-from" },
    to: { type: "number", default: "100", cssProperty: "--kui-to" },
    decimals: {
      type: "number",
      default: "0",
      cssProperty: "--kui-decimals",
      integer: true,
      minimum: 0,
      maximum: 6
    },
    format: {
      type: "keyword",
      default: "number",
      cssProperty: "--kui-format",
      keywords: ["number", "currency", "percent", "compact"]
    },
    currency: { type: "text", default: "USD", cssProperty: "--kui-currency" }
  };
  var odometerParams = {
    duration: { type: "time", default: "1600ms", cssProperty: "--kui-duration" },
    ...TRIGGER_DELAY_PARAM,
    from: { type: "number", default: "0", cssProperty: "--kui-from" },
    to: { type: "number", default: "100", cssProperty: "--kui-to" }
  };
  function countPrimitive(id, parameters, prepare) {
    return {
      id,
      renderer: "javascript",
      channels: ["content"],
      parameters,
      supportedTimelines: ["time"],
      supportedActivations: ["load", "enter", "hover", "focus", "click", "manual"],
      defaultActivation: "enter",
      perfClass: "dom-transform",
      // Not 'disable': the animator would then skip activation entirely under reduced motion,
      // leaving the counter permanently blank. `prepareTween` reads `ctx.reducedMotion` itself and
      // collapses the ramp to one effectively-instant tick instead, so the final value still lands.
      reducedMotion: "shorten",
      prepare
    };
  }
  function tweenDurationMs(params, ctx) {
    return ctx.reducedMotion ? REDUCED_MOTION_DURATION_MS : Math.max(0, effectDurationMs(params, 1600));
  }
  function tweenTimingFor(params, ctx) {
    return {
      durationMs: tweenDurationMs(params, ctx),
      // Positional first, then the same-named parameter — the two-spellings rule `effectDurationMs`
      // applies to `duration` just above, now applied to `delay` as well.
      delayMs: Math.max(0, params.timing.delayMs ?? params.ms("delay", 0)),
      easing: resolveEasing(params.timing.easing, ctx.warn)
    };
  }
  function tweenNumber(ctx, tween) {
    const { from, to, durationMs, delayMs, easing, onTick } = tween;
    let elapsed = 0;
    let handle;
    let settle2;
    const finished = new Promise((resolve) => {
      settle2 = resolve;
    });
    const stop = () => {
      ctx.win.clearTimeout(start);
      if (handle !== void 0) ctx.win.clearInterval(handle);
    };
    const tick = () => {
      elapsed += COUNT_STEP_MS;
      const ratio = durationMs <= 0 ? 1 : Math.min(elapsed / durationMs, 1);
      const done = ratio >= 1;
      onTick(tweenValue(easing(ratio), from, to), done);
      if (done) {
        stop();
        settle2();
      }
    };
    const start = ctx.win.setTimeout(() => {
      handle = ctx.win.setInterval(tick, COUNT_STEP_MS);
    }, delayMs);
    return {
      cleanup: stop,
      finished,
      finish: () => {
        stop();
        onTick(to, true);
        settle2();
      }
    };
  }
  function withCountLayers(el, doc, populate) {
    const layers = installCountLayers(el, doc);
    try {
      const setup = populate(layers);
      return {
        ...setup,
        cleanup: () => {
          setup.cleanup();
          layers.restore();
        }
      };
    } catch (err) {
      layers.restore();
      throw err;
    }
  }
  function prepareCount(el, params, ctx) {
    const doc = el.ownerDocument;
    const from = params.num("from", 0);
    const to = params.num("to", 100);
    const decimals = Math.max(0, Math.round(params.num("decimals", 0)));
    const format = params.text("format", "number");
    const currency = params.text("currency", "USD");
    const options = { format, decimals, currency };
    const fromText = formatCount(from, options);
    return withCountLayers(el, doc, (layers) => {
      layers.decorative.textContent = fromText;
      layers.srOnly.textContent = fromText;
      const tween = tweenNumber(ctx, {
        from,
        to,
        ...tweenTimingFor(params, ctx),
        onTick: (value, done) => {
          layers.decorative.textContent = formatCount(value, options);
          if (done) layers.srOnly.textContent = formatCount(to, options);
        }
      });
      return { cleanup: tween.cleanup, finished: tween.finished, finish: tween.finish };
    });
  }
  function buildOdometerColumns(container, doc, grouped) {
    const strips = [];
    for (const token of odometerTokens(grouped)) {
      if (!token.digit) {
        container.append(doc.createTextNode(token.char));
        continue;
      }
      const column = doc.createElement("span");
      column.className = "kui-odometer-col";
      const strip = doc.createElement("span");
      strip.className = "kui-odometer-strip";
      for (let digit = 0; digit <= 9; digit++) {
        const row = doc.createElement("span");
        row.textContent = String(digit);
        strip.append(row);
      }
      strip.style.setProperty("--kui-o", token.char);
      column.append(strip);
      container.append(column);
      strips.push(strip);
    }
    return strips;
  }
  function updateOdometerColumns(strips, grouped) {
    let index = 0;
    for (const token of odometerTokens(grouped)) {
      if (!token.digit) continue;
      strips[index]?.style.setProperty("--kui-o", token.char);
      index++;
    }
  }
  function prepareOdometer(el, params, ctx) {
    const doc = el.ownerDocument;
    const from = Math.max(0, params.num("from", 0));
    const to = Math.max(0, params.num("to", 100));
    const width = Math.max(String(Math.round(from)).length, String(Math.round(to)).length);
    const toGrouped = groupDigits(paddedDigits(to, width));
    const fromGrouped = groupDigits(paddedDigits(from, width));
    return withCountLayers(el, doc, (layers) => {
      layers.srOnly.textContent = fromGrouped;
      const strips = buildOdometerColumns(layers.decorative, doc, fromGrouped);
      const tween = tweenNumber(ctx, {
        from,
        to,
        ...tweenTimingFor(params, ctx),
        onTick: (value, done) => {
          updateOdometerColumns(strips, groupDigits(paddedDigits(value, width)));
          if (done) layers.srOnly.textContent = toGrouped;
        }
      });
      return { cleanup: tween.cleanup, finished: tween.finished, finish: tween.finish };
    });
  }
  var COUNT_PRIMITIVES = [
    countPrimitive("count", countParams, deferPrepare(prepareCount)),
    countPrimitive("count-odometer", odometerParams, deferPrepare(prepareOdometer))
  ];
  var COUNT_PRESETS = [
    { name: "count-up", primitive: "count", params: { from: "0", to: "100" } },
    { name: "count-down", primitive: "count", params: { from: "100", to: "0" } },
    {
      name: "count-currency",
      primitive: "count",
      params: { from: "0", to: "4820", format: "currency", currency: "USD", decimals: "0" }
    },
    {
      name: "count-percent",
      primitive: "count",
      params: { from: "0", to: "0.82", format: "percent", decimals: "0" }
    },
    {
      name: "count-compact",
      primitive: "count",
      params: { from: "0", to: "128400", format: "compact" }
    },
    { name: "odometer-roll", primitive: "count-odometer", params: { from: "0", to: "4820" } }
  ];
  var METER_PRIMITIVES = [
    cssPrimitive("stroke-sweep", [CHANNEL.stroke]),
    // `from` gives `progress-bar` a real knob on its start scale — it had none before. `--kui-bar-from`
    // is also what the `[data-kui-fx~='progress-bar'][data-kui-state='ready']` gate in numbers.css
    // neutralizes; see that rule's comment for the on:enter fix this parameter doubles as.
    // `transform-origin: left center` pins the bar's growth edge on the same unconditional rule —
    // undeclared until channel-properties.ts gained an entry for it.
    cssPrimitive("meter-bar", [CHANNEL.scale, "transform-origin"], {
      parameters: { from: { type: "number", default: "0", cssProperty: "--kui-bar-from" } }
    }),
    cssPrimitive("meter-segments", [CHANNEL.opacity]),
    cssPrimitive("meter-stars", [CHANNEL.clip])
  ];
  var METER_PRESETS = [
    { name: "progress-ring", primitive: "stroke-sweep", keyframes: "kui-progress-ring" },
    { name: "gauge-sweep", primitive: "stroke-sweep", keyframes: "kui-gauge-sweep" },
    { name: "donut-sweep", primitive: "stroke-sweep", keyframes: "kui-donut-sweep" },
    { name: "sparkline-draw", primitive: "stroke-sweep", keyframes: "kui-sparkline-draw" },
    // `cloak: true`: `kui-progress-bar`'s `from { scale: 0 1 }` (numbers.css) is a zero-width box
    // while paused, not just an invisible one — so while it waits it occupies no space in layout at
    // all. Not, despite the tidier story, because an observer refuses to fire on it: Chromium was
    // measured resolving a zero-area target's `intersectionRatio` to `1`. See numbers.css's
    // `[data-kui-fx~='progress-bar'][data-kui-state='ready']` rule for the geometry half of the fix;
    // `cloak` keeps the pre-JS and post-JS "waiting" look the same (invisible) either side of it.
    { name: "progress-bar", primitive: "meter-bar", keyframes: "kui-progress-bar", cloak: true },
    { name: "progress-segments", primitive: "meter-segments", keyframes: "kui-progress-segments" },
    { name: "star-rating-fill", primitive: "meter-stars", keyframes: "kui-star-rating-fill" }
  ];
  var NUMBERS_PRIMITIVES = [...COUNT_PRIMITIVES, ...METER_PRIMITIVES];
  var NUMBERS_PRESETS = [...COUNT_PRESETS, ...METER_PRESETS];
  function registerNumbers(registry) {
    return registry.registerPrimitives(NUMBERS_PRIMITIVES).registerPresets(NUMBERS_PRESETS);
  }

  // src/effects/catalog/text-shared.ts
  var SR_ONLY_CLASS2 = "kui-sr-only";
  var DECORATIVE_CLASS2 = "kui-split-decorative";
  function installSplitLayers(el, doc) {
    const originalText = el.textContent.trim();
    const restoreChildren = captureChildren(el);
    const decorative = doc.createElement("span");
    decorative.setAttribute("aria-hidden", "true");
    decorative.className = DECORATIVE_CLASS2;
    const srOnly = doc.createElement("span");
    srOnly.className = SR_ONLY_CLASS2;
    srOnly.textContent = originalText;
    el.textContent = "";
    el.append(decorative, srOnly);
    return {
      decorative,
      originalText,
      restore: restoreChildren
    };
  }
  function segmentGraphemes(text) {
    const segmenter = new Intl.Segmenter(void 0, { granularity: "grapheme" });
    return Array.from(segmenter.segment(text), (entry) => entry.segment);
  }
  function segmentWords(text) {
    const segmenter = new Intl.Segmenter(void 0, { granularity: "word" });
    return Array.from(segmenter.segment(text), (entry) => ({
      text: entry.segment,
      isWord: entry.isWordLike === true
    }));
  }
  function markItem(el, index, extraClass) {
    el.className = extraClass ? `kui-split-item ${extraClass}` : "kui-split-item";
    el.style.setProperty("--kui-i", String(index));
  }
  function applyStaggerVars(el, params) {
    const { durationMs, delayMs, easing } = params.timing;
    const duration = durationMs === void 0 ? params.text("duration", "500ms") : `${durationMs}ms`;
    const delay = delayMs === void 0 ? params.text("delay", "0ms") : `${delayMs}ms`;
    el.style.setProperty("--kui-duration", duration);
    el.style.setProperty("--kui-delay", delay);
    el.style.setProperty("--kui-ease", cssEasingValue(easing ?? params.text("ease", "ease-out")));
    el.style.setProperty("--kui-stagger", params.text("stagger", "30ms"));
  }
  function stepMsFor(params, ticks, fallback) {
    const total = params.timing.durationMs;
    if (total === void 0 || ticks <= 0) return params.ms("step", fallback);
    return Math.max(1, total / ticks);
  }
  function splitRevealFinishMs(params, itemCount) {
    if (itemCount === 0) return 0;
    const durationMs = params.timing.durationMs ?? params.ms("duration", 500);
    const delayMs = params.timing.delayMs ?? params.ms("delay", 0);
    const staggerMs = params.ms("stagger", 30);
    return delayMs + (itemCount - 1) * staggerMs + durationMs;
  }
  function createStepRunner(win, options) {
    let settle2;
    const finished = new Promise((resolve) => {
      settle2 = resolve;
    });
    let interval;
    function stop() {
      win.clearTimeout(start);
      if (interval !== void 0) win.clearInterval(interval);
      settle2?.();
    }
    const start = win.setTimeout(() => {
      interval = win.setInterval(() => {
        if (options.tick()) stop();
      }, options.stepMs);
    }, options.delayMs);
    return { finished, stop };
  }
  function appendCharSpans(container, doc, text) {
    const spans = [];
    let index = 0;
    let wordWrapper = null;
    for (const grapheme of segmentGraphemes(text)) {
      if (grapheme.trim() === "") {
        container.append(doc.createTextNode(grapheme));
        wordWrapper = null;
        continue;
      }
      if (!wordWrapper) {
        wordWrapper = doc.createElement("span");
        wordWrapper.className = "kui-split-word";
        container.append(wordWrapper);
      }
      const span = doc.createElement("span");
      markItem(span, index);
      span.textContent = grapheme;
      wordWrapper.append(span);
      spans.push(span);
      index++;
    }
    return spans;
  }
  function appendWordSpans(container, doc, text) {
    const spans = [];
    let index = 0;
    for (const token of segmentWords(text)) {
      if (!token.isWord) {
        container.append(doc.createTextNode(token.text));
        continue;
      }
      const span = doc.createElement("span");
      markItem(span, index);
      span.textContent = token.text;
      container.append(span);
      spans.push(span);
      index++;
    }
    return spans;
  }
  function bucketByLine(container) {
    const buckets = [];
    let currentTop = null;
    for (const node of Array.from(container.childNodes)) {
      if (node instanceof HTMLElement) {
        const top = node.offsetTop;
        if (currentTop === null || Math.abs(top - currentTop) > 1) {
          buckets.push([]);
          currentTop = top;
        }
      } else if (buckets.length === 0) {
        buckets.push([]);
      }
      buckets.at(-1).push(node);
    }
    return buckets;
  }
  function appendLineSpans(container, doc, text) {
    appendWordSpans(container, doc, text);
    const buckets = bucketByLine(container);
    container.replaceChildren();
    return buckets.map((nodes, index) => {
      const line = doc.createElement("span");
      markItem(line, index, "kui-split-line");
      for (const node of nodes) {
        if (node instanceof HTMLElement) {
          node.removeAttribute("class");
          node.style.removeProperty("--kui-i");
        }
        line.append(node);
      }
      container.append(line);
      return line;
    });
  }
  function appendSpansFor(unit, container, doc, text) {
    if (unit === "words") return appendWordSpans(container, doc, text);
    if (unit === "lines") return appendLineSpans(container, doc, text);
    return appendCharSpans(container, doc, text);
  }
  function nextTypeState(state, total, loop2) {
    if (!state.deleting) {
      const index2 = state.index + 1;
      if (index2 < total) return { index: index2, deleting: false, done: false };
      return loop2 ? { index: total, deleting: true, done: false } : { index: total, deleting: false, done: true };
    }
    const index = state.index - 1;
    if (index > 0) return { index, deleting: true, done: false };
    return { index: 0, deleting: false, done: false };
  }
  var SCRAMBLE_CHARSETS = {
    upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    binary: "01",
    symbols: "!<>-_\\/[]{}=+*^?#~"
  };
  function scrambledFrame(graphemes, resolved, charset, random) {
    return graphemes.map((grapheme, index) => {
      if (index < resolved || grapheme.trim() === "") return grapheme;
      return charset[Math.floor(random() * charset.length)] ?? charset[0] ?? grapheme;
    }).join("");
  }
  var AXIS_TAG = /^[A-Za-z0-9]{4}$/;
  var varAxisTagSpec = {
    type: "keyword",
    // Quoted, because that is what reaches the stylesheet: `font-variation-settings` takes a
    // `<string>`, and an unquoted `wght` is an ident that makes the whole declaration invalid.
    default: '"wght"',
    cssProperty: "--kui-axis",
    /*
     * Deliberately empty, and deliberately not a guess at the real axis list.
     *
     * The accepted set is open — any tag the author's font carries — which no closed `keywords` list
     * can express. `varAxisVariant` below synthesises a one-entry list per authored spec instead, so
     * the value `resolveParams` checks is always exactly the tag that spec asked for. This declared
     * list is only reachable if that variant did not run, which cannot happen today; empty makes that
     * unreachable path reject and fall back to the stylesheet's own `"wght"`, which is the safe
     * direction. A plausible-looking list here would be the unsafe one: it would silently become the
     * real allowlist the day the variant stopped being called.
     */
    keywords: []
  };
  var varAxisParams = {
    axis: varAxisTagSpec,
    from: { type: "number", default: "100", cssProperty: "--kui-from-axis", finite: true },
    to: { type: "number", default: "900", cssProperty: "--kui-to-axis", finite: true }
  };
  function varAxisVariant(spec, warn) {
    const tag = spec.params["axis"];
    if (tag === void 0) return {};
    const rest = Object.fromEntries(Object.entries(spec.params).filter(([key]) => key !== "axis"));
    if (!AXIS_TAG.test(tag)) {
      warn(
        `"axis:${tag}" is not an OpenType axis tag \u2014 expected exactly four letters or digits, case-significant, e.g. axis:wght (registered) or axis:GRAD (vendor)`
      );
      return { params: rest };
    }
    const quoted = `"${tag}"`;
    return {
      params: { ...rest, axis: quoted },
      schema: { axis: { ...varAxisTagSpec, keywords: [quoted] } }
    };
  }

  // src/effects/catalog/text.ts
  var fontWeightParams = {
    from: { type: "number", default: "100", cssProperty: "--kui-from-weight", minimum: 1, maximum: 1e3 },
    to: { type: "number", default: "800", cssProperty: "--kui-to-weight", minimum: 1, maximum: 1e3 }
  };
  var fontWidthParams = {
    from: { type: "percentage", default: "75%", cssProperty: "--kui-from-width" },
    to: { type: "percentage", default: "125%", cssProperty: "--kui-to-width" }
  };
  var fontSlantParams = {
    from: { type: "angle", default: "0deg", cssProperty: "--kui-from-slant" },
    to: { type: "angle", default: "10deg", cssProperty: "--kui-to-slant" }
  };
  var textSweepParams = {
    color: { type: "color", default: "currentColor", cssProperty: "--kui-sweep-color" }
  };
  var extrudeParams = {
    angle: { type: "angle", default: "-20deg", cssProperty: "--kui-from-angle" },
    distance: { type: "length", default: "32px", cssProperty: "--kui-distance" }
  };
  var TEXT_CSS_PRIMITIVES = [
    // `color`, alongside `background`, for `text-shimmer` and `text-gradient-sweep` alike: each
    // one's unconditional rule sets `-webkit-text-fill-color: transparent` so the `background-image`
    // gradient shows through the glyphs (the standard gradient-text technique). That is a real claim
    // on the glyph fill, the same physical property `text-outline-fill` animates on its own `color`
    // channel below — without it the two look disjoint to the compiler (`background` vs
    // `stroke`+`color`) and composing them would let whichever applied last silently win the glyph
    // fill instead of being flagged as a conflict.
    cssPrimitive("text-shimmer", [CHANNEL.background, CHANNEL.color], { reducedMotion: "disable" }),
    // Which is exactly what `text-sweep` must *not* claim. Of the three presets in that family only
    // `gradient-sweep` goes near the fill: its rule sets `-webkit-text-fill-color: transparent` and
    // its keyframe drives `background-position` across the clipped glyphs. `highlight-sweep` and
    // `underline-draw` just paint a `background-image` — a highlight bar and a 2px underline, both
    // animated through `background-size`, both leaving the glyph fill alone (see text.css). Claiming
    // `color` for all three made the compiler reject compositions like
    // `underline-draw, text-outline-fill` as a glyph-fill conflict even though they touch entirely
    // disjoint properties, and a conflict check that cries wolf is one authors learn to ignore.
    //
    // The fix is a second primitive rather than a per-preset channel override, because a narrowing
    // override is not a thing this library has. Channels are declared on the primitive; the only
    // per-entry adjustment is `variantFor`, and `channelsFor` in compile.ts unions its result over
    // the declaration, so a variant can only ever *widen* (see the note on `Primitive.variantFor` in
    // core/types.ts). That direction is deliberate — widening keeps an under-claim from slipping past
    // conflict detection — so expressing "these two presets claim less" would mean new machinery in
    // core/channels.ts, to buy exactly what a second primitive already buys. Two presets writing a
    // different property set than the third is not a parameter difference, which is all a preset is
    // meant to express; it is what "different primitive" already means here.
    cssPrimitive("text-gradient-sweep", [CHANNEL.background, CHANNEL.color], { parameters: textSweepParams }),
    cssPrimitive("text-sweep", [CHANNEL.background], { parameters: textSweepParams }),
    cssPrimitive("text-outline-fill", [CHANNEL.stroke, CHANNEL.color]),
    /*
     * The three named axes stay, and stay implemented the way they are.
     *
     * `var-axis` below generalises the *mechanism*, so the obvious tidy-up is to re-express these on
     * top of it — `var-weight` becomes `var-axis axis:wght`, and three schemas collapse into one.
     * That would change all three, and one of them would visibly break:
     *
     * - `var-weight` animates `font-weight`, which is a real CSS property with a defined behaviour on
     *   fonts that have no `wght` axis at all: the browser synthesises a bold. `font-variation-
     *   settings "wght"` does nothing there. Rewriting it would silently drop every non-variable font
     *   out of the effect.
     * - `var-width` animates `font-stretch`, in percentages, which is likewise defined against
     *   non-variable width faces the way the raw `wdth` axis is not.
     * - `var-slant` is the one that breaks outright. It animates `font-style: oblique <angle>`, and
     *   the `slnt` axis uses the OPPOSITE sign convention — negative `slnt` leans right, positive
     *   `oblique` leans right. See the note over `kui-var-slant` in `text.css`, which already had to
     *   work this out for the default. `var-axis axis:slnt from:0 to:10` leans the text the other way
     *   from what `var-slant 0deg -> 10deg` has always done.
     *
     * Beyond that, `font-variation-settings` is the low-level escape hatch and the CSS Fonts spec
     * says to prefer the high-level property wherever one exists — it does not inherit or animate the
     * way the high-level properties do, and it overrides them wholesale. So the three names are not
     * legacy spellings of the generic one; they are the correct implementation for the three axes CSS
     * modelled properly, and `var-axis` is for the axes it did not.
     */
    cssPrimitive("var-weight", ["font"], { parameters: fontWeightParams }),
    cssPrimitive("var-width", ["font"], { parameters: fontWidthParams }),
    cssPrimitive("var-slant", ["font"], { parameters: fontSlantParams }),
    /*
     * Channel `font`, the same as its three siblings, which is what stops `data-kui="var-weight,
     * var-axis"` compiling. That pair looks composable — two different CSS properties — and is not:
     * `font-variation-settings` overrides the high-level font properties for any axis it names, so
     * whichever landed last would silently win the glyph shape. Two `var-axis` segments collide for
     * the blunter reason that both write the whole `font-variation-settings` declaration.
     *
     * `variantFor` is spread on rather than passed through `cssPrimitive`, whose options object
     * covers the shared timing/activation defaults only. Nothing else about this primitive differs.
     */
    { ...cssPrimitive("var-axis", ["font"], { parameters: varAxisParams }), variantFor: varAxisVariant },
    /*
     * `defaultActivation: 'load'` for the same reason every ambient primitive declares it, and it
     * was missing here: a marquee is continuous motion, so `reducedMotion: 'disable'` is only half
     * the rule `ambient.ts` spells out — the other half is starting on `load` rather than waiting on
     * a scroll-triggered `enter`.
     *
     * Without it, a bare `data-kui="marquee 42s"` resolved to `enter`, which `style-plan.ts`'s
     * `resolveGate` sends down the `deferred` path and stamps `animation-play-state: paused`. It
     * compiled correctly, reported `data-kui-state="ready"`, and never ran — measured on a marquee
     * fully in view, so this was not an observer that had simply not fired yet. Every page carrying
     * one had to know to write `on:load`, which is exactly the kind of thing an author cannot be
     * expected to guess.
     *
     * `marquee-scroll-linked` is unaffected: its position comes from `animation-timeline: scroll()`,
     * not from an activation.
     */
    // `'discrete'` alongside `translate`: the unconditional rule shared by `marquee`/
    // `marquee-scroll-linked` also pins `display: flex` so the two duplicated text spans it draws sit
    // side by side. Unrelated to `catalog/discrete.ts`'s show/hide use of the same channel — see that
    // channel's own doc comment in `test/support/channel-properties.ts`.
    cssPrimitive("text-marquee", [CHANNEL.translate, "discrete"], {
      timelines: ["time", "scroll"],
      defaultActivation: "load",
      reducedMotion: "disable"
    }),
    // `'discrete'` alongside `clip`: the unconditional rule also pins `display: inline-block` for
    // sizing, same reasoning as `text-marquee` above.
    cssPrimitive("redaction-reveal", [CHANNEL.clip, "discrete"]),
    // `'text-shadow'` beside the two transform channels: the keyframe tweens `rotate`/`translate`,
    // but the unconditional `[data-kui-fx~='text-3d-extrude']` rule in `text.css` also paints a
    // six-layer `text-shadow` stack — the extrusion itself, and the loudest thing this effect does.
    // It went undeclared from the day the effect landed because `text-shadow` was mapped under no
    // channel in `test/support/channel-properties.ts`, so the static-rule invariant never looked at
    // the property. Nothing else in the catalog writes `text-shadow` yet, which is the only reason
    // this never surfaced as a real collision; the channel is what stops the second one from doing so.
    // `'discrete'` for the same rule's `display: inline-block` sizing declaration.
    cssPrimitive("text-3d-extrude", [CHANNEL.rotate, CHANNEL.translate, "text-shadow", "discrete"], {
      parameters: extrudeParams
    })
  ];
  var TEXT_CSS_PRESETS = [
    { name: "gradient-shimmer", phase: "idle", primitive: "text-shimmer", keyframes: "kui-gradient-shimmer" },
    { name: "gradient-sweep", primitive: "text-gradient-sweep", keyframes: "kui-gradient-sweep" },
    {
      name: "highlight-sweep",
      primitive: "text-sweep",
      keyframes: "kui-highlight-sweep",
      params: { color: "gold" }
    },
    { name: "underline-draw", primitive: "text-sweep", keyframes: "kui-underline-draw" },
    { name: "text-outline-fill", primitive: "text-outline-fill", keyframes: "kui-text-outline-fill" },
    { name: "var-weight", primitive: "var-weight", keyframes: "kui-var-weight" },
    { name: "var-width", primitive: "var-width", keyframes: "kui-var-width" },
    { name: "var-slant", primitive: "var-slant", keyframes: "kui-var-slant" },
    { name: "var-axis", primitive: "var-axis", keyframes: "kui-var-axis" },
    { name: "marquee", phase: "idle", primitive: "text-marquee", keyframes: "kui-marquee" },
    { name: "marquee-scroll-linked", primitive: "text-marquee", keyframes: "kui-marquee" },
    { name: "redaction-reveal", primitive: "redaction-reveal", keyframes: "kui-redaction-reveal" },
    { name: "text-3d-extrude", primitive: "text-3d-extrude", keyframes: "kui-text-3d-extrude" }
  ];
  function jsTextPrimitive(id, channels, options) {
    return {
      id,
      renderer: "javascript",
      channels,
      parameters: options.parameters,
      supportedTimelines: ["time"],
      supportedActivations: ["load", "enter", "hover", "focus", "click", "manual"],
      defaultActivation: "enter",
      perfClass: options.perfClass ?? "dom-transform",
      // Every JS-rendered primitive in this catalog is `disable`: none of them declare a CSS
      // `animation-duration` the reduced-motion policy layer could shorten, so `shorten` would be a
      // silent no-op. `disable` is enforced upstream — the animator never calls `activate()` at all
      // — which is the only place that actually works for a timer- or DOM-surgery-driven effect.
      reducedMotion: "disable",
      prepare: options.prepare
    };
  }
  var splitTiming = {
    duration: { type: "time", default: "500ms", cssProperty: "--kui-duration" },
    ...TRIGGER_DELAY_PARAM,
    ease: { type: "easing", default: "ease-out", cssProperty: "--kui-ease" },
    stagger: { type: "time", default: "30ms", cssProperty: "--kui-stagger" },
    unit: {
      type: "keyword",
      default: "chars",
      cssProperty: "--kui-unit",
      keywords: ["chars", "words", "lines"]
    },
    direction: {
      type: "keyword",
      default: "fade",
      cssProperty: "--kui-direction",
      keywords: ["fade", "up", "down", "mask"]
    }
  };
  var motionParams = {
    stagger: { type: "time", default: "40ms", cssProperty: "--kui-stagger" },
    // `duration`/`ease` are deliberately *not* declared beside the delay: text.css pins both for
    // wave and jitter on a higher-specificity `[data-kui-split-fx='wave'] .kui-split-item` rule, so
    // declaring them would advertise two knobs that the stylesheet then overrides. `animation-delay`
    // is the one the phase-start rule leaves alone, which is what lets `applyStaggerVars` honour it.
    ...TRIGGER_DELAY_PARAM,
    motion: {
      type: "keyword",
      default: "wave",
      cssProperty: "--kui-motion",
      keywords: ["wave", "jitter"]
    }
  };
  var typewriterParams = {
    step: { type: "time", default: "55ms", cssProperty: "--kui-step" },
    loop: { type: "keyword", default: "false", cssProperty: "--kui-loop", keywords: ["true", "false"] },
    ...TRIGGER_DELAY_PARAM
  };
  var scrambleParams = {
    step: { type: "time", default: "40ms", cssProperty: "--kui-step" },
    // `duration` gets no such shared declaration: `stepMsFor` reads its authored-or-not distinction
    // to decide between a whole-effect time and a per-tick `step:`, and a schema default would erase
    // that distinction. A `0ms` delay default has no equivalent problem.
    ...TRIGGER_DELAY_PARAM,
    revealEvery: {
      type: "number",
      default: "2",
      cssProperty: "--kui-reveal-every",
      minimum: 1,
      integer: true
    },
    charset: {
      type: "keyword",
      default: "upper",
      cssProperty: "--kui-charset",
      keywords: ["upper", "binary", "symbols"]
    }
  };
  var wordCyclerParams = {
    words: { type: "text", default: "", cssProperty: "--kui-words" },
    interval: { type: "time", default: "2200ms", cssProperty: "--kui-interval" },
    // Load-bearing here, not just for symmetry: a cycler has no authored `duration` — `interval:`
    // paces it — so the positional "duration then delay" slot only reached a delay when the author
    // wrote a throwaway first value, `word-cycler 0ms 300ms`.
    ...TRIGGER_DELAY_PARAM
  };
  function prepareSplitText(el, params, ctx) {
    const doc = el.ownerDocument;
    const unit = params.text("unit", "chars");
    const direction = params.text("direction", "fade");
    const layers = installSplitLayers(el, doc);
    layers.decorative.setAttribute("data-kui-split-fx", direction);
    applyStaggerVars(layers.decorative, params);
    const items = appendSpansFor(unit, layers.decorative, doc, layers.originalText);
    let settle2;
    const finished = new Promise((resolve) => {
      settle2 = resolve;
    });
    const timer = ctx.win.setTimeout(settle2, splitRevealFinishMs(params, items.length));
    return {
      cleanup: () => {
        ctx.win.clearTimeout(timer);
        layers.restore();
      },
      finished,
      finish: () => {
        ctx.win.clearTimeout(timer);
        settle2();
      }
    };
  }
  function prepareSplitMotion(el, params) {
    const doc = el.ownerDocument;
    const motion = params.text("motion", "wave");
    const layers = installSplitLayers(el, doc);
    layers.decorative.setAttribute("data-kui-split-fx", motion);
    applyStaggerVars(layers.decorative, params);
    appendCharSpans(layers.decorative, doc, layers.originalText);
    return layers.restore;
  }
  function prepareTypewriter(el, params, ctx) {
    const loop2 = params.is("loop");
    const layers = installSplitLayers(el, el.ownerDocument);
    layers.decorative.classList.add("kui-typewriter");
    const graphemes = segmentGraphemes(layers.originalText);
    let state = { index: 0, deleting: false };
    const render = (count) => {
      layers.decorative.textContent = graphemes.slice(0, count).join("");
    };
    const run = createStepRunner(ctx.win, {
      delayMs: params.timing.delayMs ?? params.ms("delay", 0),
      stepMs: stepMsFor(params, graphemes.length, 55),
      tick: () => {
        const step = nextTypeState(state, graphemes.length, loop2);
        state = step;
        render(step.index);
        return step.done;
      }
    });
    return {
      cleanup: () => {
        run.stop();
        layers.restore();
      },
      finished: run.finished,
      finish: () => {
        run.stop();
        render(graphemes.length);
      }
    };
  }
  function prepareScramble(el, params, ctx) {
    const charset = SCRAMBLE_CHARSETS[params.text("charset", "upper")];
    const revealEvery = Math.max(1, Math.round(params.num("revealEvery", 2)));
    const node = el;
    const authoredMinWidth = node.style.getPropertyValue("min-width");
    const authoredMinHeight = node.style.getPropertyValue("min-height");
    const restRect = el.getBoundingClientRect();
    ctx.style.set("min-width", `${restRect.width}px`);
    ctx.style.set("min-height", `${restRect.height}px`);
    const releaseSizeLock = () => {
      ctx.style.set("min-width", authoredMinWidth);
      ctx.style.set("min-height", authoredMinHeight);
    };
    const layers = installSplitLayers(el, el.ownerDocument);
    layers.decorative.classList.add("kui-scramble");
    const graphemes = segmentGraphemes(layers.originalText);
    let resolved = 0;
    let ticks = 0;
    const render = () => {
      layers.decorative.textContent = scrambledFrame(graphemes, resolved, charset, Math.random);
    };
    render();
    const totalTicks = Math.max(1, graphemes.length * revealEvery);
    const run = createStepRunner(ctx.win, {
      delayMs: params.timing.delayMs ?? params.ms("delay", 0),
      stepMs: stepMsFor(params, totalTicks, Math.max(1, 700 / totalTicks)),
      tick: () => {
        ticks++;
        if (ticks % revealEvery === 0) resolved++;
        render();
        const done = resolved >= graphemes.length;
        if (done) releaseSizeLock();
        return done;
      }
    });
    return {
      cleanup: () => {
        run.stop();
        layers.restore();
        releaseSizeLock();
      },
      finished: run.finished,
      finish: () => {
        run.stop();
        resolved = graphemes.length;
        render();
        releaseSizeLock();
      }
    };
  }
  function prepareWordCycler(el, params, ctx) {
    const words = params.text("words", "").split("|").map((word) => word.trim()).filter(Boolean);
    if (words.length === 0) return () => {
    };
    const restoreChildren = captureChildren(el);
    const swapMs = 150;
    let index = 0;
    el.textContent = words[0];
    const pendingSwaps = /* @__PURE__ */ new Set();
    function cancelPendingSwaps() {
      for (const handle of pendingSwaps) ctx.win.clearTimeout(handle);
      pendingSwaps.clear();
    }
    const run = createStepRunner(ctx.win, {
      delayMs: params.timing.delayMs ?? params.ms("delay", 0),
      stepMs: params.ms("interval", 2200),
      tick: () => {
        el.classList.add("kui-word-cycler-swap");
        const handle = ctx.win.setTimeout(() => {
          pendingSwaps.delete(handle);
          index = (index + 1) % words.length;
          el.textContent = words[index];
          el.classList.remove("kui-word-cycler-swap");
        }, swapMs);
        pendingSwaps.add(handle);
        return false;
      }
    });
    return {
      cleanup: () => {
        run.stop();
        cancelPendingSwaps();
        el.classList.remove("kui-word-cycler-swap");
        restoreChildren();
      },
      finished: run.finished,
      finish: () => {
        run.stop();
        cancelPendingSwaps();
        el.classList.remove("kui-word-cycler-swap");
      }
    };
  }
  var TEXT_JS_PRIMITIVES = [
    jsTextPrimitive("split-text", [CHANNEL.opacity, CHANNEL.translate, CHANNEL.clip], {
      parameters: splitTiming,
      prepare: deferPrepare(prepareSplitText)
    }),
    jsTextPrimitive("split-text-motion", [CHANNEL.translate, CHANNEL.rotate], {
      parameters: motionParams,
      prepare: deferPrepare(prepareSplitMotion),
      perfClass: "continuous"
    }),
    jsTextPrimitive("typewriter", [CHANNEL.clip], {
      parameters: typewriterParams,
      prepare: deferPrepare(prepareTypewriter),
      perfClass: "continuous"
    }),
    jsTextPrimitive("scramble-text", ["content"], {
      parameters: scrambleParams,
      prepare: deferPrepare(prepareScramble),
      perfClass: "continuous"
    }),
    // `CHANNEL.opacity` alongside `'content'`: the host rule's swap transition (text.css) fades
    // `opacity`, which `content` alone does not cover — see this preset's own `transitions` below
    // and text.css's `[data-kui-fx~='word-cycler']` rule. Undeclared before, this primitive's fade
    // was invisible to `findConflicts`: composing it with any other opacity-channel effect looked
    // disjoint to the compiler while both silently fought over the same fade. `'discrete'` for the
    // same rule's `display: inline-block` sizing declaration — same reasoning as `text-marquee`.
    jsTextPrimitive("word-cycler", ["content", CHANNEL.opacity, "discrete"], {
      parameters: wordCyclerParams,
      prepare: deferPrepare(prepareWordCycler),
      perfClass: "continuous"
    })
  ];
  var CHARS_STAGGER = "30ms";
  var WORDS_STAGGER = "90ms";
  var LINES_STAGGER = "160ms";
  var TEXT_JS_PRESETS = [
    { name: "split-chars", primitive: "split-text", params: { unit: "chars", direction: "fade", stagger: CHARS_STAGGER } },
    { name: "split-words", primitive: "split-text", params: { unit: "words", direction: "fade", stagger: WORDS_STAGGER } },
    { name: "split-lines", primitive: "split-text", params: { unit: "lines", direction: "fade", stagger: LINES_STAGGER } },
    { name: "text-reveal-up", primitive: "split-text", params: { unit: "words", direction: "up", stagger: WORDS_STAGGER }, cloak: true },
    { name: "text-reveal-down", primitive: "split-text", params: { unit: "words", direction: "down", stagger: WORDS_STAGGER }, cloak: true },
    { name: "text-reveal-mask", primitive: "split-text", params: { unit: "lines", direction: "mask", stagger: LINES_STAGGER }, cloak: true },
    { name: "text-wave", primitive: "split-text-motion", params: { motion: "wave" } },
    { name: "text-jitter", primitive: "split-text-motion", params: { motion: "jitter" } },
    { name: "typewriter", primitive: "typewriter", params: { loop: "false" } },
    { name: "typewriter-loop", primitive: "typewriter", params: { loop: "true" } },
    { name: "scramble", primitive: "scramble-text", params: { charset: "upper" } },
    { name: "decode", primitive: "scramble-text", params: { charset: "binary" } },
    { name: "glitch", primitive: "scramble-text", params: { charset: "symbols" } },
    {
      name: "word-cycler",
      primitive: "word-cycler",
      // Transcribed from text.css's own `transition: opacity 150ms ease-out` — a cycler paces
      // itself off `interval:`, not a generated `--kui-word-cycler-duration`, so this is a literal
      // the same way `header-shrink`'s three segments are.
      transitions: [{ property: "opacity", duration: "150ms", easing: "ease-out" }]
    }
  ];
  var TEXT_PRIMITIVES = [...TEXT_CSS_PRIMITIVES, ...TEXT_JS_PRIMITIVES];
  var TEXT_PRESETS = [...TEXT_CSS_PRESETS, ...TEXT_JS_PRESETS];
  function registerText(registry) {
    return registry.registerPrimitives(TEXT_PRIMITIVES).registerPresets(TEXT_PRESETS);
  }

  // src/effects/catalog/transforms.ts
  var ANGLE_UNSET = "";
  var rotateStaticParams = {
    /**
     * Same `type: 'angle'` as `rotate-in`'s own `angle:` (`core.ts`), deliberately — an author who
     * already knows `rotate-in angle:180deg` reaches for the identical spelling here, and both go
     * through the one `angle` grammar in `core/params.ts` (`45`, `45d`, and `45deg` all mean the
     * same thing; `rad`/`grad`/`turn` are accepted too).
     *
     * `cssProperty` is declared for schema-shape consistency — `ParamSpec.cssProperty` is a required
     * field — even though no stylesheet ever reads `--kui-static-angle`. `prepareRotateStatic` below
     * reads the validated value straight off `params.text()` and writes it through `ctx.style.set()`,
     * the same indirection `background-media`'s `src`/`focus`/`overlay` already use for a value that
     * is consumed entirely in JavaScript and never substituted into a `var()`.
     *
     * Defaults to *nothing written* rather than some small nonzero nudge (`rotate-in`'s `-8deg`,
     * `orbit`'s `360deg`): those defaults exist because the *bare* name is meant to look like
     * something on its own (an entrance nudge, a full spin). A bare `rotate-static` with no authored
     * angle has no canonical look to default to — any nonzero value would be an arbitrary visual
     * surprise for an author who typed the name to see what it does — so the honest default is a
     * no-op until `angle:` is written.
     *
     * This slot previously read `default: '0deg'` and called that "a documented no-op", which it was
     * not: `prepareRotateStatic` wrote it unconditionally, so `<div class="tilted"
     * data-kui="rotate-static">` on a stylesheet rule of `rotate: 12deg` visibly *un*-rotated the
     * moment the library started. An inline `rotate: 0deg` is not the element's rest state; it is an
     * override of it. See {@link ANGLE_UNSET} for why the fix is a sentinel and not a comparison.
     */
    angle: { type: "angle", default: ANGLE_UNSET, cssProperty: "--kui-static-angle" }
  };
  function prepareRotateStatic(el, params, ctx) {
    const angle = params.text("angle", ANGLE_UNSET);
    if (angle !== ANGLE_UNSET) ctx.style.set("rotate", angle);
    return continuousSetup(() => {
    });
  }
  var TRANSFORMS_PRIMITIVES = [
    {
      id: "rotate-static",
      renderer: "javascript",
      channels: [CHANNEL.rotate],
      parameters: rotateStaticParams,
      // An abstention, not a claim — this primitive never reads `Timeline` at all, the same reason
      // `background-media` spreads the same shared constant rather than naming `['time']` and
      // narrowing what a scrubbed neighbour on the same element may still request. See
      // `TIMELINE_AGNOSTIC`'s own doc (`effects/shared.ts`).
      supportedTimelines: TIMELINE_AGNOSTIC,
      // Same three `background-media` supports, and for the same reason: `'load'` is the default so
      // an element already on screen at load, sitting in a background tab, or still zero-area does
      // not wait on an `IntersectionObserver` that may never fire to be given its tilt. `'enter'` and
      // `'manual'` stay available for an author who deliberately wants the tilt to arrive later.
      supportedActivations: ["load", "enter", "manual"],
      defaultActivation: "load",
      // Writes only the individual `rotate` transform property — compositor-only, no layout or paint
      // implication, the same class `parallax`'s `translate`-only write earns.
      perfClass: "compositor",
      // Not `'disable'`, which activates nothing on the whole host and so silenced every composed
      // neighbour, and not because a fixed tilt is exempt from reduced motion — see the module doc.
      reducedMotion: "shorten",
      // No timing tokens at all, and for a different reason than `background-media`'s: that primitive
      // is refused because it paints a backdrop instead of animating; this one is refused because it
      // writes its one property exactly once, synchronously, on activation — there is no later moment
      // a `delay` could push the write to, no span a `duration` could stretch it across, and no curve
      // an `ease` could bend a single write along.
      prepare: withTimingContract(
        "rotate-static",
        { because: "it sets a fixed rotation once rather than animating, so there is no motion to time" },
        deferPrepare(prepareRotateStatic)
      )
    }
  ];
  var TRANSFORMS_PRESETS = [{ name: "rotate-static", primitive: "rotate-static" }];
  function registerTransforms(registry) {
    return registry.registerPrimitives(TRANSFORMS_PRIMITIVES).registerPresets(TRANSFORMS_PRESETS);
  }

  // src/effects/catalog/index.ts
  function registerCatalog(registry) {
    registerMedia(registry);
    registerText(registry);
    registerAmbient(registry);
    registerFeedback(registry);
    registerNumbers(registry);
    registerInteraction(registry);
    registerInteractionProximity(registry);
    registerDiscrete(registry);
    registerTransforms(registry);
    registerMaterials(registry);
    return registry;
  }

  // src/effects/catalog/core.ts
  var distance2 = {
    distance: { type: "length", default: "24px", cssProperty: "--kui-distance" },
    /*
     * `'number|percentage'` because `--kui-from-opacity` feeds `opacity:`, and CSS spells that
     * property's value `<alpha-value>` — a number *or* a percentage, meaning the same thing either
     * way. An author who writes `opacity:80%` is writing correct CSS, and rejecting it taught them
     * a rule this library invented. The union accepts both and `normalise` in `core/params.ts`
     * converts the percentage, so `0.8` is what reaches the custom property from either spelling
     * and there is still exactly one value shape in devtools.
     *
     * Purely a widening: every attribute already written against this parameter is a bare number,
     * and a bare number is still the canonical form.
     */
    opacity: { type: "number|percentage", default: "0", cssProperty: "--kui-from-opacity" }
  };
  var ENTRANCE_TIMELINES = ["time", "view", "scroll", "pin"];
  var PRIMITIVES = [
    // --- entrance / exit -------------------------------------------------------------------
    cssPrimitive("reveal", [CHANNEL.opacity, CHANNEL.translate], { timelines: ENTRANCE_TIMELINES, parameters: distance2 }),
    cssPrimitive("scale", [CHANNEL.scale], {
      timelines: ENTRANCE_TIMELINES,
      parameters: { scale: { type: "number", default: "0.92", cssProperty: "--kui-from-scale" } }
    }),
    // Separate from `scale` because it claims translate as well and so composes differently.
    // `distance.distance` only, not `...distance`: `kui-zoom-in-up`/`-down` (entrance.css) read
    // `--kui-distance` and `--kui-from-scale` but never `--kui-from-opacity` — this primitive
    // doesn't declare `CHANNEL.opacity`. Spreading the whole shared `distance` object used to expose
    // `opacity:` as an apparently-valid, silently-inert parameter (same dead-parameter shape as
    // `flip-3d`'s old `perspective`, fixed above).
    cssPrimitive("scale-move", [CHANNEL.scale, CHANNEL.translate], {
      timelines: ENTRANCE_TIMELINES,
      parameters: {
        distance: distance2.distance,
        scale: { type: "number", default: "0.92", cssProperty: "--kui-from-scale" }
      }
    }),
    cssPrimitive("rotate", [CHANNEL.rotate], {
      timelines: ENTRANCE_TIMELINES,
      parameters: { angle: { type: "angle", default: "-8deg", cssProperty: "--kui-from-angle" } }
    }),
    // `distance.distance` only, not `...distance`: `kui-roll-in`/`-out` (entrance.css) write
    // `rotate`/`translate`, never `opacity` — this primitive doesn't declare `CHANNEL.opacity`. Same
    // dead-parameter shape as `scale-move` above.
    cssPrimitive("roll", [CHANNEL.rotate, CHANNEL.translate], {
      timelines: ENTRANCE_TIMELINES,
      parameters: {
        distance: distance2.distance,
        angle: { type: "angle", default: "-120deg", cssProperty: "--kui-from-angle" }
      }
    }),
    // `skew`, not `rotate`: entrance.css's keyframes write `transform: perspective(...)
    // rotateX/Y(...)`, not the individual `rotate:` property — the `perspective` parameter below
    // used to compile cleanly and do nothing, because nothing read it. See entrance.css's own
    // comment on `kui-flip-in-x` for the fix; `CHANNEL.skew` is this catalog's name for "claims the
    // whole `transform` shorthand" (`core/types.ts`), shared with `scroll-skew` and `flip-face`.
    cssPrimitive("flip-3d", [CHANNEL.skew], {
      timelines: ENTRANCE_TIMELINES,
      parameters: {
        angle: { type: "angle", default: "90deg", cssProperty: "--kui-from-angle" },
        perspective: { type: "length", default: "1200px", cssProperty: "--kui-perspective" }
      }
    }),
    cssPrimitive("blur", [CHANNEL.filter], {
      timelines: ENTRANCE_TIMELINES,
      parameters: { blur: { type: "length", default: "12px", cssProperty: "--kui-blur" } }
    }),
    // Purpose-built combination: one keyframe, so opacity is written once instead of twice.
    cssPrimitive("reveal-blur", [CHANNEL.opacity, CHANNEL.translate, CHANNEL.filter], {
      timelines: ENTRANCE_TIMELINES,
      parameters: { ...distance2, blur: { type: "length", default: "12px", cssProperty: "--kui-blur" } }
    }),
    // --- scroll-linked ---------------------------------------------------------------------
    // These are progress-linked, not time-triggered: they reverse as the user scrolls back.
    // That is by design and is why `timeline:` is a different axis from `on:`.
    // `distance.distance` only, not the whole `distance` object: `kui-parallax-y`/`-x` (scroll.css)
    // write only `translate` — this primitive doesn't declare `CHANNEL.opacity`. Same dead-parameter
    // shape as `scale-move`/`roll` above; `parallax-y`/`parallax-x`/`depth-layer` never read
    // `--kui-from-opacity`.
    cssPrimitive("parallax", [CHANNEL.translate], {
      parameters: { distance: distance2.distance },
      timelines: ["view", "scroll", "pin"],
      activations: ["manual"],
      reducedMotion: "disable",
      perfClass: "compositor"
    }),
    // `from` exists because the resting end was hardcoded (scale 1 / rotate 0deg), which fixed
    // these to "grow slightly" and "tilt slightly" — a scroll-driven element that should sweep in
    // from a quarter-size or from half a turn away had no way to say so. Same `--kui-from-*`
    // properties the entrance primitives already use, so the two stay spellable the same way.
    cssPrimitive("parallax-scale", [CHANNEL.scale], {
      parameters: {
        scale: { type: "number", default: "1.2", cssProperty: "--kui-to-scale" },
        from: { type: "number", default: "1", cssProperty: "--kui-from-scale" }
      },
      timelines: ["view", "scroll", "pin"],
      activations: ["manual"],
      reducedMotion: "disable"
    }),
    cssPrimitive("parallax-rotate", [CHANNEL.rotate], {
      parameters: {
        angle: { type: "angle", default: "12deg", cssProperty: "--kui-to-angle" },
        from: { type: "angle", default: "0deg", cssProperty: "--kui-from-angle" }
      },
      timelines: ["view", "scroll", "pin"],
      activations: ["manual"],
      reducedMotion: "disable"
    }),
    cssPrimitive("scroll-fade", [CHANNEL.opacity], {
      // `'number|percentage'` for the reason `distance.opacity` above gives.
      parameters: {
        opacity: { type: "number|percentage", default: "0", cssProperty: "--kui-from-opacity" }
      },
      timelines: ["view", "scroll", "pin"],
      activations: ["manual"],
      reducedMotion: "disable"
    }),
    // `filter`, not `opacity` — it collides with `blur`, and declaring the real channel is what
    // makes `channels.ts` say so instead of letting the two silently overwrite each other's
    // `filter` declaration.
    cssPrimitive("desaturate", [CHANNEL.filter], {
      parameters: {
        from: { type: "percentage", default: "100%", cssProperty: "--kui-from-grayscale" },
        to: { type: "percentage", default: "0%", cssProperty: "--kui-to-grayscale" }
      },
      timelines: ["view", "scroll", "pin"],
      activations: ["manual"],
      reducedMotion: "disable",
      perfClass: "paint"
    }),
    /*
     * `transform`, not one of the independent transform properties, because CSS never shipped a
     * standalone `skew:`. That is also why `skew` is its own channel rather than folded in with
     * `rotate`: writing `transform` replaces the entire shorthand, so a skew composed with anything
     * else that wrote `transform` would silently win. Nothing else in the catalog does — every other
     * transform in the library goes through `translate`/`rotate`/`scale` — so the shorthand is free.
     */
    cssPrimitive("skew", [CHANNEL.skew], {
      parameters: {
        from: { type: "angle", default: "8deg", cssProperty: "--kui-from-skew" },
        to: { type: "angle", default: "0deg", cssProperty: "--kui-to-skew" }
      },
      timelines: ["view", "scroll", "pin"],
      activations: ["manual"],
      reducedMotion: "disable"
    }),
    // `'transform-origin'` alongside `scale`: `scroll-progress-bar`/`-y` pin the bar's growth edge
    // with `transform-origin: left center` (scroll.css) — undeclared until channel-properties.ts
    // gained an entry for it, which made the write structurally invisible to the static-rule check.
    cssPrimitive("progress", [CHANNEL.scale, "transform-origin"], {
      timelines: ["scroll", "view"],
      activations: ["manual"],
      reducedMotion: "disable"
    }),
    // Separate primitive because it writes `stroke-dashoffset`, not `scale` — declaring the
    // wrong channel would let it silently compose with an effect it actually collides with.
    cssPrimitive("progress-stroke", [CHANNEL.stroke], {
      parameters: { length: { type: "number", default: "100", cssProperty: "--kui-path-length" } },
      timelines: ["scroll", "view"],
      activations: ["manual"],
      reducedMotion: "disable",
      perfClass: "paint"
    })
  ];
  var p = (name, primitive, keyframes, params) => ({ name, primitive, keyframes, ...params ? { params } : {} });
  var pIn = (name, primitive, keyframes, params) => ({ ...p(name, primitive, keyframes, params), cloak: true, phase: "entrance" });
  var pOut = (name, primitive, keyframes, params) => ({ ...p(name, primitive, keyframes, params), phase: "exit" });
  var FADE = [
    pIn("fade-in", "reveal", "kui-in"),
    pOut("fade-out", "reveal", "kui-out"),
    pIn("fade-up", "reveal", "kui-in-up"),
    pIn("fade-down", "reveal", "kui-in-down"),
    pIn("fade-left", "reveal", "kui-in-right"),
    pIn("fade-right", "reveal", "kui-in-left"),
    pOut("fade-out-up", "reveal", "kui-out-up"),
    pOut("fade-out-down", "reveal", "kui-out-down"),
    pOut("fade-out-left", "reveal", "kui-out-left"),
    pOut("fade-out-right", "reveal", "kui-out-right")
  ];
  var SLIDE_PARAMS = { distance: "100px", opacity: "1" };
  var SLIDE = [
    pIn("slide-up", "reveal", "kui-in-up", SLIDE_PARAMS),
    pIn("slide-down", "reveal", "kui-in-down", SLIDE_PARAMS),
    pIn("slide-left", "reveal", "kui-in-right", SLIDE_PARAMS),
    pIn("slide-right", "reveal", "kui-in-left", SLIDE_PARAMS),
    pOut("slide-out-up", "reveal", "kui-out-up", SLIDE_PARAMS),
    pOut("slide-out-down", "reveal", "kui-out-down", SLIDE_PARAMS),
    pOut("slide-out-left", "reveal", "kui-out-left", SLIDE_PARAMS),
    pOut("slide-out-right", "reveal", "kui-out-right", SLIDE_PARAMS)
  ];
  var LOGICAL = [
    pIn("slide-inline-start", "reveal", "kui-in-inline-end", SLIDE_PARAMS),
    pIn("slide-inline-end", "reveal", "kui-in-inline-start", SLIDE_PARAMS),
    pIn("slide-block-start", "reveal", "kui-in-up", SLIDE_PARAMS),
    pIn("slide-block-end", "reveal", "kui-in-down", SLIDE_PARAMS)
  ];
  var ZOOM = [
    pIn("zoom-in", "scale", "kui-zoom-in"),
    pOut("zoom-out", "scale", "kui-zoom-out"),
    pIn("pop-in", "scale", "kui-zoom-in", { scale: "0.6", ease: "back-out" }),
    pOut("pop-out", "scale", "kui-zoom-out", { scale: "0.6", ease: "back-in" }),
    pIn("zoom-in-up", "scale-move", "kui-zoom-in-up"),
    pIn("zoom-in-down", "scale-move", "kui-zoom-in-down")
  ];
  var FLIP = [
    pIn("flip-in-x", "flip-3d", "kui-flip-in-x"),
    pIn("flip-in-y", "flip-3d", "kui-flip-in-y"),
    pOut("flip-out-x", "flip-3d", "kui-flip-out-x"),
    pOut("flip-out-y", "flip-3d", "kui-flip-out-y")
  ];
  var ROTATE = [
    pIn("rotate-in", "rotate", "kui-rotate-in"),
    pOut("rotate-out", "rotate", "kui-rotate-out"),
    pIn("rotate-in-left", "rotate", "kui-rotate-in", { angle: "-45deg" }),
    pIn("rotate-in-right", "rotate", "kui-rotate-in", { angle: "45deg" }),
    pIn("roll-in", "roll", "kui-roll-in"),
    pOut("roll-out", "roll", "kui-roll-out"),
    pIn("swing-in", "rotate", "kui-swing-in", { angle: "-15deg", ease: "back-out" })
  ];
  var BLUR = [
    pIn("blur-in", "blur", "kui-blur-in"),
    pOut("blur-out", "blur", "kui-blur-out"),
    pIn("fade-blur-up", "reveal-blur", "kui-fade-blur-up"),
    pIn("fade-blur-in", "reveal-blur", "kui-fade-blur-in")
  ];
  var CHARACTER = [
    pIn("bounce-in", "scale", "kui-zoom-in", { scale: "0.3", ease: "bounce" }),
    pIn("bounce-in-up", "reveal", "kui-in-up", { distance: "60px", ease: "back-out" }),
    pIn("bounce-in-down", "reveal", "kui-in-down", { distance: "60px", ease: "back-out" }),
    pIn("back-in-up", "reveal", "kui-in-up", { distance: "120px", ease: "expo-out" }),
    pIn("back-in-down", "reveal", "kui-in-down", { distance: "120px", ease: "expo-out" })
  ];
  var SCROLL = [
    p("parallax-y", "parallax", "kui-parallax-y"),
    p("parallax-x", "parallax", "kui-parallax-x"),
    p("parallax-scale", "parallax-scale", "kui-parallax-scale"),
    p("parallax-rotate", "parallax-rotate", "kui-parallax-rotate"),
    p("depth-layer", "parallax", "kui-parallax-y", { distance: "200px" }),
    p("scroll-fade", "scroll-fade", "kui-scroll-fade"),
    p("scroll-desaturate", "desaturate", "kui-desaturate"),
    p("scroll-skew", "skew", "kui-scroll-skew"),
    p("scroll-progress-bar", "progress", "kui-progress-x"),
    p("scroll-progress-bar-y", "progress", "kui-progress-y"),
    p("scroll-progress-ring", "progress-stroke", "kui-progress-ring"),
    // `reveal-repeat` was removed: it was byte-identical to `reveal-once`, and the activation
    // binder unobserves after first entry, so a repeating reveal is not implementable yet.
    pIn("reveal-once", "reveal", "kui-in-up")
  ];
  var PRESETS = [
    ...FADE,
    ...SLIDE,
    ...LOGICAL,
    ...ZOOM,
    ...FLIP,
    ...ROTATE,
    ...BLUR,
    ...CHARACTER,
    ...SCROLL
  ];
  var COMBOS = [
    [["fade-up", "blur-in"], "fade-blur-up"],
    [["fade-in", "blur-in"], "fade-blur-in"]
  ];
  function registerCore(registry) {
    registry.registerPrimitives(PRIMITIVES).registerPresets(PRESETS);
    for (const [names, preset] of COMBOS) registry.registerCombo(names, preset);
    return registry;
  }

  // src/effects/step-marking.ts
  var STEP_STATE_ATTR = "data-kui-step-state";
  var STEP_OFFSET_ATTR = "data-kui-step-offset";
  function placeInGroups(nodes) {
    const order = [];
    const sizes = /* @__PURE__ */ new Map();
    for (const node of nodes) {
      const parent = node.parentElement;
      const position = sizes.get(parent) ?? 0;
      sizes.set(parent, position + 1);
      order.push({ node, parent, position });
    }
    return { order, sizes };
  }
  function indexWithin(index, size) {
    return size > 0 ? (index % size + size) % size : index;
  }
  function createStepMarker(resolve, warn) {
    const ledgers = /* @__PURE__ */ new Map();
    const styles = /* @__PURE__ */ new Map();
    let warned = false;
    return {
      mark(index) {
        const { order, sizes } = placeInGroups(resolve());
        if (!warned && warn && new Set(sizes.values()).size > 1) {
          warned = true;
          warn(
            `target matched groups of different sizes (${[...sizes.values()].join(", ")}) \u2014 the shorter group wraps onto its own ring, so its active element will not line up with the longer one`
          );
        }
        for (const { node, parent, position } of order) {
          const size = sizes.get(parent) ?? 0;
          const local = indexWithin(index, size);
          let ledger = ledgers.get(node);
          if (!ledger) {
            ledger = createAttributeLedger(node);
            ledgers.set(node, ledger);
          }
          ledger.set(STEP_STATE_ATTR, stepStateFor(position, local));
          let style = styles.get(node);
          if (!style) {
            style = createStyleLedger(node);
            styles.set(node, style);
          }
          const offset = circularOffset(position, local, size);
          style.set("--kui-offset", String(offset));
          ledger.set(STEP_OFFSET_ATTR, String(offset));
          style.set("--kui-item-count", String(size));
        }
      },
      restore() {
        for (const ledger of ledgers.values()) ledger.restore();
        for (const style of styles.values()) style.restore();
        ledgers.clear();
        styles.clear();
      }
    };
  }
  function circularOffset(position, index, size) {
    if (size <= 0) return 0;
    const forward = ((position - index) % size + size) % size;
    return forward > Math.floor(size / 2) ? forward - size : forward;
  }
  function stepStateFor(position, index) {
    if (position < index) return "before";
    if (position === index) return "active";
    return "after";
  }

  // src/effects/forms/primitives.ts
  var timing = {
    duration: { type: "time", default: "400ms", cssProperty: "--kui-duration" },
    ...TRIGGER_DELAY_PARAM,
    ease: { type: "easing", default: "ease-out", cssProperty: "--kui-ease" }
  };
  var FORM_STATE_TIMING = {
    because: "forms.css pins its timing literally \u2014 the motion lands on a sibling that inline custom properties cannot reach"
  };
  var NATIVE_STATE_PRIMITIVE = {
    id: "native-state",
    renderer: "javascript",
    channels: [CHANNEL.translate, CHANNEL.scale, CHANNEL.opacity, CHANNEL.stroke, CHANNEL.color],
    parameters: {},
    supportedTimelines: ["time"],
    supportedActivations: ["load"],
    defaultActivation: "load",
    perfClass: "compositor",
    // Native pseudo-classes drive these and the motion lands on a sibling, not on the control that
    // carries the attribute, so base.css's policy layer enforces this through its sibling
    // `transition-duration` rules rather than the `animation-*` ones.
    reducedMotion: "disable",
    prepare: withTimingContract("native-state", FORM_STATE_TIMING, () => inertInstance())
  };
  function prepareSiblingScale(cssProperty) {
    return (el, params) => {
      const sibling = el.nextElementSibling;
      sibling?.style.setProperty(cssProperty, String(params.num("scale", 1)));
      return () => sibling?.style.removeProperty(cssProperty);
    };
  }
  function siblingScalePrimitive(id, cssProperty) {
    return {
      id,
      renderer: "javascript",
      channels: [CHANNEL.translate, CHANNEL.scale, CHANNEL.opacity, CHANNEL.stroke, CHANNEL.color],
      parameters: { scale: { type: "number", default: "1", cssProperty } },
      supportedTimelines: ["time"],
      supportedActivations: ["load"],
      defaultActivation: "load",
      perfClass: "compositor",
      reducedMotion: "disable",
      prepare: withTimingContract(id, FORM_STATE_TIMING, deferPrepare(prepareSiblingScale(cssProperty)))
    };
  }
  var TOGGLE_MORPH_PRIMITIVE = siblingScalePrimitive("toggle-morph", "--kui-toggle-scale");
  var RADIO_FILL_PRIMITIVE = siblingScalePrimitive("radio-fill", "--kui-radio-scale");
  var FOCUS_RING_PRIMITIVE = cssPrimitive("focus-ring", ["shadow"], {
    activations: ["focus", "manual"],
    defaultActivation: "focus"
  });
  var VALIDATE_SHAKE_PRIMITIVE = cssPrimitive("validate-shake", [CHANNEL.translate], {
    activations: ["click", "manual"],
    defaultActivation: "click"
  });
  var VALIDATE_CHECK_PRIMITIVE = cssPrimitive("validate-check", [CHANNEL.stroke], {
    activations: ["click", "manual"],
    defaultActivation: "click"
  });
  function jsInputPrimitive(id, channels, parameters, prepare) {
    return {
      id,
      renderer: "javascript",
      channels,
      parameters: { ...timing, ...parameters },
      supportedTimelines: ["time"],
      supportedActivations: ["load"],
      defaultActivation: "load",
      perfClass: "compositor",
      /*
       * Right for the family this helper was written for, and *only* for it. `strength-meter` and
       * `range-fill` publish a value the browser then transitions, and base.css shortens that
       * transition to 1ms — so refusing to activate is a complete treatment: the meter still sits at
       * its correct resting position, with nothing left over to take away.
       *
       * It is the wrong answer for a primitive whose output is behaviour rather than a resting
       * style, because `disable` is enforced by the animator rather than by CSS — `openGate`
       * (`core/animator.ts`) marks the element finished and never calls `activate()`, so a deferred
       * setup simply never runs. `STEP_PROGRESS_PRIMITIVE` overrides this for exactly that reason;
       * see the note there.
       */
      reducedMotion: "disable",
      prepare
    };
  }
  function computeStrength(value) {
    let score = 0;
    if (value.length >= 6) score++;
    if (value.length >= 10) score++;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
    if (/\d/.test(value)) score++;
    if (/[^A-Za-z0-9]/.test(value)) score++;
    return Math.min(4, score);
  }
  function prepareStrengthMeter(el) {
    const input = el;
    const update = () => {
      el.setAttribute("data-kui-strength-level", String(computeStrength(input.value)));
    };
    input.addEventListener("input", update);
    update();
    return () => {
      input.removeEventListener("input", update);
      el.removeAttribute("data-kui-strength-level");
    };
  }
  function prepareRangeFill(el, params, ctx) {
    const input = el;
    const update = () => {
      const min = Number(input.min || "0");
      const max = Number(input.max || "100");
      const pct = max > min ? (Number(input.value) - min) / (max - min) * 100 : 0;
      ctx.style.set("--kui-fill", `${pct.toFixed(2)}%`);
    };
    input.addEventListener("input", update);
    update();
    return () => input.removeEventListener("input", update);
  }
  var STRENGTH_METER_PRIMITIVE = jsInputPrimitive(
    "strength-meter",
    ["meter"],
    {},
    deferPrepare(prepareStrengthMeter)
  );
  var RANGE_FILL_PRIMITIVE = jsInputPrimitive(
    "range-fill",
    [CHANNEL.background],
    {},
    deferPrepare(prepareRangeFill)
  );
  function nextStep(step, total) {
    return total > 0 ? (step + 1) % total : 0;
  }
  function prevStep(step, total) {
    return total > 0 ? (step - 1 + total) % total : 0;
  }
  function clampStep(step, total) {
    return total > 0 ? (step % total + total) % total : 0;
  }
  function countSteps(params, resolveSteps) {
    const authored = Math.round(params.num("steps", 0));
    if (authored >= 1) return authored;
    const groups = /* @__PURE__ */ new Map();
    for (const node of resolveSteps()) {
      groups.set(node.parentElement, (groups.get(node.parentElement) ?? 0) + 1);
    }
    return Math.max(1, ...groups.values());
  }
  function delegateControls(request) {
    const { el, ctx, scope, groups } = request;
    if (groups.length === 0) return () => {
    };
    const root = scope === "page" ? ctx.doc : el;
    const onClick = (event) => {
      const from = event.target;
      if (typeof from?.closest !== "function") return;
      for (const { selector, run } of groups) {
        const matches = queryScoped(el, ctx, selector, scope);
        const matched = new Set(matches);
        let node = from;
        while (node && !matched.has(node)) node = node.parentElement;
        if (!node) continue;
        run(node, matches.indexOf(node));
      }
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }
  function prepareStepProgress(el, params, ctx) {
    const selector = resolveTarget(params.text("target"), ctx, "step-progress");
    const scope = scopeParam(params, "page");
    const resolveSteps = () => selector ? queryScoped(el, ctx, selector, scope) : el.children;
    const marker = createStepMarker(
      resolveSteps,
      (message) => ctx.warn(`step-progress ${message}`)
    );
    const total = () => countSteps(params, resolveSteps);
    const self = createAttributeLedger(el);
    const selfStyle = createStyleLedger(el);
    let step = 0;
    const render = () => {
      self.set("data-kui-step", String(step));
      selfStyle.set("--kui-step", String(step));
      marker.mark(step);
    };
    const goTo = (index) => {
      step = clampStep(index, total());
      render();
    };
    const groups = [];
    const bindControl = (param, run) => {
      const selector2 = resolveTarget(params.text(param), ctx, `step-progress ${param}`);
      if (!selector2) return false;
      if (queryScoped(el, ctx, selector2, scope).length === 0) {
        ctx.warn(`step-progress ${param} "${selector2}" matched nothing`);
      }
      groups.push({ selector: selector2, run });
      return true;
    };
    const named = [
      bindControl("next", () => goTo(nextStep(step, total()))),
      bindControl("prev", () => goTo(prevStep(step, total()))),
      // A jump control's index is its own position among the controls, in document order — the dots
      // are written in the same order as the slides they select, so nothing has to be numbered by
      // hand and adding a slide cannot desynchronise the pair. The `>= 0` is a floor on the contract
      // rather than a live case: `delegateControls` numbers a control against the same match set it
      // found it in, so a press cannot report a position that set does not have.
      bindControl("jump", (_node, position) => {
        if (position >= 0) goTo(position);
      })
    ].some(Boolean);
    const advance = () => goTo(nextStep(step, total()));
    if (!named) el.addEventListener("click", advance);
    const releaseControls = delegateControls({ el, ctx, scope, groups });
    render();
    return () => {
      if (!named) el.removeEventListener("click", advance);
      releaseControls();
      self.restore();
      selfStyle.restore();
      marker.restore();
    };
  }
  var STEP_PROGRESS_BASE = jsInputPrimitive(
    "step-progress",
    ["state"],
    {
      // Empty default, not '4': `readParams` fills every declared default in unconditionally and
      // does not validate it, so an empty one is how `prepareStepProgress` tells "unauthored" from
      // "authored 4" and knows to count the elements instead. The bounds still screen an authored
      // value; a counted one is a fact about the DOM and is not capped by them.
      steps: { type: "number", default: "", cssProperty: "--kui-steps", minimum: 1, maximum: 20, integer: true },
      target: { type: "text", default: "", cssProperty: "--kui-target" },
      // The three optional controls. Selectors, resolved and scoped exactly like `target:` — so the
      // same quoting rule applies to one containing a space or comma. Naming any of them replaces
      // the click-the-container form rather than adding to it; see `prepareStepProgress`.
      next: { type: "text", default: "", cssProperty: "--kui-next" },
      prev: { type: "text", default: "", cssProperty: "--kui-prev" },
      jump: { type: "text", default: "", cssProperty: "--kui-jump" },
      /*
       * Spacing, as three numbers the stylesheet reads back off `--kui-peek` / `--kui-rest` /
       * `--kui-main`.
       *
       * Unlike an `axis:` — which would only have chosen between two transforms the page was
       * writing anyway, and so would have been a knob that does nothing — these are *values*. The
       * library publishes them, `calc()` consumes them, and a page tuning how crowded its deck is
       * changes one token in the attribute instead of editing a stylesheet. That is the same
       * contract every `cssProperty` parameter in this file already has.
       *
       * Per `design.md` §7 the default is the `var()` fallback and is never written inline, so a
       * deck that names neither still lands on these numbers via the page's own `var(--kui-peek,
       * 56%)`, and no inline style appears until someone actually asks for a different one.
       */
      peek: { type: "percentage", default: "56%", cssProperty: "--kui-peek" },
      rest: { type: "number", default: "0.78", cssProperty: "--kui-rest" },
      /*
       * The third number, and the one the other two are measured against.
       *
       * `peek:` is a percentage of a slide's own width and `rest:` a scale of it, so both are
       * anchored to how big the live slide is — and that size was reachable only from the
       * stylesheet. A deck that was too crowded could not be fixed from the attribute at all: with
       * the live slide filling its clip, no `peek:` pushes a neighbour into view, because the
       * neighbour is behind the live one rather than short of it. Two thirds of a knob is not a
       * knob.
       *
       * A scale and not a width, which is what makes it safe to write in an attribute. Every
       * authored parameter reaches the element as an *inline* custom property, so a media query
       * cannot take it back — and a width is exactly the thing a phone and a desktop must disagree
       * about. A multiplier does not care: `main:0.82` means the same "a bit smaller than its box"
       * at 390px and at 1440px, and the page keeps owning the box. Same reason `rest:` is a number.
       */
      main: { type: "number", default: "1", cssProperty: "--kui-main", finite: true, minimum: 0 },
      // Which tree `target:` is searched in. Unset means this primitive's own historical answer —
      // see `prepareStepProgress`. One declaration, shared: `effects/step-marking.ts`.
      scope: SCOPE_PARAM
    },
    deferPrepare(prepareStepProgress)
  );
  var STEP_PROGRESS_PRIMITIVE = {
    ...STEP_PROGRESS_BASE,
    reducedMotion: "shorten"
  };
  function nextSubmitStage(stage) {
    if (stage === "idle") return "loading";
    if (stage === "loading") return "done";
    return "idle";
  }
  function prepareSubmitFlow(el, params, ctx) {
    const loadMs = params.ms("load", 1200);
    const holdMs = params.ms("hold", 1500);
    let stage = "idle";
    let handle;
    const render = () => el.setAttribute("data-kui-stage", stage);
    const toIdle = () => {
      stage = nextSubmitStage(stage);
      render();
    };
    const toDone = () => {
      stage = nextSubmitStage(stage);
      render();
      handle = ctx.win.setTimeout(toIdle, holdMs);
    };
    const advance = () => {
      if (stage !== "idle") return;
      stage = nextSubmitStage(stage);
      render();
      handle = ctx.win.setTimeout(toDone, loadMs);
    };
    el.addEventListener("click", advance);
    render();
    return () => {
      el.removeEventListener("click", advance);
      if (handle !== void 0) ctx.win.clearTimeout(handle);
      el.removeAttribute("data-kui-stage");
    };
  }
  var SUBMIT_FLOW_PRIMITIVE = jsInputPrimitive(
    "submit-flow",
    ["state"],
    {
      load: { type: "time", default: "1200ms", cssProperty: "--kui-load" },
      hold: { type: "time", default: "1500ms", cssProperty: "--kui-hold" }
    },
    deferPrepare(prepareSubmitFlow)
  );

  // src/effects/forms/index.ts
  var FORMS_PRIMITIVES = [
    NATIVE_STATE_PRIMITIVE,
    FOCUS_RING_PRIMITIVE,
    VALIDATE_SHAKE_PRIMITIVE,
    VALIDATE_CHECK_PRIMITIVE,
    STRENGTH_METER_PRIMITIVE,
    TOGGLE_MORPH_PRIMITIVE,
    RADIO_FILL_PRIMITIVE,
    RANGE_FILL_PRIMITIVE,
    STEP_PROGRESS_PRIMITIVE,
    SUBMIT_FLOW_PRIMITIVE
  ];
  var FORMS_PRESETS = [
    { name: "label-float", primitive: "native-state", requiresOwnSubtree: true, phase: "state" },
    {
      name: "input-underline-grow",
      primitive: "native-state",
      requiresOwnSubtree: true,
      phase: "state"
    },
    { name: "focus-ring-grow", primitive: "focus-ring", keyframes: "kui-focus-ring-grow" },
    { name: "validate-shake", primitive: "validate-shake", keyframes: "kui-validate-shake" },
    { name: "validate-check", primitive: "validate-check", keyframes: "kui-validate-check" },
    { name: "strength-meter", primitive: "strength-meter", requiresOwnSubtree: true, phase: "state" },
    { name: "toggle-morph", primitive: "toggle-morph", requiresOwnSubtree: true, phase: "state" },
    { name: "checkbox-draw", primitive: "native-state", requiresOwnSubtree: true, phase: "state" },
    { name: "radio-fill", primitive: "radio-fill", requiresOwnSubtree: true, phase: "state" },
    { name: "range-fill", primitive: "range-fill", phase: "state" },
    {
      name: "submit-to-spinner-to-check",
      primitive: "submit-flow",
      requiresOwnSubtree: true,
      phase: "state"
    },
    { name: "step-progress", primitive: "step-progress", requiresOwnSubtree: true, phase: "state" },
    /*
     * Same primitive, second name — an index that wraps is a progress bar when its steps are
     * segments of a bar and a carousel when they are slides, and the only thing separating those
     * two readings is the stylesheet. `step-progress` was the wrong word to type on a deck of
     * slides, which is the only reason this alias exists; nothing behaves differently under it.
     *
     * It is still an *index*, not a carousel component: no ARIA, no roving focus, no autoplay. That
     * boundary is the one section H states — the library animates elements you control and does not
     * own the widget — and naming this `carousel` does not move it.
     *
     * No `requiresOwnSubtree` here, unlike `step-progress` beside it. That flag means "this name's
     * shipped CSS reaches past the element into its descendants, so the universal `target:` must
     * refuse to relocate it" — and `forms.css` keys its stepper rules on
     * `[data-kui-fx~='step-progress']`, which is the *name*, not the primitive. Under this name the
     * library ships no CSS at all: the page styles its own slides off `data-kui-step-state`. Carrying
     * the flag anyway would silently refuse a `target:` that would have worked fine.
     */
    /*
     * `scope:self` is the one thing that does differ, and it is a default rather than a behaviour:
     * `step-progress` resolves `target:`/`next:`/`prev:`/`jump:` page-wide, which is right for a bar
     * whose segments are deliberately elsewhere (a legend beside it) and wrong for a deck. Two decks
     * on one page are the ordinary case, not an edge one, and page-wide resolution makes them share
     * everything: each instance binds *both* decks' arrows and marks *both* decks' slides, so
     * clicking next on one advances the other. A deck's slides and its controls live inside it, so
     * searching inside it is both correct and the only reading that scales past one.
     *
     * A default, so `scope:page` still spells the old behaviour for a deck whose arrows genuinely
     * sit outside it, and `step-progress` — which is what the shipped stepper form is authored as —
     * is untouched.
     */
    { name: "carousel", primitive: "step-progress", params: { scope: "self" }, phase: "state" }
  ];
  function registerForms(registry) {
    return registry.registerPrimitives(FORMS_PRIMITIVES).registerPresets(FORMS_PRESETS);
  }

  // src/core/gesture.ts
  var VELOCITY_WINDOW_MS = 100;
  var MAX_SAMPLES2 = 12;
  function velocityFrom(samples) {
    const last = samples[samples.length - 1];
    if (!last || samples.length < 2) return { vx: 0, vy: 0 };
    const cutoff = last.time - VELOCITY_WINDOW_MS;
    const first = samples.find((sample) => sample.time >= cutoff) ?? samples[0];
    const span = (last.time - first.time) / 1e3;
    if (span <= 0) return { vx: 0, vy: 0 };
    return { vx: (last.x - first.x) / span, vy: (last.y - first.y) / span };
  }
  function swipeDirection(vector, minVelocity) {
    const { vx, vy } = vector;
    if (Math.abs(vx) < minVelocity && Math.abs(vy) < minVelocity) return null;
    if (Math.abs(vx) >= Math.abs(vy)) return vx > 0 ? "right" : "left";
    return vy > 0 ? "down" : "up";
  }
  function applyAxis(vector, axis) {
    if (axis === "x") return { ...vector, dy: 0, vy: 0 };
    if (axis === "y") return { ...vector, dx: 0, vx: 0 };
    return vector;
  }
  function recognise(el, handlers, options = {}, deps = defaultGestureDeps()) {
    const threshold = options.threshold ?? 4;
    const axis = options.axis ?? "both";
    const swipeVelocity = options.swipeVelocity ?? 300;
    const capturePointer = options.capturePointer ?? true;
    const longPressMs = options.longPressMs ?? 0;
    let samples = [];
    let origin = null;
    let active = false;
    let longPressTimer = null;
    let longPressFired = false;
    function sampleOf(event) {
      return { x: event.clientX, y: event.clientY, time: deps.now() };
    }
    function vectorNow(sample) {
      const start = origin;
      const { vx, vy } = velocityFrom(samples);
      return applyAxis({ dx: sample.x - start.x, dy: sample.y - start.y, vx, vy }, axis);
    }
    function clearLongPress() {
      if (longPressTimer !== null) deps.clearTimer(longPressTimer);
      longPressTimer = null;
    }
    function onDown(event) {
      origin = sampleOf(event);
      samples = [origin];
      active = false;
      longPressFired = false;
      if (capturePointer) el.setPointerCapture?.(event.pointerId);
      if (longPressMs > 0) {
        longPressTimer = deps.setTimer(() => {
          longPressFired = true;
          handlers.onLongPress?.(origin);
        }, longPressMs);
      }
    }
    function onMove(event) {
      if (!origin) return;
      const sample = sampleOf(event);
      samples.push(sample);
      if (samples.length > MAX_SAMPLES2) samples.shift();
      const vector = vectorNow(sample);
      if (!active && Math.hypot(vector.dx, vector.dy) < threshold) return;
      if (!active) {
        active = true;
        clearLongPress();
        handlers.onStart?.(origin);
      }
      handlers.onMove?.(vector, sample);
    }
    function onUp(event) {
      clearLongPress();
      if (capturePointer) el.releasePointerCapture?.(event.pointerId);
      if (!origin) return;
      const sample = sampleOf(event);
      samples.push(sample);
      const vector = vectorNow(sample);
      if (active) {
        handlers.onEnd?.(vector, sample);
        const direction = swipeDirection(vector, swipeVelocity);
        if (direction) handlers.onSwipe?.(direction, vector);
      } else if (longPressFired) {
        handlers.onEnd?.(vector, sample);
      }
      origin = null;
      active = false;
      longPressFired = false;
      samples = [];
    }
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerup", onUp, { passive: true });
    el.addEventListener("pointercancel", onUp, { passive: true });
    return () => {
      clearLongPress();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }
  function defaultGestureDeps() {
    return {
      now: () => typeof performance === "undefined" ? Date.now() : performance.now(),
      setTimer: (callback, ms) => globalThis.setTimeout(callback, ms),
      clearTimer: (handle) => globalThis.clearTimeout(handle)
    };
  }
  function rubberBand(offset, limit, tension = 0.55) {
    if (limit <= 0) return 0;
    const sign = Math.sign(offset);
    const magnitude = Math.abs(offset);
    return sign * (1 - 1 / (magnitude / limit / tension + 1)) * limit;
  }

  // src/effects/gestures/primitives.ts
  var springParams2 = {
    stiffness: {
      type: "number",
      default: "180",
      cssProperty: "--kui-stiffness",
      finite: true,
      minimum: 1,
      maximum: 1e4
    },
    damping: {
      type: "number",
      default: "24",
      cssProperty: "--kui-damping",
      finite: true,
      minimum: 0.1,
      maximum: 1e3
    },
    mass: {
      type: "number",
      default: "1",
      cssProperty: "--kui-mass",
      finite: true,
      minimum: 0.1
    }
  };
  var GESTURE_TIMING_REASON = "it is driven by pointer position and velocity, so it has no start moment and no authored curve";
  function gesturePrimitive(id, channels, parameters, prepare) {
    const honours = Object.hasOwn(parameters, "duration") ? ["duration"] : [];
    return {
      id,
      renderer: "javascript",
      channels,
      parameters,
      supportedTimelines: ["time", "pointer"],
      supportedActivations: ["load", "manual"],
      defaultActivation: "load",
      perfClass: "continuous",
      reducedMotion: "disable",
      prepare: withTimingContract(id, { honours, because: GESTURE_TIMING_REASON }, prepare)
    };
  }
  function springFrom2(params) {
    return {
      ...DEFAULT_SPRING,
      stiffness: params.num("stiffness", DEFAULT_SPRING.stiffness),
      damping: params.num("damping", DEFAULT_SPRING.damping),
      mass: params.num("mass", DEFAULT_SPRING.mass)
    };
  }
  function springDeps(ctx) {
    return { ...defaultSpringDeps(), warn: ctx.warn };
  }
  function writeOffset(ctx, x, y) {
    ctx.style.set("translate", `${x.toFixed(2)}px ${y.toFixed(2)}px`);
  }
  function prepareDraggable(el, params, ctx) {
    const config = springFrom2(params);
    const bounds = params.num("bounds", 0);
    const returns = params.is("return");
    const inertia = params.is("inertia");
    const resistance = params.num("resistance", 0.55);
    const momentum = params.num("momentum", 0.2);
    const offset = { x: 0, y: 0 };
    const pickup = { x: 0, y: 0 };
    const deps = springDeps(ctx);
    const runners = {
      x: createSpringRunner(config, (value) => write({ ...offset, x: value }), deps),
      y: createSpringRunner(config, (value) => write({ ...offset, y: value }), deps)
    };
    function write(next) {
      offset.x = next.x;
      offset.y = next.y;
      writeOffset(ctx, offset.x, offset.y);
    }
    const stopRecognising = recognise(
      el,
      {
        onStart() {
          runners.x.stop();
          runners.y.stop();
          pickup.x = offset.x;
          pickup.y = offset.y;
          el.setAttribute("data-kui-dragging", "true");
        },
        onMove(vector) {
          write({
            x: resist(pickup.x + vector.dx, bounds, resistance),
            y: resist(pickup.y + vector.dy, bounds, resistance)
          });
        },
        onEnd(vector) {
          el.setAttribute("data-kui-dragging", "false");
          settle(runners, offset, vector, { returns, inertia, momentum });
        }
      },
      { axis: params.text("axis", "both") }
    );
    ctx.invalidate();
    return () => {
      stopRecognising();
      runners.x.stop();
      runners.y.stop();
      el.removeAttribute("data-kui-dragging");
    };
  }
  function resist(delta, bounds, tension) {
    return bounds > 0 ? rubberBand(delta, bounds, tension) : delta;
  }
  function settle(runners, offset, vector, mode) {
    runners.x.set(offset.x, mode.inertia ? vector.vx : 0);
    runners.y.set(offset.y, mode.inertia ? vector.vy : 0);
    if (mode.returns) {
      runners.x.to(0);
      runners.y.to(0);
      return;
    }
    const carry = mode.inertia ? mode.momentum : 0;
    runners.x.to(offset.x + vector.vx * carry);
    runners.y.to(offset.y + vector.vy * carry);
  }
  function prepareSwipeable(el, params) {
    const stop = recognise(
      el,
      {
        onSwipe(direction) {
          el.setAttribute("data-kui-swipe", direction);
        }
      },
      {
        axis: params.text("axis", "both"),
        swipeVelocity: params.num("velocity", 300),
        // This primitive publishes an attribute and moves nothing, so it has no reason to hold the
        // pointer — and holding it retargets the following `click` at this element, which silently
        // breaks every interactive child. A `swipe-x` on a carousel shell killed its own dots and
        // buttons that way. See `capturePointer` in `core/gesture.ts`.
        capturePointer: false
      }
    );
    return () => {
      stop();
      el.removeAttribute("data-kui-swipe");
    };
  }
  function preparePressable(el, params) {
    const stop = recognise(
      el,
      {
        onLongPress() {
          el.setAttribute("data-kui-pressed", "true");
        },
        onEnd() {
          el.setAttribute("data-kui-pressed", "false");
        }
      },
      { longPressMs: effectDurationMs(params, 500) }
    );
    return () => {
      stop();
      el.removeAttribute("data-kui-pressed");
    };
  }
  function prepareMagnetic(el, params, ctx) {
    const node = el;
    const radius = params.num("radius", 120);
    const strength = params.num("strength", 0.35);
    const config = springFrom2(params);
    const deps = springDeps(ctx);
    const offset = { x: 0, y: 0 };
    const runnerX = createSpringRunner(config, (value) => {
      offset.x = value;
      writeOffset(ctx, offset.x, offset.y);
    }, deps);
    const runnerY = createSpringRunner(config, (value) => {
      offset.y = value;
      writeOffset(ctx, offset.x, offset.y);
    }, deps);
    const onPointerMove = (event) => {
      const box = node.getBoundingClientRect();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      const inRange = Math.hypot(dx, dy) < radius;
      runnerX.to(inRange ? dx * strength : 0);
      runnerY.to(inRange ? dy * strength : 0);
    };
    ctx.win.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      ctx.win.removeEventListener("pointermove", onPointerMove);
      runnerX.stop();
      runnerY.stop();
    };
  }
  var GESTURE_PRIMITIVES = [
    gesturePrimitive(
      "draggable",
      ["translate"],
      {
        ...springParams2,
        axis: { type: "keyword", default: "both", cssProperty: "--kui-axis", keywords: ["x", "y", "both"] },
        bounds: { type: "number", default: "0", cssProperty: "--kui-bounds" },
        return: {
          type: "keyword",
          default: "false",
          cssProperty: "--kui-return",
          keywords: ["true", "false"]
        },
        inertia: {
          type: "keyword",
          default: "false",
          cssProperty: "--kui-inertia",
          keywords: ["true", "false"]
        },
        resistance: {
          type: "number",
          default: "0.55",
          cssProperty: "--kui-resistance",
          finite: true,
          minimum: 0,
          maximum: 1
        },
        momentum: { type: "number", default: "0.2", cssProperty: "--kui-momentum", finite: true }
      },
      deferPrepare(prepareDraggable)
    ),
    gesturePrimitive(
      "swipeable",
      ["state"],
      {
        axis: { type: "keyword", default: "both", cssProperty: "--kui-axis", keywords: ["x", "y", "both"] },
        velocity: { type: "number", default: "300", cssProperty: "--kui-velocity" }
      },
      deferPrepare(prepareSwipeable)
    ),
    gesturePrimitive(
      "pressable",
      ["state"],
      { duration: { type: "time", default: "500ms", cssProperty: "--kui-duration" } },
      // `duration` here is the hold threshold, not a span of motion — `long-press 800ms` means
      // "count it once the finger has been down for 800ms". It is read (see `preparePressable`), so
      // declaring it is what stops the contract above from warning about it.
      deferPrepare(preparePressable)
    ),
    gesturePrimitive(
      "magnetic",
      ["translate"],
      {
        ...springParams2,
        radius: { type: "number", default: "120", cssProperty: "--kui-radius" },
        strength: { type: "number", default: "0.35", cssProperty: "--kui-strength" }
      },
      deferPrepare(prepareMagnetic)
    )
  ];

  // src/effects/gestures/index.ts
  var GESTURE_PRESETS = [
    { name: "drag", primitive: "draggable", phase: "state" },
    { name: "drag-x", primitive: "draggable", params: { axis: "x" }, phase: "state" },
    { name: "drag-y", primitive: "draggable", params: { axis: "y" }, phase: "state" },
    { name: "drag-inertia", primitive: "draggable", params: { inertia: "true" }, phase: "state" },
    {
      name: "throwable",
      primitive: "draggable",
      params: { inertia: "true", damping: "18" },
      phase: "state"
    },
    {
      name: "elastic-pull",
      primitive: "draggable",
      params: { return: "true", bounds: "80" },
      phase: "state"
    },
    {
      name: "rubber-band",
      primitive: "draggable",
      params: { return: "true", bounds: "120" },
      phase: "state"
    },
    {
      name: "snap-back",
      primitive: "draggable",
      params: { return: "true", stiffness: "260" },
      phase: "state"
    },
    { name: "swipe", primitive: "swipeable", phase: "state" },
    { name: "swipe-x", primitive: "swipeable", params: { axis: "x" }, phase: "state" },
    { name: "long-press", primitive: "pressable", phase: "state" },
    { name: "magnetic", primitive: "magnetic", phase: "state" },
    {
      name: "magnetic-snap",
      primitive: "magnetic",
      params: { strength: "0.6", radius: "160" },
      phase: "state"
    }
  ];
  function registerGestures(registry) {
    return registry.registerPrimitives(GESTURE_PRIMITIVES).registerPresets(GESTURE_PRESETS);
  }

  // src/core/flip.ts
  var EPSILON = 0.5;
  function domMeasure(el) {
    const rect = el.getBoundingClientRect();
    return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
  }
  function domAnimate(el, keyframes, options) {
    const animate = el.animate;
    return typeof animate === "function" ? animate.call(el, keyframes, options) : null;
  }
  function createFlipEngine(deps = {}) {
    const measure = deps.measure ?? domMeasure;
    const animate = deps.animate ?? domAnimate;
    return {
      snapshot(elements) {
        const boxes = /* @__PURE__ */ new Map();
        for (const el of elements) boxes.set(el, measure(el));
        return { boxes };
      },
      play(before, elements, options = {}) {
        const deltas = collectDeltas(before, elements, measure, options.scale ?? false);
        if (deltas.length === 0) {
          return { moved: [], finished: Promise.resolve(), cancel: () => {
          } };
        }
        return runDeltas(deltas, animate, options);
      }
    };
  }
  function collectDeltas(before, elements, measure, scale) {
    const deltas = [];
    for (const el of elements) {
      const first = before.boxes.get(el);
      if (!first) continue;
      const last = measure(el);
      const delta = deltaFor(el, first, last, scale);
      if (delta) deltas.push(delta);
    }
    return deltas;
  }
  function deltaFor(el, first, last, scale) {
    const dx = first.x - last.x;
    const dy = first.y - last.y;
    const sx = scale && last.width > 0 ? first.width / last.width : 1;
    const sy = scale && last.height > 0 ? first.height / last.height : 1;
    const still = Math.abs(dx) < EPSILON && Math.abs(dy) < EPSILON && Math.abs(sx - 1) < 1e-3 && Math.abs(sy - 1) < 1e-3;
    return still ? null : { el, dx, dy, sx, sy };
  }
  function runDeltas(deltas, animate, options) {
    const duration = options.durationMs ?? 400;
    const delay = options.delayMs ?? 0;
    const easing = options.easing ?? "cubic-bezier(0.2, 0, 0, 1)";
    const animations = [];
    for (const { el, dx, dy, sx, sy } of deltas) {
      const animation = animate(
        el,
        [
          { translate: `${dx}px ${dy}px`, scale: `${sx} ${sy}` },
          { translate: "0px 0px", scale: "1 1" }
        ],
        // `'none'` whenever there is no delay, so the zero-delay path is byte-for-byte what it was.
        { duration, delay, easing, fill: delay > 0 ? "backwards" : "none" }
      );
      if (animation) animations.push(animation);
    }
    const finished = Promise.all(
      animations.map((animation) => animation.finished.catch(() => void 0))
    ).then(() => void 0);
    return {
      moved: deltas.map((delta) => delta.el),
      finished,
      cancel() {
        for (const animation of animations) animation.cancel();
      }
    };
  }
  function trackFlipRuns() {
    const playing = /* @__PURE__ */ new Set();
    return {
      track(run) {
        playing.add(run);
        void run.finished.then(() => playing.delete(run));
      },
      cancelAll() {
        for (const run of playing) run.cancel();
        playing.clear();
      }
    };
  }
  function observeLayout(container, engine, options, observe) {
    let before = engine.snapshot(container.children);
    const runs = trackFlipRuns();
    const cleanup = observe(() => {
      runs.track(engine.play(before, container.children, options));
      before = engine.snapshot(container.children);
    });
    return () => {
      cleanup();
      runs.cancelAll();
    };
  }
  function mutationWatcher(container) {
    return (callback) => {
      if (typeof MutationObserver === "undefined") return () => {
      };
      const observer = new MutationObserver(callback);
      observer.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["hidden"]
      });
      return () => observer.disconnect();
    };
  }

  // src/effects/layout/primitives.ts
  var timing2 = {
    duration: { type: "time", default: "400ms", cssProperty: "--kui-duration" },
    /*
     * All three of these have a definite start moment even though they default to `on:load`: the
     * children moved, the watched attribute flipped, the indicator's target changed. `'load'` here
     * means "install the observer now", not "play now" — so "hold everything in place for 200ms,
     * then move" is a coherent thing to ask for, and it is what a sequence needs in order to
     * position a FLIP after something else.
     *
     * Spent as the Web Animations `delay` on the invert-to-identity keyframes (`core/flip.ts`) and
     * on the height tween, both with `fill: 'backwards'`, so the wait is spent looking *un-moved*
     * rather than looking finished. Symmetric, unlike the hover family's: a reorder has no
     * "leaving" direction to treat differently.
     */
    ...TRIGGER_DELAY_PARAM,
    ease: { type: "easing", default: "ease-out", cssProperty: "--kui-ease" }
  };
  function layoutPrimitive(id, channels, parameters, prepare) {
    return {
      id,
      renderer: "javascript",
      channels,
      parameters: { ...timing2, ...parameters },
      supportedTimelines: ["time"],
      supportedActivations: ["load", "manual", "click"],
      defaultActivation: "load",
      perfClass: "layout",
      // A layout transition that is merely faster is still a layout transition; under reduced
      // motion the correct behaviour is for elements to appear in place.
      reducedMotion: "disable",
      prepare
    };
  }
  function prepareFlipContainer(el, params, ctx) {
    const engine = createFlipEngine();
    return observeLayout(
      el,
      engine,
      {
        durationMs: effectDurationMs(params, 400),
        delayMs: effectDelayMs(params),
        easing: waapiEasingValue(effectEasing(params), el, ctx.warn),
        scale: params.is("scale")
      },
      mutationWatcher(el)
    );
  }
  function prepareAutoHeight(el, params, ctx) {
    const node = el;
    ctx.style.set("overflow", "hidden");
    ctx.style.claim("height");
    const duration = effectDurationMs(params, 400);
    const delay = effectDelayMs(params);
    const easing = waapiEasingValue(effectEasing(params), el, ctx.warn);
    let animation = null;
    let previous = node.getBoundingClientRect().height;
    const observer = watchAttribute(node, params.text("attribute"), () => {
      animation?.cancel();
      const endpoints = heightEndpoints(node, previous);
      previous = endpoints.to;
      animation = animateHeight(node, endpoints, { duration, delay, easing });
    });
    ctx.invalidate();
    return () => {
      observer();
      animation?.cancel();
    };
  }
  function heightEndpoints(node, previous) {
    node.style.removeProperty("height");
    const to = node.getBoundingClientRect().height;
    return { from: previous, to };
  }
  function animateHeight(node, endpoints, timing3) {
    const animate = node.animate;
    if (typeof animate !== "function") return null;
    return animate.call(
      node,
      [{ height: `${endpoints.from}px` }, { height: `${endpoints.to}px` }],
      // `fill: 'backwards'` only when there is a delay to fill, so the undelayed path stays exactly
      // as it was. It has to be there when there is one: by the time this runs the stylesheet has
      // already repainted at the destination height (see `heightEndpoints`), so an unfilled delay
      // would show the panel already open for the wait and then snap shut to animate.
      { ...timing3, fill: timing3.delay > 0 ? "backwards" : "none" }
    );
  }
  function prepareIndicator(el, params, ctx) {
    const node = el;
    const engine = createFlipEngine();
    const easing = waapiEasingValue(effectEasing(params), el, ctx.warn);
    const selector = params.text("follow");
    const runs = trackFlipRuns();
    let currentShift = 0;
    const move = () => {
      if (!selector) return;
      const target = ctx.doc.querySelector(selector);
      if (!(target instanceof Element)) return;
      const before = engine.snapshot([node]);
      const box = target.getBoundingClientRect();
      const current = node.getBoundingClientRect();
      const shift = box.left - current.left + currentShift;
      currentShift = shift;
      ctx.style.set("width", `${box.width}px`);
      ctx.style.set("translate", `${shift}px 0`);
      runs.track(
        engine.play(before, [node], {
          durationMs: effectDurationMs(params, 400),
          delayMs: effectDelayMs(params),
          easing,
          scale: true
        })
      );
    };
    move();
    const unwatch = watchAttribute(ctx.doc.documentElement, params.text("attribute"), move);
    return () => {
      unwatch();
      runs.cancelAll();
    };
  }
  function watchAttribute(root, attribute, onChange) {
    if (typeof MutationObserver === "undefined" || !attribute) return () => {
    };
    const observer = new MutationObserver(onChange);
    observer.observe(root, { subtree: true, attributes: true, attributeFilter: [attribute] });
    return () => observer.disconnect();
  }
  var LAYOUT_PRIMITIVES = [
    layoutPrimitive(
      "flip-container",
      ["translate", "scale"],
      {
        scale: {
          type: "keyword",
          default: "false",
          cssProperty: "--kui-flip-scale",
          keywords: ["true", "false"]
        }
      },
      deferPrepare(prepareFlipContainer)
    ),
    layoutPrimitive(
      "auto-height",
      ["layout"],
      { attribute: { type: "text", default: "data-open", cssProperty: "--kui-attribute" } },
      deferPrepare(prepareAutoHeight)
    ),
    layoutPrimitive(
      "flip-indicator",
      ["translate", "layout"],
      {
        follow: { type: "text", default: "", cssProperty: "--kui-follow" },
        attribute: { type: "text", default: "aria-selected", cssProperty: "--kui-attribute" }
      },
      deferPrepare(prepareIndicator)
    )
  ];

  // src/effects/layout/presets.ts
  var LAYOUT_PRESETS = [
    { name: "flip-reorder", primitive: "flip-container" },
    { name: "flip-filter", primitive: "flip-container" },
    { name: "flip-sort", primitive: "flip-container" },
    { name: "flip-shuffle", primitive: "flip-container" },
    // Cards changing aspect between layouts need their size interpolated, not just their position.
    { name: "grid-to-list", primitive: "flip-container", params: { scale: "true" } },
    { name: "masonry-reflow", primitive: "flip-container" },
    { name: "expand-to-modal", primitive: "flip-container", params: { scale: "true", duration: "500ms" } },
    { name: "accordion-height", primitive: "auto-height" },
    {
      name: "tab-indicator-slide",
      primitive: "flip-indicator",
      params: { duration: "300ms" },
      phase: "state"
    }
  ];

  // src/effects/layout/index.ts
  function registerLayout(registry) {
    return registry.registerPrimitives(LAYOUT_PRIMITIVES).registerPresets(LAYOUT_PRESETS);
  }

  // src/effects/motion-path/index.ts
  var OFFSET = "offset";
  var PATH_TIMELINES = ["time", "view", "scroll", "pin"];
  var MOTION_PATH_PARAMS = {
    /**
     * The curve, as SVG path data: `path:"M 0 0 C 40 -70 120 -70 160 0"`.
     *
     * Quoted, following the `target:` precedent in `core/parse.ts` — path data is full of spaces
     * and commas and the tokenizer would otherwise shred it into a dozen unrecognised tokens. The
     * quotes are syntax and `unquote` strips them; a *different* pair is added back by `validate`,
     * because `offset-path: path(...)` takes a CSS string and `var()` substitutes tokens rather than
     * text. See `checkPath` in `core/params.ts` for why quoting there is the only safe place for it.
     */
    path: { type: "path", default: "M 0 0 L 120 0", cssProperty: "--kui-motion-path" },
    /**
     * Whether the element turns to face its direction of travel — GSAP's `autoRotate`.
     *
     * **Default off, which is not the CSS default.** `offset-rotate`'s initial value is `auto`, so
     * shipping the CSS default would mean every element handed a path silently starts tipping as it
     * moves. That is right for an arrow, a plane, or a comet, and wrong for the far commoner case: a
     * card, a badge, a line of text. GSAP made the same call — `autoRotate` is off unless asked for
     * — and this is a parity feature, so it matches. `rotate:auto` opts in.
     *
     * `type: 'angle|keyword'` rather than a `keyword` with an enumerated angle list, because
     * `offset-rotate` is genuinely `[ auto | reverse ] || <angle>`: `auto` follows the tangent,
     * `reverse` follows it backwards, and a bare angle pins a fixed rotation instead (`0deg`, the
     * default, being "keep the orientation you already had"). This is the parameter the union types
     * were added for — it used to be an `'angle'` carrying two literals in the old, additive reading
     * of `values`, which is the reading that made the same key mean validation on one type and
     * nothing at all on the others. See {@link UnionParamType}.
     *
     * The combined `auto 90deg` form — follow the tangent, but the artwork points up rather than
     * right — is deliberately not exposed as a parameter, since it is one value in a space of
     * infinitely many and every other spelling of it invents grammar. A page that needs it sets
     * `--kui-motion-rotate: auto 90deg` in its own stylesheet, which the cascade design already
     * supports without `!important`.
     */
    rotate: {
      type: "angle|keyword",
      keywords: ["auto", "reverse"],
      default: "0deg",
      cssProperty: "--kui-motion-rotate"
    },
    /**
     * Which point of the element rides the path.
     *
     * `0 0` — the top-left corner — is the default for the reason given in the module comment: it is
     * what makes a path read as offsets from the element's own position. `center` is the value to
     * reach for alongside `rotate:auto`, since the anchor is also the pivot the rotation turns
     * about, and an arrow pivoting on its corner looks broken.
     *
     * A value containing a space needs quoting, so `anchor:"0 0"` and `anchor:"top right"` — again
     * the `target:` precedent.
     */
    anchor: {
      type: "keyword",
      default: "0 0",
      cssProperty: "--kui-motion-anchor",
      keywords: ["auto", "center", "top", "bottom", "left", "right", "0 0", "top left", "top right", "bottom left", "bottom right"]
    },
    /**
     * The span of the path actually travelled, as percentages of its length.
     *
     * Two things this buys that a second path would not. `from:100% to:0%` runs the same curve
     * backwards without writing it backwards — path data reversed by hand is error-prone and stops
     * matching the drawing it came from. And `from:20% to:80%` uses the middle of a long path, which
     * is how a single hand-drawn route gets shared by several elements that each travel a stretch of
     * it.
     */
    from: { type: "percentage", default: "0%", cssProperty: "--kui-motion-from" },
    to: { type: "percentage", default: "100%", cssProperty: "--kui-motion-to" }
  };
  var MOTION_PATH_PRIMITIVES = [
    cssPrimitive("motion-path", [OFFSET], { timelines: PATH_TIMELINES, parameters: MOTION_PATH_PARAMS })
  ];
  var KEYFRAMES = "kui-motion-travel";
  var path = (name, d, params) => ({
    name,
    primitive: "motion-path",
    keyframes: KEYFRAMES,
    params: { path: d, ...params }
  });
  var MOTION_PATH_PRESETS = [
    /*
     * The neutral carrier: the name to write when you have your own path.
     *
     * It still ships a path of its own — a flat 120px traverse — rather than defaulting to nothing.
     * `data-kui="motion-path"` with no `path:` would otherwise compile cleanly, stamp its attribute,
     * run its animation to completion, and move the element precisely nowhere, which is the silent
     * no-op this codebase treats as the worst possible outcome. A plainly generic straight line is
     * self-evidently a placeholder in a way that stillness is not.
     */
    path("motion-path", "M 0 0 L 120 0", { duration: "1200ms" }),
    // A thrown-ball arc: out, up over about 50px, and back down to the level it left. The two
    // control points sit at the same height so the curve is symmetrical and the apex lands mid-flight.
    path("path-arc", "M 0 0 C 40 -70 120 -70 160 0", { duration: "1200ms", ease: "ease-in-out" }),
    // An S-curve. Control points mirrored through the midpoint, so the two bends are equal and
    // opposite and the element leaves travelling the same direction it arrived.
    path("path-wave", "M 0 0 C 45 -45 105 45 150 0", { duration: "1600ms", ease: "ease-in-out" }),
    // A closed loop, out to the right and back. `linear`, for the reason `ambient-orbit` gives: an
    // eased circuit visibly slows at the point where it closes, which reads as a stutter rather
    // than as easing.
    path("path-loop", "M 0 0 C 0 -70 110 -70 110 0 C 110 70 0 70 0 0", { duration: "2400ms", ease: "linear" }),
    /*
     * The entrance of the set, and the only one written to *end* at `0 0`: it flies in from below
     * and to the left and settles exactly where layout put the element.
     *
     * `cloak: true` for the same reason `fade-up` declares it. Between first paint and the runtime
     * installing `offset-path`, the element is painted at its resting position; the effect then
     * yanks it 120px left and 70px down to start. That backwards jump is the flash the cloak layer
     * exists to remove, and it is a from-state flash like any other even though nothing here
     * animates opacity.
     *
     * The displacement is deliberately kept in the same range as `slide-left`'s 100px rather than
     * pushed for drama. A deferred `on:enter` effect paints its from-state while it waits, and an
     * `IntersectionObserver` measures the box *as displaced* — so an element swooping in from far
     * enough off the left gutter would never intersect, never activate, and never leave its start
     * state. That is the same deadlock as the zero-area one in `entrance-zero-area.test.ts`, reached
     * by translation instead of by collapse, and the defence is not to travel further than the
     * catalog's existing entrances already do.
     */
    { ...path("path-swoop", "M -120 70 C -70 70 -25 25 0 0", { duration: "900ms", ease: "expo-out" }), cloak: true }
  ];
  function registerMotionPath(registry) {
    return registry.registerPrimitives(MOTION_PATH_PRIMITIVES).registerPresets(MOTION_PATH_PRESETS);
  }

  // src/effects/navigation/index.ts
  var NAV_CSS_PRIMITIVES = [
    cssPrimitive("nav-reveal", [CHANNEL.opacity, CHANNEL.translate]),
    cssPrimitive("menu-fullscreen", [CHANNEL.clip, CHANNEL.opacity]),
    cssPrimitive("panel-reveal", [CHANNEL.opacity, CHANNEL.translate]),
    cssPrimitive("drawer-slide", [CHANNEL.translate], {
      defaultActivation: "click"
    })
  ];
  var NAV_CSS_PRESETS = [
    { name: "menu-stagger-open", primitive: "nav-reveal", keyframes: "kui-nav-reveal", phase: "entrance" },
    { name: "menu-fullscreen", primitive: "menu-fullscreen", keyframes: "kui-menu-fullscreen" },
    { name: "dropdown-open", primitive: "panel-reveal", keyframes: "kui-panel-reveal", phase: "entrance" },
    {
      name: "mega-menu-drop",
      primitive: "panel-reveal",
      keyframes: "kui-panel-reveal",
      params: { duration: "550ms" },
      phase: "entrance"
    },
    {
      name: "drawer-slide",
      primitive: "drawer-slide",
      keyframes: "kui-drawer-slide-right",
      phase: "entrance"
    }
  ];
  var NAV_SCROLL_TIMING_REASON = "it reacts to scroll position rather than a clock, so style the state attribute it publishes and put your timing there";
  function navPrimitive(id, channels, parameters, prepare) {
    return {
      id,
      renderer: "javascript",
      channels,
      parameters,
      supportedTimelines: ["time"],
      supportedActivations: ["load"],
      defaultActivation: "load",
      perfClass: "compositor",
      // A scroll-position reaction, like the scroll-mechanics category: shortening its "duration"
      // is meaningless because the position, not a clock, drives it.
      reducedMotion: "disable",
      prepare: withTimingContract(id, { because: NAV_SCROLL_TIMING_REASON }, prepare)
    };
  }
  function subscribeScrollTop(el, ctx, onScrollTop) {
    return ctx.scheduler.subscribe(ctx.rootFor(el), (frame) => onScrollTop(frame.metrics.scrollTop));
  }
  function prepareHeaderShrink(el, params, ctx) {
    const offset = params.num("offset", 120);
    const state = createAttributeLedger(el);
    const unsubscribe = subscribeScrollTop(el, ctx, (top) => {
      const progress = offset > 0 ? Math.min(1, Math.max(0, top / offset)) : 1;
      ctx.style.set("--kui-shrink", progress.toFixed(4));
      state.set("data-kui-shrunk", String(progress >= 1));
    });
    return () => {
      unsubscribe();
      state.restore();
    };
  }
  function prepareHeaderHide(el, params, ctx) {
    const minDelta = params.num("offset", 8);
    let last = 0;
    const state = createAttributeLedger(el);
    const unsubscribe = subscribeScrollTop(el, ctx, (top) => {
      const delta = top - last;
      if (Math.abs(delta) < minDelta) return;
      state.set("data-kui-hidden", String(delta > 0 && top > minDelta));
      last = top;
    });
    return () => {
      unsubscribe();
      state.restore();
    };
  }
  function prepareBackToTop(el, params, ctx) {
    const offset = params.num("offset", 400);
    const state = createAttributeLedger(el);
    const unsubscribe = subscribeScrollTop(el, ctx, (top) => {
      state.set("data-kui-visible", String(top > offset));
    });
    return () => {
      unsubscribe();
      state.restore();
    };
  }
  var NAV_JS_PRIMITIVES = [
    navPrimitive(
      "header-shrink",
      // `'shadow'` alongside `'layout'`: `header-shrink`'s host rule also transitions `box-shadow`
      // (navigation.css), which `layout` alone does not cover — see `header-shrink`'s own
      // `Preset.transitions` below and `channel-properties.ts`'s `layout` entry for why the two
      // interpolated properties (`padding-block`/`font-size`) stay on `layout` while this one moves
      // to the channel that already owns every other box-shadow writer (`lift-shadow`,
      // `border-glow`). Composing `header-shrink` with either of those is now a refused conflict
      // instead of a silent clobber on the same property — the self-consistency bug this closes.
      ["layout", "shadow"],
      { offset: { type: "number", default: "120", cssProperty: "--kui-offset" } },
      deferPrepare(prepareHeaderShrink)
    ),
    navPrimitive(
      "header-hide-on-scroll",
      [CHANNEL.translate],
      { offset: { type: "number", default: "8", cssProperty: "--kui-offset" } },
      deferPrepare(prepareHeaderHide)
    ),
    navPrimitive(
      "back-to-top-fade",
      [CHANNEL.opacity, CHANNEL.translate],
      { offset: { type: "number", default: "400", cssProperty: "--kui-offset" } },
      deferPrepare(prepareBackToTop)
    )
  ];
  var HEADER_SHRINK_TRANSITIONS = [
    { property: "padding-block", duration: "200ms", easing: "ease-out" },
    { property: "font-size", duration: "200ms", easing: "ease-out" },
    { property: "box-shadow", duration: "200ms", easing: "ease-out" }
  ];
  var NAV_JS_PRESETS = [
    { name: "header-shrink", primitive: "header-shrink", transitions: HEADER_SHRINK_TRANSITIONS },
    {
      name: "header-hide-on-scroll",
      primitive: "header-hide-on-scroll",
      transitions: [{ property: "translate", duration: "220ms", easing: "ease-out" }]
    },
    {
      name: "back-to-top-fade",
      primitive: "back-to-top-fade",
      transitions: [
        { property: "opacity", duration: "200ms", easing: "ease-out" },
        { property: "translate", duration: "200ms", easing: "ease-out" }
      ]
    }
  ];
  var NAVIGATION_PRIMITIVES = [...NAV_CSS_PRIMITIVES, ...NAV_JS_PRIMITIVES];
  var NAVIGATION_PRESETS = [...NAV_CSS_PRESETS, ...NAV_JS_PRESETS];
  function registerNavigation(registry) {
    return registry.registerPrimitives(NAVIGATION_PRIMITIVES).registerPresets(NAVIGATION_PRESETS);
  }

  // src/effects/scroll-mechanics/tracker.ts
  var domGeometry = (el) => {
    const rect = el.getBoundingClientRect();
    return { top: rect.top, height: rect.height };
  };
  var domPosition = (el) => {
    const view = el.ownerDocument?.defaultView;
    return view ? view.getComputedStyle(el).position : "static";
  };
  var domOffsetTop = (el) => {
    const view = el.ownerDocument?.defaultView;
    if (!view) return 0;
    const parsed = Number.parseFloat(view.getComputedStyle(el).top);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  function geometrySource(el, positionOf) {
    let outermostSticky = null;
    for (let node = el; node; node = node.parentElement) {
      if (positionOf(node) === "sticky") outermostSticky = node;
    }
    return outermostSticky?.parentElement ?? el;
  }
  function sourceTop(el, box, measure, positionOf) {
    const source = geometrySource(el, positionOf);
    return source === el ? box.top : measure(source).top;
  }
  function trackProgress(el, ctx, options, onProgress) {
    const measure = options.measure ?? domGeometry;
    const positionOf = options.positionOf ?? domPosition;
    const offsetOf = options.offsetOf ?? domOffsetTop;
    let scrollTop = 0;
    let scrollportTop = 0;
    const geometry2 = createMeasureCache(() => {
      const box = measure(el);
      const anchor = options.contentAnchor ? measure(options.contentAnchor) : null;
      const top = anchor ? anchor.top - box.height : sourceTop(el, box, measure, positionOf);
      const stickyOffset = options.stickyEl ? offsetOf(options.stickyEl) : 0;
      return {
        contentTop: top - stickyOffset - scrollportTop + scrollTop,
        height: box.height,
        // Only read on the `spacerIsAuthoritative` path below, but measured here so it shares the
        // one layout flush per epoch that everything else in this cache already pays for.
        anchorHeight: anchor?.height ?? 0
      };
    });
    const authoredDistance = options.distance ?? "";
    const opaqueDistance = authoredDistance !== "" && !resolvesToPixels(authoredDistance);
    if (opaqueDistance && !options.contentAnchor) warnUnmeasurable(ctx, authoredDistance);
    const spacerIsAuthoritative = authoredDistance !== "" && usesPercentBasis(authoredDistance);
    return ctx.scheduler.subscribe(ctx.rootFor(el), (frame) => {
      scrollTop = frame.metrics.scrollTop;
      scrollportTop = frame.metrics.viewportTop;
      const box = geometry2.read(frame.epoch);
      const span = spacerIsAuthoritative && options.contentAnchor ? box.anchorHeight : resolveDistance(options.distance, { top: 0, height: box.height }, frame);
      onProgress(progressFrom(box.contentTop - scrollTop, span), frame);
    });
  }
  var PROBE_BASIS = {
    viewportWidth: 1,
    viewportHeight: 1,
    percentBasis: 1,
    fontSize: 16,
    rootFontSize: 16
  };
  var PROBE_BASIS_ALT_PERCENT = { ...PROBE_BASIS, percentBasis: 2 };
  function resolvesToPixels(value) {
    return Number.isFinite(toPixels(value, PROBE_BASIS, Number.NaN));
  }
  function usesPercentBasis(value) {
    const primary = toPixels(value, PROBE_BASIS, Number.NaN);
    if (!Number.isFinite(primary)) return true;
    return primary !== toPixels(value, PROBE_BASIS_ALT_PERCENT, Number.NaN);
  }
  function warnUnmeasurable(ctx, distance3) {
    ctx.warn(
      `distance "${distance3}" is a CSS expression this effect cannot measure, so progress runs over the element's own height instead \u2014 author a plain length like "200vh", or turn on spacer:true so the distance can be measured from the box the library reserves.`
    );
  }
  function resolveDistance(distance3, box, frame) {
    if (!distance3) return box.height;
    const basis = {
      viewportWidth: frame.metrics.viewportWidth,
      viewportHeight: frame.metrics.viewportHeight,
      percentBasis: box.height,
      fontSize: 16,
      rootFontSize: 16
    };
    return toPixels(distance3, basis, box.height);
  }
  function progressFrom(top, span) {
    if (span <= 0) return 0;
    return clamp012(-top / span);
  }

  // src/effects/scroll-mechanics/scroll-spy.ts
  function prepareScrollSpy(el, params, ctx) {
    const sectionsAuthored = params.text("sections");
    if (sectionsAuthored) {
      const sectionsSelector = resolveTarget(sectionsAuthored, ctx, "scroll-spy sections");
      return prepareScrollSpyContainer(el, params, ctx, sectionsSelector);
    }
    return prepareScrollSpySingle(el, params, ctx);
  }
  function prepareScrollSpySingle(el, params, ctx) {
    if (params.text("offset-top", "0px") !== "0px") {
      ctx.warn('scroll-spy "offset-top" has no effect without sections: and is ignored here');
    }
    const selector = resolveTarget(params.text("target"), ctx, "scroll-spy");
    const scope = scopeParam(params, "page");
    const links = /* @__PURE__ */ new Map();
    const self = createAttributeLedger(el);
    let last;
    const untrack = trackProgress(el, ctx, { distance: params.text("distance") }, (progress) => {
      const active = progress > 0 && progress < 1;
      if (active === last) return;
      last = active;
      self.set("data-kui-active", String(active));
      if (selector) markLinks(queryScoped(el, ctx, selector, scope), active, links);
    });
    return continuousSetup(() => {
      untrack();
      self.restore();
      for (const ledger of links.values()) ledger.restore();
    });
  }
  function markLinks(matches, active, links) {
    for (const link of matches) {
      let ledger = links.get(link);
      if (!ledger) {
        ledger = createAttributeLedger(link);
        links.set(link, ledger);
      }
      ledger.set("data-kui-active", String(active));
    }
  }
  function hrefHash(link) {
    const href = link.getAttribute("href") ?? "";
    const at = href.indexOf("#");
    return at === -1 ? "" : href.slice(at);
  }
  function pairSectionsWithLinks(sections, links, ctx, sectionsSelector) {
    const linksByHash = /* @__PURE__ */ new Map();
    for (const link of links) {
      const hash = hrefHash(link);
      if (hash) linksByHash.set(hash, link);
    }
    const claimed = /* @__PURE__ */ new Set();
    const pairs = sections.map((section) => {
      if (!section.id) {
        ctx.warn(
          `scroll-spy: a section matched by sections:"${sectionsSelector}" has no id and cannot be paired with a link`
        );
        return { section, link: null };
      }
      const hash = `#${section.id}`;
      const link = linksByHash.get(hash) ?? null;
      if (link) claimed.add(hash);
      return { section, link };
    });
    for (const [hash, link] of linksByHash) {
      if (!claimed.has(hash)) {
        ctx.warn(`scroll-spy: link "${link.getAttribute("href")}" matches no section id in sections:"${sectionsSelector}"`);
      }
    }
    return pairs;
  }
  function offsetTopPixels(authored, frame) {
    return toPixels(
      authored,
      {
        viewportWidth: frame.metrics.viewportWidth,
        viewportHeight: frame.metrics.viewportHeight,
        percentBasis: 0,
        fontSize: 16,
        rootFontSize: 16
      },
      0
    );
  }
  function highestReachedIndex(tops, scrollTop, line) {
    let index = -1;
    for (let i = 0; i < tops.length; i++) {
      if (tops[i] - scrollTop - line <= 0) index = i;
    }
    return index;
  }
  function prepareScrollSpyContainer(el, params, ctx, sectionsSelector) {
    if (params.text("distance", "100vh") !== "100vh") {
      ctx.warn('scroll-spy "distance" has no effect with sections: \u2014 each section measures its own height');
    }
    const linksSelector = resolveTarget(params.text("target"), ctx, "scroll-spy target");
    const scope = scopeParam(params, "self");
    const sections = sectionsSelector ? [...el.querySelectorAll(sectionsSelector)] : [];
    if (sectionsSelector && sections.length === 0) {
      ctx.warn(`scroll-spy sections:"${sectionsSelector}" matched nothing inside this element`);
    }
    const links = linksSelector ? queryScoped(el, ctx, linksSelector, scope) : [];
    const pairs = pairSectionsWithLinks(sections, links, ctx, sectionsSelector);
    const sectionLedgers = pairs.map((pair) => createAttributeLedger(pair.section));
    const linkLedgers = /* @__PURE__ */ new Map();
    for (const { link } of pairs) {
      if (link && !linkLedgers.has(link)) linkLedgers.set(link, createAttributeLedger(link));
    }
    const offsetAuthored = params.text("offset-top", "0px");
    let scrollTop = 0;
    let scrollportTop = 0;
    const contentTops = createMeasureCache(
      () => pairs.map(({ section }) => domGeometry(section).top - scrollportTop + scrollTop)
    );
    let active = -1;
    function setActive(index, value) {
      const pair = pairs[index];
      sectionLedgers[index].set("data-kui-active", String(value));
      if (pair.link) linkLedgers.get(pair.link).set("data-kui-active", String(value));
    }
    const untrack = ctx.scheduler.subscribe(ctx.rootFor(el), (frame) => {
      scrollTop = frame.metrics.scrollTop;
      scrollportTop = frame.metrics.viewportTop;
      const tops = contentTops.read(frame.epoch);
      const line = offsetTopPixels(offsetAuthored, frame);
      const next = highestReachedIndex(tops, scrollTop, line);
      if (next === active) return;
      if (active !== -1) setActive(active, false);
      if (next !== -1) setActive(next, true);
      active = next;
    });
    return continuousSetup(() => {
      untrack();
      for (const ledger of sectionLedgers) ledger.restore();
      for (const ledger of linkLedgers.values()) ledger.restore();
    });
  }

  // src/effects/scroll-mechanics/params.ts
  var distanceParam2 = {
    distance: { type: "length", default: "100vh", cssProperty: "--kui-distance" }
  };
  var stickyParams = {
    "offset-top": {
      type: "length",
      default: "var(--kui-pin-offset, 0px)",
      cssProperty: "--kui-offset-top"
    },
    spacer: {
      type: "keyword",
      default: "false",
      cssProperty: "--kui-spacer",
      keywords: ["true", "false"]
    }
  };

  // src/effects/scroll-mechanics/primitives.ts
  var PROGRESS_VAR = "--kui-progress";
  function installSticky(node, params, ctx) {
    ctx.style.set("position", "sticky");
    ctx.style.set("top", params.text("offset-top", "var(--kui-pin-offset, 0px)"));
    const inserted = params.is("spacer") ? insertSpacer(node, params.text("distance"), ctx) : null;
    return { spacer: inserted?.spacer ?? null, dispose: () => inserted?.remove() };
  }
  function scrollPrimitive(spec) {
    const { id, channels, parameters, prepare, perfClass = "compositor" } = spec;
    return {
      id,
      renderer: "javascript",
      channels,
      parameters,
      // Accepted, never read: these primitives read scroll position themselves and are never driven
      // by an `animation-timeline`. The list exists so that composing the driver with the effects it
      // drives — `data-kui="pin-section distance:200vh, parallax-rotate ... "` plus `timeline:pin` —
      // survives `compile.ts`'s `intersect`. Without it the intersection empties, `style-plan.ts`
      // refuses the timeline, and the scrub silently degrades to a one-shot. See `TIMELINE_AGNOSTIC`
      // (`effects/shared.ts`) for why the name says abstention rather than support.
      supportedTimelines: TIMELINE_AGNOSTIC,
      supportedActivations: ["manual", "load", "enter"],
      defaultActivation: "load",
      perfClass,
      reducedMotion: "disable",
      /*
       * The refusal side of `TIMELINE_AGNOSTIC` above, and for the same underlying reason: these
       * primitives are driven by *where the page is*, not by a clock. A pin engages when its range
       * enters the scrollport and disengages when it leaves; a scrub's frame is a pure function of
       * progress. There is no instant an authored `delay` could be measured from, no span a
       * `duration` could set, and no curve an `ease` could bend — so all three are refused rather
       * than accepted and discarded.
       *
       * The `delay:` spelling already warned, because none of these declares the parameter and
       * `readParams` rejects unknown names. The positional `pin-section 0ms 300ms` did not: it is
       * lifted out to `params.timing` before the schema is ever consulted, so it reached a
       * primitive that never reads it and vanished without a word. This is what closes that half.
       */
      prepare: withTimingContract(
        id,
        {
          because: "it is driven by scroll position rather than a clock, so it has no start moment and no fixed span"
        },
        prepare
      )
    };
  }
  function writeProgress(ctx, progress) {
    ctx.style.set(PROGRESS_VAR, progress.toFixed(4));
  }
  function preparePin(el, params, ctx) {
    const node = el;
    const { spacer, dispose: unstick } = installSticky(node, params, ctx);
    const tracked = spacer ? node : node.parentElement ?? el;
    const untrack = trackProgress(
      tracked,
      ctx,
      { distance: params.text("distance"), contentAnchor: spacer ?? void 0, stickyEl: node },
      (progress) => {
        writeProgress(ctx, progress);
        const holding = progress > 0 && progress < 1 && domPosition(node) === "sticky";
        el.setAttribute("data-kui-pinned", holding ? "true" : "false");
      }
    );
    return continuousSetup(() => {
      untrack();
      unstick();
      el.removeAttribute("data-kui-pinned");
    });
  }
  function insertSpacer(node, distance3, ctx) {
    const spacer = ctx.doc.createElement("div");
    spacer.setAttribute("data-kui-spacer", "");
    spacer.setAttribute("aria-hidden", "true");
    spacer.style.height = distance3;
    spacer.style.pointerEvents = "none";
    node.after(spacer);
    ctx.invalidate();
    return {
      spacer,
      remove: () => {
        spacer.remove();
        ctx.invalidate();
      }
    };
  }
  function prepareProgress(el, params, ctx) {
    const steps = Math.max(0, Math.round(params.num("steps", 0)));
    const selector = resolveTarget(params.text("target"), ctx, "scroll-progress");
    const scope = scopeParam(params, "page");
    const marker = createStepMarker(
      () => queryScoped(el, ctx, selector, scope),
      (message) => ctx.warn(`scroll-progress ${message}`)
    );
    const self = createAttributeLedger(el);
    let lastIndex;
    const untrack = trackProgress(el, ctx, { distance: params.text("distance") }, (progress) => {
      writeProgress(ctx, progress);
      if (steps === 0) return;
      const index = Math.min(steps - 1, Math.floor(progress * steps));
      if (index === lastIndex) return;
      lastIndex = index;
      self.set("data-kui-step", String(index));
      ctx.style.set("--kui-step", String(index));
      if (selector) marker.mark(index);
    });
    return continuousSetup(() => {
      untrack();
      self.restore();
      marker.restore();
    });
  }
  function prepareHorizontal(el, params, ctx) {
    const selector = resolveTarget(params.text("target"), ctx, "horizontal-track");
    if (!selector) return prepareBareTrack(el, params, ctx);
    const scope = scopeParam(params, "self");
    const tracks = queryScoped(el, ctx, selector, scope);
    const track = tracks[0];
    if (!track) {
      ctx.warn(`horizontal-track target "${selector}" matched nothing inside this element`);
      return () => {
      };
    }
    if (tracks.length > 1) {
      ctx.warn(
        `horizontal-track target "${selector}" matched ${tracks.length} elements; only the first is used`
      );
    }
    return prepareManagedTrack(el, track, params, ctx);
  }
  function prepareBareTrack(node, params, ctx) {
    const authored = params.text("travel", "auto");
    const travel = createMeasureCache(() => trackTravel(node, authored, node.ownerDocument));
    return continuousSetup(
      trackProgress(node, ctx, { distance: params.text("distance") }, (progress, frame) => {
        ctx.style.set("translate", `${-progress * travel.read(frame.epoch)}px 0`);
        writeProgress(ctx, progress);
      })
    );
  }
  function prepareManagedTrack(host, track, params, ctx) {
    const offsetTop = params.text("offset-top", "var(--kui-pin-offset, 0px)");
    ctx.style.set("position", "sticky");
    ctx.style.set("top", offsetTop);
    ctx.style.set("height", `calc(100vh - ${offsetTop})`);
    ctx.style.set("overflow", "hidden");
    ctx.style.set("display", "grid");
    ctx.style.set("align-content", "center");
    const { spacer, remove: removeSpacer } = insertSpacer(host, params.text("distance"), ctx);
    const rail = createStyleLedger(track);
    rail.set("display", "flex");
    rail.set("width", "max-content");
    const authored = params.text("travel", "auto");
    const travel = createMeasureCache(() => trackTravel(track, authored, track.ownerDocument));
    const untrack = trackProgress(host, ctx, { distance: params.text("distance"), contentAnchor: spacer, stickyEl: host }, (progress, frame) => {
      rail.set("translate", `${-progress * travel.read(frame.epoch)}px 0`);
      writeProgress(ctx, progress);
    });
    return continuousSetup(() => {
      untrack();
      rail.restore();
      removeSpacer();
    });
  }
  function trackTravel(node, authored, doc) {
    if (authored && authored !== "auto") return toPixels(authored, ABSOLUTE_BASIS, 0);
    const selfOverflow = node.scrollWidth - node.clientWidth;
    if (selfOverflow > 0) return selfOverflow;
    const viewportWidth = node.parentElement?.clientWidth || doc.documentElement.clientWidth;
    return Math.max(0, node.scrollWidth - viewportWidth);
  }
  function prepareMediaScrub(el, params, ctx) {
    const managed = params.is("spacer") ? installSticky(el, params, ctx) : null;
    const contentAnchor = managed?.spacer ?? void 0;
    const stickyEl = managed ? el : void 0;
    const selector = resolveTarget(params.text("target"), ctx, "media-scrub");
    const scope = scopeParam(params, "page");
    const scrub = selector ? prepareTargetScrub(el, params, ctx, { selector, scope, contentAnchor, stickyEl }) : prepareSrcScrub(el, params, ctx, { contentAnchor, stickyEl });
    return continuousSetup(() => {
      scrub();
      managed?.dispose();
    });
  }
  function prepareTargetScrub(el, params, ctx, authored) {
    const { selector, scope, contentAnchor, stickyEl } = authored;
    const marker = createStepMarker(
      () => queryScoped(el, ctx, selector, scope),
      (message) => ctx.warn(`media-scrub ${message}`)
    );
    const frames = Math.max(1, queryScoped(el, ctx, selector, scope).length);
    let lastIndex;
    const untrack = trackProgress(el, ctx, { distance: params.text("distance"), contentAnchor, stickyEl }, (progress) => {
      writeProgress(ctx, progress);
      const index = Math.min(frames - 1, Math.floor(progress * frames));
      if (index === lastIndex) return;
      lastIndex = index;
      marker.mark(index);
    });
    marker.mark(0);
    return () => {
      untrack();
      marker.restore();
    };
  }
  function prepareSrcScrub(el, params, ctx, anchors) {
    const { contentAnchor, stickyEl } = anchors;
    const frames = Math.max(1, Math.round(params.num("frames", 1)));
    const pattern = mediaSrcPattern(params.text("src"), ctx);
    const media = el;
    let lastIndex = -1;
    const untrack = trackProgress(el, ctx, { distance: params.text("distance"), contentAnchor, stickyEl }, (progress) => {
      writeProgress(ctx, progress);
      const index = Math.min(frames - 1, Math.floor(progress * frames));
      if (index === lastIndex) return;
      lastIndex = index;
      applyFrame(media, { index, frames, progress, pattern });
    });
    return untrack;
  }
  function mediaSrcPattern(pattern, ctx) {
    if (!pattern || isSameOriginPath(pattern)) return pattern;
    ctx.warn(`media-scrub "src" must be a same-origin path, got "${pattern}" \u2014 ignoring`);
    return "";
  }
  function applyFrame(media, write) {
    const { index, frames, progress, pattern } = write;
    if (media.tagName === "VIDEO") {
      const duration = Number.isFinite(media.duration) ? media.duration : 0;
      if (duration > 0) media.currentTime = duration * progress;
      return;
    }
    if (media.tagName !== "IMG") return;
    if (pattern) media.src = pattern.replace("{i}", String(index).padStart(String(frames).length, "0"));
  }
  function prepareSmoothScroll(el, params, ctx) {
    ctx.style.set("scroll-behavior", params.text("behavior", "smooth"));
    return () => {
    };
  }
  function prepareSnap(el, params, ctx) {
    const axis = params.is("axis", "x") ? "x" : "y";
    ctx.style.set("scroll-snap-type", `${axis} ${params.text("strictness", "mandatory")}`);
    const selector = resolveTarget(params.text("target"), ctx, "scroll-snap");
    const scope = scopeParam(params, "self");
    const items = selector ? queryScoped(el, ctx, selector, scope) : [...el.children];
    if (selector && items.length === 0) {
      ctx.warn(`scroll-snap target "${selector}" matched nothing inside this element`);
    }
    if (selector) installSnapContainer(axis, ctx);
    const childLedgers = items.map((child) => createStyleLedger(child));
    for (const ledger of childLedgers) ledger.set("scroll-snap-align", params.text("align", "start"));
    return () => {
      for (const ledger of childLedgers) ledger.restore();
    };
  }
  function installSnapContainer(axis, ctx) {
    ctx.style.set(axis === "x" ? "overflow-x" : "overflow-y", "auto");
    if (axis === "x") ctx.style.set("display", "flex");
  }
  var SCROLL_PRIMITIVES = [
    scrollPrimitive({
      id: "pin",
      channels: ["layout", "progress"],
      parameters: {
        ...distanceParam2,
        ...stickyParams
      },
      prepare: deferPrepare(preparePin),
      perfClass: "layout"
    }),
    scrollPrimitive({
      id: "scroll-progress",
      channels: ["progress"],
      parameters: {
        ...distanceParam2,
        steps: { type: "number", default: "0", cssProperty: "--kui-steps" },
        // Same name, same shape and the same validation as scroll-spy's: one `target:` convention
        // across the library rather than a second word for "the elements this effect marks".
        target: { type: "text", default: "", cssProperty: "--kui-target" },
        // Which tree `target:` is searched in. Unset means this primitive's own historical answer —
        // see `prepareProgress`. One declaration, shared: `effects/step-marking.ts`.
        scope: SCOPE_PARAM
      },
      prepare: deferPrepare(prepareProgress)
    }),
    scrollPrimitive({
      id: "horizontal-track",
      channels: ["translate", "progress"],
      parameters: {
        ...distanceParam2,
        travel: { type: "text", default: "auto", cssProperty: "--kui-travel" },
        // Same name, same shape and the same validation as scroll-spy's and media-scrub's: one
        // `target:` convention across the library. Naming the row that moves is also what opts this
        // primitive into owning the stage, the sticky window and the row's layout itself.
        target: { type: "text", default: "", cssProperty: "--kui-target" },
        // Which tree `target:` is searched in. Unset means this primitive's own historical answer —
        // see `prepareHorizontal`. One declaration, shared: `effects/step-marking.ts`.
        scope: SCOPE_PARAM,
        "offset-top": {
          type: "length",
          default: "var(--kui-pin-offset, 0px)",
          cssProperty: "--kui-offset-top"
        }
      },
      prepare: deferPrepare(prepareHorizontal)
    }),
    scrollPrimitive({
      id: "media-scrub",
      channels: ["media", "progress"],
      parameters: {
        ...distanceParam2,
        // A scrub is a hold, so it needs the same two knobs a pin does. Declaring them here is what
        // lets `sequence-scrub` become one attribute with no wrapper at all.
        ...stickyParams,
        frames: { type: "number", default: "1", cssProperty: "--kui-frames" },
        src: { type: "text", default: "", cssProperty: "--kui-src" },
        // The preferred form. `frames:`/`src:` remain for sequences too long to author as tags.
        target: { type: "text", default: "", cssProperty: "--kui-target" },
        // Which tree `target:` is searched in. Unset means this primitive's own historical answer —
        // see `prepareMediaScrub`. One declaration, shared: `effects/step-marking.ts`.
        scope: SCOPE_PARAM
      },
      prepare: deferPrepare(prepareMediaScrub),
      perfClass: "paint"
    }),
    scrollPrimitive({
      id: "scroll-spy",
      channels: ["state"],
      parameters: {
        // `distance`: the per-section form only. `offset-top`: the container form only. Each is a
        // no-op — warned, not silent — in the other; see `prepareScrollSpySingle` and
        // `prepareScrollSpyContainer`.
        ...distanceParam2,
        // Same name and meaning in both forms: the link(s) this instance marks. Per-section, the
        // one link this section names; with `sections:`, every link `target:` matches, each paired
        // to its own section by `href`. See `prepareScrollSpyContainer`.
        target: { type: "text", default: "", cssProperty: "--kui-target" },
        // Which tree `target:` is searched in — and the one place in the library where the *same*
        // declared parameter has two historical answers, because the two forms below resolve it
        // differently on purpose: `'page'` per-section (the nav link is elsewhere by definition),
        // `'self'` in the container form. Unset means "each form keeps its own"; see
        // `prepareScrollSpySingle` and `prepareScrollSpyContainer`.
        scope: SCOPE_PARAM,
        // Presence, not value, selects the container form: authoring this at all switches
        // `prepareScrollSpy` from one-section-per-instance to one-instance-on-the-shared-ancestor.
        sections: { type: "text", default: "", cssProperty: "--kui-sections" },
        "offset-top": { type: "length", default: "0px", cssProperty: "--kui-offset-top" }
      },
      prepare: deferPrepare(prepareScrollSpy)
    }),
    scrollPrimitive({
      id: "smooth-scroll",
      /*
       * Its own channel, not the `'layout'` it used to share with `pin`, `stacking-cards` and
       * `scroll-snap`. The channel model exists to stop two effects fighting over the same CSS
       * property, and this one writes exactly `scroll-behavior` — a property that describes how a
       * *user-or-script-initiated* scroll is performed, and that no other primitive touches.
       *
       * On `'layout'` it made a legitimate pairing impossible. Both `smooth-scroll` and
       * `scroll-snap` have to sit on the document element to have any effect at all — neither
       * `scroll-behavior` nor `scroll-snap-type` is propagated to the viewport from `<body>` — so
       * "apply them to nested elements", the advice the conflict message gives, has no valid
       * nesting to offer here. `data-kui="smooth-scroll-to, scroll-snap-y"` on `<html>` is the
       * ordinary way to ask for smooth anchor jumps on a page that also snaps, and it was refused
       * for a collision that cannot happen: the two write disjoint properties.
       */
      channels: ["scroll-behavior"],
      parameters: {
        behavior: { type: "keyword", default: "smooth", cssProperty: "--kui-scroll-behavior", keywords: ["smooth", "auto"] }
      },
      prepare: deferPrepare(prepareSmoothScroll),
      perfClass: "layout"
    }),
    scrollPrimitive({
      id: "scroll-snap",
      channels: ["layout"],
      parameters: {
        axis: { type: "keyword", default: "y", cssProperty: "--kui-axis", keywords: ["x", "y"] },
        strictness: {
          type: "keyword",
          default: "mandatory",
          cssProperty: "--kui-snap-strictness",
          keywords: ["mandatory", "proximity"]
        },
        align: {
          type: "keyword",
          default: "start",
          cssProperty: "--kui-snap-align",
          keywords: ["start", "center", "end"]
        },
        // Names the snap items. Also what opts this primitive into owning the scroll container
        // itself — see `installSnapContainer`. Without it, the direct children are the items and
        // the page keeps its own `overflow`, exactly as before.
        target: { type: "text", default: "", cssProperty: "--kui-target" },
        // Which tree `target:` is searched in. Unset means this primitive's own historical answer —
        // see `prepareSnap`. One declaration, shared: `effects/step-marking.ts`.
        scope: SCOPE_PARAM
      },
      prepare: deferPrepare(prepareSnap),
      perfClass: "layout"
    })
  ];

  // src/effects/scroll-mechanics/presets.ts
  var SCROLL_PRESETS = [
    // --- pinning ---------------------------------------------------------------------------
    // The default carries a spacer: a pin longer than its containing block silently does nothing,
    // and that is the single most common way authors get sticky wrong.
    { name: "pin-section", primitive: "pin", params: { distance: "100vh", spacer: "true" }, phase: "idle" },
    { name: "pin-until", primitive: "pin", params: { spacer: "false" }, phase: "idle" },
    { name: "pin-spacer", primitive: "pin", params: { spacer: "true" }, phase: "idle" },
    // Applied per card; each card sticks at its own offset and the stack builds up naturally.
    { name: "stacking-cards", primitive: "pin", params: { spacer: "false" }, phase: "idle" },
    // --- progress publishing ---------------------------------------------------------------
    { name: "scroll-progress", primitive: "scroll-progress", phase: "idle" },
    { name: "scrollytelling-step", primitive: "scroll-progress", params: { steps: "4" }, phase: "idle" },
    // --- travel ------------------------------------------------------------------------------
    { name: "horizontal-scroll", primitive: "horizontal-track", phase: "idle" },
    // --- media -------------------------------------------------------------------------------
    /*
     * `spacer:true` is what deletes the `.scrub-stage` wrapper a page used to hand-write.
     *
     * It could not be switched on until the tracker stopped measuring against the parent. A scrub
     * makes itself sticky, and `geometrySource` escapes a sticky subtree by taking its parent — so
     * with the wrapper gone the scrub was measured against whatever section contained it. Measured
     * on `demo/scroll.html`: the parent started 926px above the scrub against a 1817px distance, so
     * progress reached 51% before the element had even stuck and half the sequence played off
     * screen. The wrapper was not ceremony; it was the tight box that made the parent honest.
     *
     * `trackProgress`'s `contentAnchor` is the fix. Progress is read from the spacer, which the
     * library inserts, is exactly `distance` tall, is never sticky, and moves with the content — so
     * there is no wrapper to write and nothing to disagree with.
     *
     * `video-scrub` stays off: a video positioned by the page is not asking the library for a box.
     */
    // `requiresOwnSubtree: true` on both — moot for `compile.ts`'s lift, since `media-scrub` already
    // declares its own `target` parameter and is never lifted at all (see `liftTarget`), but still
    // correct for `test/css-invariants.test.ts`'s generated scan, which derives the 16-name list from
    // `src/css/*.css` alone and does not know which primitives self-manage `target:`.
    {
      name: "sequence-scrub",
      primitive: "media-scrub",
      params: { spacer: "true" },
      requiresOwnSubtree: true,
      phase: "idle"
    },
    { name: "video-scrub", primitive: "media-scrub", requiresOwnSubtree: true, phase: "idle" },
    // --- navigation --------------------------------------------------------------------------
    { name: "scroll-spy", primitive: "scroll-spy", phase: "idle" },
    // --- native CSS passthroughs ---------------------------------------------------------------
    { name: "smooth-scroll-to", primitive: "smooth-scroll", phase: "idle" },
    { name: "scroll-snap-x", primitive: "scroll-snap", params: { axis: "x" }, phase: "idle" },
    { name: "scroll-snap-y", primitive: "scroll-snap", params: { axis: "y" }, phase: "idle" }
  ];

  // src/effects/scroll-mechanics/index.ts
  function registerScrollMechanics(registry) {
    return registry.registerPrimitives(SCROLL_PRIMITIVES).registerPresets(SCROLL_PRESETS);
  }

  // src/core/path-morph.ts
  var COMMAND = /([mlhvcz])|(-?(?:\d+(?:\.\d+)?|\.\d+))/gi;
  var UNSUPPORTED = /[AaSsQqTt]/;
  function takeCommand(tokens, index, state) {
    const token = tokens[index];
    state.command = token;
    if (token.toLowerCase() === "z") closeSubpath(state);
    const expected = ARITY[token.toLowerCase()];
    const next = tokens[index + 1];
    if (expected > 0 && (next === void 0 || /[a-z]/i.test(next))) {
      return argumentError(token, expected, "0");
    }
    return void 0;
  }
  function walkTokens(tokens, state) {
    let index = 0;
    while (index < tokens.length) {
      const token = tokens[index];
      if (/[a-z]/i.test(token)) {
        const reason = takeCommand(tokens, index, state);
        if (reason !== void 0) return reason;
        index++;
        continue;
      }
      if (!state.command) return "path must start with a command letter";
      const result = consume(tokens, index, state);
      if ("reason" in result) return result.reason;
      index = result.index;
    }
    return void 0;
  }
  function parsePath(d) {
    if (UNSUPPORTED.test(d)) {
      return {
        segments: [],
        subpaths: [],
        reason: "arc and shorthand commands (A S Q T) are not supported"
      };
    }
    const tokens = [...d.matchAll(COMMAND)].map((m) => m[1] ?? m[2]);
    const state = {
      subpaths: [],
      open: void 0,
      current: { x: 0, y: 0 },
      start: { x: 0, y: 0 },
      command: ""
    };
    const reason = walkTokens(tokens, state);
    if (reason !== void 0) return { segments: [], subpaths: [], reason };
    if (state.subpaths.length === 0) {
      return { segments: [], subpaths: [], reason: "no drawable segments" };
    }
    return { segments: state.subpaths.flatMap((sub) => sub.segments), subpaths: state.subpaths };
  }
  function pushSegment(state, segment) {
    if (!state.open) {
      state.open = { segments: [], closed: false };
      state.subpaths.push(state.open);
    }
    state.open.segments.push(segment);
  }
  var ARITY = { m: 2, l: 2, h: 1, v: 1, c: 6, z: 0 };
  function closeSubpath(state) {
    const { current, start, open } = state;
    if (!open) return;
    if (Math.abs(current.x - start.x) >= 1e-6 || Math.abs(current.y - start.y) >= 1e-6) {
      open.segments.push(lineToCubic(current, start));
    }
    open.closed = true;
    state.current = { ...start };
    state.open = void 0;
  }
  function argumentError(command, arity, found) {
    return `'${command}' expects ${arity} number${arity === 1 ? "" : "s"}, found ${found}`;
  }
  function consume(tokens, index, state) {
    const key = state.command.toLowerCase();
    const relative = state.command === key;
    const arity = ARITY[key];
    if (arity === 0) {
      return { reason: `'${state.command}' does not take arguments` };
    }
    const args = tokens.slice(index, index + arity).map(Number);
    if (args.length < arity) {
      return { reason: argumentError(state.command, arity, String(args.length)) };
    }
    const bad = args.findIndex(Number.isNaN);
    if (bad !== -1) {
      return {
        reason: argumentError(state.command, arity, `the command letter '${tokens[index + bad]}'`)
      };
    }
    const next = endpointFor(key, args, state.current, relative);
    if (key === "m") {
      state.current = next;
      state.start = next;
      state.open = void 0;
      state.command = relative ? "l" : "L";
      return { index: index + arity };
    }
    pushSegment(state, straightOrCubic({ key, args, from: state.current, relative }, next));
    state.current = next;
    return { index: index + arity };
  }
  function endpointFor(key, args, current, relative) {
    const base = relative ? current : { x: 0, y: 0 };
    if (key === "h") return { x: base.x + args[0], y: current.y };
    if (key === "v") return { x: current.x, y: base.y + args[0] };
    if (key === "c") return { x: base.x + args[4], y: base.y + args[5] };
    return { x: base.x + args[0], y: base.y + args[1] };
  }
  function straightOrCubic(command, to) {
    const { key, args, from, relative } = command;
    if (key !== "c") return lineToCubic(from, to);
    const base = relative ? from : { x: 0, y: 0 };
    return {
      from,
      c1: { x: base.x + args[0], y: base.y + args[1] },
      c2: { x: base.x + args[2], y: base.y + args[3] },
      to
    };
  }
  function lineToCubic(from, to) {
    return {
      from,
      c1: lerpPoint(from, to, 1 / 3),
      c2: lerpPoint(from, to, 2 / 3),
      to
    };
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function lerpPoint(a, b, t) {
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  }
  function splitCubic(segment, t) {
    const p01 = lerpPoint(segment.from, segment.c1, t);
    const p12 = lerpPoint(segment.c1, segment.c2, t);
    const p23 = lerpPoint(segment.c2, segment.to, t);
    const p012 = lerpPoint(p01, p12, t);
    const p123 = lerpPoint(p12, p23, t);
    const mid = lerpPoint(p012, p123, t);
    return [
      { from: segment.from, c1: p01, c2: p012, to: mid },
      { from: mid, c1: p123, c2: p23, to: segment.to }
    ];
  }
  function normaliseCount(segments, target) {
    const out = [...segments];
    while (out.length < target && out.length > 0) {
      let longest = 0;
      for (let i = 1; i < out.length; i++) {
        if (chordLength(out[i]) > chordLength(out[longest])) longest = i;
      }
      const [a, b] = splitCubic(out[longest], 0.5);
      out.splice(longest, 1, a, b);
    }
    return out;
  }
  function chordLength(segment) {
    return Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y);
  }
  function round3(value) {
    return Math.round(value * 100) / 100;
  }
  function subpathsToPathData(subpaths) {
    const parts = [];
    for (const sub of subpaths) {
      const head = sub.segments[0];
      parts.push(`M${round3(head.from.x)},${round3(head.from.y)}`);
      for (const s of sub.segments) {
        parts.push(
          `C${round3(s.c1.x)},${round3(s.c1.y)} ${round3(s.c2.x)},${round3(s.c2.y)} ${round3(s.to.x)},${round3(s.to.y)}`
        );
      }
      if (sub.closed) parts.push("Z");
    }
    return parts.join(" ");
  }
  function centroidOf(subpath) {
    let x = 0;
    let y = 0;
    for (const s of subpath.segments) {
      x += s.from.x;
      y += s.from.y;
    }
    return { x: x / subpath.segments.length, y: y / subpath.segments.length };
  }
  function collapsedLike(partner) {
    const at = centroidOf(partner);
    return {
      segments: partner.segments.map(() => ({
        from: { ...at },
        c1: { ...at },
        c2: { ...at },
        to: { ...at }
      })),
      closed: partner.closed
    };
  }
  function normaliseSubpaths(a, b) {
    const count = Math.max(a.length, b.length);
    const from = [];
    const to = [];
    for (let i = 0; i < count; i++) {
      const left = a[i] ?? collapsedLike(b[i]);
      const right = b[i] ?? collapsedLike(a[i]);
      const target = Math.max(left.segments.length, right.segments.length);
      const closed = left.closed && right.closed;
      from.push({ segments: normaliseCount(left.segments, target), closed });
      to.push({ segments: normaliseCount(right.segments, target), closed });
    }
    return { from, to };
  }
  function createMorph(fromPath, toPath) {
    const a = parsePath(fromPath);
    const b = parsePath(toPath);
    if (a.reason) return { reason: `start path: ${a.reason}` };
    if (b.reason) return { reason: `end path: ${b.reason}` };
    const { from, to } = normaliseSubpaths(a.subpaths, b.subpaths);
    const count = from.reduce((total, sub) => total + sub.segments.length, 0);
    return {
      morph: {
        segmentCount: count,
        at(t) {
          const clamped = Math.min(1, Math.max(0, t));
          return subpathsToPathData(
            from.map((sub, i) => ({
              segments: sub.segments.map(
                (segment, j) => lerpCubic(segment, to[i].segments[j], clamped)
              ),
              closed: sub.closed
            }))
          );
        }
      }
    };
  }
  function lerpCubic(a, b, t) {
    return {
      from: lerpPoint(a.from, b.from, t),
      c1: lerpPoint(a.c1, b.c1, t),
      c2: lerpPoint(a.c2, b.c2, t),
      to: lerpPoint(a.to, b.to, t)
    };
  }

  // src/effects/svg/index.ts
  function prepareMorph(el, params, ctx) {
    const path2 = el;
    const startPath = params.text("from") || path2.getAttribute("d") || "";
    const { morph, reason } = createMorph(startPath, params.text("to"));
    if (!morph) {
      ctx.warn(`cannot morph: ${reason}`);
      return () => {
      };
    }
    const duration = effectDurationMs(params, 300);
    const ease = resolveEasing(params.timing.easing ?? params.text("ease", "linear"), ctx.warn);
    const delay = params.timing.delayMs ?? params.ms("delay", 0);
    let frame = 0;
    let cancelled = false;
    const drive = (target) => {
      cancelAnimationFrame(frame);
      const startedAt = performance.now();
      const startValue = current;
      const wait = target === 1 ? delay : 0;
      const step = (now) => {
        if (cancelled) return;
        const elapsed = now - startedAt - wait;
        if (elapsed < 0) {
          frame = requestAnimationFrame(step);
          return;
        }
        const t = duration > 0 ? Math.min(1, elapsed / duration) : 1;
        current = startValue + (target - startValue) * ease(t);
        path2.setAttribute("d", morph.at(current));
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };
    let current = 0;
    const enter = () => drive(1);
    const leave = () => drive(0);
    el.addEventListener("pointerenter", enter, { passive: true });
    el.addEventListener("focusin", enter, { passive: true });
    el.addEventListener("pointerleave", leave, { passive: true });
    el.addEventListener("focusout", leave, { passive: true });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("focusin", enter);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("focusout", leave);
      path2.setAttribute("d", startPath);
    };
  }
  var PATH_DRAW_PRIMITIVE = cssPrimitive("path-draw", [CHANNEL.stroke], {
    parameters: {
      length: { type: "number", default: "100", cssProperty: "--kui-path-length", finite: true }
    }
  });
  var SHAPE_FILL_PRIMITIVE = cssPrimitive("shape-fill", [CHANNEL.clip]);
  var BAR_GROW_PRIMITIVE = cssPrimitive("bar-grow", [CHANNEL.scale, "transform-origin"], {
    parameters: { from: { type: "number", default: "0", cssProperty: "--kui-bar-from" } }
  });
  var LOGO_BUILD_PRIMITIVE = cssPrimitive("logo-assemble", [
    CHANNEL.opacity,
    CHANNEL.scale,
    CHANNEL.rotate
  ]);
  var ICON_TOGGLE_PRIMITIVE = {
    id: "icon-toggle",
    renderer: "javascript",
    channels: [CHANNEL.translate, CHANNEL.rotate, CHANNEL.scale, CHANNEL.opacity, CHANNEL.clip],
    parameters: {
      duration: { type: "time", default: "260ms", cssProperty: "--kui-duration" },
      // The state flip is the start moment: `aria-expanded` goes true and the bars begin to move.
      // svg.css spends this as a `transition-delay` on the *expanded* rules only, so it delays
      // opening and never closing — see that file's comment, and `interaction.css`'s for why.
      ...TRIGGER_DELAY_PARAM,
      ease: { type: "easing", default: "ease-out", cssProperty: "--kui-ease" }
    },
    supportedTimelines: ["time"],
    supportedActivations: ["load"],
    defaultActivation: "load",
    perfClass: "compositor",
    reducedMotion: "disable",
    prepare: stylesheetTimingPrepare("icon-toggle", {
      honours: ALL_TIMING_TOKENS,
      because: "svg.css pins that value on this effect"
    })
  };
  var SVG_PRIMITIVES = [
    {
      id: "path-morph",
      renderer: "javascript",
      // `d` is its own channel: nothing else in the catalog writes path geometry, so a morph can
      // safely compose with a fade or a rotation on the same element.
      channels: ["path"],
      parameters: {
        from: { type: "text", default: "", cssProperty: "--kui-path-from" },
        to: { type: "text", default: "", cssProperty: "--kui-path-to" },
        duration: { type: "time", default: "300ms", cssProperty: "--kui-duration" },
        // Both new, both no-ops at their defaults. The morph drives its own frames, so unlike the
        // stylesheet-backed members of this file it honours them in JS — see `prepareMorph`.
        // `linear`, not the catalog's usual `ease-out`: that is the curve this effect has always
        // interpolated on, and adding a knob must not move a page that never asked for one.
        ...TRIGGER_DELAY_PARAM,
        ease: { type: "easing", default: "linear", cssProperty: "--kui-ease" }
      },
      supportedTimelines: ["time"],
      supportedActivations: ["hover", "focus", "manual", "load"],
      // The morph attaches its own hover listeners, so it must be wired up on load, not on enter.
      defaultActivation: "load",
      perfClass: "paint",
      reducedMotion: "disable",
      // No `withTimingContract` wrapper: this primitive honours all three tokens, so there is
      // nothing for one to warn about.
      prepare: deferPrepare(prepareMorph)
    },
    PATH_DRAW_PRIMITIVE,
    SHAPE_FILL_PRIMITIVE,
    BAR_GROW_PRIMITIVE,
    LOGO_BUILD_PRIMITIVE,
    ICON_TOGGLE_PRIMITIVE
  ];
  var SVG_PRESETS = [
    { name: "icon-morph", primitive: "path-morph" },
    { name: "blob-morph", primitive: "path-morph", params: { duration: "800ms" } },
    // Stroke draws. One keyframe block each rather than one shared block, matching the
    // progress-ring/gauge-sweep/donut-sweep/sparkline-draw group in numbers.ts: identical bodies
    // today, but each name is free to diverge and a consumer can restyle one without the others.
    { name: "draw-stroke", primitive: "path-draw", keyframes: "kui-draw-stroke", params: { duration: "800ms", ease: "ease-in-out" } },
    { name: "draw-signature", primitive: "path-draw", keyframes: "kui-draw-signature", params: { duration: "1600ms", ease: "ease-in-out" } },
    { name: "draw-underline", primitive: "path-draw", keyframes: "kui-draw-underline", params: { duration: "420ms" } },
    { name: "checkmark-draw", primitive: "path-draw", keyframes: "kui-checkmark-draw", params: { duration: "320ms" } },
    { name: "cross-draw", primitive: "path-draw", keyframes: "kui-cross-draw", params: { duration: "260ms" } },
    { name: "chart-line-draw", primitive: "path-draw", keyframes: "kui-chart-line-draw", params: { duration: "1200ms", ease: "ease-in-out" } },
    { name: "gradient-stroke", phase: "idle", primitive: "path-draw", keyframes: "kui-gradient-stroke", params: { duration: "2400ms", ease: "ease-in-out" } },
    // Fills.
    { name: "heart-fill", primitive: "shape-fill", keyframes: "kui-heart-fill", params: { duration: "420ms" } },
    { name: "bookmark-fill", primitive: "shape-fill", keyframes: "kui-bookmark-fill", params: { duration: "360ms" } },
    { name: "chart-area-fill", primitive: "shape-fill", keyframes: "kui-chart-area-fill", params: { duration: "900ms" } },
    // `cloak: true`: `kui-chart-bar-grow`'s `from { scale: 1 0 }` (svg.css) is a zero-height box
    // while paused, not just an invisible one — so it occupies no space in layout for the whole
    // wait. Same defect `fold-panel` has, and the same fix shape: see svg.css's
    // `[data-kui-fx~='chart-bar-grow'][data-kui-state='ready']` rule.
    {
      name: "chart-bar-grow",
      primitive: "bar-grow",
      keyframes: "kui-chart-bar-grow",
      params: { duration: "700ms", ease: "back-out" },
      cloak: true
    },
    { name: "logo-build", primitive: "logo-assemble", keyframes: "kui-logo-build", params: { duration: "520ms", ease: "back-out" } },
    // Icon toggles — no `keyframes`, because their motion is a CSS transition in svg.css keyed off
    // aria state, not a compiled animation. Same shape as forms.ts's native-state presets.
    // `requiresOwnSubtree: true` on all three: each moves its own `.kui-bar` children, assumed
    // present under the fx element itself.
    { name: "hamburger-to-x", phase: "state", primitive: "icon-toggle", requiresOwnSubtree: true },
    { name: "play-to-pause", phase: "state", primitive: "icon-toggle", requiresOwnSubtree: true },
    // Only `plus-to-minus` transitions on the shared `icon-toggle` primitive's host box — the other
    // two only move their `.kui-bar` children, a different box `transitions` deliberately does not
    // describe (see `Preset.transitions`'s own doc comment). Transcribed from svg.css's
    // `[data-kui-fx~='plus-to-minus'] { transition: rotate ... }`; no literal timing, because
    // `icon-toggle` already has a generated `--kui-icon-toggle-duration`/`-ease` pair the way the
    // hover family's five do. Still `requiresOwnSubtree`, for the same `.kui-bar` reason as its two
    // siblings above, on top of the host-box rotation `transitions` already describes.
    {
      name: "plus-to-minus",
      primitive: "icon-toggle",
      transitions: [{ property: "rotate" }],
      requiresOwnSubtree: true
    }
  ];
  function registerSvg(registry) {
    return registry.registerPrimitives(SVG_PRIMITIVES).registerPresets(SVG_PRESETS);
  }

  // src/effects/three-d/index.ts
  var FLIP_CONTROL_SELECTOR = ":scope > .kui-flip-control";
  function prepareCardToggle(el, params, ctx) {
    mirrorTimingToCss("card-toggle", ALL_TIMING_TOKENS, params, ctx);
    const trigger = params.text("trigger", "click");
    if (trigger === "click") return () => {
    };
    if (!supportsFineHover(ctx.win)) return () => {
    };
    const control2 = el.querySelector(FLIP_CONTROL_SELECTOR);
    if (!control2) {
      ctx.warn(`flip-card trigger:${trigger} found no direct-child .kui-flip-control \u2014 the card will not flip`);
      return () => {
      };
    }
    const set = (flipped) => control2.setAttribute("aria-pressed", String(flipped));
    const isFlipped = () => control2.getAttribute("aria-pressed") === "true";
    const onEnter = () => {
      set(trigger === "hover-toggle" ? !isFlipped() : true);
    };
    const onLeave = () => set(false);
    el.addEventListener("pointerenter", onEnter, { passive: true });
    if (trigger === "hover") el.addEventListener("pointerleave", onLeave, { passive: true });
    return () => {
      el.removeEventListener("pointerenter", onEnter);
      el.removeEventListener("pointerleave", onLeave);
    };
  }
  var CARD_TOGGLE_PRIMITIVE = {
    id: "card-toggle",
    renderer: "javascript",
    // `'discrete'` alongside `rotate`: the unconditional `[data-kui-fx~='flip-card']` rule pins
    // `display: grid` so the two faces stack in one cell instead of flowing as normal block
    // siblings — unrelated to `catalog/discrete.ts`'s show/hide use of the same physical property,
    // but `display` is tracked as one channel regardless of the value written into it.
    channels: [CHANNEL.rotate, "discrete"],
    parameters: {
      duration: { type: "time", default: "700ms", cssProperty: "--kui-duration" },
      // The turn has a start moment — the click, or the pointer arriving — so a delay before it is
      // coherent. three-d.css spends it as a `transition-delay` on the turned-face rules only, so it
      // delays turning to the back and never turning back to the front; see that file's comment.
      ...TRIGGER_DELAY_PARAM,
      ease: { type: "easing", default: "ease-in-out", cssProperty: "--kui-ease" },
      perspective: { type: "length", default: "1600px", cssProperty: "--kui-perspective" },
      trigger: {
        type: "keyword",
        default: "click",
        cssProperty: "--kui-flip-trigger",
        keywords: ["click", "hover", "hover-latch", "hover-toggle"]
      }
    },
    supportedTimelines: ["time"],
    supportedActivations: ["load"],
    defaultActivation: "load",
    perfClass: "compositor",
    reducedMotion: "disable",
    prepare: deferPrepare(prepareCardToggle)
  };
  var THREE_D_PRIMITIVES = [
    // `skew`, not `rotate`: the keyframes in three-d.css write `transform: perspective(...)
    // rotateX/Y(...)`, not the individual `rotate:` property — `perspective` only creates depth for
    // an element's *children*, so giving one of these effects its own depth means reaching for the
    // `perspective()` transform *function*, which only exists inside the `transform` shorthand.
    // `CHANNEL.skew` is this catalog's name for "claims the whole `transform` shorthand"; see the
    // comment on it in `core/types.ts`.
    // `'transform-origin'` alongside `skew`: two of this primitive's five presets pin one —
    // `book-page-turn` (`left center`) and `fold-panel` (`top center`), each on its own unconditional
    // rule in three-d.css — undeclared until channel-properties.ts gained an entry for it.
    // `card-flip-x`/`-y`/`cube-rotate` don't write it, but the channel only says what this primitive
    // is *allowed* to paint, not what every preset built on it does.
    cssPrimitive("flip-face", [CHANNEL.skew, "transform-origin"], {
      parameters: {
        angle: { type: "angle", default: "180deg", cssProperty: "--kui-from-angle" },
        perspective: { type: "length", default: "1200px", cssProperty: "--kui-perspective" }
      }
    }),
    cssPrimitive("page-reveal", [CHANNEL.opacity, CHANNEL.translate], {
      parameters: { distance: { type: "length", default: "40px", cssProperty: "--kui-distance" } }
    }),
    cssPrimitive("wipe", [CHANNEL.clip]),
    // `from` gives `loading-bar` a real knob on its start scale — it had none before, unlike
    // `flip-face`'s `angle:` two rows up. `--kui-bar-from` is also what the fold-panel-style
    // `[data-kui-fx~='loading-bar'][data-kui-state='ready']` gate neutralizes in three-d.css; see
    // that rule's comment for the on:enter fix this parameter doubles as.
    // `transform-origin: left center` pins the bar's growth edge on the same unconditional rule —
    // undeclared until channel-properties.ts gained an entry for it.
    cssPrimitive("bar", [CHANNEL.scale, "transform-origin"], {
      parameters: { from: { type: "number", default: "0", cssProperty: "--kui-bar-from" } }
    }),
    CARD_TOGGLE_PRIMITIVE
  ];
  var THREE_D_PRESETS = [
    // --- 3D & perspective ---
    // `requiresOwnSubtree`: `three-d.css:106-154` branches on `:has(> :nth-child(2))` — a flip
    // relocated onto a childless element silently takes the single-face branch and spins a bare box.
    {
      name: "card-flip-y",
      primitive: "flip-face",
      keyframes: "kui-card-flip-y",
      cloak: true,
      requiresOwnSubtree: true
    },
    {
      name: "card-flip-x",
      primitive: "flip-face",
      keyframes: "kui-card-flip-x",
      cloak: true,
      requiresOwnSubtree: true
    },
    { name: "cube-rotate", primitive: "flip-face", keyframes: "kui-cube-rotate", params: { angle: "90deg" } },
    {
      name: "book-page-turn",
      primitive: "flip-face",
      keyframes: "kui-book-page-turn",
      params: { angle: "-160deg", duration: "900ms" }
    },
    // `cloak: true`, unlike its `flip-face` siblings above: those are `to`-only keyframes, so their
    // paused/waiting box is the ordinary, untransformed rest state. `fold-panel` is `from`-only —
    // its `rotateX(-90deg)` (three-d.css) *is* the paused box, edge-on and zero-height, so it holds
    // no space in layout for the whole wait; see the
    // `[data-kui-fx~='fold-panel'][data-kui-state='ready']` rule in three-d.css for the other half
    // of that fix. `cloak` only ever hid the pre-JS flash, not this, but adding it here keeps the
    // pre-JS and post-JS "ready" appearances the same (invisible) instead of trading one flash for
    // the other.
    {
      name: "fold-panel",
      phase: "entrance",
      primitive: "flip-face",
      keyframes: "kui-fold-panel",
      params: { angle: "-90deg" },
      cloak: true
    },
    // --- page transitions ---
    { name: "page-fade", primitive: "page-reveal", keyframes: "kui-page-fade" },
    { name: "page-slide", primitive: "page-reveal", keyframes: "kui-page-slide" },
    { name: "curtain-wipe", primitive: "wipe", keyframes: "kui-curtain-wipe", params: { duration: "800ms" } },
    // `cloak: true` for the same reason as `fold-panel`: `kui-loading-bar`'s `from { scale: 0 1 }`
    // (three-d.css) is a zero-width box, not just an invisible one — see that file's
    // `[data-kui-fx~='loading-bar'][data-kui-state='ready']` rule.
    { name: "loading-bar", phase: "entrance", primitive: "bar", keyframes: "kui-loading-bar", cloak: true },
    // No `keyframes`: its motion is a CSS transition in three-d.css keyed off the control's
    // aria-pressed, not a compiled animation. Same shape as the icon toggles in svg.ts.
    // `requiresOwnSubtree`: the transition rotates `> .kui-face-front`/`.kui-face-back` children
    // (three-d.css:297-306), assumed to exist under the fx element itself.
    { name: "flip-card", phase: "state", primitive: "card-toggle", requiresOwnSubtree: true }
  ];
  function registerThreeD(registry) {
    return registry.registerPrimitives(THREE_D_PRIMITIVES).registerPresets(THREE_D_PRESETS);
  }

  // src/effects/carousel/drag.ts
  var MOMENTUM_SECONDS = 0.28;
  var MAX_FLICK_PLACES = 4;
  var DRAG_THRESHOLD_PX = 6;
  function projectRelease(position, velocityPxPerSec, travelPx) {
    if (travelPx <= 0) return position;
    const places = velocityPxPerSec / travelPx * MOMENTUM_SECONDS;
    const capped = Math.max(-MAX_FLICK_PLACES, Math.min(MAX_FLICK_PLACES, places));
    return position - capped;
  }
  function snapTo(projected) {
    return Math.round(projected) + 0;
  }
  function wrapPlace(place2, total) {
    return total > 0 ? (place2 % total + total) % total : 0;
  }
  var KEY_DELTAS = {
    ArrowRight: 1,
    ArrowDown: 1,
    ArrowLeft: -1,
    ArrowUp: -1,
    PageDown: 1,
    PageUp: -1,
    Home: null,
    End: null
  };
  function createRingDrag(request) {
    const { el, ctx, enabled, travelPx, total, positionOf, moveTo, setDragging } = request;
    let suppressClick = false;
    const onClickCapture = (event) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.stopPropagation();
      event.preventDefault();
    };
    const stopRecognising = enabled ? recognise(
      el,
      {
        onStart() {
          setDragging(true);
        },
        onMove(vector) {
          moveTo(positionOf() - vector.dx / travelPx);
        },
        onEnd(vector) {
          setDragging(false);
          suppressClick = true;
          const settled = snapTo(projectRelease(positionOf(), vector.vx, travelPx));
          moveTo(wrapPlace(settled, total()));
        }
      },
      // Locked to one axis: a ring spins about one pole, so vertical pointer movement is the
      // visitor scrolling the page *through* the deck, which must keep working. The higher
      // threshold than `recognise`'s own default of 4px is what buys that — a ring occupies a
      // large slab of a phone screen, and a scroll that begins with a two-pixel horizontal wobble
      // should not capture the pointer away from the page.
      { axis: "x", threshold: DRAG_THRESHOLD_PX }
    ) : () => {
    };
    if (enabled) ctx.style.set("touch-action", "pan-y");
    const onKeyDown = (event) => {
      const keyboard = event;
      const key = keyboard.key;
      const delta = KEY_DELTAS[key];
      if (delta === void 0) return;
      if (keyboard.altKey || keyboard.ctrlKey || keyboard.metaKey) return;
      const count = total();
      const absolute = key === "Home" ? 0 : count - 1;
      const next = delta === null ? absolute : snapTo(positionOf()) + delta;
      event.preventDefault();
      moveTo(wrapPlace(next, count));
    };
    const grantedFocus = el.getAttribute("tabindex") === null;
    if (grantedFocus) el.setAttribute("tabindex", "0");
    el.addEventListener("keydown", onKeyDown);
    el.addEventListener("click", onClickCapture, true);
    return () => {
      stopRecognising();
      el.removeEventListener("keydown", onKeyDown);
      el.removeEventListener("click", onClickCapture, true);
      if (grantedFocus) el.removeAttribute("tabindex");
    };
  }

  // src/effects/carousel/index.ts
  var DRAGGING_ATTR = "data-kui-ring-dragging";
  var FACE_ATTR = "data-kui-ring-face";
  var QUARTER_TURN_DEG = 90;
  var FLATTENING = [
    ["overflow", (value) => value !== "" && value !== "visible"],
    ["clip-path", (value) => value !== "" && value !== "none"],
    ["opacity", (value) => value !== "" && Number(value) < 1],
    ["filter", (value) => value !== "" && value !== "none"],
    ["backdrop-filter", (value) => value !== "" && value !== "none"]
  ];
  function warnFlatteningAncestor(el, ctx) {
    const body = el.ownerDocument?.body ?? null;
    let node = el.parentElement;
    while (node && node !== body) {
      const found = flatteningDeclaration(node, ctx);
      if (found) {
        ctx.warn(
          `carousel: an ancestor <${node.localName}> has ${found.property}: ${found.value}, which flattens transform-style: preserve-3d \u2014 the ring will render as flat overlapping cards. Move the ring out of it, or drop that property on the ancestor.`
        );
        return;
      }
      node = node.parentElement;
    }
  }
  function flatteningDeclaration(node, ctx) {
    const style = ctx.win.getComputedStyle?.(node);
    if (!style) return null;
    for (const [property2, flattens] of FLATTENING) {
      const value = style.getPropertyValue(property2);
      if (flattens(value)) return { property: property2, value };
    }
    return null;
  }
  function ledgersFor(store, node) {
    let attributes = store.attributes.get(node);
    if (!attributes) {
      attributes = createAttributeLedger(node);
      store.attributes.set(node, attributes);
    }
    let styles = store.styles.get(node);
    if (!styles) {
      styles = createStyleLedger(node);
      store.styles.set(node, styles);
    }
    return { attributes, styles };
  }
  function faceAt(angleDeg) {
    return Math.abs(normaliseDegrees(angleDeg)) >= QUARTER_TURN_DEG ? "back" : "front";
  }
  function normaliseDegrees(angleDeg) {
    const wrapped2 = (angleDeg % 360 + 360) % 360;
    return wrapped2 > 180 ? wrapped2 - 360 : wrapped2;
  }
  function snapPosition(position, total) {
    if (total <= 0) return { step: 0, drift: 0 };
    const nearest = Math.round(position);
    return { step: (nearest % total + total) % total, drift: position - nearest };
  }
  var RING_PARAMETERS = {
    duration: { type: "time", default: "620ms", cssProperty: "--kui-duration" },
    ...TRIGGER_DELAY_PARAM,
    ease: { type: "easing", default: "cubic-bezier(0.22, 1, 0.36, 1)", cssProperty: "--kui-ease" },
    /*
     * A real CSS `<angle>`, not a normalised scalar.
     *
     * A designer specifies fifteen degrees; nobody specifies 0.375 of an unstated maximum. A
     * normalised knob also bakes taste into a coordinate — the maximum *is* an opinion about how much
     * tilt is too much, expressed as a unit — and it cannot be typed in the spelling the rest of the
     * attribute grammar uses (`0.05turn` is a legal angle and means something exact). Legibility is
     * still bounded, but the bound is applied to the angle, in `carousel.css`, where it is one
     * `clamp()` an author can see in devtools rather than a hidden rescale.
     *
     * Sign convention: **positive tilts the camera up and over the ring**, looking down at it. That
     * is the opposite sign from the `rotateX()` it compiles to — see `carousel.css` for the
     * derivation — and the inversion is deliberate: "18 degrees above" is the sentence a designer
     * says, and it should not be spelled `-18deg` because of which way a matrix happens to turn.
     */
    tilt: { type: "angle", default: "0deg", cssProperty: "--kui-tilt" },
    /*
     * How far the ring spreads. `360deg` is a full ring; anything less is a slice.
     *
     * This is the parameter the concave name exists around. From the centre of a *full* ring most of
     * it is behind your head, so a 360-degree spread there is not a design choice but a way of hiding
     * two thirds of the content — the inside name defaults to a slice for that reason.
     */
    arc: { type: "angle", default: "360deg", cssProperty: "--kui-arc" },
    /*
     * The ring's radius, or unset for one derived from the content.
     *
     * Empty default, not a number, and for the same reason `step-progress`'s `steps` is empty:
     * `readParams` fills every declared default in unconditionally, so an empty one is the only way
     * to tell "the author said nothing" from "the author said 320px". Unset, `carousel.css` computes
     * the circumradius of a regular polygon with this many sides and this much side length —
     * `(width + gap) / (2 * tan(step / 2))` — which is the arrangement where neighbours just touch.
     * Every consumer solving that by hand was the alternative, and they would all have solved it
     * differently.
     *
     * The width half of that has to come from JavaScript: CSS can compute with a measurement but
     * cannot take one. See `measureItemWidth`.
     */
    radius: { type: "length", default: "", cssProperty: "--kui-radius" },
    /** Breathing room between neighbours, spent by the derived radius above. */
    gap: { type: "length", default: "24px", cssProperty: "--kui-gap" },
    /** Camera distance. Shorter is a wider lens: more foreshortening, more drama, more distortion. */
    perspective: { type: "length", default: "1600px", cssProperty: "--kui-perspective" },
    /*
     * Whether a slot keeps its own outward orientation, or turns to keep facing the viewer.
     *
     * `radial` is the ring's natural state and needs nothing: a slot placed by
     * `rotateY(θ) translateZ(R)` already faces outward along its own radius, which is why the live
     * one faces you. It is what you want for a cover-flow, and it is what makes the far side of the
     * ring read as the far side.
     *
     * `camera` counter-rotates each slot's *child* — never the slot itself; the placement transform
     * and the billboard have to stay on separate boxes or every later change to one silently
     * multiplies into the other — so text stays readable at every position, which is what a raised
     * camera needs. Costs one element of markup per slide; see `docs/catalog.md`.
     */
    facing: {
      type: "keyword",
      default: "radial",
      cssProperty: "--kui-facing",
      keywords: ["radial", "camera"]
    },
    /** Whether a pointer can spin the ring by hand. */
    grab: { type: "keyword", default: "true", cssProperty: "--kui-grab", keywords: ["true", "false"] },
    /*
     * How far the pointer travels, in pixels, to move the ring one place.
     *
     * A pixels-per-step mapping rather than pixels-per-degree, because a step is the unit everything
     * else here is in — the index, the offset, the snap — and a degree is not: the same drag would
     * move a six-item ring one place and a sixty-item ring ten, purely because the spacing changed.
     */
    travel: { type: "number", default: "220", cssProperty: "--kui-travel", finite: true, minimum: 1 },
    /** Which elements sit on the ring. Unset means this element's own children. */
    target: { type: "text", default: "", cssProperty: "--kui-target" },
    /** Optional controls, resolved exactly as `step-progress` resolves its own. */
    next: { type: "text", default: "", cssProperty: "--kui-next" },
    prev: { type: "text", default: "", cssProperty: "--kui-prev" },
    jump: { type: "text", default: "", cssProperty: "--kui-jump" },
    scope: SCOPE_PARAM
  };
  function measureItemWidth(styles, slots) {
    for (const slot of slots) {
      const width = slot.offsetWidth;
      if (width > 0) styles.set("--kui-item-width", `${width}px`);
      return;
    }
  }
  function prepareSpatialRing(el, params, ctx) {
    warnFlatteningAncestor(el, ctx);
    mirrorTimingToCss("spatial-ring", ALL_TIMING_TOKENS, params, ctx);
    const selector = resolveTarget(params.text("target"), ctx, "carousel");
    const scope = scopeParam(params, "self");
    const resolveSlots = () => selector ? queryScoped(el, ctx, selector, scope) : el.children;
    const marker = createStepMarker(resolveSlots, (message) => ctx.warn(`carousel ${message}`));
    const total = () => countSteps(params, resolveSlots);
    const hostAttributes = createAttributeLedger(el);
    const hostStyles = createStyleLedger(el);
    hostAttributes.set("data-kui-ring-facing", params.text("facing", "radial"));
    const slots = { attributes: /* @__PURE__ */ new Map(), styles: /* @__PURE__ */ new Map() };
    const derivesRadius = params.text("radius") === "";
    let position = 0;
    const arcDeg = degreesOf(params.text("arc", "360deg"), 360);
    const render = () => {
      const count = total();
      const { step, drift: drift2 } = snapPosition(position, count);
      hostAttributes.set("data-kui-step", String(step));
      hostStyles.set("--kui-step", String(step));
      hostStyles.set("--kui-step-position", (step + drift2).toFixed(4));
      marker.mark(step);
      const slotNodes = [...resolveSlots()];
      if (derivesRadius) measureItemWidth(hostStyles, slotNodes);
      const spacing = count > 0 ? arcDeg / count : arcDeg;
      for (const node of slotNodes) {
        const offset = Number(node.getAttribute("data-kui-step-offset") ?? "0");
        const angle = (offset - drift2) * spacing;
        ledgersFor(slots, node).attributes.set(FACE_ATTR, faceAt(angle));
      }
    };
    const goTo = (next) => {
      position = next;
      render();
    };
    const groups = [];
    const bindControl = (param, run) => {
      const control2 = resolveTarget(params.text(param), ctx, `carousel ${param}`);
      if (!control2) return false;
      if (queryScoped(el, ctx, control2, scope).length === 0) {
        ctx.warn(`carousel ${param} "${control2}" matched nothing`);
      }
      groups.push({ selector: control2, run });
      return true;
    };
    bindControl("next", () => goTo(nextStep(snapPosition(position, total()).step, total())));
    bindControl("prev", () => goTo(prevStep(snapPosition(position, total()).step, total())));
    bindControl("jump", (_node, at) => {
      if (at >= 0) goTo(at);
    });
    const releaseControls = delegateControls({ el, ctx, scope, groups });
    const releaseDrag = createRingDrag({
      el,
      ctx,
      enabled: params.is("grab"),
      travelPx: params.num("travel", 220),
      total,
      positionOf: () => position,
      moveTo: goTo,
      setDragging: (dragging) => hostAttributes.set(DRAGGING_ATTR, String(dragging))
    });
    render();
    return () => {
      releaseDrag();
      releaseControls();
      marker.restore();
      for (const ledger of slots.attributes.values()) ledger.restore();
      for (const ledger of slots.styles.values()) ledger.restore();
      slots.attributes.clear();
      slots.styles.clear();
      hostAttributes.restore();
      hostStyles.restore();
    };
  }
  function degreesOf(value, fallbackDeg) {
    const match = /^(-?[\d.]+)(deg|rad|turn|grad)?$/i.exec(value.trim());
    if (!match) return fallbackDeg;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount)) return fallbackDeg;
    switch ((match[2] ?? "deg").toLowerCase()) {
      case "rad":
        return amount * 180 / Math.PI;
      case "turn":
        return amount * 360;
      case "grad":
        return amount * 0.9;
      default:
        return amount;
    }
  }
  var SPATIAL_RING_PRIMITIVE = {
    id: "spatial-ring",
    renderer: "javascript",
    channels: [CHANNEL.skew, "discrete"],
    parameters: RING_PARAMETERS,
    supportedTimelines: ["time"],
    // `load`, not `enter`: a carousel that only wires its arrows once scrolled into view is broken,
    // not lazy — the same distinction `Primitive.defaultActivation` documents.
    supportedActivations: ["load", "enter", "click", "manual"],
    defaultActivation: "load",
    perfClass: "compositor",
    reducedMotion: "shorten",
    prepare: deferPrepare(prepareSpatialRing)
  };
  var CAROUSEL_PRIMITIVES = [SPATIAL_RING_PRIMITIVE];
  var CAROUSEL_PRESETS = [
    {
      name: "carousel-3d",
      primitive: "spatial-ring",
      params: { tilt: "12deg" },
      requiresOwnSubtree: true,
      phase: "idle"
    },
    {
      name: "carousel-3d-high",
      primitive: "spatial-ring",
      params: { tilt: "30deg", perspective: "1200px" },
      requiresOwnSubtree: true,
      phase: "idle"
    },
    {
      name: "carousel-3d-low",
      primitive: "spatial-ring",
      params: { tilt: "-18deg", perspective: "1800px" },
      requiresOwnSubtree: true,
      phase: "idle"
    },
    /*
     * The concave name. `arc:120deg` is the default the outside names cannot want and this one cannot
     * do without: from the centre of a full ring, two thirds of the deck is behind the viewer.
     *
     * `facing:camera` too, because the reason to stand inside a ring is to read what is on it. A
     * radial slot at the edge of a 120-degree slice is turned 60 degrees away from the camera, which
     * is legible as a shape and not as text.
     */
    {
      name: "carousel-3d-inside",
      primitive: "spatial-ring",
      params: { arc: "120deg", facing: "camera", perspective: "900px" },
      requiresOwnSubtree: true,
      phase: "idle"
    }
  ];
  function registerCarousel(registry) {
    return registry.registerPrimitives(CAROUSEL_PRIMITIVES).registerPresets(CAROUSEL_PRESETS);
  }

  // src/effects/tween/properties.ts
  var TWEEN_GROUP_ORDER = [
    "translate",
    "rotate",
    "scale",
    "opacity",
    "filter",
    "color",
    "background"
  ];
  var TWEEN_GROUP_CHANNELS = {
    translate: CHANNEL.translate,
    rotate: CHANNEL.rotate,
    scale: CHANNEL.scale,
    opacity: CHANNEL.opacity,
    filter: CHANNEL.filter,
    color: CHANNEL.color,
    background: CHANNEL.background
  };
  function property(group, key, type, identity) {
    const constraints = type === "number" ? { finite: true, ...group === "filter" ? { minimum: 0 } : {} } : {};
    return [key, { group, spec: { type, default: identity, cssProperty: `--kui-tween-${key}`, ...constraints } }];
  }
  var TWEEN_PROPERTIES = Object.fromEntries([
    // Translation. `x`/`y`/`z` rather than `translate-x`: they are the conventional shorthands, they
    // are what GSAP calls them, and the CSS property they feed is named on the group instead.
    property("translate", "x", "length", "0"),
    property("translate", "y", "length", "0"),
    property("translate", "z", "length", "0"),
    // Rotation about the z axis — the only one CSS's `rotate` property renders as a turn. See above.
    property("rotate", "rotate", "angle", "0deg"),
    // `scale` sets both axes; `scale-x`/`scale-y` override one. That layering happens in the
    // keyframe's nested `var()` fallback, not here — see `tween.css`.
    property("scale", "scale", "number", "1"),
    property("scale", "scale-x", "number", "1"),
    property("scale", "scale-y", "number", "1"),
    property("opacity", "opacity", "number", "1"),
    // One filter list, with an identity for each function so unnamed functions do no work.
    property("filter", "blur", "length", "0px"),
    property("filter", "brightness", "number", "1"),
    property("filter", "saturate", "number", "1"),
    property("filter", "grayscale", "number", "0"),
    property("filter", "contrast", "number", "1"),
    property("filter", "hue-rotate", "angle", "0deg"),
    property("filter", "invert", "number", "0"),
    property("filter", "sepia", "number", "0"),
    // `currentcolor` on the `color` property resolves to the inherited colour, which is exactly the
    // "leave it alone" the other identities express.
    property("color", "color", "color", "currentcolor"),
    property("background", "background-color", "color", "transparent")
  ]);
  var TWEEN_SCHEMA = Object.fromEntries(
    [
      ...Object.entries(TWEEN_PROPERTIES).map(([key, entry]) => [key, entry.spec]),
      ...TWEEN_GROUP_ORDER.map((group) => [`${group}-ease`, {
        type: "easing",
        default: "ease-out",
        cssProperty: `--kui-tween-${group}-ease`
      }])
    ]
  );
  function withImpliedUnit(raw, type) {
    raw = raw.trim();
    if (type === "number" && raw.endsWith("%")) {
      const value = raw.slice(0, -1);
      return decimalNumber(value, -2) ?? raw;
    }
    const decimal = decimalNumber(raw);
    if (decimal === void 0) return raw;
    if (type === "length") return `${decimal}px`;
    if (type === "angle") return `${decimal}deg`;
    if (type === "number") return decimal;
    return raw;
  }
  function tweenValue2(key, raw, warn, label = key) {
    const spec = TWEEN_PROPERTIES[key].spec;
    const value = withImpliedUnit(raw, spec.type);
    const reason = slotProblem(key, value);
    const result = reason ? { ok: false, reason, value } : validate(value, spec);
    if (!result.ok) {
      warn(`parameter "${label}": ${result.reason} \u2014 got "${raw}", using default "${spec.default}"`);
      return void 0;
    }
    return result.value;
  }
  function slotProblem(key, value) {
    if (/^(?:inherit|initial|unset|revert|revert-layer)$/i.test(value)) return "CSS-wide keyword cannot be passed through a tween custom property";
    if ((key === "z" || key === "blur") && value.includes("%")) return "expected a length without percentages";
    if (key === "blur" && Number.parseFloat(value) < 0) return "blur must be non-negative";
    return void 0;
  }

  // src/effects/tween/waypoints.ts
  var MAX_WAYPOINTS = 5;
  var MIN_WAYPOINTS = 2;
  function readWaypoints(raw) {
    const values = [];
    let start = 0;
    let depth = 0;
    let i = 0;
    while (i < raw.length) {
      const char = raw[i];
      if (char === '"' || char === "'") i = quotedEnd(raw, i);
      else if (char === "(") depth++;
      else if (char === ")") depth = Math.max(0, depth - 1);
      else if (char === "," && depth === 0) {
        values.push(raw.slice(start, i).trim());
        start = i + 1;
      }
      i++;
    }
    values.push(raw.slice(start).trim());
    return values;
  }
  function quotedEnd(raw, start) {
    for (let i = start + 1; i < raw.length; i++) {
      if (raw[i] === "\\") i++;
      else if (raw[i] === raw[start]) return i;
    }
    return raw.length;
  }
  function padToCount(group, keys, count, warn) {
    for (const [key, values] of keys) {
      if (values.length === count) continue;
      const last = values.at(-1);
      if (values.length >= MIN_WAYPOINTS) {
        warn(
          `"${key}" has ${String(values.length)} waypoints and another "${group}" property has ${String(count)} \u2014 they share one keyframe block, so "${key}" holds at "${last}" for the rest`
        );
      }
      while (values.length < count) values.push(last);
    }
  }
  function clampCount(key, values, warn) {
    if (values.length <= MAX_WAYPOINTS) return values;
    warn(
      `"${key}" has ${String(values.length)} waypoints \u2014 at most ${String(MAX_WAYPOINTS)} are supported, so the animation now ends at "${values[MAX_WAYPOINTS - 1] ?? ""}"`
    );
    return values.slice(0, MAX_WAYPOINTS);
  }
  function collectWaypoints(authored, warn) {
    const byGroup = /* @__PURE__ */ new Map();
    for (const [key, raw] of authored) {
      if (raw.length < MIN_WAYPOINTS) continue;
      const property2 = Object.hasOwn(TWEEN_PROPERTIES, key) ? TWEEN_PROPERTIES[key] : void 0;
      if (!property2) continue;
      const values = clampCount(key, raw, warn).map(
        (value) => withImpliedUnit(value.trim(), property2.spec.type)
      );
      const group = byGroup.get(property2.group) ?? { count: 0, keys: /* @__PURE__ */ new Map() };
      group.keys.set(key, values);
      group.count = Math.max(group.count, values.length);
      byGroup.set(property2.group, group);
    }
    for (const [group, waypoints] of byGroup) padToCount(group, waypoints.keys, waypoints.count, warn);
    return byGroup;
  }
  function expandWaypoints(waypoints, params, schema, warn) {
    for (const [key, values] of waypoints.keys) {
      if (!Object.hasOwn(TWEEN_PROPERTIES, key)) continue;
      const spec = TWEEN_PROPERTIES[key].spec;
      for (const [index, value] of values.entries()) {
        const step = index + 1;
        const label = `${key}[${String(step)}]`;
        const accepted = tweenValue2(key, value, warn, label);
        if (accepted === void 0) continue;
        params[label] = accepted;
        schema[label] = waypointSpec(spec, key, step);
      }
    }
  }
  function waypointSpec(spec, key, step) {
    return { ...spec, cssProperty: `--kui-tween-${key}-${String(step)}` };
  }
  function waypointKeyframes(group, count) {
    return `kui-tween-keys${String(count)}-${group}`;
  }

  // src/effects/tween/index.ts
  var TWEEN_TIMELINES = ["time", "view", "scroll", "pin"];
  function warnZeroScale(name, starts, warn) {
    const zero = ["scale-x", "scale-y"].filter((key) => Number(starts[key] ?? starts.scale ?? "1") === 0);
    if (zero.length === 0) return;
    warn(
      `"${name}" starts with no box area on ${zero.join(", ")}, which can prevent on:enter activation depending on its geometry \u2014 use a small non-zero scale, or on:load`
    );
  }
  function startStates(direction, values, params) {
    const starts = {};
    const explicit = new Set(values.filter(([, list]) => list.length > 1).map(([key]) => TWEEN_PROPERTIES[key].group));
    for (const [key] of values) {
      if (direction === "from" || explicit.has(TWEEN_PROPERTIES[key].group)) {
        if (params[key] !== void 0) starts[key] = params[key];
      }
    }
    return starts;
  }
  function buildVariant(direction, spec, warn) {
    const params = /* @__PURE__ */ Object.create(null);
    const values = authoredValues(spec, params, warn);
    const groups = new Set(values.map(([key]) => TWEEN_PROPERTIES[key].group));
    const touched = TWEEN_GROUP_ORDER.filter((group) => groups.has(group));
    if (touched.length === 0) {
      warn(
        `"${spec.name}" names no properties to animate \u2014 add at least one, e.g. "${spec.name} x:100" (known: ${Object.keys(TWEEN_PROPERTIES).join(", ")})`
      );
      return { channels: [], keyframes: [], params };
    }
    warnZeroScale(spec.name, startStates(direction, values, params), warn);
    const waypoints = collectWaypoints(values, warn);
    const schema = {};
    for (const group of waypoints.values()) expandWaypoints(group, params, schema, warn);
    for (const group of touched) {
      const key = `${group}[ease]`;
      const easing = groupEasing(direction, spec, group);
      params[key] = easing.value;
      schema[key] = easing.schema;
    }
    const variant = {
      channels: touched.map((group) => TWEEN_GROUP_CHANNELS[group]),
      keyframes: touched.map((group) => keyframesFor2(group, direction, waypoints.get(group))),
      params,
      schema
    };
    return variant;
  }
  function authoredValues(spec, params, warn) {
    const values = [];
    for (const [key, raw] of Object.entries(spec.params)) {
      const property2 = Object.hasOwn(TWEEN_PROPERTIES, key) ? TWEEN_PROPERTIES[key] : void 0;
      if (!property2) {
        params[key] = raw;
        continue;
      }
      const list = readWaypoints(raw);
      values.push([key, list]);
      const accepted = tweenValue2(key, list[0], warn);
      if (accepted !== void 0) params[key] = accepted;
    }
    return values;
  }
  function groupEasing(direction, spec, group) {
    const id = direction === "from" ? "tween-from" : "tween";
    const fallback = `var(--kui-${id}-ease, ease-out)`;
    const cssProperty = `--kui-tween-${group}-default-ease`;
    if (spec.easing) {
      return { value: spec.easing, schema: { type: "easing", default: fallback, cssProperty } };
    }
    return {
      value: fallback,
      schema: { type: "keyword", default: fallback, keywords: [fallback], cssProperty }
    };
  }
  function keyframesFor2(group, direction, waypoints) {
    return waypoints ? waypointKeyframes(group, waypoints.count) : `kui-tween-${direction}-${group}`;
  }
  function tweenPrimitive(id, direction) {
    return {
      ...cssPrimitive(id, [], {
        timelines: TWEEN_TIMELINES,
        parameters: TWEEN_SCHEMA,
        perfClass: "paint"
      }),
      variantFor: (spec, warn) => buildVariant(direction, spec, warn)
    };
  }
  var TWEEN_PRIMITIVES = [
    tweenPrimitive("tween", "to"),
    tweenPrimitive("tween-from", "from")
  ];
  var TWEEN_PRESETS = [
    { name: "tween", primitive: "tween" },
    { name: "tween-from", primitive: "tween-from", cloak: true }
  ];
  function registerTween(registry) {
    return registry.registerPrimitives(TWEEN_PRIMITIVES).registerPresets(TWEEN_PRESETS);
  }

  // src/effects/catalog/view-transitions.ts
  var CUSTOM_IDENT = /^-?[A-Za-z_][\w-]*$/;
  var NON_NAMES = /* @__PURE__ */ new Set(["none", "match-element"]);
  function resolveTransitionName(el, params, warn) {
    const authored = params.text("name", "auto").trim();
    if (authored === "auto") {
      const id = el.id;
      if (!id) {
        warn(
          "page-morph needs a name to morph *to*: give this element an id (and the same id to its counterpart on the other view), or write name:something explicitly"
        );
        return void 0;
      }
      return CUSTOM_IDENT.test(id) ? id : warnRejected(id, warn);
    }
    if (NON_NAMES.has(authored)) {
      warn(`page-morph name:${authored} is a keyword, not a name \u2014 omit the effect instead`);
      return void 0;
    }
    return CUSTOM_IDENT.test(authored) ? authored : warnRejected(authored, warn);
  }
  function warnRejected(value, warn) {
    warn(
      `page-morph cannot use "${value}" as a view-transition-name \u2014 it must be a CSS identifier (a letter or underscore, then letters, digits, hyphens or underscores)`
    );
    return void 0;
  }
  function prepareViewMorph(el, params, ctx) {
    if (!ctx.capabilities.viewTransitions) {
      ctx.warn(
        "this browser has no View Transitions API, so page-morph will not morph \u2014 the navigation or state change still happens, it just cuts instead of animating"
      );
      return () => {
      };
    }
    const name = resolveTransitionName(el, params, ctx.warn);
    if (name === void 0) return () => {
    };
    ctx.style.set("view-transition-name", name);
    return () => {
    };
  }
  var VIEW_MORPH = {
    id: "view-morph",
    renderer: "javascript",
    /**
     * Named after the one property it writes, the way `transform-origin` is (`three-d/index.ts`).
     * Deliberately *not* the same channel as `view-swap` below: a card that is both the thing you
     * click and the thing that morphs is the headline use case, so `data-kui="page-morph,
     * view-swap"` on one element has to compose.
     */
    channels: ["view-transition-name"],
    parameters: {
      name: { type: "text", default: "auto", cssProperty: "--kui-view-transition-name" }
    },
    supportedTimelines: ["time"],
    /*
     * No `enter`. The morph's start moment is a navigation or a `view-swap`, not this element
     * scrolling into view — an `on:enter` here would leave every off-screen half of a pair unnamed,
     * which is not a slower morph but no morph at all. `activation.ts` warns by name for it.
     */
    supportedActivations: ["load", "manual"],
    defaultActivation: "load",
    perfClass: "compositor",
    /*
     * `disable`, not `shorten`. A shared-element morph flies a card across the viewport, which is
     * exactly the large-area travel a reduced-motion request is about — and unlike the discrete
     * open/close family, refusing it strands nothing: an unnamed element simply is not part of the
     * transition, so the page still navigates and still swaps, it just cuts. There is no state left
     * half-applied and nothing for the author to work around.
     */
    reducedMotion: "disable",
    prepare: withTimingContract(
      "view-morph",
      {
        // No `honours` list at all — see the note in `view-transitions.css` on `--kui-vt-duration`.
        because: "the ::view-transition pseudo-elements hang off the document root, not off this element, so no per-element value can reach them \u2014 set --kui-vt-duration/-delay/-ease on :root instead"
      },
      deferPrepare(prepareViewMorph)
    )
  };
  function resolveSwapTarget(el, params, ctx) {
    const selector = params.text("controls", "").trim();
    if (selector) {
      const found2 = ctx.doc.querySelector(selector);
      if (found2) return found2;
      ctx.warn(`view-swap controls:${selector} matched nothing \u2014 the click will do nothing`);
      return void 0;
    }
    const controls = el.getAttribute("aria-controls");
    const found = controls ? ctx.doc.getElementById(controls) : null;
    if (found) return found;
    ctx.warn(
      "view-swap has nothing to swap: give this control an aria-controls pointing at the element whose state changes, or name it with controls:#selector"
    );
    return void 0;
  }
  function supportsTransitionTypes(win) {
    const ctor = win.ViewTransition;
    const proto = ctor?.prototype;
    return typeof proto === "object" && proto !== null && "types" in proto;
  }
  function usableType(authored, ctx) {
    if (!authored) return "";
    if (!ctx.capabilities.viewTransitions) return "";
    if (supportsTransitionTypes(ctx.win)) return authored;
    ctx.warn(
      `view-swap type:${authored} needs View Transition types, which this browser's View Transitions API predates \u2014 the swap still animates, with the browser's default cross-fade instead of the motion this type names`
    );
    return "";
  }
  function runSwap(update, type, ctx) {
    const start = ctx.doc.startViewTransition;
    if (!ctx.capabilities.viewTransitions || typeof start !== "function" || ctx.reducedMotion) {
      update();
      return;
    }
    if (type) start.call(ctx.doc, { update, types: [type] });
    else start.call(ctx.doc, update);
  }
  function prepareViewSwap(el, params, ctx) {
    const target = resolveSwapTarget(el, params, ctx);
    if (!target) return () => {
    };
    if (!ctx.capabilities.viewTransitions) {
      ctx.warn(
        "this browser has no View Transitions API, so view-swap will not animate \u2014 the state change still happens, it just cuts"
      );
    }
    const attribute = params.text("attribute", "data-open").trim() || "data-open";
    const type = usableType(params.text("type", "").trim(), ctx);
    const delay = effectDelayMs(params);
    const flip = () => {
      const open = target.hasAttribute(attribute);
      if (open) target.removeAttribute(attribute);
      else target.setAttribute(attribute, "");
      if (el.hasAttribute("aria-expanded")) el.setAttribute("aria-expanded", String(!open));
    };
    const pendingSwaps = /* @__PURE__ */ new Set();
    const onClick = () => {
      if (delay <= 0) {
        runSwap(flip, type, ctx);
        return;
      }
      const handle = ctx.win.setTimeout(() => {
        pendingSwaps.delete(handle);
        runSwap(flip, type, ctx);
      }, delay);
      pendingSwaps.add(handle);
    };
    el.addEventListener("click", onClick, { signal: ctx.signal });
    return () => {
      for (const handle of pendingSwaps) ctx.win.clearTimeout(handle);
      pendingSwaps.clear();
    };
  }
  var VIEW_SWAP = {
    id: "view-swap",
    /** Its own channel — see `view-morph`'s, above, for why the two are not the same one. */
    channels: ["view-transition-run"],
    renderer: "javascript",
    parameters: {
      /*
       * `controls:`, not `target:`. `target:` has one meaning across this library — relocate the
       * effect onto an inner element, because the library owns the structure — and this parameter
       * means the opposite: the effect stays on the control, and this names a *different* element
       * somewhere else in the document whose state changes. Reusing the word would make
       * `target:#panel` mean "move the click handler onto #panel", which is not what any author
       * writing it would expect.
       */
      controls: { type: "text", default: "", cssProperty: "--kui-view-swap-controls" },
      attribute: { type: "text", default: "data-open", cssProperty: "--kui-view-swap-attribute" },
      /*
       * The view-transition *type* this swap runs under, which is what selects the motion in
       * `view-transitions.css` — and the same word the author puts in their `@view-transition`
       * rule for the cross-document half. One vocabulary for both halves is the point: `type:
       * kui-page-slide` here and `types: kui-page-slide` there animate identically.
       */
      type: { type: "text", default: "", cssProperty: "--kui-view-swap-type" },
      ...TRIGGER_DELAY_PARAM
    },
    supportedTimelines: ["time"],
    supportedActivations: ["load", "manual"],
    defaultActivation: "load",
    /* The update repaints the page and the browser re-lays it out to capture the new state. */
    perfClass: "layout",
    /*
     * `shorten`, and emphatically not `disable`. `disable` means `activate()` is never called, so
     * the listener is never installed, so the panel this control opens never opens — a reduced-motion
     * user would get a dead button. The reduction happens inside `runSwap` instead, which skips the
     * transition and applies the state change directly: the page still works, it just cuts.
     */
    reducedMotion: "shorten",
    prepare: withTimingContract(
      "view-swap",
      {
        honours: ["delay"],
        because: "it starts a transition the browser then owns \u2014 the duration and curve live on the ::view-transition pseudo-elements at :root, not on this control"
      },
      deferPrepare(prepareViewSwap)
    )
  };
  var VIEW_TRANSITION_PRIMITIVES = [VIEW_MORPH, VIEW_SWAP];
  var VIEW_TRANSITION_PRESETS = [
    /*
     * `page-morph` has been documented as planned in `docs/catalog.md` §L since long before it
     * existed, described there as "a View Transitions shared-element handoff; it degrades to
     * page-fade where unsupported". That is exactly what this is, so it keeps the name rather than
     * shipping a synonym beside a permanently-planned row.
     */
    { name: "page-morph", primitive: "view-morph" },
    { name: "view-swap", primitive: "view-swap", phase: "state" }
  ];
  function registerViewTransitions(registry) {
    return registry.registerPrimitives(VIEW_TRANSITION_PRIMITIVES).registerPresets(VIEW_TRANSITION_PRESETS);
  }

  // src/effects/index.ts
  function createRegistry() {
    const registry = new Registry();
    registerCore(registry);
    registerScrollMechanics(registry);
    registerLayout(registry);
    registerSvg(registry);
    registerMotionPath(registry);
    registerGestures(registry);
    registerThreeD(registry);
    registerCarousel(registry);
    registerCatalog(registry);
    registerNavigation(registry);
    registerForms(registry);
    registerTween(registry);
    registerViewTransitions(registry);
    return registry;
  }

  // src/index.ts
  function kuinetic(options = {}) {
    return new Animator({ registry: createRegistry(), ...options });
  }
  var src_default = kuinetic;
  return __toCommonJS(src_exports);
})();
