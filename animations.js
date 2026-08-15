/* ============================================================
   The motion layer. Everything here is additive: script.js has
   already put the page in its correct resting state, so if this
   file exits early (reduced motion, or GSAP missing) the visitor
   gets the complete, legible page — just without the show.

   Rule: never set a hidden initial state in CSS. Every "from"
   state is established here at runtime, so a no-JS visitor can
   never end up staring at content that was waiting for a tween.

   Stronger rule, learned the hard way: never create a `from`
   tween for content that is not on screen yet either. A from()
   renders its start state the moment it is CREATED, so a page
   full of `gsap.from(el, {scrollTrigger})` is a page that is
   blank from the first frame and depends on the ticker to become
   readable. Everything below builds its tween INSIDE the
   ScrollTrigger callback, when the element is actually arriving —
   so the resting page is never hidden waiting for a frame that
   might not come.
   ============================================================ */

(function () {
    'use strict';

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !window.gsap || !window.ScrollTrigger) return;

    gsap.registerPlugin(ScrollTrigger);

    const fine = window.matchMedia('(pointer: fine)').matches;

    /* ---- one motion vocabulary ------------------------------------------
       The site had a different curve in every call — power3 here, power4
       there, a hand-written cubic-bezier somewhere else — which is what
       makes motion read as "animated" rather than as one thing moving. Three
       curves, each with a job:
         RISE   long travel, big impact, long tail   (entrances)
         GLIDE  short travel, quick and quiet        (copy, tags, rows)
         SETTLE a single small overshoot             (things that arrive
                                                      in place, like a card
                                                      landing on the table) */
    const RISE = 'expo.out';
    const GLIDE = 'power3.out';
    const SETTLE = 'back.out(1.35)';

    /* The whole motion layer waits until the page is actually visible.
       Chrome throttles requestAnimationFrame in a background tab, so a
       timeline created there never runs. The hero intro below is the one
       place that still uses `from`, and it is why this gate exists. */
    function boot() {

        /* =========================================================
           0. The scroll itself
           ========================================================= */

        /* Momentum scrolling. The single biggest difference between this
           page and the sites it is measured against is not any one effect —
           it is that their scroll has weight. A wheel notch here sets a
           target and the page eases toward it, so movement starts and stops
           on a curve instead of in one jump.

           Deliberately WHEEL ONLY, and only on a fine pointer. Touch,
           keyboard, scrollbar dragging, find-in-page and the browser's own
           scroll restoration all stay completely native — those are the
           paths where a hand-rolled scroller breaks accessibility, and none
           of them are what the effect is for. If any of them moves the page
           out from under us we notice and hand the scroll straight back.

           It also publishes a per-frame velocity, which is what earns it its
           place: the falling-card layer reads it and streaks. */
        const scroller = (function momentum() {
            if (!fine) return null;

            const doc = document.documentElement;
            const limit = () => Math.max(0, doc.scrollHeight - window.innerHeight);
            const clamp = (v) => Math.min(limit(), Math.max(0, v));
            const LERP = 0.145;

            let pos = window.scrollY;
            let target = pos;
            let running = false;
            let vel = 0;
            let jump = null;

            // never take the wheel away from something that genuinely
            // scrolls itself (the nav links strip is a scroller under 1280px)
            function ownsItsScroll(node) {
                while (node && node.nodeType === 1 && node !== document.body) {
                    const s = getComputedStyle(node);
                    if (/(auto|scroll)/.test(s.overflowY) && node.scrollHeight > node.clientHeight + 1) return true;
                    if (/(auto|scroll)/.test(s.overflowX) && node.scrollWidth > node.clientWidth + 1) return true;
                    node = node.parentNode;
                }
                return false;
            }

            window.addEventListener('wheel', (e) => {
                if (e.ctrlKey || e.defaultPrevented) return;   // pinch-zoom
                if (ownsItsScroll(e.target)) return;
                e.preventDefault();
                if (jump) { jump.kill(); jump = null; }
                // deltaMode 1 is lines, 2 is pages
                const d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1);
                if (!running) { pos = window.scrollY; target = pos; }
                target = clamp(target + d);
                running = true;
            }, { passive: false });

            // in-page links get a real ride rather than a teleport; the CSS
            // smooth-scroll would fight the loop above, so it is turned off
            doc.style.scrollBehavior = 'auto';
            document.addEventListener('click', (e) => {
                const a = e.target.closest && e.target.closest('a[href^="#"]');
                if (!a || a.getAttribute('href') === '#') return;
                const id = a.getAttribute('href').slice(1);
                const el = document.getElementById(id);
                if (!el) return;
                e.preventDefault();
                const to = clamp(window.scrollY + el.getBoundingClientRect().top);
                running = false;
                if (jump) jump.kill();
                const o = { v: window.scrollY };
                // distance-aware duration: a short hop should not take as long
                // as a trip to the footer, or short links feel sluggish
                const dur = gsap.utils.clamp(0.6, 1.4, Math.abs(to - o.v) / 2600 + 0.55);
                jump = gsap.to(o, {
                    v: to, duration: dur, ease: 'power3.inOut', overwrite: true,
                    onUpdate() { vel = o.v - pos; pos = target = o.v; window.scrollTo(0, o.v); },
                    onComplete() { jump = null; vel = 0; },
                });
                try { history.replaceState(null, '', '#' + id); } catch (err) { /* file:// */ }
            });

            gsap.ticker.add(() => {
                if (jump) return;

                /* Check the document every frame rather than listening for a
                   scroll event. Our own scrollTo lands within a pixel of `pos`,
                   so a bigger gap than that means something else moved the page
                   — keyboard, scrollbar, find-in-page, scroll restoration — and
                   that wins. A scroll listener was tried first and is not good
                   enough: scroll events are coalesced and can arrive AFTER the
                   next frame, and by then this loop has already written `pos`
                   back over the top and yanked the reader home. */
                if (Math.abs(window.scrollY - pos) > 3) {
                    pos = target = window.scrollY;
                    running = false;
                    vel = 0;
                    return;
                }

                if (!running) { vel *= 0.82; if (Math.abs(vel) < 0.15) vel = 0; return; }
                const d = target - pos;
                if (Math.abs(d) < 0.35) { pos = target; running = false; vel = 0; }
                else { pos += d * LERP; vel = d * LERP; }
                window.scrollTo(0, pos);
            });

            return { velocity: () => vel };
        })();

        const velocity = () => (scroller ? scroller.velocity() : 0);

        /* =========================================================
           1. The hero
           ========================================================= */

        const hero = document.querySelector('.hero');
        const title = document.querySelector('.title');

        // split the name into masked words: <span class=line><span class=word>
        let words = [];
        if (title) {
            const line = document.createElement('span');
            line.className = 'line';
            title.textContent.trim().split(/\s+/).forEach((w, i) => {
                if (i) line.appendChild(document.createTextNode(' '));
                const span = document.createElement('span');
                span.className = 'word';
                span.textContent = w;
                line.appendChild(span);
            });
            title.textContent = '';
            title.appendChild(line);
            words = Array.from(title.querySelectorAll('.word'));
        }

        /* The name does not just slide up — it pivots up off its own baseline,
           left edge first, the way a card being turned over comes up on one
           corner. Rotation and skew are what separate that from a lift. */
        const intro = gsap.timeline({ defaults: { ease: GLIDE } });
        intro
            /* The follow-spot comes up like a lamp warming, not like a shape
               sliding in — opacity only, because .beam's transform is already
               owned by the infinite beam-sway keyframes and a CSS animation
               beats an inline style outright. */
            .from('.beam', { autoAlpha: 0, duration: 1.8, ease: 'power2.out' }, 0)
            .from('.eyebrow', { autoAlpha: 0, y: 16, duration: 0.8 }, 0.05)
            .from(words, {
                yPercent: 118,
                rotation: 6,
                skewY: 4,
                transformOrigin: '0% 100%',
                duration: 1.3,
                stagger: 0.12,
                ease: RISE,
            }, 0.14)
            .from('.pill', { autoAlpha: 0, y: 14, duration: 0.7, stagger: 0.08 }, 0.72)
            .from('.hero-cta .btn', { autoAlpha: 0, y: 14, scale: 0.96, duration: 0.7, stagger: 0.09, ease: SETTLE }, 0.84)
            .from('.cue', { autoAlpha: 0, y: -10, duration: 0.7 }, 1.15);

        // the hero text lifts away as the page takes over
        if (hero) {
            gsap.to('.hero-inner', {
                yPercent: -22,
                autoAlpha: 0,
                ease: 'none',
                scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
            });
            // the follow-spot fades a beat behind the text rather than leaving
            // with it, so the hero has two speeds on the way out
            gsap.to('.beam', {
                autoAlpha: 0,
                ease: 'none',
                scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom+=40% top', scrub: true },
            });
        }

        /* The name drifts a few pixels against the pointer. Kept on .title
           itself: .hero-inner is already owned by the scroll scrub above, and
           two tweens writing the same transform fight. */
        if (fine && title && hero) {
            const tx = gsap.quickTo(title, 'x', { duration: 0.9, ease: 'power3.out' });
            const ty = gsap.quickTo(title, 'y', { duration: 0.9, ease: 'power3.out' });
            hero.addEventListener('pointermove', (e) => {
                const nx = (e.clientX / window.innerWidth) - 0.5;
                const ny = (e.clientY / window.innerHeight) - 0.5;
                tx(nx * 16); ty(ny * 10);
            });
            hero.addEventListener('pointerleave', () => { tx(0); ty(0); });
        }

        /* =========================================================
           2. The rail
           ========================================================= */

        /* ---- the rail: the current section's card turns face-up ----
           The flip is 2D on purpose (scaleX through ~0, swap sides with
           autoAlpha). The rail is fixed UI, and ANY 3D transform on a card
           makes Chromium paint it above other fixed UI regardless of
           z-index — here that would put cards over the nav. */
        (function rail() {
            const el = document.getElementById('rail');
            if (!el) return;
            // every card in the rail is a destination, including Home — a card
            // that looks identical to its neighbours but does nothing reads as broken
            const items = Array.from(el.querySelectorAll('.rail-card'));
            if (!items.length) return;

            el.classList.add('dealt');

            // The wheel: a large radius with its hub off-screen to the left, so
            // the run of cards curves away and genuinely leaves the viewport
            // rather than sitting as a straight column.
            const R = 620;
            // Degrees between neighbours. Sized so the whole run still fits the
            // screen from either end: the spread is (n-1) * STEP, and at R=620
            // a card that far round sits R*sin(spread) px off centre. Six cards
            // at the old 11° reached 55° — ~508px — which pushed the far card
            // off the bottom whenever the run's other end was active, so a
            // destination could be unreachable. Hold the total spread at 45°
            // (~438px, the figure that worked) however many cards there are,
            // capped at 9° so a short run never fans out absurdly wide.
            const SPREAD = 45;
            const STEP = Math.min(9, SPREAD / Math.max(1, items.length - 1));
            const rad = (d) => (d * Math.PI) / 180;

            const parts = items.map((card) => ({
                card: card,
                back: card.querySelector('.rc-back'),
                face: card.querySelector('.rc-face'),
                label: card.querySelector('.rail-label'),
                num: card.querySelector('.rail-num'),
            }));

            // pull the indices out of their cards so they can ride the wheel
            // independently — inside a rotated card they inherit its angle
            parts.forEach((p) => { if (p.num) el.appendChild(p.num); });

            /* ...and push the section name the other way, INTO the card face,
               where it is printed in the pip field (the caption that used to
               hang below the card landed on the next card's back and could not
               be read). It has to live inside the face, not beside it, so the
               turn scales it with the card — outside, it sat at full width
               while the card was still edge-on. Moved here rather than in the
               markup so the undealt no-JS rail keeps its plain label. */
            parts.forEach((p) => {
                const stock = p.face && p.face.querySelector('.rcard-face');
                if (stock && p.label) stock.appendChild(p.label);
            });

            // position on the arc, measured from whichever card is currently front
            function slot(i, centre) {
                const t = (i - centre) * STEP;
                return {
                    x: R * Math.cos(rad(t)) - R,   // recedes left as it curves away
                    y: R * Math.sin(rad(t)),
                    rot: t,
                };
            }

            let current = -1;

            // with nothing active the wheel rests centred on its middle card
            function centreOf(activeIdx) {
                return activeIdx >= 0 ? activeIdx : (parts.length - 1) / 2;
            }

            // where card i belongs when the wheel is at rest
            function spot(i, activeIdx) {
                const centre = centreOf(activeIdx);
                const s = slot(i, centre);
                const on = i === activeIdx;
                return {
                    x: s.x + (on ? 56 : 0),
                    y: s.y,
                    rotation: on ? 0 : s.rot,
                    scale: on ? 1.1 : 1,
                    yPercent: -50,
                    zIndex: on ? 40 : 20 - Math.round(Math.abs(i - centre)),
                    autoAlpha: 1,
                };
            }

            /* The squared deck: every card collected onto the front card's
               spot, offset a hair so the packet has thickness instead of
               reading as one flat sheet. The whole run fans out of this and
               collects back into it. */
            function packed(i, activeIdx) {
                const centre = centreOf(activeIdx);
                const front = spot(Math.round(centre), activeIdx);
                const dist = Math.abs(i - centre);
                return {
                    x: front.x - dist * 1.6,
                    y: front.y - dist * 1.6,
                    rotation: front.rotation,
                    scale: front.scale,
                    yPercent: -50,
                    zIndex: i === activeIdx ? 40 : 20 - Math.round(dist),
                };
            }

            function layout(activeIdx, animate) {
                const centre = centreOf(activeIdx);
                parts.forEach((p, i) => {
                    const on = i === activeIdx;
                    const to = spot(i, activeIdx);
                    if (animate) {
                        /* The whole wheel does not snap round as one rigid
                           object: each card starts a beat after the one nearer
                           the front, so the run ripples the way a spread does
                           when you square it up. The card being turned to gets
                           the overshoot; the rest just glide. */
                        const lag = Math.abs(i - centre) * 0.035;
                        gsap.to(p.card, Object.assign({}, to, {
                            duration: on ? 0.85 : 0.72,
                            delay: on ? 0 : lag,
                            ease: on ? SETTLE : GLIDE,
                        }));
                        if (p.num) {
                            gsap.to(p.num, {
                                y: to.y, yPercent: -50, duration: 0.72,
                                delay: lag, ease: GLIDE,
                            });
                        }
                    } else {
                        gsap.set(p.card, to);
                        if (p.num) gsap.set(p.num, { y: to.y, yPercent: -50 });
                    }
                });
            }

            /* The turn only swaps the sides; the wheel handles every position.

               It is a real card TURN-OVER: the card narrows to edge-on, the
               sides swap there, and the new side opens back out. The vertical
               reel ROLL this used to be was rejected — travelling with the
               wheel made the card read as a strip of film sliding through a
               window rather than a card being turned over.

               Still strictly 2D. The rail is fixed UI and ANY 3D transform on
               a card makes Chromium paint it above other fixed UI regardless
               of z-index — here that would put cards over the nav. It does not
               need to be 3D: x-scale through zero is genuinely what a turning
               card does, since its apparent width is cos(theta). The halves
               are eased `sine.in` then `sine.out` so the card turns at a
               constant rate instead of hanging at the edges, which is what
               made the old linear scaleX flip read as a blink. */
            const FLIP = 0.54;

            /* Both the scroll turn and the fan's turn are this one move; `on`
               says which way round (face-up or back to face-down). */
            function turnOver(p, on) {
                if (!p || !p.face) return;
                if (p.num) p.num.classList.toggle('on', on);

                const faceSheet = p.face.firstElementChild;
                const backSheet = p.back && p.back.firstElementChild;
                gsap.killTweensOf([p.back, p.face, p.label, faceSheet, backSheet]);
                // the turn moves the SIDES; the sheets inside them stay home
                gsap.set([faceSheet, backSheet].filter(Boolean), { yPercent: 0 });

                const leaving = on ? p.back : p.face;
                const arriving = on ? p.face : p.back;

                const H = FLIP / 2;
                const tl = gsap.timeline();
                tl.set(leaving, { autoAlpha: 1, scaleX: 1 }, 0)
                  .set(arriving, { autoAlpha: 0, scaleX: 0 }, 0)
                  .to(leaving, { scaleX: 0, duration: H, ease: 'sine.in' }, 0)
                  // edge-on: the sides swap over
                  .set(leaving, { autoAlpha: 0 }, H)
                  .set(arriving, { autoAlpha: 1 }, H)
                  .to(arriving, { scaleX: 1, duration: H, ease: 'sine.out' }, H)
                  // leave the hidden side square, or the next turn brings back
                  // a sliver of a squashed card
                  .set(leaving, { scaleX: 1 }, FLIP);

                if (on) {
                    // the label is parked at autoAlpha 0 by the deal-in, so
                    // this has to be a `to` — a from() would animate 0 → 0
                    tl.set(p.label, { x: -8 }, H)
                      .to(p.label, { autoAlpha: 1, x: 0, duration: 0.4, ease: GLIDE }, H + 0.08);
                } else {
                    tl.to(p.label, { autoAlpha: 0, duration: 0.18, ease: 'power2.in' }, 0);
                }
            }

            function turn(p, on) { turnOver(p, on); }
            function flip(p) { turnOver(p, true); }

            /* The fan.

               The deck is CARRIED IN from off the far (right) edge as a
               squared packet — right across the screen to the rail's column on
               the left — squares up for a beat, then spreads along the
               arc, each card behind the one nearer the front. Split into
               arm/play because the cord replays it — the rail is display:none
               in plain mode, so coming back it would otherwise be there fully
               assembled, which reads as a panel being toggled.

               The packet used to fade up in place instead of travelling. With
               every card sitting on the same spot there was nothing to see but
               the stack appearing and then breaking apart, which read as a
               blink rather than a hand bringing a deck in — the user's words
               were that it "just appears and then disappears". The travel is
               what makes the spread the second half of one gesture. */
            const cardEls = parts.map((p) => p.card);
            const numEls = parts.map((p) => p.num).filter(Boolean);
            const labelEls = parts.map((p) => p.label).filter(Boolean);
            let pending = null;

            /* The two wings. The packet waits off the FAR (right) edge before
               it is carried in, and it is scooped off the NEAR (left) edge on
               the way out — deliberately not a mirror pair (see `nearstage`).
               Both are the squared deck, tipped a little so it travels at an
               angle. `#rail.dealt` spans the full viewport width so the carry
               is not clipped back to the column (pointer-events off everywhere
               but the cards themselves), and is overflow: hidden, so out there
               is genuinely out of sight. */
            const TIP = 15;            // how far the packet leans as it travels

            /* The card's own overhang once it is tipped: a tilted card's
               bounding box is w*cos + h*sin, far wider than the card, and
               clearing only its own width leaves a corner of the packet
               showing at the screen edge. Measured rather than guessed
               because --rail-card is a clamp. */
            function tipped(rot, scale) {
                const c = parts[0].card;
                const a = Math.abs(rad(rot));
                return (c.offsetWidth * Math.cos(a) + c.offsetHeight * Math.sin(a))
                       * (scale || 1);
            }

            /* Where the packet is SCOOPED OFF TO on the way out: just past the
               near (left) edge, tipped back, the way it always left. It is
               deliberately NOT the mirror of the entrance — the deck is
               carried the whole width of the screen coming in, but going out
               it simply slips off the side it lives on. Sweeping it back
               across the page to leave made the exit a second full crossing
               and the swap top-heavy with travel. */
            function nearstage(i, activeIdx) {
                const p = packed(i, activeIdx);
                const c = parts[0].card;
                const rot = p.rotation - TIP;
                return Object.assign({}, p, {
                    x: p.x - (c.offsetLeft + tipped(rot, p.scale) + 40),
                    y: p.y + 34,
                    rotation: rot,
                });
            }

            function offstage(i, activeIdx) {
                const p = packed(i, activeIdx);
                const c = parts[0].card;
                const rot = p.rotation + TIP;
                const wide = tipped(rot, p.scale);
                const span = el.clientWidth || window.innerWidth;
                return Object.assign({}, p, {
                    // card's left edge parked past the right-hand edge of the
                    // rail's (full-width) box, plus the overhang the tilt adds
                    x: p.x + (span - c.offsetLeft + (wide - c.offsetWidth) / 2 + 40),
                    y: p.y + 34,
                    rotation: rot,
                });
            }

            function arm() {
                // a fan still waiting on its delay would fire into the armed
                // state and undo it
                if (pending) { pending.kill(); pending = null; }
                parts.forEach((p, i) => {
                    gsap.killTweensOf([p.card, p.back, p.face, p.label, p.num,
                                       p.face.firstElementChild,
                                       p.back && p.back.firstElementChild]);
                    gsap.set(p.card, Object.assign(offstage(i, current), { autoAlpha: 0 }));
                    // scaleX: a flip cut short by the cord leaves a side squashed
                    gsap.set(p.face, { autoAlpha: 0, scaleX: 1 });
                    gsap.set(p.back, { autoAlpha: 1, scaleX: 1 });
                    gsap.set(p.label, { autoAlpha: 0 });
                    // both sheets start at home; the roll moves them, not their sides
                    if (p.face.firstElementChild) gsap.set(p.face.firstElementChild, { yPercent: 0 });
                    if (p.back && p.back.firstElementChild) gsap.set(p.back.firstElementChild, { yPercent: 0 });
                    if (p.num) gsap.set(p.num, { autoAlpha: 0, y: packed(i, current).y, yPercent: -50 });
                });
            }

            /* The packet's travel in — a whole viewport's width, not the width
               of the rail column, so it takes real time to read as a carry
               rather than a card being flicked in. It is also the **blade**:
               the swap's reveal is a slice that rides this exact path, so this
               number and CARRY below are what script.js hands the stylesheet
               as `--slice-dur` and what it inverts to time each region. Change
               one and the cut stops tracking the deck. */
            const SLIDE = 1.4;
            /* Per card behind the front one. Kept SHORT: over a whole
               viewport's travel even a small lag strings the packet out into
               a line of separate cards mid-flight, and it has to arrive as a
               deck for the spread that follows to read as one gesture. */
            const LAG = 0.018;
            const SQUARE = 0.1;            // a beat squared up before it spreads
            /* The carry is the one move that does NOT use RISE. Two reasons,
               both about the slice: expo.out is 2^-10x, which covers 90% of a
               whole-screen crossing in the first third — the deck teleported
               and there was nothing to follow — and no CSS bezier can match
               it, so the blade could never stay on the cards. power2.out is
               invertible in closed form (t → 1 - sqrt(1-t)), which is exactly
               what script.js needs to work out when the cut passes a section.
               This is not a fourth vocabulary curve; it is the one tween the
               stylesheet has to share. */
            const CARRY = 'power2.out';
            const CARRY_CSS = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
            /* The flip waits for the spread to be completely finished, and
               then some. Two things happening to the same card at once reads
               as neither, and "nearly settled" is not settled: the slowest
               card's tween runs 0.72s plus up to 0.14s of lag, and the front
               card's SETTLE overshoot takes 0.85s to come back to rest. This
               clears all of that and leaves a beat of stillness, so the flip
               is unmistakably its own move. */
            const TURN_IN = 1.1;

            function play(delay) {
                if (pending) pending.kill();
                const centre = Math.round(centreOf(current));
                const far = Math.max(centre, parts.length - 1 - centre);
                // when the last card has landed and the packet is square
                const FAN = SLIDE + LAG * far + SQUARE;
                const at = (key) => (i) => packed(i, current)[key];
                pending = gsap.timeline({ delay: delay || 0, onComplete() { pending = null; } })
                    // the packet is carried in from off the edge as one deck,
                    // the front card leading and the rest trailing it in...
                    .set(cardEls, { autoAlpha: 1 }, 0)
                    .to(cardEls, {
                        x: at('x'), y: at('y'), rotation: at('rotation'),
                        duration: SLIDE,
                        ease: CARRY,
                        stagger: { each: LAG, from: centre },
                    }, 0)
                    // ...and once it is squared up, spreads into the run...
                    .call(() => layout(current, true), null, FAN)
                    .to(numEls, { autoAlpha: 1, duration: 0.5, stagger: 0.04 }, FAN)
                    // ...and only once it has settled, the top card turns
                    // over. arm() left every card face-down, so the section
                    // you are standing in has to be turned back to.
                    .call(() => {
                        if (current >= 0 && parts[current]) flip(parts[current]);
                    }, null, FAN + TURN_IN);
            }

            /* The inverse, run BEFORE the page turns over: the run collects
               back into the packet and carries straight on off the near edge,
               so what the transition snapshots is an empty column. Collecting
               and leaving are one move rather than two — squaring up and then
               waiting to be faded out was the same "it just disappears" the
               entrance had. Returns how long to wait in ms. */
            const GATHER = 0.42;           // only the near edge to clear
            const SCOOP = 0.06;            // head start for the far end of the run

            function gather() {
                if (pending) { pending.kill(); pending = null; }
                const centre = centreOf(current);
                const far = Math.max(centre, parts.length - 1 - centre) || 1;
                parts.forEach((p, i) => {
                    gsap.killTweensOf(p.card);
                    gsap.to(p.card, Object.assign(nearstage(i, current), {
                        duration: GATHER,
                        // the far cards move first, so the run closes inward
                        // the way a spread does when you scoop it up
                        delay: SCOOP * (1 - Math.abs(i - centre) / far),
                        ease: 'power2.in',
                    }));
                });
                gsap.to(numEls, { autoAlpha: 0, duration: GATHER * 0.7 });
                gsap.to(labelEls, { autoAlpha: 0, duration: GATHER * 0.5 });
                return (GATHER + SCOOP) * 1000;
            }

            /* script.js runs first and its scroll handler has already marked a
               card active by now. Adopt it BEFORE arming — the packet has to
               be squared on the card the fan will open around, and the fan is
               the entrance, so calling railSetActive here instead would turn
               to that card as if it had been scrolled to and skip the packet
               entirely. */
            const pre = items.findIndex((c) => c.classList.contains('active'));
            if (pre >= 0) current = pre;

            arm();
            play(0.35);

            // called by script.js around the cord swap: armed inside the view
            // transition so nothing is snapshotted, then fanned as the wave
            // passes; gathered up front on the way out
            window.railArm = arm;
            window.railDeal = function (delay) { play(delay || 0); };
            window.railGather = gather;

            /* The carry, published for script.js: coming back to the show, the
               swap's reveal is a cut that travels along this exact path, so
               the transition is timed off the deck's own numbers rather than
               guessing at them. `inv` answers "at what fraction of the move is
               the deck a fraction t of the way across?" — the inverse of the
               easing — and is how each region is timed to the moment the blade
               passes it. `CARRY` is a quadratic precisely so it inverts in
               closed form and has an exact CSS twin.

               Only the way IN is published. Leaving, the run just slips off
               the near edge and the transition starts at the cord instead —
               there is nothing crossing the screen for a cut to ride. */
            window.railFlight = {
                // carried IN: power2.out, y = 1-(1-x)^2
                carry: {
                    dur: SLIDE,
                    css: CARRY_CSS,
                    inv: function (t) { return 1 - Math.sqrt(Math.max(0, 1 - t)); },
                },
            };

            // called by script.js from the scroll handler
            window.railSetActive = function (i) {
                if (i === current) return;
                const prev = current;
                current = i;
                layout(i, true);                   // the whole wheel turns
                if (prev >= 0 && parts[prev]) turn(parts[prev], false);
                if (i >= 0 && parts[i]) turn(parts[i], true);
            };

            window.addEventListener('resize', () => layout(current, false));
        })();

        /* =========================================================
           3. The falling cards
           ========================================================= */

        (function drift() {
            const layer = document.getElementById('drift');
            if (!layer) return;

            // three depth tiers, back to front; the far ones are small, blurred
            // and slow, the near ones large and quicker — that spread is what
            // makes it read as depth rather than as scattered confetti
            const TIERS = [
                { cls: 'd-far',  n: 15, w: 86,  min: 70, max: 105, pull: 0.35 },
                { cls: 'd-mid',  n: 10, w: 140, min: 52, max: 78,  pull: 0.75 },
                { cls: 'd-near', n: 5,  w: 205, min: 38, max: 56,  pull: 1.3 },
            ];

            /* One container per tier. The cards themselves are owned by their
               fall tween, which writes the whole transform — so the scroll
               reaction has to live on a separate element or the two fight over
               it every frame. Per TIER rather than per card: three moving
               elements instead of thirty, and the tier is the unit of depth
               anyway. */
            const layers = TIERS.map((t) => {
                const g = document.createElement('div');
                g.className = 'dtier';
                layer.appendChild(g);
                return { host: g, set: gsap.quickSetter(g, 'y', 'px'), pull: t.pull };
            });

            function float(el, w, min, max, immediate) {
                const h = w * 7 / 5;
                // Lean each card decisively one way or the other rather than
                // sampling a narrow band around vertical — a symmetric ±25° range
                // still reads as "everything tilted about the same".
                const lean = (Math.random() < 0.5 ? -1 : 1) * gsap.utils.random(14, 62);
                gsap.set(el, {
                    x: gsap.utils.random(-w * 0.3, window.innerWidth - w * 0.7),
                    y: immediate ? gsap.utils.random(-h, window.innerHeight) : -h - 30,
                    rotation: lean,
                });
                gsap.to(el, {
                    y: window.innerHeight + h,
                    rotation: '+=' + gsap.utils.random(-45, 45),
                    duration: gsap.utils.random(min, max),
                    ease: 'none',
                    onComplete() { float(el, w, min, max, false); },
                });
            }

            TIERS.forEach((t, ti) => {
                for (let i = 0; i < t.n; i++) {
                    const el = document.createElement('div');
                    el.className = 'dcard ' + t.cls;
                    el.innerHTML = '<svg><use href="#card-back"/></svg>';
                    layers[ti].host.appendChild(el);
                    float(el, t.w, t.min, t.max, true);
                }
            });

            /* The layer answers the scroll. Each tier is dragged by a different
               amount, so a hard flick shears the three depths apart and they
               close back up as you stop — the parallax you would get from
               moving past real objects, which a fixed layer otherwise never
               gets. Smoothed so it trails the wheel rather than tracking it. */
            let smooth = 0;
            gsap.ticker.add(() => {
                const v = velocity();
                smooth += (v - smooth) * 0.09;
                if (Math.abs(smooth) < 0.02) { smooth = 0; }
                const drag = gsap.utils.clamp(-90, 90, -smooth * 2.2);
                for (let i = 0; i < layers.length; i++) layers[i].set(drag * layers[i].pull);
            });
        })();

        /* =========================================================
           4. Section reveals
           ========================================================= */

        /* Build the tween when the element ARRIVES, never at boot. See the
           note at the top of the file: a from() created up front renders its
           hidden state immediately, so a page of them is a blank page waiting
           on the ticker. */
        /* Every reveal below ends exactly where the stylesheet already wanted
           the element, so it hands the transform BACK when it is done. Left
           inline, `transform: translate(0px, 0px)` outranks any stylesheet
           rule — which quietly killed .btn:active on the project buttons and
           would have reset .contact-card's dealt angle. Never clear it on
           something a scrub tween is still writing (the project art). */
        const HANDBACK = { clearProps: 'transform' };

        function onArrival(el, start, build) {
            ScrollTrigger.create({
                trigger: el,
                start: start || 'top 86%',
                once: true,
                onEnter: () => build(el),
            });
        }

        /* Headings rise out of a mask like the hero name does, so the page has
           one reveal idea rather than a different fade per section. The wrapper
           needs the descender padding (.ln in the stylesheet) — Abril Fatface
           hangs well outside a 1.02 line box and a plain overflow:hidden
           shaves the g and the y. */
        function maskLines(h) {
            if (!h || h.querySelector('.ln')) return [];
            const ln = document.createElement('span');
            ln.className = 'ln';
            const inner = document.createElement('span');
            while (h.firstChild) inner.appendChild(h.firstChild);
            ln.appendChild(inner);
            h.appendChild(ln);
            return [inner];
        }

        document.querySelectorAll('.sec-head').forEach((head) => {
            const h2 = head.querySelector('h2');
            const risers = maskLines(h2);
            const rest = [head.querySelector('.kicker'), head.querySelector('.sec-sub')].filter(Boolean);
            onArrival(head, 'top 88%', () => {
                const tl = gsap.timeline();
                if (rest[0]) tl.from(rest[0], Object.assign({ autoAlpha: 0, x: -14, duration: 0.6, ease: GLIDE }, HANDBACK), 0);
                if (risers.length) tl.from(risers, Object.assign({ yPercent: 112, duration: 1.1, ease: RISE }, HANDBACK), 0.08);
                if (rest[1]) tl.from(rest[1], Object.assign({ autoAlpha: 0, y: 16, duration: 0.7, ease: GLIDE }, HANDBACK), 0.34);
            });
        });

        /* A project deals in: the art wipes open from its bottom edge with the
           image settling back from an overscale, then the copy follows line by
           line. The wipe is a clip-path on the frame and the settle is a scale
           on the image — neither touches .proj-shot's own transform, which the
           hover lift owns. */
        document.querySelectorAll('.proj').forEach((proj) => {
            const shot = proj.querySelector('.proj-shot');
            const img = shot && shot.querySelector('img');
            const body = proj.querySelector('.proj-body');
            const bits = body ? Array.from(body.children) : [];
            const flip = Array.from(proj.parentNode.children).indexOf(proj) % 2 === 1;

            onArrival(proj, 'top 82%', () => {
                const tl = gsap.timeline();
                if (shot) {
                    tl.fromTo(shot,
                        { clipPath: 'inset(0% 0% 100% 0%)' },
                        { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.15, ease: RISE }, 0);
                }
                if (img) {
                    tl.from(img, { scale: 1.28, xPercent: flip ? 4 : -4, duration: 1.4, ease: RISE }, 0);
                }
                if (bits.length) {
                    // .proj-body's direct children include the Visit button
                    tl.from(bits, Object.assign({
                        autoAlpha: 0, y: 22, duration: 0.75, stagger: 0.08, ease: GLIDE,
                    }, HANDBACK), 0.22);
                }
            });

            // the art breathes against the scroll inside its own frame
            if (img) {
                gsap.fromTo(img, { yPercent: -3 }, {
                    yPercent: 3,
                    ease: 'none',
                    scrollTrigger: { trigger: proj, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
                });
            }
        });

        /* Rows arrive as a run, not one at a time: everything that crosses the
           line in the same frame shares one staggered tween. That is what
           ScrollTrigger.batch is for, and it is the difference between a list
           that deals and a list that pops. */
        function batch(sel, opts) {
            const els = gsap.utils.toArray(sel);
            if (!els.length) return;
            ScrollTrigger.batch(els, {
                start: 'top 90%',
                once: true,
                onEnter: (group) => gsap.from(group, Object.assign({
                    autoAlpha: 0,
                    y: 24,
                    duration: 0.8,
                    ease: GLIDE,
                    stagger: 0.08,
                    overwrite: true,
                }, HANDBACK, opts || {})),
            });
        }

        // the track record: the big number slides in from the margin, the
        // entry itself rises — two parts moving, which reads as one row
        document.querySelectorAll('.tr').forEach((row) => {
            const n = row.querySelector('.tr-n');
            const body = row.querySelector('.tr-body');
            onArrival(row, 'top 90%', () => {
                const tl = gsap.timeline();
                if (n) tl.from(n, Object.assign({ autoAlpha: 0, x: -22, duration: 0.7, ease: RISE }, HANDBACK), 0);
                if (body) tl.from(body, Object.assign({ autoAlpha: 0, y: 20, duration: 0.75, ease: GLIDE }, HANDBACK), 0.08);
            });
        });

        batch('.stack-row', { y: 16, duration: 0.6, stagger: 0.06 });
        batch('.paper-list li', { y: 20, stagger: 0.07 });

        document.querySelectorAll('.contact-card').forEach((card) => {
            onArrival(card, 'top 85%', () => {
                // rotation is relative to the angle the card is already dealt
                // at, and clearProps hands that angle back to the stylesheet
                gsap.from(card, Object.assign({
                    autoAlpha: 0, y: 46, rotation: '-=1.6', scale: 0.97,
                    duration: 1.1, ease: RISE, transformOrigin: '50% 100%',
                }, HANDBACK));
            });
        });

        /* =========================================================
           5. Pointer detail
           ========================================================= */

        /* ---- a light that follows the pointer across the project art ---- */
        if (fine) {
            document.querySelectorAll('.proj-shot').forEach((shot) => {
                const glow = document.createElement('span');
                glow.setAttribute('aria-hidden', 'true');
                glow.style.cssText =
                    'position:absolute;inset:0;pointer-events:none;opacity:0;z-index:2;' +
                    'background:radial-gradient(260px circle at var(--mx,50%) var(--my,50%),' +
                    'rgba(251,191,36,0.16),transparent 65%);transition:opacity .35s;';
                shot.appendChild(glow);
                shot.addEventListener('pointermove', (e) => {
                    const r = shot.getBoundingClientRect();
                    glow.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
                    glow.style.setProperty('--my', ((e.clientY - r.top) / r.height) * 100 + '%');
                    glow.style.opacity = '1';
                });
                shot.addEventListener('pointerleave', () => { glow.style.opacity = '0'; });
            });
        }

        /* The hero's call to action leans toward the cursor before you reach
           it. Scoped to that one button on purpose: .btn's press state is a
           CSS :active transform and an inline transform from GSAP would
           silently kill it everywhere else, and .cue's transform is already
           spoken for twice over (translateX(-50%) for centring, plus the
           cue-bob keyframes, which beat an inline style outright). */
        if (fine) {
            document.querySelectorAll('.hero-cta .btn').forEach((el) => {
                el.classList.add('magnetic');
                const qx = gsap.quickTo(el, 'x', { duration: 0.5, ease: 'power3.out' });
                const qy = gsap.quickTo(el, 'y', { duration: 0.5, ease: 'power3.out' });
                const qs = gsap.quickTo(el, 'scale', { duration: 0.35, ease: 'power2.out' });
                const REACH = 90;                 // px of pull around the button
                function move(e) {
                    const r = el.getBoundingClientRect();
                    const dx = e.clientX - (r.left + r.width / 2);
                    const dy = e.clientY - (r.top + r.height / 2);
                    const d = Math.hypot(dx, dy);
                    const k = Math.max(0, 1 - d / (Math.max(r.width, r.height) / 2 + REACH));
                    qx(dx * k * 0.35);
                    qy(dy * k * 0.35);
                }
                window.addEventListener('pointermove', move, { passive: true });
                el.addEventListener('pointerleave', () => { qx(0); qy(0); qs(1); });
                el.addEventListener('pointerdown', () => qs(0.96));
                el.addEventListener('pointerup', () => qs(1));
            });
        }

        ScrollTrigger.refresh();

        // last resort: if the ticker stalls while visible, never leave the
        // hero stuck in its from-state
        setTimeout(function () {
            if (intro && intro.progress() < 1) intro.progress(1);
        }, 7000);
    }

    if (document.hidden) {
        document.addEventListener('visibilitychange', function once() {
            if (document.hidden) return;
            document.removeEventListener('visibilitychange', once);
            boot();
        });
    } else {
        boot();
    }
})();
