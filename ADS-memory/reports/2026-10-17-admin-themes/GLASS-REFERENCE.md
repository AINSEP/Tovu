# Glassmorphic admin theme — owner reference (10-17 ~21:00)
Owner shared a screenshot ("can you use this for the glassmorphic?") — a planner/todo app UI. Use it as THE look target for the Glassmorphic theme. Description (the image itself isn't on disk):

- **Overall:** light, cool, frosted. Calm and airy, low contrast between surfaces; depth comes from blur, soft shadows and white edge highlights, not borders.
- **App background:** soft blue-grey gradient behind everything (~#9fb2c1 at the edges → ~#e6edf2 centre), with a large blurred white glow top-left. The blur needs this coloured layer behind the panels to show.
- **Shell:** a big rounded window (radius ~28–32px) on that background; a white 1px inner highlight on its top/left edge.
- **Sidebar rail:** narrow vertical rail, a slightly lighter frosted strip (white ~55–65% alpha), thin-stroke outline icons (~1.5px, slate grey). Active item = solid DARK NAVY rounded square (~#141a2e, radius ~14px) with a white icon (top one); a hovered/selected item = pale grey-blue rounded square (~#dfe6ec).
- **Panels/columns ("Planner", "Todo's"):** large frosted cards, white ~35–45% alpha over the gradient, backdrop blur ~20–30px, radius ~24px, no visible border except a faint white top highlight; very soft, wide drop shadow (blue-grey, low alpha).
- **Raised cards (clock, calendar):** brighter frosted white (~70–80% alpha), radius ~22px, a crisp 1px white inner border, a soft diffuse shadow below (e.g. 0 12px 32px rgba(70,90,110,.18)) — they float above the panel.
- **List rows:** selected row = brighter frosted white pill (radius ~12px) with a VERY subtle diagonal hatch texture; unselected rows transparent. Input row ("Add todo…") = faint frosted field with a thin light border.
- **Chips/badges:** small grey-blue rounded rectangles (~#dde4ea) with dark text for counts ("2"); zero counts in muted grey on a paler chip. Inline tags ("HI-1") = white pill with a hairline border.
- **Accent:** NOT orange. Primary = dark navy/near-black (~#141a2e) for active nav, today's date cell, clock hands. A secondary state uses pale grey (#d5dde3) (e.g. the "19" date).
- **Text:** headings dark slate (~#1c2230), semibold; body slate (~#2b3242); muted labels cool grey (~#6b7684). Font = a neutral grotesk like Inter (open licence, self-host woff2).
- **Shadows/edges:** everything soft; no hard 1px grey borders. Hairline separators, if any, are white at low alpha.
- **Dark scheme:** not shown; derive it as a deep blue-slate gradient with dark frosted panels (black ~30–40% alpha), the same white edge highlights at low alpha, and a light accent swapped from the navy.

Implications to resolve in the build:
- The owner's saved accent (#d97706, orange) currently overrides a theme's primary (themepicker leftover). Glass needs its navy primary → the accent override must only apply when the user picked an accent for this theme, or the theme sets primary and the Accent picker shows the theme default.
- The 10 data-theme="light" pinned screens and the chat pane must still look frosted, not cream/flat.
- Provide a prefers-reduced-transparency fallback (solid surfaces), and keep text contrast at WCAG AA on frosted surfaces.

## Reference 2 (owner, ~21:05): BACKGROUND IMAGE seen through the frost — owner: "a great one"
File: glass-reference-2-background.jpg (this folder; a browser start page).
- **Key idea:** a soft, misty, desaturated landscape photo (pale fog, blue-grey mountains, a lake) fills the app background; every panel is frosted glass over it, so the image shows through, blurred. This is what makes glass read as glass. Ship the theme WITH a background image layer (token e.g. --jini-app-bg: image + gradient fallback).
- **Image licence:** don't ship the reference photo. Use an open-licence photo (Unsplash/Pexels licence, or CC0) of a misty mountain lake in the same pale palette, or generate one; compress it (webp/avif, ~200–400 KB, 2560px wide); record source + licence in the theme folder.
- **Panels:** white ~45–60% alpha, blur ~24px, radius ~20px, a 1px white ~60% border, soft shadow. Rows inside panels = slightly brighter frosted pills (radius ~10px). Small buttons ("View all", "Edit", "+ Add") = white frosted pills with hairline borders.
- **Sidebar:** a floating frosted rail with rounded ends, detached from the window edge; active item = dark navy rounded square with a white icon (same as ref 1). Top-right icon cluster = a frosted pill.
- **Type:** big thin numerals for hero numbers (clock), light-weight grotesk; text dark navy/slate; muted grey secondary.
- **Readability:** text sits on the frosted layer, never directly on the photo; keep AA contrast. Reduced-transparency fallback = solid pale panels + the photo dimmed.
