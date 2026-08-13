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
        const swing = cordEl && cordEl.querySelector('.cord-swing');
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

        try { if (localStorage.getItem(KEY) === '1') apply(true); } catch (e) {}

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
            ['foot', 'footer'],
        ];

        /* Time and aim each region from where the pull actually happened.

           Naming a region takes it out of the root snapshot, so the radial
           mask growing from the cord never touches it — which left the
           "spreads out from the cord" transition running a fixed cascade in
           DOM order no matter where on the page you were standing. Measuring
           it here is what makes the stagger a wavefront instead of a queue.

           Distance is normalised by the distance from the pull to the farthest
           corner of the viewport, because that is exactly what 100% means
           inside the mask's radial-gradient — so the regions turn over as the
           mask's own edge sweeps past them. */
        function aimWave(ox, oy) {
            const root = document.documentElement;
            const vw = window.innerWidth, vh = window.innerHeight;
            const far = Math.max(
                Math.hypot(ox, oy), Math.hypot(vw - ox, oy),
                Math.hypot(ox, vh - oy), Math.hypot(vw - ox, vh - oy)) || 1;

            REGIONS.forEach(function (entry) {
                const key = entry[0];
                let el = null;
                document.querySelectorAll(entry[1]).forEach(function (n) {
                    // a name duplicated across two RENDERED elements aborts the
                    // whole transition; display:none means not rendered, which
                    // offsetParent does not reliably tell you
                    if (n.getClientRects().length) el = n;
                });

                let d = far, dx = 0, dy = 1;
                if (el) {
                    const b = el.getBoundingClientRect();
                    // the wave reaches a region at its NEAREST edge, not its
                    // middle — a section taller than the screen should start
                    // turning over the moment the front touches it
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
                root.style.setProperty('--w-' + key, (0.05 + t * 0.5).toFixed(3) + 's');
                root.style.setProperty('--w-' + key + '-x', (dx * 26).toFixed(1) + 'px');
                root.style.setProperty('--w-' + key + '-y', (dy * 26).toFixed(1) + 'px');
            });
        }

        /* Deal the rail back in as the wave reaches it.
           Not on vt.finished: the whole transition runs a second or more once
           the far regions' delays are counted, and the column would sit empty
           for all of it. ::view-transition-new renders the new state live, so
           the cards can arrive underneath the side region's own layer. */
        function dealWithWave(vt) {
            if (!window.railDeal) return;
            const wait = vt && vt.ready;
            if (!wait) { window.railDeal(0); return; }
            wait.then(() => {
                const d = parseFloat(
                    getComputedStyle(document.documentElement).getPropertyValue('--w-side'));
                window.railDeal((d || 0.3) + 0.12);
            }, () => window.railDeal(0));   // skipped transition: just deal
        }

        // The swap is animated with the View Transitions API: the browser
        // snapshots the old and new views so they can be tweened. A bare class
        // change repaints in a single frame, which is the "jump".
        function swap(next) {
            if (reduce || !document.startViewTransition) {
                apply(next);
                if (!next) dealWithWave(null);
                return Promise.resolve();
            }
            // anchor the reveal to the cord, so the change reads as caused by
            // the pull rather than arriving from nowhere
            const r = cordEl.getBoundingClientRect();
            const ox = r.left + r.width / 2;
            const oy = r.top + r.height * 0.75;
            const root = document.documentElement;
            root.style.setProperty('--swap-x', (ox / window.innerWidth) * 100 + '%');
            root.style.setProperty('--swap-y', (oy / window.innerHeight) * 100 + '%');
            aimWave(ox, oy);

            let vt;
            try { vt = document.startViewTransition(() => apply(next)); }
            catch (e) { apply(next); if (!next) dealWithWave(null); return Promise.resolve(); }
            if (!next) dealWithWave(vt);
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
            // Leaving the show, let the run collect back into the deck first.
            // The transition snapshots the rail the instant it starts, so a
            // gather run alongside it would never be seen — what the snapshot
            // has to catch is the packet, not the whole spread shrinking.
            const lead = (next && window.railGather) ? window.railGather() : 0;
            const go = () => swap(next).then(() => { busy = false; });
            if (lead) setTimeout(go, lead); else go();
        }


        const paths = cordEl.querySelectorAll('.cord-hit, .cord-back, .cord-front');
        const tassel = cordEl.querySelector('.cord-tassel');
        const ANCHOR_X = 100, REST_LEN = 150;

        /* Draw the rope from the bracket to the tassel as a quadratic curve.
           The control point lags behind the swing, so the cord bows the way a
           real one does instead of staying a rigid line — and because the path
           always starts at the anchor, it can never detach from its mount. */
        function draw(drop, sway) {
            const len = REST_LEN + drop;
            const rad = sway * Math.PI / 180;
            const tipX = ANCHOR_X + Math.sin(rad) * len;
            const tipY = Math.cos(rad) * len;
            // control point sits partway down, pushed against the direction of
            // travel — that lag is what makes it read as rope rather than wire
            const bow = -sway * 0.85;
            const cx = ANCHOR_X + Math.sin(rad) * len * 0.55 + Math.cos(rad) * bow;
            const cy = Math.cos(rad) * len * 0.55 - Math.sin(rad) * bow;
            const d = 'M' + ANCHOR_X + ',0 Q' + cx.toFixed(1) + ',' + cy.toFixed(1) +
                      ' ' + tipX.toFixed(1) + ',' + tipY.toFixed(1);
            paths.forEach((p) => p.setAttribute('d', d));
            // the tassel hangs off the end, aligned to the curve's exit angle
            const ang = Math.atan2(tipX - cx, tipY - cy) * 180 / Math.PI;
            tassel.style.transform =
                'translate(' + tipX.toFixed(1) + 'px,' + tipY.toFixed(1) + 'px) rotate(' + (-ang).toFixed(1) + 'deg)';
        }

        let curDrop = 0, curSway = 0;
        function render() { draw(curDrop, curSway); }
        render();

        /* A damped harmonic oscillator, integrated per frame:
               a = (-k(x - target) - d·v) / m
           GSAP's elastic ease was the problem before — it is a fixed decaying
           sine with a long tail, so it reads as jelly whatever you feed it. A
           real spring is tuned by its damping ratio ζ = d / 2√(k·m):
             ζ < 1  underdamped — overshoots, then rings out
             ζ = 1  critical    — fastest approach, no overshoot
             ζ > 1  overdamped  — sluggish
           The two axes get different ratios on purpose: the cord pays back in
           fast (ζ≈0.62, one small overshoot) while the tassel keeps swinging a
           beat longer (ζ≈0.27), which is how a pendulum behaves. */
        function makeSpring(apply, k, d, m) {
            let x = 0, v = 0, target = 0, raf = null;
            const dt = 1 / 60;
            function step() {
                for (let i = 0; i < 2; i++) {
                    const a = (-k * (x - target) - d * v) / m;
                    v += a * (dt / 2);
                    x += v * (dt / 2);
                }
                apply(x);
                if (Math.abs(v) < 0.04 && Math.abs(x - target) < 0.04) {
                    x = target; v = 0; apply(x); raf = null; return;
                }
                raf = requestAnimationFrame(step);
            }
            return {
                hold(val) { if (raf) cancelAnimationFrame(raf); raf = null; x = val; v = 0; apply(x); },
                release(vel) { v = vel || 0; if (!raf) raf = requestAnimationFrame(step); },
            };
        }

        const drop = makeSpring((y) => { curDrop = y; render(); }, 210, 18, 1);
        const sway = makeSpring((r) => { curSway = r; render(); }, 60, 4.2, 1);

        function tug() {
            // a click is a short sharp pull: hand it downward velocity and let
            // the spring do the rest rather than scripting the bounce
            drop.hold(28);
            drop.release(210);
            sway.hold(1.5);
            sway.release(24);
            pull();
        }

        cordEl.addEventListener('click', tug);

        // drag-and-release, with the rope leaning toward the pull
        let startY = null, startX = 0, lastDy = 0;
        cordEl.addEventListener('pointerdown', (e) => {
            startY = e.clientY; startX = e.clientX;
            cordEl.setPointerCapture(e.pointerId);
        });
        cordEl.addEventListener('pointermove', (e) => {
            if (startY === null) return;
            const dy = Math.max(0, Math.min(90, e.clientY - startY));
            const dx = Math.max(-60, Math.min(60, e.clientX - startX));
            lastDy = dy;
            // rotation is about the mount at the TOP, and a positive CSS
            // rotation swings the hanging end LEFT — negated so the rope
            // leans toward the cursor rather than away from it
            drop.hold(dy);
            // the tip should follow the cursor, so a rightward drag swings right
            sway.hold(dx * 0.16);
        });
        cordEl.addEventListener('pointerup', (e) => {
            if (startY === null) return;
            const dy = e.clientY - startY;
            startY = null;
            try { cordEl.releasePointerCapture(e.pointerId); } catch (err) {}
            // let go with no injected velocity — the spring pulls it home from
            // wherever the hand left it, which is what release actually is
            drop.release(0);
            sway.release(0);
            if (dy > 26) { e.preventDefault(); pull(); }
        });
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
