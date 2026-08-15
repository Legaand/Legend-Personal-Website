/* ============================================================
   Non-GSAP helpers: scroll progress, nav state, the section rail,
   and the trailing cursor.

   This file runs before animations.js and owns the *resting* state.
   The rail markup lives in index.html and is face-up and legible by
   default, so it works as a nav with no JS at all; all this file adds
   is which card is current. animations.js layers the dealt stack and
   the flip on top, and never on the critical path to readability.
   ============================================================ */

(function () {
    'use strict';

    // ---- scroll progress + sticky nav border ------------------------------
    const progress = document.getElementById('progress');
    const nav = document.getElementById('nav');
    const spine = document.querySelector('.rail-spine i');
    let ticking = false;

    function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            const doc = document.documentElement;
            const max = doc.scrollHeight - doc.clientHeight;
            if (progress) {
                progress.style.transform = 'scaleX(' + (max > 0 ? window.scrollY / max : 0) + ')';
            }
            if (nav) nav.classList.toggle('stuck', window.scrollY > 40);
            if (spine) spine.style.height = (max > 0 ? (window.scrollY / max) * 100 : 0) + '%';
            setActive(currentSection());
            ticking = false;
        });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    // ---- letter-roll hover -------------------------------------------------
    // Each character is stacked twice inside an overflow-hidden box; on hover
    // the pair rolls up one character-height so the twin takes its place,
    // staggered left to right. The rolled copy is aria-hidden and a plain
    // visually-hidden label carries the real text, or a screen reader would
    // announce "VVIISSIITT".
    function rollify(el) {
        const textNodes = Array.from(el.childNodes).filter((n) => n.nodeType === 3);
        const text = textNodes.map((n) => n.textContent).join('').trim();
        if (!text || el.querySelector('.roll')) return;

        const sr = document.createElement('span');
        sr.className = 'sr-only';
        sr.textContent = text;

        const roll = document.createElement('span');
        roll.className = 'roll';
        roll.setAttribute('aria-hidden', 'true');

        Array.from(text).forEach((ch, i) => {
            const slot = document.createElement('span');
            slot.className = 'roll-i';
            const a = document.createElement('span');
            const b = document.createElement('span');
            a.textContent = ch === ' ' ? '\u00a0' : ch;
            b.textContent = a.textContent;
            // the stagger is what makes it read as a roll rather than a jump
            a.style.transitionDelay = b.style.transitionDelay = (i * 18) + 'ms';
            slot.append(a, b);
            roll.appendChild(slot);
        });

        textNodes.forEach((n) => n.remove());
        el.prepend(roll);
        el.prepend(sr);
    }

    document.querySelectorAll('.btn, .nav-links a').forEach(rollify);

    // ---- the cord: swaps the site between the show and the plain version ----
    // Lives here rather than in the motion layer because the swap must work
    // with no GSAP and under reduced motion — only the flourish is motion.
    (function cord() {
        const cordEl = document.getElementById('cord');
        if (!cordEl) return;
        cordEl.hidden = false;   // hidden in markup so no-JS never sees a dead control

        // The cord hangs off the top bar wherever that bar is visible, so it
        // has to know the bar's real height — a guessed offset leaves the rope
        // floating in a gap below it.
        const navEl = document.getElementById('nav');
        function measureNav() {
            if (!navEl) return;
            const h = Math.round(navEl.getBoundingClientRect().height);
            if (h) document.documentElement.style.setProperty('--nav-h', h + 'px');
        }
        measureNav();
        window.addEventListener('resize', measureNav);
        // the bar is display:none in show mode, so it measures 0 there; re-measure
        // after any mode change and once fonts have settled the bar's height
        window.addEventListener('load', measureNav);

        const KEY = 'ly-plain';
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const gsapOK = !!window.gsap;
        let busy = false;

        function label(plain) {
            cordEl.setAttribute('aria-pressed', plain ? 'true' : 'false');
            cordEl.setAttribute('aria-label', plain
                ? 'Pull the cord to return to the card version of this site'
                : 'Pull the cord for the plain version of this site');
        }

        function apply(plain) {
            document.body.classList.toggle('plain', plain);
            measureNav();          // the bar's visibility changes with the mode
            label(plain);
            try { localStorage.setItem(KEY, plain ? '1' : '0'); } catch (e) { /* private mode */ }
            // the rail and drift are display:none in plain mode, so every
            // cached trigger position is stale the moment the class flips
            if (window.ScrollTrigger) window.ScrollTrigger.refresh();
            // Bringing the rail back: hold the cards off the left edge from
            // inside the transition, so the new view is snapshotted on an
            // empty column and swap() can deal them in as the wave passes. A
            // rail that is simply there reads as a panel being toggled.
            if (!plain && window.railArm) window.railArm();
        }

        /* Plain is the default and ships on <body> in the markup, so the only
           thing to restore here is an explicit opt-in to the show. Anything
           other than a stored '0' — never pulled, storage blocked — stays
           plain, which is the state the page already painted. */
        try { if (localStorage.getItem(KEY) === '0') apply(false); } catch (e) {}
        label(document.body.classList.contains('plain'));

        /* Every region named in the stylesheet, and the element it is on.
           The rail and the index share a name deliberately — only one of them
           is ever rendered, so the browser morphs one into the other. */
        const REGIONS = [
            ['hero', '.hero-inner'],
            ['side', '#rail, #index'],
            ['s1',   '#work'],
            ['s2',   '#track'],
            ['s3',   '#stack'],
            ['s4',   '#contact'],
            ['s5',   '#other'],
            ['s6',   '#papers'],
            ['foot', 'footer'],
        ];

        /* Every region gets a delay and a direction, written as CSS variables
           the stylesheet's shared `layer-in`/`layer-out` keyframes read.

           Naming a region takes it out of the root snapshot, so the root mask
           never touches it — measuring the regions here is what makes the
           stagger a wavefront rather than a fixed cascade in DOM order.

           THE TWO DIRECTIONS ARE DIFFERENT TRANSITIONS, on purpose:
             · coming back to the show, the deck is carried the whole width of
               the screen, and `aimSlice()` runs the change along its path
             · leaving for plain, the run just slips off the near edge, so
               there is nothing to follow and `aimCord()` starts the change at
               the cord, where the hand actually is
           Don't unify them. Slicing on the way out was tried and cut: with no
           deck crossing the screen the blade was a bare wipe, a piece of
           motion that pointed at nothing. */

        /* --- leaving: the change spreads from the cord ---------------------
           The original, and the one the pull earns. Distance is normalised by
           the distance from the pull to the farthest corner of the viewport,
           because that is exactly what 100% means inside the mask's
           radial-gradient — so regions turn over as the mask's own edge sweeps
           past them. Measured to a region's NEAREST edge, not its centre, so a
           section taller than the screen starts turning the moment the front
           touches it. */
        function aimCord(ox, oy) {
            const root = document.documentElement;
            const vw = window.innerWidth, vh = window.innerHeight;
            const far = Math.max(
                Math.hypot(ox, oy), Math.hypot(vw - ox, oy),
                Math.hypot(ox, vh - oy), Math.hypot(vw - ox, vh - oy)) || 1;

            root.style.setProperty('--swap-x', (ox / vw) * 100 + '%');
            root.style.setProperty('--swap-y', (oy / vh) * 100 + '%');

            REGIONS.forEach(function (entry) {
                const el = rendered(entry[1]);
                let d = far, dx = 0, dy = 1;
                if (el) {
                    const b = el.getBoundingClientRect();
                    const nx = Math.min(Math.max(ox, b.left), b.right);
                    const ny = Math.min(Math.max(oy, b.top), b.bottom);
                    d = Math.hypot(nx - ox, ny - oy);
                    // direction points away from the pull; a region sitting
                    // under the cord has no direction, so fall back to down
                    const cx = (b.left + b.right) / 2 - ox;
                    const cy = (b.top + b.bottom) / 2 - oy;
                    const m = Math.hypot(cx, cy);
                    if (m > 1) { dx = cx / m; dy = cy / m; }
                }
                const t = Math.min(1, d / far);
                root.style.setProperty('--w-' + entry[0], (0.05 + t * 0.5).toFixed(3) + 's');
                root.style.setProperty('--w-' + entry[0] + '-x', (dx * 26).toFixed(1) + 'px');
                root.style.setProperty('--w-' + entry[0] + '-y', (dy * 26).toFixed(1) + 'px');
            });
        }

        /* A name duplicated across two RENDERED elements aborts the whole
           transition; display:none means not rendered, which offsetParent does
           not reliably tell you. */
        function rendered(sel) {
            let el = null;
            document.querySelectorAll(sel).forEach(function (n) {
                if (n.getClientRects().length) el = n;
            });
            return el;
        }

        /* --- arriving: the change runs along the deck's path ---------------
           The cut is the card. The packet crosses the entire screen to reach
           the rail, scoring a seam across the middle as it goes; the seam then
           opens up and down and the new state spreads out of it. */
        function aimSlice() {
            const root = document.documentElement;
            const vw = window.innerWidth, vh = window.innerHeight;
            const dir = -1;                       // right to left, with the deck
            // no rail (no GSAP, narrow screen): nothing is flying, so the cut
            // goes at its own pace
            const leg = window.railFlight && window.railFlight.carry;
            const span = leg ? leg.dur : 0.9;
            const inv = leg ? leg.inv : function (t) { return t; };
            // the blade's own line, for the vertical half of the ripple: the
            // rail's cards ride the middle of the screen
            const midY = vh / 2;

            /* The cut is raked 14° off square, so "how far along" is a
               projection onto its own axis, not an x-coordinate. `RAKE` is the
               CSS gradient angle below; a CSS angle is measured clockwise from
               straight up, which in screen coordinates (y down) is the unit
               vector (sin A, -cos A). The gradient's 0% sits at the corner
               furthest back along it, and its 100% is the opposite corner —
               vw*|ux| + vh*|uy| away — which is exactly what a percentage in
               the mask means, so a region timed this way turns over as the
               real edge reaches it. */
            const RAKE = 284;
            const a = RAKE * Math.PI / 180;
            const ux = Math.sin(a), uy = -Math.cos(a);
            const sx = ux < 0 ? vw : 0, sy = uy < 0 ? vh : 0;
            const len = vw * Math.abs(ux) + vh * Math.abs(uy) || 1;
            // where along the cut a point sits, 0 (not yet touched) to 1
            const along = function (px, py) {
                return Math.min(1, Math.max(0, ((px - sx) * ux + (py - sy) * uy) / len));
            };

            /* The other half of the mask: the seam opening up and down from
               the middle line. These three numbers ARE the `swap-new`
               keyframes — the seam is held at a hairline until 28% of the
               flight while the deck is still scoring it, then opens from 2% to
               62% of the height either side of centre, on the same easing the
               cards ride. Kept in step by hand because a keyframe's values
               cannot be read back out of the cascade; change one file and you
               must change the other.

               `opens(d)` inverts it: at what fraction of the flight has the
               seam grown far enough to reach something `d` of the viewport's
               height off the middle line? */
            const SPLIT_HOLD = 0.28, SPLIT_MIN = 0.02, SPLIT_MAX = 0.62;
            const opens = function (d) {
                if (d <= SPLIT_MIN) return 0;
                const need = Math.min(1, (d - SPLIT_MIN) / (SPLIT_MAX - SPLIT_MIN));
                return SPLIT_HOLD + (1 - SPLIT_HOLD) * inv(need);
            };

            REGIONS.forEach(function (entry) {
                const key = entry[0];
                const el = rendered(entry[1]);
                let t = 1, dy = 0, off = 0.5;
                if (el) {
                    const b = el.getBoundingClientRect();
                    /* Timed at the middle of the region's VISIBLE part, and
                       nothing else works. The leading edge was the rule while
                       the wave came from the cord — a point source, so a
                       region's near corner was genuinely where it arrived. A
                       cut sweeping sideways reaches every full-width section
                       at the same instant, which timed the whole page at 0.000
                       and collapsed the cascade back into a crossfade. Off the
                       visible middle, the rake does the work instead: the cut
                       leans, so what is high on the screen turns over before
                       what is low, and a section half-scrolled past is timed
                       by the half you can actually see. */
                    const l = Math.max(b.left, 0), r = Math.min(b.right, vw);
                    const tp = Math.max(b.top, 0), bt = Math.min(b.bottom, vh);
                    if (r > l && bt > tp) {
                        t = along((l + r) / 2, (tp + bt) / 2);
                        /* and how far off the middle line it is — measured at
                           its NEAREST edge, because the seam reaches a region
                           the moment it has opened that far, and a region
                           straddling the middle is reached at once. As a
                           fraction of the FULL height, which is what --split's
                           percentages are of (50% ± split). */
                        off = Math.max(0, Math.max(tp - midY, midY - bt)) / vh;
                    } else {
                        t = 1;   // entirely off screen: let it come last
                    }
                    const cy = (b.top + b.bottom) / 2 - midY;
                    dy = Math.max(-1, Math.min(1, cy / (vh / 2)));
                }

                /* A region is uncovered when BOTH masks have got to it — the
                   cut has swept past AND the seam has opened out that far — so
                   its moment is the later of the two. Timing it on the cut
                   alone put the top and bottom of the screen through their
                   layer while the seam was still a hairline across the middle,
                   which is a region animating behind a mask that has not
                   reached it: invisible motion, and then the content simply
                   there when the split arrived. */
                const at = Math.max(inv(t), opens(off)) * span;
                root.style.setProperty('--w-' + key, at.toFixed(3) + 's');
                /* and the ripple runs out of the seam — mostly up and down,
                   away from the line the cards travel on, with a little of the
                   blade's own direction in it */
                root.style.setProperty('--w-' + key + '-x', (dir * 14).toFixed(1) + 'px');
                root.style.setProperty('--w-' + key + '-y', (dy * 36).toFixed(1) + 'px');
            });

            /* The blade itself. Raked ~14° off vertical so the cut lies along
               the angle the packet is tipped at as it travels, rather than
               being a ruled line the cards happen to cross. */
            root.style.setProperty('--slice-dir', RAKE + 'deg');
            root.style.setProperty('--slice-dur', span + 's');
            root.style.setProperty('--slice-ease', leg ? leg.css : 'ease-out');
            root.style.setProperty('--slice-push', (dir * 34) + 'px');
            root.style.setProperty('--slice-skew', (dir * -1.4) + 'deg');
        }

        /* Deal the rail back in ON `vt.ready` — the deck is not following the
           wave any more, it IS the wave, so it launches the instant the
           transition's own animations do and the cut travels with it.

           It used to wait for `--w-side` so the cards arrived as the wavefront
           reached the column; now the column is where the flight ENDS, so
           waiting for that would have the blade cross an empty screen and the
           deck turn up after the change was over.

           Not on vt.finished either: the whole transition runs a second or
           more once the far regions' delays are counted. ::view-transition-new
           renders the new state live, so the cards really are visible flying
           across it. */
        function dealWithWave(vt) {
            if (!window.railDeal) return;
            if (!vt || !vt.ready) { window.railDeal(0); return; }
            /* `ready` resolving means the update callback has already run, so
               `railArm()` is done and the deal has an armed packet to launch.
               A SKIPPED transition — the browser skips whenever the document
               is hidden, so: pull the cord, switch tabs — rejects it instead,
               and can reject BEFORE the callback runs. Dealing straight off
               that rejection put the cards in the air and then armed them
               back offstage a tick later, and the column stayed empty for
               good. On that path wait for the update itself. */
            afterUpdate(vt, () => window.railDeal(0));
        }

        /* Run something once the transition's own animations are under way —
           or, if the transition was SKIPPED (the browser skips whenever the
           document is hidden, so: pull the cord, switch tabs), once the DOM
           update has at least happened.

           `ready` resolving already means the update callback has run. The
           rejection is the trap: it can reject BEFORE the callback, and both
           the deal and the gather have to run after it — the deal needs its
           armed packet, and the gather needs the column kept alive by
           `.rail-out`. Firing on the bare rejection put the cards in the air
           and then armed them straight back offstage a tick later, and the
           rail stayed empty for good. */
        function afterUpdate(vt, fn) {
            const updated = vt.updateCallbackDone
                ? vt.updateCallbackDone.catch(() => {})
                : Promise.resolve();
            vt.ready.then(fn, () => updated.then(fn));
        }

        /* Carry the run off, then let the column go. `.rail-out` is the only
           thing keeping the rail rendered in plain mode, so it comes off once
           the cards are gone — a beat after the gather's own duration, which
           railGather() reports in ms. */
        function gatherNow() {
            if (!window.railGather) { document.body.classList.remove('rail-out'); return; }
            const ms = window.railGather();
            setTimeout(() => document.body.classList.remove('rail-out'), ms + 80);
        }

        // The swap is animated with the View Transitions API: the browser
        // snapshots the old and new views so they can be tweened. A bare class
        // change repaints in a single frame, which is the "jump".
        function swap(next) {
            /* Leaving: keep the rail rendered past the class flip so the run
               can be carried off INSIDE the transition, at the same moment as
               the change spreading from the cord. Only a live
               `::view-transition-new` snapshot can still move, and the rail is
               `display: none` in plain mode, so without this the column is
               simply gone the instant the callback runs. */
            document.body.classList.toggle('rail-out', next);

            if (reduce || !document.startViewTransition) {
                apply(next);
                if (next) gatherNow(); else dealWithWave(null);
                return Promise.resolve();
            }
            /* Two different transitions, picked by which way we are going.
               `.vt-cord` on the root swaps the stylesheet from the slice to
               the radial bloom; it has to be set BEFORE startViewTransition,
               since that is when the pseudo-elements are matched. */
            const root = document.documentElement;
            root.classList.toggle('vt-cord', next);
            if (next) {
                // leaving: the deck just slips off the near edge, so the change
                // starts at the cord — the hand that caused it
                const r = cordEl.getBoundingClientRect();
                aimCord(r.left + r.width / 2, r.top + r.height * 0.75);
            } else {
                // coming back: the deck crosses the whole screen, so the change
                // runs along its path
                aimSlice();
            }

            let vt;
            try { vt = document.startViewTransition(() => apply(next)); }
            catch (e) {
                apply(next);
                if (next) gatherNow(); else dealWithWave(null);
                return Promise.resolve();
            }
            if (next) afterUpdate(vt, gatherNow); else dealWithWave(vt);
            // A skipped transition (the browser skips whenever the document is
            // hidden) rejects ALL THREE of these. Catching only .finished leaves
            // unhandled rejections that surface as "InvalidStateError:
            // Transition was aborted". The DOM update still ran either way.
            vt.ready.catch(() => {});
            vt.updateCallbackDone.catch(() => {});
            return vt.finished.catch(() => {});
        }

        function pull() {
            if (busy) return;
            busy = true;
            const next = !document.body.classList.contains('plain');
            /* No lead. The gather used to run here, BEFORE the transition, and
               `pull()` held the swap back the 480ms it took — so the cards
               left and then, separately, the page changed. They are one moment
               now: the swap starts on the pull and `swap()` carries the run off
               inside it (see `.rail-out`), so the deck leaving and the change
               spreading from the cord happen together. */
            swap(next).then(() => { busy = false; });
        }


        const paths = cordEl.querySelectorAll('.cord-hit, .cord-back, .cord-front');
        const tassel = cordEl.querySelector('.cord-tassel');
        const ANCHOR_X = 100, REST_LEN = 150;
        const MAX_LEN = REST_LEN + 96;   // how far it can be hauled down
        const HOVER_R = 150;             // how close the pointer has to pass to disturb it

        /* The rope is TWO tracked points, not an angle: the tip (where the
           tassel hangs) and the belly (the curve's control point). Driving it
           off a single rotation is what made it feel like a rigid pendulum on
           a short leash — the tip could only ever sit on one arc, so a wide
           lateral pull was impossible and the rope could not fold. With the
           belly on its own springs it LAGS behind the tip, which is exactly
           what a real cord does: it bows against the direction of travel,
           whips on release, and folds when the tip is pushed back toward the
           mount (the slack has to go somewhere). */
        function spring(k, d, x0) {
            return { x: x0, v: 0, target: x0, k: k, d: d };
        }
        /* A damped harmonic oscillator, integrated per frame:
               a = -k(x - target) - d·v          (mass is 1)
           GSAP's elastic ease was the problem before — it is a fixed decaying
           sine with a long tail, so it reads as jelly whatever you feed it. A
           real spring is tuned by its damping ratio ζ = d / 2√k:
             ζ < 1  underdamped — overshoots, then rings out
             ζ = 1  critical    — fastest approach, no overshoot
             ζ > 1  overdamped  — sluggish
           Each axis gets its own ratio on purpose. Sideways is the pendulum
           and rings the longest (ζ≈0.27); the vertical pays back fast with one
           small overshoot (ζ≈0.62); the belly sits between the two (ζ≈0.47) so
           it trails the tip by a visible beat instead of tracking it rigidly. */
        function integrate(s, dt) {
            for (let i = 0; i < 2; i++) {
                const a = -s.k * (s.x - s.target) - s.d * s.v;
                s.v += a * (dt / 2);
                s.x += s.v * (dt / 2);
            }
        }

        const tipX  = spring(60,  4.2, ANCHOR_X);
        const tipY  = spring(210, 18,  REST_LEN);
        const belX  = spring(90,  9,   ANCHOR_X);
        const belY  = spring(90,  9,   REST_LEN / 2);
        const springs = [tipX, tipY, belX, belY];

        let hoverPush = 0;      // lateral disturbance from a passing pointer
        let dragging = false;

        // where the belly wants to be: halfway along, plus however much rope
        // is not being used — slack has to hang somewhere, and gravity picks down
        function aimBelly() {
            const dx = tipX.x - ANCHOR_X, dy = tipY.x;
            const slack = Math.max(0, REST_LEN - Math.hypot(dx, dy));
            belX.target = ANCHOR_X + dx / 2;
            belY.target = dy / 2 + slack * 0.9;
        }

        function draw() {
            const tx = tipX.x, ty = tipY.x, cx = belX.x, cy = belY.x;
            const d = 'M' + ANCHOR_X + ',0 Q' + cx.toFixed(1) + ',' + cy.toFixed(1) +
                      ' ' + tx.toFixed(1) + ',' + ty.toFixed(1);
            paths.forEach((p) => p.setAttribute('d', d));
            // the tassel hangs off the end, aligned to the curve's exit angle
            const ang = Math.atan2(tx - cx, ty - cy) * 180 / Math.PI;
            tassel.style.transform =
                'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) rotate(' + (-ang).toFixed(1) + 'deg)';
        }

        let raf = null, last = 0;
        function frame(now) {
            const dt = Math.min(0.05, (now - last) / 1000) || 1 / 60;
            last = now;
            // The brush from a passing pointer is an IMPULSE, not a held
            // offset: it decays away so the rope settles and the loop can stop.
            // Left sustained, a mouse resting anywhere near the cord pinned it
            // off-centre and kept a per-frame SVG repaint running forever.
            hoverPush *= Math.pow(0.12, dt);
            if (Math.abs(hoverPush) < 0.05) hoverPush = 0;
            tipX.target = ANCHOR_X + hoverPush;
            tipY.target = REST_LEN;
            aimBelly();
            if (!dragging) { integrate(tipX, dt); integrate(tipY, dt); }
            integrate(belX, dt);
            integrate(belY, dt);
            draw();
            const moving = springs.some((s) =>
                Math.abs(s.v) > 0.06 || Math.abs(s.x - s.target) > 0.06);
            if (dragging || moving || hoverPush) { raf = requestAnimationFrame(frame); }
            else { raf = null; }
        }
        function wake() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
        draw();

        function tug() {
            // a click is a short sharp pull: hand it downward velocity and let
            // the spring do the rest rather than scripting the bounce
            tipY.x = REST_LEN + 28; tipY.v = 210;
            tipX.v = 24;
            wake();
            pull();
        }

        cordEl.addEventListener('click', tug);

        // ---- drag: the tip goes wherever the pointer goes -------------------
        // Only the rope's length constrains it, so it can be hauled right
        // across the screen and swung up past the horizontal, and pushing it
        // back toward the mount folds it rather than shortening it.
        /* #cord is position:fixed, so its viewport rect only changes on resize
           or when --nav-h moves it — cache it. Measuring it inside a pointermove
           handler forces a layout flush on every mouse move, which is exactly
           the kind of thing that shows up as scroll jank. */
        let cordRect = null;
        const rectOf = () => (cordRect || (cordRect = cordEl.getBoundingClientRect()));
        const dropRect = () => { cordRect = null; };
        window.addEventListener('resize', dropRect);
        window.addEventListener('load', dropRect);
        const local = (e) => {
            const r = rectOf();
            return { x: e.clientX - r.left, y: e.clientY - r.top };
        };
        let startY = null, px = 0, py = 0, pvx = 0, pvy = 0, pt = 0;

        cordEl.addEventListener('pointerdown', (e) => {
            const p = local(e);
            startY = e.clientY;
            dragging = true;
            px = p.x; py = p.y; pvx = pvy = 0; pt = performance.now();
            dropRect();                       // re-measure before a drag reads it
            cordEl.setPointerCapture(e.pointerId);
            wake();
        });
        cordEl.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const p = local(e);
            let dx = p.x - ANCHOR_X;
            let dy = Math.max(0, p.y);            // never above its own bracket
            const dist = Math.hypot(dx, dy) || 1;
            // the cord is inextensible: past its length the tip rides the arc
            const len = Math.min(MAX_LEN, dist);
            const nx = ANCHOR_X + (dx / dist) * len, ny = (dy / dist) * len;
            const now = performance.now(), dt = Math.max(8, now - pt) / 1000;
            pvx = (nx - tipX.x) / dt; pvy = (ny - tipY.x) / dt;
            pt = now;
            tipX.x = nx; tipY.x = ny;
            px = p.x; py = p.y;
            // draw here as well as in the loop: while the hand is on it the
            // tip must track the pointer exactly, even if the ticker stalls
            draw();
            wake();
        });
        cordEl.addEventListener('pointerup', (e) => {
            if (!dragging) return;
            const dy = e.clientY - startY;
            dragging = false; startY = null;
            try { cordEl.releasePointerCapture(e.pointerId); } catch (err) {}
            // let go carrying the hand's own velocity — that is what makes it
            // whip rather than just easing home from where it was left
            tipX.v = Math.max(-1400, Math.min(1400, pvx));
            tipY.v = Math.max(-1400, Math.min(1400, pvy));
            wake();
            if (dy > 26) { e.preventDefault(); pull(); }
        });

        /* Passing the pointer near the rope pushes it aside, so it sways
           without being grabbed. Falls off with distance and settles through
           the same spring, so a mouse swept across it leaves it swinging.
           Skipped under reduced motion — nothing here is load-bearing. */
        if (!reduce && window.matchMedia('(pointer: fine)').matches) {
            window.addEventListener('pointermove', (e) => {
                if (dragging) return;
                const r = rectOf();
                const x = e.clientX - r.left, y = e.clientY - r.top;
                // measure to the rope's midpoint, which is where it is easiest to brush
                const mx = (ANCHOR_X + tipX.x + belX.x * 2) / 4;
                const my = (tipY.x + belY.x * 2) / 4;
                const dist = Math.hypot(x - mx, y - my);
                const near = Math.max(0, 1 - dist / HOVER_R);
                if (!near) {
                    if (hoverPush) { hoverPush = 0; wake(); }
                    return;
                }
                // pushed away from the pointer, hardest when closest
                const dir = x > mx ? -1 : 1;
                const push = dir * near * near * 30;
                if (Math.abs(push) > Math.abs(hoverPush)) hoverPush = push;
                wake();
            }, { passive: true });
        }
    })();

    // ---- plain mode's section index ---------------------------------------
    (function buildIndex() {
        const host = document.getElementById('index');
        const cards = Array.from(document.querySelectorAll('.rail-card'));
        if (!host || !cards.length) return;
        cards.forEach((c, i) => {
            const a = document.createElement('a');
            a.className = 'index-item';
            a.href = c.getAttribute('href');
            a.dataset.section = c.dataset.section;
            a.innerHTML = '<span class="ix-num">' + String(i + 1).padStart(2, '0') + '</span>' +
                          '<span>' + c.querySelector('.rail-label').textContent + '</span>';
            host.appendChild(a);
        });
    })();

    // ---- which section am I in? ------------------------------------------
    // Drives both the narrow-screen text links and the rail. The active state
    // is set here rather than in animations.js so it still tracks under
    // reduced motion — it just highlights instead of flipping a card.
    const links = Array.from(document.querySelectorAll('.nav-links a'));
    const railCards = Array.from(document.querySelectorAll('.rail-card'));
    const railIds = railCards.map((c) => c.dataset.section);

    const sections = railIds
        .map((id) => document.getElementById(id))
        .filter(Boolean);

    let activeId = null;
    function setActive(id) {
        if (id === activeId) return;
        activeId = id;
        links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
        railCards.forEach((c) => {
            const on = c.dataset.section === id;
            c.classList.toggle('active', on);
            if (on) c.setAttribute('aria-current', 'true');
            else c.removeAttribute('aria-current');
        });
        document.querySelectorAll('.index-item').forEach((a) => {
            const on = a.dataset.section === id;
            a.classList.toggle('active', on);
            if (on) a.setAttribute('aria-current', 'true');
            else a.removeAttribute('aria-current');
        });
        if (window.railSetActive) window.railSetActive(railIds.indexOf(id));
    }

    // Whichever section fills most of the viewport. Computed from scroll
    // position rather than via an IntersectionObserver so there is one
    // mechanism instead of two (the scroll handler above is already running)
    // and no rootMargin dead-zone where nothing qualifies as current.
    //
    // Measuring area rather than testing a fixed probe line matters: a probe
    // set part-way down the viewport overshoots any section shorter than the
    // remaining screen, so standing in a short section reports the next one.
    // Returns null over the hero, where no section is meaningfully on screen.
    function currentSection() {
        const vh = window.innerHeight;
        const top = window.scrollY;
        const bottom = top + vh;
        let best = null;
        let bestArea = 0;
        for (let i = 0; i < sections.length; i++) {
            const s = sections[i];
            const area = Math.min(bottom, s.offsetTop + s.offsetHeight) -
                         Math.max(top, s.offsetTop);
            if (area > bestArea) { bestArea = area; best = s; }
        }
        // a short final section may never win on area; at the foot of the
        // page it is unambiguously the one you are looking at
        const atEnd = bottom >= document.documentElement.scrollHeight - 2;
        if (atEnd && sections.length) return sections[sections.length - 1].id;
        return best && bestArea > vh * 0.25 ? best.id : null;
    }

    // first paint. Deliberately down here: onScroll reads `sections` and
    // `railCards`, which are const and would still be in the temporal dead
    // zone if this ran beside the listener registration above.
    onScroll();

})();
