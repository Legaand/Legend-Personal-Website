/* ============================================================
   The motion layer. Everything here is additive: script.js has
   already put the page in its correct resting state, so if this
   file exits early (reduced motion, or GSAP missing) the visitor
   gets the complete, legible page — just without the show.

   Rule: never set a hidden initial state in CSS. Every "from"
   state is established here at runtime, so a no-JS visitor can
   never end up staring at content that was waiting for a tween.
   ============================================================ */

(function () {
    'use strict';

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !window.gsap || !window.ScrollTrigger) return;

    gsap.registerPlugin(ScrollTrigger);

    /* The whole motion layer waits until the page is actually visible.

       Every entrance below is a GSAP `from`, which hides its target the moment
       the tween is *created* and only reveals it as the tween runs. In a
       background tab Chrome throttles requestAnimationFrame, so the tween
       never runs and the hero — eyebrow, name, pill, buttons, cue — sits
       completely blank. Same for every section reveal. Until boot() runs the
       page stays in its plain CSS state, which is already complete. */
    function boot() {

        /* ---------------------------------------------------------
           1. The hero: name rises out of a mask, deck spreads open
           --------------------------------------------------------- */

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

        const intro = gsap.timeline({ defaults: { ease: 'power3.out' } });
        intro
            .from('.eyebrow', { autoAlpha: 0, y: 14, duration: 0.7 })
            .from(words, { yPercent: 115, duration: 1.05, stagger: 0.09, ease: 'power4.out' }, 0.12)
            .from('.pill', { autoAlpha: 0, y: 12, duration: 0.6, stagger: 0.07 }, 0.7)
            .from('.hero-cta .btn', { autoAlpha: 0, y: 12, duration: 0.6, stagger: 0.08 }, 0.82)
            .from('.cue', { autoAlpha: 0, duration: 0.6 }, 1.1);

        // the hero text lifts away as the page takes over
        if (hero) {
            gsap.to('.hero-inner', {
                yPercent: -18,
                autoAlpha: 0,
                ease: 'none',
                scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true },
            });
        }

        /* ---------------------------------------------------------
           2b. The rail, and the falling cards behind the page.
           --------------------------------------------------------- */

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
            const STEP = 11;                       // degrees between neighbours
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

            function layout(activeIdx, animate) {
                // with nothing active the wheel rests centred on its middle card
                const centre = activeIdx >= 0 ? activeIdx : (parts.length - 1) / 2;
                parts.forEach((p, i) => {
                    const s = slot(i, centre);
                    const on = i === activeIdx;
                    const to = {
                        x: s.x + (on ? 56 : 0),
                        y: s.y,
                        rotation: on ? 0 : s.rot,
                        scale: on ? 1.1 : 1,
                        yPercent: -50,
                        zIndex: on ? 40 : 20 - Math.round(Math.abs(i - centre)),
                        autoAlpha: 1,
                    };
                    if (animate) {
                        gsap.to(p.card, Object.assign(to, { duration: 0.7, ease: 'power3.out' }));
                        if (p.num) gsap.to(p.num, { y: s.y, yPercent: -50, duration: 0.7, ease: 'power3.out' });
                    } else {
                        gsap.set(p.card, to);
                        if (p.num) gsap.set(p.num, { y: s.y, yPercent: -50 });
                    }
                });
            }

            // the flip only swaps the sides; the wheel handles every position
            function turn(p, on) {
                if (!p || !p.face) return;
                if (p.num) p.num.classList.toggle('on', on);
                gsap.killTweensOf([p.back, p.face, p.label]);
                const tl = gsap.timeline();
                if (on) {
                    tl.to(p.back, { scaleX: 0.02, duration: 0.14, ease: 'power2.in' }, 0.12)
                      .set(p.back, { autoAlpha: 0 }, 0.26)
                      .set(p.face, { autoAlpha: 1, scaleX: 0.02 }, 0.26)
                      .to(p.face, { scaleX: 1, duration: 0.16, ease: 'power2.out' }, 0.261)
                      .to(p.label, { autoAlpha: 1, duration: 0.3, ease: 'power2.out' }, 0.3);
                } else {
                    tl.to(p.label, { autoAlpha: 0, duration: 0.18, ease: 'power2.in' }, 0)
                      .to(p.face, { scaleX: 0.02, duration: 0.13, ease: 'power2.in' }, 0)
                      .set(p.face, { autoAlpha: 0 }, 0.14)
                      .set(p.back, { autoAlpha: 1, scaleX: 0.02 }, 0.14)
                      .to(p.back, { scaleX: 1, duration: 0.13, ease: 'power2.out' }, 0.141);
                }
            }

            // deal in: the wheel swings up from off the left edge
            parts.forEach((p) => {
                gsap.set(p.card, { autoAlpha: 0, x: -260, y: 0, rotation: -40, yPercent: -50 });
                gsap.set(p.face, { autoAlpha: 0, scaleX: 1 });
                gsap.set(p.back, { autoAlpha: 1, scaleX: 1 });
                gsap.set(p.label, { autoAlpha: 0 });
                if (p.num) gsap.set(p.num, { autoAlpha: 0, yPercent: -50 });
            });
            gsap.delayedCall(0.35, () => {
                layout(current, true);
                gsap.to(parts.map((p) => p.num).filter(Boolean),
                        { autoAlpha: 1, duration: 0.5, stagger: 0.04 });
            });

            // called by script.js from the scroll handler
            window.railSetActive = function (i) {
                if (i === current) return;
                const prev = current;
                current = i;
                layout(i, true);                   // the whole wheel turns
                if (prev >= 0 && parts[prev]) turn(parts[prev], false);
                if (i >= 0 && parts[i]) turn(parts[i], true);
            };

            // script.js runs first and its observer may already have marked a
            // card active before this file defined railSetActive — sync up
            const pre = items.findIndex((c) => c.classList.contains('active'));
            if (pre >= 0) window.railSetActive(pre);

            window.addEventListener('resize', () => layout(current, false));
        })();

        /* ---- cards drifting down the gutters, clickable ---- */
        (function drift() {
            const layer = document.getElementById('drift');
            if (!layer) return;

            // three depth tiers, back to front; the far ones are small, blurred
            // and slow, the near ones large and quicker — that spread is what
            // makes it read as depth rather than as scattered confetti
            const TIERS = [
                { cls: 'd-far',  n: 15, w: 86,  min: 70, max: 105 },
                { cls: 'd-mid',  n: 10, w: 140, min: 52, max: 78 },
                { cls: 'd-near', n: 5, w: 205, min: 38, max: 56 },
            ];

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

            TIERS.forEach((t) => {
                for (let i = 0; i < t.n; i++) {
                    const el = document.createElement('div');
                    el.className = 'dcard ' + t.cls;
                    el.innerHTML = '<svg><use href="#card-back"/></svg>';
                    layer.appendChild(el);
                    float(el, t.w, t.min, t.max, true);
                }
            });
        })();

        /* ---------------------------------------------------------
           Section reveals
           --------------------------------------------------------- */

        const reveal = (targets, opts) => {
            gsap.utils.toArray(targets).forEach((el) => {
                gsap.from(el, Object.assign({
                    autoAlpha: 0,
                    y: 26,
                    duration: 0.8,
                    ease: 'power3.out',
                    scrollTrigger: { trigger: el, start: 'top 86%' },
                }, opts || {}));
            });
        };

        reveal('.sec-head');
        reveal('.proj');
        reveal('.tr', { y: 18, duration: 0.6 });
        reveal('.stack-row', { y: 14, duration: 0.55 });
        reveal('.paper-list li');
        reveal('.contact-card', { y: 30 });

        gsap.from('.stat', {
            autoAlpha: 0,
            y: 24,
            duration: 0.7,
            ease: 'power3.out',
            stagger: 0.07,
            scrollTrigger: { trigger: '.stats', start: 'top 85%' },
        });

        /* ---------------------------------------------------------
           The count — numbers roll up when the band arrives
           --------------------------------------------------------- */

        function format(value, decimals, suffix) {
            const n = decimals
                ? value.toFixed(decimals)
                : Math.round(value).toLocaleString('en-US');
            return n + (suffix || '');
        }

        document.querySelectorAll('.stat-n').forEach((el) => {
            const to = parseFloat(el.dataset.to);
            if (isNaN(to)) return;
            const decimals = parseInt(el.dataset.decimals || '0', 10);
            const suffix = el.dataset.suffix || '';
            const counter = { v: 0 };

            // The HTML carries the final value so no-JS/reduced-motion readers see
            // the real number. Now that we know the count-up will run, wind it back
            // to zero — the band sits below the fold, so this is never seen as a flash.
            el.textContent = format(0, decimals, suffix);

            ScrollTrigger.create({
                trigger: el,
                start: 'top 88%',
                once: true,
                onEnter() {
                    gsap.to(counter, {
                        v: to,
                        duration: 1.8,
                        ease: 'power2.out',
                        onUpdate() { el.textContent = format(counter.v, decimals, suffix); },
                        onComplete() { el.textContent = format(to, decimals, suffix); },
                    });
                },
            });
        });

        /* ---- a light that follows the pointer across the project art ---- */
        document.querySelectorAll('.proj-shot').forEach((shot) => {
            if (!window.matchMedia('(pointer: fine)').matches) return;
            const glow = document.createElement('span');
            glow.setAttribute('aria-hidden', 'true');
            glow.style.cssText =
                'position:absolute;inset:0;pointer-events:none;opacity:0;' +
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
