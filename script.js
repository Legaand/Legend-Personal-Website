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
