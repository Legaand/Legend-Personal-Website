/* ============================================================
   The ribbon spread — GSAP ScrollTrigger drives the whole show.
   Scroll 1: the stacked deck spreads into a fan (bicycle backs).
   Then one segment per card: it rises out of the fan, flips face-up
   in the spotlight, and slides back before the next card takes over.
   If motion is reduced or GSAP is missing, the page stays in its
   static CSS layout (grid of face-up cards) and this file exits.
   ============================================================ */

(function () {
    'use strict';

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cards = Array.from(document.querySelectorAll('.spread-card'));
    const N = cards.length;

    if (reduceMotion || !window.gsap || !window.ScrollTrigger || N === 0) return;

    document.body.classList.add('live');
    gsap.registerPlugin(ScrollTrigger);

    const show = document.getElementById('show');
    const hud = document.querySelector('.hud');
    const hudAct = document.getElementById('hud-act');
    const hudCount = document.getElementById('hud-count');
    const hint = document.querySelector('.show-hint');
    const flips = cards.map((c) => c.querySelector('.flip'));
    const backs = cards.map((c) => c.querySelector('.side.back'));
    const faces = cards.map((c) => c.querySelector('.side.face'));

    const SEGMENTS = N + 1; // segment 0 = deck spreads into the fan
    const rad = (d) => (d * Math.PI) / 180;

    let st = null;
    let tl = null;
    let fillers = null;

    // decorative face-down cards interleaved between the content cards so
    // the fan reads as a full ribbon spread (live mode only)
    function ensureFillers() {
        if (fillers) return;
        const spreadEl = document.querySelector('.spread');
        fillers = [];
        for (let k = 0; k <= N; k++) {
            const li = document.createElement('li');
            li.className = 'spread-card filler';
            li.setAttribute('aria-hidden', 'true');
            li.innerHTML = '<div class="flip"><div class="side back"><svg><use href="#card-back"/></svg></div></div>';
            spreadEl.appendChild(li);
            fillers.push(li);
        }
    }

    function build() {
        ensureFillers();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const cardW = cards[0].offsetWidth;

        const fanW = Math.min(150, Math.max(86, vw * 0.125));
        const fanScale = fanW / cardW;
        const spreadW = Math.min(vw * 0.84, 1100);
        const maxA = vw < 640 ? 44 : 34;
        const R = spreadW / (2 * Math.sin(rad(maxA)));
        const baseY = vh * 0.17;   // fan apex just below stage centre
        const popY = -vh * 0.015;  // popped card floats just above centre

        // slots along the arc: filler, card, filler, card, ... filler
        const M = N + fillers.length;
        const slotPos = (j) => {
            const a = -maxA + (j / (M - 1)) * 2 * maxA;
            return {
                x: R * Math.sin(rad(a)),
                y: baseY + R * (1 - Math.cos(rad(a))),
                rotation: a,
            };
        };
        const fan = cards.map((_, i) => slotPos(2 * i + 1));
        const fanFill = fillers.map((_, k) => slotPos(2 * k));

        // start: a squared-up deck resting where the fan's centre will be
        const deckSet = (el, slot) => gsap.set(el, {
            xPercent: -50,
            yPercent: -50,
            x: 0,
            y: baseY + 26,
            rotation: (slot % 3) - 1,
            scale: fanScale,
            zIndex: slot + 1,
        });
        cards.forEach((card, i) => deckSet(card, 2 * i + 1));
        fillers.forEach((f, k) => deckSet(f, 2 * k));
        gsap.set(flips, { scaleX: 1, transformOrigin: '50% 50%' });
        gsap.set(backs, { autoAlpha: 1 });
        gsap.set(faces, { autoAlpha: 0 });
        if (hint) gsap.set(hint, { opacity: 1 });

        tl = gsap.timeline({ paused: true });

        // segment 0 — the ribbon spread (all slots, staggered along the arc)
        for (let j = 0; j < M; j++) {
            const el = j % 2 ? cards[(j - 1) / 2] : fillers[j / 2];
            const p = j % 2 ? fan[(j - 1) / 2] : fanFill[j / 2];
            tl.to(el, { ...p, duration: 0.7, ease: 'power2.out' }, 0.008 * j);
        }
        if (hint) tl.to(hint, { opacity: 0, duration: 0.3 }, 0.9);

        // one segment per card — rise, edge-flip swap, hold, return.
        // The flip is 2D (scaleX through 0) on purpose: any 3D transform here
        // makes Chromium paint the cards above fixed UI like the side nav.
        cards.forEach((card, i) => {
            const seg = 1 + i;
            tl.set(card, { zIndex: 200 }, seg + 0.001);
            tl.to(card, { x: 0, y: popY, rotation: 0, scale: 1, duration: 0.24, ease: 'power2.inOut' }, seg);
            tl.to(flips[i], { scaleX: 0.04, duration: 0.1, ease: 'power1.in' }, seg + 0.08);
            tl.set(backs[i], { autoAlpha: 0 }, seg + 0.18);
            tl.set(faces[i], { autoAlpha: 1 }, seg + 0.18);
            tl.to(flips[i], { scaleX: 1, duration: 0.1, ease: 'power1.out' }, seg + 0.181);
            // flip shut on the way back
            tl.to(flips[i], { scaleX: 0.04, duration: 0.09, ease: 'power1.in' }, seg + 0.76);
            tl.set(faces[i], { autoAlpha: 0 }, seg + 0.85);
            tl.set(backs[i], { autoAlpha: 1 }, seg + 0.85);
            tl.to(flips[i], { scaleX: 1, duration: 0.09, ease: 'power1.out' }, seg + 0.851);
            tl.to(card, { ...fan[i], scale: fanScale, duration: 0.22, ease: 'power2.inOut' }, seg + 0.78);
            tl.set(card, { zIndex: 2 * i + 2 }, seg + 0.999);
        });

        // resting points: the open fan, then each card's spotlight hold
        const snaps = [0, 1 / SEGMENTS];
        for (let i = 0; i < N; i++) snaps.push((i + 1.5) / SEGMENTS);
        snaps.push(1);

        st = ScrollTrigger.create({
            trigger: show,
            start: 'top top',
            end: () => '+=' + Math.round(SEGMENTS * window.innerHeight),
            pin: true,
            scrub: 0.5,
            anticipatePin: 1,
            animation: tl,
            snap: { snapTo: snaps, duration: { min: 0.2, max: 0.6 }, delay: 0.1, ease: 'power1.inOut', inertia: false },
            onUpdate(self) { updateHud(self.progress); },
            onToggle(self) { hud.classList.toggle('on', self.isActive); },
        });
    }

    function updateHud(progress) {
        const t = progress * SEGMENTS;
        const idx = Math.min(N - 1, Math.floor(t - 1));
        if (window.highlightNavCard) window.highlightNavCard(idx);
        if (idx >= 0) {
            hudAct.textContent = cards[idx].dataset.act;
            hudCount.textContent = (idx + 1) + ' / ' + N;
        } else {
            hudAct.textContent = 'THE SPREAD';
            hudCount.textContent = N + ' CARDS';
        }
    }

    function teardown() {
        if (st) st.kill();
        if (tl) tl.kill();
        gsap.set(cards, { clearProps: 'all' });
        if (fillers) gsap.set(fillers, { clearProps: 'all' });
        gsap.set(flips, { clearProps: 'all' });
        gsap.set(backs, { clearProps: 'all' });
        gsap.set(faces, { clearProps: 'all' });
        if (hint) gsap.set(hint, { clearProps: 'all' });
    }

    // ---- smooth programmatic scrolling (rAF tween; cancels on user input) --
    let scrollAnim = null;
    function animateScrollTo(targetY, ms) {
        cancelAnimationFrame(scrollAnim);
        const startY = window.scrollY;
        const delta = targetY - startY;
        if (Math.abs(delta) < 2 || ms === 0) { window.scrollTo(0, targetY); return; }
        const t0 = performance.now();
        const cancel = () => cancelAnimationFrame(scrollAnim);
        window.addEventListener('wheel', cancel, { once: true, passive: true });
        window.addEventListener('touchstart', cancel, { once: true, passive: true });
        (function step(now) {
            const t = Math.min(1, (now - t0) / ms);
            const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // easeInOutCubic
            window.scrollTo(0, startY + delta * e);
            if (t < 1) scrollAnim = requestAnimationFrame(step);
        })(t0);
    }

    // ---- the cut: teleport without scrubbing through every card ----------
    // Fading the stage, jumping, and forcing the scrub tween to its end
    // avoids the strobe of fast-forwarding the whole timeline.
    let cutting = false;
    function cut(top, skipFade) {
        const settle = () => {
            window.scrollTo(0, top);
            ScrollTrigger.update(); // create the scrub tween for the new position now
            const tween = st.getTween && st.getTween();
            if (tween) tween.progress(1);
        };
        if (skipFade) { settle(); return; }
        if (cutting) return;
        cutting = true;
        gsap.timeline({ onComplete: () => { cutting = false; } })
            .to(show, { opacity: 0, duration: 0.16, ease: 'power1.in' })
            .add(settle)
            .to(show, { opacity: 1, duration: 0.3, ease: 'power1.out' }, '+=0.05');
    }

    // ---- public navigation: scroll so card i sits in its spotlight hold ----
    function jumpToCard(i, behavior) {
        if (!st) return;
        const p = (i + 1.5) / SEGMENTS;
        const top = st.start + p * (st.end - st.start);
        if (behavior === 'instant') { cut(top, true); return; }
        // neighbours scroll smoothly; anything further cuts to avoid strobing
        if (Math.abs(top - window.scrollY) <= window.innerHeight * 1.6) {
            animateScrollTo(top, 700);
        } else {
            cut(top);
        }
    }

    window.jumpToSection = function (section, behavior) {
        const i = cards.findIndex((c) => c.dataset.section === section);
        if (i !== -1) jumpToCard(i, behavior);
    };
    window.jumpToCardIndex = jumpToCard;

    // fanned cards double as clickable / keyboard-focusable shortcuts
    cards.forEach((card, i) => {
        card.tabIndex = 0;
        card.addEventListener('click', (e) => {
            if (e.target.closest('a')) return; // let links on the face work
            jumpToCard(i);
        });
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                jumpToCard(i);
            }
        });
    });

    // ---- rebuild on real viewport changes (ignore mobile URL-bar jitter) ----
    let lastW = window.innerWidth;
    let lastH = window.innerHeight;
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const dW = Math.abs(window.innerWidth - lastW);
            const dH = Math.abs(window.innerHeight - lastH);
            if (dW < 4 && dH < 140) return;
            lastW = window.innerWidth;
            lastH = window.innerHeight;
            const progress = st ? st.progress : 0;
            teardown();
            build();
            ScrollTrigger.refresh();
            window.scrollTo(0, st.start + progress * (st.end - st.start));
        }, 250);
    });

    build();
})();
