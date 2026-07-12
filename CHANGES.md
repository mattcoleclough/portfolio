# Site review & fixes — July 2026

A log of everything changed in this pass, grouped by why it was changed. Nothing here
alters the design on the devices the site was built for (laptop / iPhone portrait);
the goal was reliability on everything else, plus performance.

## 1. JavaScript crashes (main.js)

`main.js` loads as `<script type="module">`, which runs in **strict mode**: assigning to
an undeclared variable throws a `ReferenceError` instead of silently creating a global.
Four bugs of this kind were live:

- **`dragStartX` typo.** Declared as `dragstartX` (lowercase s) but used as `dragStartX`.
  Every mousedown/touchstart on a film strip threw. Effect: desktop drag-to-scroll and the
  fling/inertia physics never worked (mouse-wheel scrolling masked this on laptops), and on
  touch the handler died mid-setup. Fixed the declaration.
- **`touchScrollTargetPx` out of scope in the `mixed_touch` branch** of
  `calculateDynamicLayoutAndScroll`. On landscape phones and portrait tablets the whole
  layout recalculation crashed, so margins, scroll targets and title positions were never
  applied — the main cause of the broken layouts on sizes you didn't develop on. Fixed by
  declaring it in that branch, and made the branch a plain `else` so the function can never
  return `undefined` for an unrecognised layout mode.
- **`scrollCorrectionTimeout` / `checkAndCorrectScrollPosition` out of scope.** The
  touchstart/touchend handlers near the top of the file referenced these, but they were
  declared inside a block near the bottom — every touch on the page threw, and the
  "soft scroll-back" correction never ran. Moved the declarations (and the headroom
  constants) up to the shared scope.

Other logic bugs fixed:

- **Resize scroll-position restore was dead.** Progress was saved into a Map keyed by
  `container` but read back keyed by `module` (and then written to `module.scrollLeft`,
  which does nothing). Film strips now keep their scroll position through resize/rotation.
- **Fullscreen button: `else` without braces.** Only the first `if` belonged to the
  desktop branch; the rest of the desktop fullscreen code also ran on touch devices,
  fighting the Vimeo-API path. Braced properly.
- **`updateParallaxTitles`** used `title`/`year` before its null-check; the guard now runs
  first.
- Removed duplicate `mouseenter`/`mouseleave` listeners (attached once in
  `setupFilmScrollModule` and again in a later loop).
- Removed a no-op `setTimeout(500)` (setTimeout with no callback) in the tap listener.

## 2. Invalid / dead CSS (style.css)

- **`font-weight: light` is not a valid value.** CORRECTED AFTER A REGRESSION: the first
  fix mapped body text to the Light cut at weight 300, which broke two things at once —
  browsers style `<b>`/`<strong>` as `font-weight: bolder`, which is *relative*, and
  bolder(300) is only 400, so all bold text (including the `<strong>`-wrapped apostrophes,
  which exist specifically to borrow the Bold cut's apostrophe glyph) silently rendered
  in the Regular/Light cuts, whose straight-apostrophe glyphs have very wide side
  bearings (Light ~4x wider than Bold). FINAL state (matches the live site, confirmed
  against screenshots): Light registered at `300 400` so all body text renders in the
  Light cut (as the live site accidentally did); Bold at 700; Regular unregistered
  (file kept in ASSETS); all inline weights say `normal` — never 300 — so
  bolder(400)=700 still reaches the Bold cut for <b> text and the <strong>-wrapped
  apostrophes. See the warning comment above the @font-face rules.
- **Scroll-edge shadows are disabled** by `display: none` on the wrapper pseudo-elements,
  though the JS still toggles the classes. Left disabled (as found), removed the invalid
  `display: hidden` overrides, and added a comment marking the two lines to delete if you
  want to re-enable them (to be tested separately).
- Removed dead rules that matched nothing:
  `.films-section-wrapper` (real ids are `#films-section-wrapper-moduleN`),
  `#filmsimage-3-moduleN` (real ids are `#films-image-3-moduleN`),
  `#contact-content-wrapper` (element doesn't exist),
  `#about-text-container p { font-weight: light }` (invalid value, no-op),
  `#initial-buffer { size: 0rem }` (`size` isn't a CSS property).
  All were no-ops, so removing them changes nothing; notes in the CSS say what to target
  if you ever want the intended effects.
- `align-items: left` → `align-items: flex-start` (was invalid, and with the current
  full-width children this renders the same).
- Added `overflow-x: hidden` to `#main-content-wrapper` to guard against accidental
  horizontal panning from sub-pixel rounding.

## 3. HTML validity (index.html)

- `#video-placeholder-div` was never closed — added the missing `</div>` (browsers were
  auto-repairing it).
- The two favicon `<link>` tags sat outside `</head>`; moved into the head.
- Added a `<meta name="description">`.
- Added `defer` to the Vimeo player script so it no longer blocks page parsing
  (it still executes before `main.js` needs it).
- Fixed duplicate id: the second image in the Scene 18 strip was also
  `films-image-1-module2`; now `films-image-2-module2`. Side effect: on phone/tablet it
  now gets the same margin as the second image in every other module (it was accidentally
  matching the first-image margin rule).
- Corrected alt text: every still said "A still from the film Inhibition" — Scene 18,
  Cheese Story and Everything Goes stills now name the right film.
- Added `loading="lazy" decoding="async"` to all stills except the first Inhibition one.
- Removed the commented-out `<img ... .png>` blocks (superseded by the `<picture>` tags).

## 4. Performance / repo hygiene

- **Deleted 157 MB of PNG stills** from `ASSETS/Stills/`. They were referenced only from
  commented-out markup; the site serves the .webp (with .jpg fallback). Repo went from
  ~186 MB to ~19 MB. Keep the PNG masters somewhere outside the repo.
- **Instagram.svg was 10.9 MB** — it embeds a 2500×2500 PNG as base64, loaded on every
  page view for an icon displayed at ~54px. Downscaled the embedded bitmap to 512×512
  (visually identical at icon size): now 273 KB. If you have the real vector Instagram
  glyph, swapping it in would be even better.
- Deleted committed `.DS_Store` files and added `.DS_Store` to `.gitignore`.
- Updated the stale template comment in `vite.config.js` (`base: '/'` is correct for the
  custom domain).

## 5. Things investigated but deliberately NOT changed

- **Root font-size clamp.** I recommended this initially, then checked the numbers:
  your container is 435.6rem and the root font is 0.229568411vw — 435.6 × 0.229568411
  ≈ 100vw exactly, so the layout is perfectly proportional and text is always the same
  fraction of the window width (never disproportionately small). Any px floor would make
  the content wider than the window and cause horizontal overflow. Skipped; the
  `overflow-x: hidden` guard above covers the rounding edge case.
- **`-webkit-text-size-adjust: 221% / 120%`** in the media queries is load-bearing for
  your mobile text sizes — left exactly as is.
- The 400rem `#initial-buffer` intro-scroll mechanism — untouched.

## 6. Intro rework: scroll-in reveal + desktop soft lock (second pass)

Replaced the long white fade with the scroll-in intro:

- **Load sequence now:** the white overlay drops quickly (0.5s fade — seamless, since the
  buffer beneath is also white), then the page scrolls the composition in from the bottom
  over 1.6s. `#scroll-overlay` (which existed in the HTML but was never used) blocks
  scroll/touch input during the animation, then the soft locks take over.
- **Start position:** on first layout the page positions up to one viewport above the
  final composition (`finalScrollTargetY - window.innerHeight`, floored at 0), so the
  video rises in from the bottom edge. On phones the white buffer above the video is
  shorter than a viewport, so the reveal distance is smaller there.
- **Desktop soft lock:** the old hard clamp (`scrollTop` snapped instantly, no travel) is
  now a spring — you can pull up to 15rem into the white space, hit a hard stop, and
  ~160ms after input settles it animates back to the composition over 450ms. Mobile
  already had this behaviour (soft/hard headroom); it's unchanged, and works again now
  that the scope crashes are fixed. A guard flag stops the spring re-arming off its own
  scroll events.
- **Less white time (third pass, tightened further):** the intro now starts as soon as
  the DOM and fonts are ready (`document.fonts.ready`) instead of waiting for
  `window.load` — which was the real culprit: the Vimeo iframe src is set early, so
  `load` waited for the entire embedded player page. The Vimeo-readiness gate on the
  intro was removed entirely (the video is off-screen when movement starts and gets the
  whole scroll-in as loading time). Overlay fade 2.5s → 0.3s; `window.load` and a 2s
  timer remain as fallbacks. Spring timings tightened: settle delay 160ms → 80ms,
  spring return 450ms → 350ms, intro 1.6s → 1.4s.
- **`prefers-reduced-motion`** users skip the animation and land directly on the
  composition.
- Tuning knobs at the top of main.js: `INTRO_SCROLL_DURATION_MS`,
  `DESKTOP_SPRING_ALLOWANCE_REM`, `DESKTOP_SPRING_RETURN_MS`,
  `DESKTOP_SPRING_SETTLE_DELAY_MS`.

## 7. Elastic soft lock + video fade-in (fourth pass)

- **Soft lock reworked as an elastic rubber band.** The previous version clamped
  instantly at the allowance but then debounced the spring on *input*, so trackpad
  inertia deferred the spring for ages while the page sat frozen. Now a non-passive
  `wheel` listener on the scroll wrapper intercepts any gesture that would carry the
  view above the composition and applies it manually with exponential damping —
  the page keeps moving during the pull, approaching the allowance asymptotically,
  and springs back ~80ms after wheel deltas stop. Scrolling down while stretched
  releases the band immediately. The spring animation is cancellable, so fresh input
  always wins. (The old clamp+debounce survives only as a fallback for scroll sources
  the wheel listener can't see, e.g. touch-drag on large tablets in desktop layout.)
- **No more black video box.** `#video-placeholder-div` is now white (invisible
  against the page — only its drop shadow marks the frame) and the iframe starts at
  opacity 0, fading in over 0.8s on Vimeo's first 'play' event. If autoplay is blocked
  (iOS Low Power Mode etc.) a 4s fallback reveals the poster. Fullscreen letterbox
  bars are forced back to black in CSS.
- Firefox line-mode wheel deltas (`deltaMode === 1`) are converted to pixels in the
  interceptor.

## 8a. Final video treatment (supersedes most of section 8)

- The placeholder is a **black card with the design's normal shadow-lg throughout** —
  no white box, no shadow transition, no poster. The iframe stays hidden until Vimeo
  reports real playback progress (first 'timeupdate' past the threshold in main.js),
  so the buffering spinner never shows; the video appears on the black card and its
  own opening fade does the reveal. Blocked autoplay is handled by the getPaused()
  fallback (reveals Vimeo's poster only when the player is sitting paused).
- If the showreel is ever re-exported to fade from white, switch the card back with
  `bg-black` → `bg-white` on #video-placeholder-div in index.html.

## 8. Shadow presence, elasticity parameter (fifth pass; poster removed in sixth)

- **The video frame has presence from the first paint** via a deliberately prominent
  drop shadow that eases back to the design's normal shadow-lg weight (2s) once the
  video is playing. The video reveal is a 0.2s near-cut with exactly ONE trigger for
  normal playback: the first 'timeupdate' past a threshold (playback genuinely
  progressing). 'play' and 'playing' were both removed as reveal triggers — each can
  fire while Vimeo is still buffering, which put the spinner on screen. The
  blocked-autoplay fallback now checks getPaused() (paused = poster showing, safe to
  reveal; not paused = still buffering, stay hidden and re-check) instead of firing
  blind at 4s.
  An oEmbed-thumbnail poster that faded up from white was tried and removed: the
  showreel itself opens with a fade, so poster + video reveal read as up-down-up.
  If autoplay is blocked, a 4s fallback reveals Vimeo's own poster.
- The elastic damping divisor is now `DESKTOP_SPRING_ELASTICITY` (top of main.js).
  Note: with `DESKTOP_SPRING_ALLOWANCE_REM = 0` the soft lock degenerates into a clean
  hard lock (no travel, no spring) — a guard prevents the 0-allowance maths from
  producing NaN. Set the allowance back above 0 any time to get the elastic behaviour.

## 9. Native scrolling rework + Mac resize fix (seventh pass)

The jumpy phone scrolling came from fighting the browser: custom JS touch-dragging on
the film strips, and per-scroll-frame layout reads + scrollTop snaps enforcing the
vertical limit during momentum. Both replaced with native mechanisms:

- **The intro buffer now collapses out of the scrollable area** once the intro lands
  (`collapseIntroBuffer()`): the composition becomes scrollTop 0, so "can't scroll up
  into the white" is enforced by the browser's own top edge — iOS rubber-band bounce
  (the spring, for free) on phones, plain hard edge on desktop. Deleted: the desktop
  wheel interceptor + spring functions + all DESKTOP_SPRING_* constants, the mobile
  hard/soft headroom enforcement, checkAndCorrectScrollPosition, and the touch
  handlers supporting them. The scroll listener now only updates navigation state
  (passive). On resize, any newly-created headroom is folded back into the buffer
  instead of clamping scrollTop.
- **Film strips scroll natively on touch.** The custom touchstart/touchmove drag code
  (with its own fling physics and axis-locking) is gone; overflow-x scrolling gives the
  browser's momentum and axis-locking. Mouse drag-to-scroll on desktop is kept (browsers
  don't drag-scroll with a mouse). Parallax titles/shadows still update via scroll events.
- `overscroll-behavior-y: contain` on the wrapper keeps the edge bounce local (and
  disables Android pull-to-refresh).
- **Mac window-resize chaos fixed:** narrowing a desktop window until it's taller than
  wide flipped `orientation: portrait`, activating the phone/tablet media queries while
  the JS stayed in desktop mode — two layout systems fighting. All mobile media queries
  are now additionally gated on `(hover: none) and (pointer: coarse)` (real touch
  hardware), matching the JS `getLayoutMode()` detection exactly. Desktop windows keep
  desktop CSS at every size (the vw-based scaling handles narrow widths proportionally);
  phones and tablets are unaffected.

## 10. Narrow-window intro snap fix (eighth pass)

On narrow windows the slow intro would play, then snap to a different composition
at the end. Cause: the intro used `customSmoothScroll(finalScrollTargetY, …)`, which
captured the target ONCE at the start of the 4.5s animation. During those 4.5s
`handleLayoutRecalculation()` fires again (window.load, the video height resolving,
fonts) and reassigns `finalScrollTargetY` to a different value — so the animation
eased toward the stale target and `finishIntro` then snapped scrollTop to the new
one. Worst on narrow windows because there `vhRem` is large, selecting the Case-3
layout path whose target depends on the About heading's absolute position, which
shifts most when the video height settles.

Fix: a dedicated `animateIntroScroll()` that tracks the LIVE `finalScrollTargetY`
every frame, with the motion defined as a gap above the target shrinking from
`revealDistance` (one viewport, capped at the target) to 0. However the target moves
mid-intro, the animation follows it and lands exactly on it — no end snap. The old
`customSmoothScroll` is unchanged and still used for the nav-heading click scrolls.

## 11. Phone intro tuning: reveal distance, speed, interruptibility, reload (ninth pass)

Three phone problems fixed:

- **Tiny, slow phone reveal.** The reveal distance was capped at one viewport but was
  really limited by the intro buffer, whose CSS height is in `rem` — and rem scales
  with viewport *width*, so on a phone the 400rem buffer collapses to a fraction of a
  screen. The composition barely moved. Now reveal distance is set per device in
  viewport-heights (`INTRO_DESKTOP` / `INTRO_PHONE` at the top of main.js: phone = 2.2
  viewports), and `ensureIntroHeadroom()` grows the buffer in px so that distance is
  actually available. The phone composition now sweeps fully into frame.
- **Too long before you can navigate.** Phone intro duration cut to 2200ms (from 4500);
  desktop keeps 4500ms. (An interrupt-to-skip gesture was tried and removed — it hurt
  more than it helped; the intro now simply plays through at the set speeds.)
- **Jitter when trying to scroll during the intro.** The `#scroll-overlay` blocked taps
  but not the browser's native touch-scroll of the container, so a finger-scroll fought
  the JS `animateIntroScroll` (both writing scrollTop). Now the container is set
  `overflow-y: hidden` for the duration of the intro — JS can still animate scrollTop,
  but there's no native scroll to fight — and restored when the intro finishes.
- **Reload while scrolled down started the intro from the wrong place.** The browser was
  restoring the previous scroll position and fighting the intro positioning. Set
  `history.scrollRestoration = 'manual'` so the page owns its scroll position on every
  load. Combined with the buffer-growth guarantee, the intro now starts identically
  regardless of where you reloaded from.

Tuning knobs: `INTRO_PHONE` / `INTRO_DESKTOP` (`revealViewports`, `durationMs`) at the
top of main.js.

## 12. Known issues left for you

- The **Instagram social icon links to `href="#"`** (a dead link that opens a new tab).
  Add the real profile URL or remove the icon.
- Scroll-edge shadows: still disabled; see the comment in style.css to re-enable and test.
- One typo in the About text: "what is is like" (presumably "what it is like").
- The .jpg fallbacks for stills are 0.5–1.2 MB each; they're only served to browsers
  without WebP support (very rare now), so low priority.
- JS layout modes are detected by pointer type while CSS uses width/orientation media
  queries, so a mouse-driven window at phone width gets phone CSS with desktop JS.
  Harmless in the cases I traced (the JS crash that used to accompany it is fixed), but
  worth knowing about if you ever see oddness in very narrow desktop windows.
