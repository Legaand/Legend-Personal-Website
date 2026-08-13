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

    gsap.timeline({ defaults: { ease: 'power3.out' } })
        .from('.eyebrow', { autoAlpha: 0, y: 14, duration: 0.7 })
        .from(words, { yPercent: 115, duration: 1.05, stagger: 0.09, ease: 'power4.out' }, 0.12)
        .from('.lede', { autoAlpha: 0, y: 16, duration: 0.8 }, 0.55)
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
        const all = Array.from(el.querySelectorAll('.rail-card'));
        const items = all;
        if (!items.length) return;

        el.classList.add('dealt');

        const allCount = all.length;
        const parts = all.map((card, i) => ({
            card: card,
            back: card.querySelector('.rc-back'),
            face: card.querySelector('.rc-face'),
            label: card.querySelector('.rail-label'),
            num: card.querySelector('.rail-num'),
            // A real ribbon spread: the stack bows out along an arc (middle
            // cards pushed furthest right) and the fan angle sweeps with it,
            // rather than sitting as a straight column of near-parallel cards.
            rest: Math.round(30 * Math.sin((i / (allCount - 1)) * Math.PI)),
            rot: -15 + (i / (allCount - 1)) * 30,
        }));
        const partOf = new Map(parts.map((p) => [p.card, p]));

        // Move each index out of its card and pin it to the rail. Inside the
        // card it inherited the fan rotation and the rotation's positional
        // shift, so the column came out tilted and ragged by ~10px.
        function pinNumbers() {
            parts.forEach((p) => {
                if (!p.num) return;
                const mid = p.card.offsetTop + p.card.offsetHeight / 2;
                if (p.num.parentElement !== el) el.appendChild(p.num);
                p.num.style.left = '22px';
                p.num.style.top = mid + 'px';
            });
        }
        pinNumbers();
        let pinTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(pinTimer);
            pinTimer = setTimeout(pinNumbers, 200);
        });

        // deal in: the stack slides out of the left edge on load
        parts.forEach((p, i) => {
            // later cards overlap earlier ones, so a card popping out from
            // higher in the stack would be clipped by the ones below it
            gsap.set(p.card, { x: p.rest - 60, autoAlpha: 0, rotation: p.rot, scale: 1, zIndex: i });
            if (p.face) gsap.set(p.face, { autoAlpha: 0, scaleX: 1 });
            if (p.back) gsap.set(p.back, { autoAlpha: 1, scaleX: 1 });
            if (p.label) gsap.set(p.label, { autoAlpha: 0, x: -8 });
        });
        gsap.to(parts.map((p) => p.card), {
            x: (i) => parts[i].rest,
            autoAlpha: 1,
            duration: 0.7,
            ease: 'power3.out',
            stagger: 0.05,
            delay: 0.5,
        });

        let current = -1;

        function show(p, on) {
            if (!p || !p.face) return;
            if (p.num) p.num.classList.toggle('on', on);
            gsap.killTweensOf([p.card, p.back, p.face, p.label]);
            // The kill above can take out the deal-in tween mid-flight, and
            // that tween owned the card's fade to visible — without this the
            // card is stuck invisible whenever the reader scrolls into a
            // section before the rail has finished dealing.
            gsap.set(p.card, { autoAlpha: 1 });
            const tl = gsap.timeline();
            if (on) {
                gsap.set(p.card, { zIndex: 20 });
                // 14px rather than 0: flush against the viewport edge reads
                // like a rendering mistake rather than a deliberate inset
                tl.to(p.card, { x: p.rest + 52, rotation: 0, scale: 1.12,
                                duration: 0.45, ease: 'power3.out' }, 0)
                  .to(p.back, { scaleX: 0.02, duration: 0.14, ease: 'power2.in' }, 0.06)
                  .set(p.back, { autoAlpha: 0 }, 0.2)
                  .set(p.face, { autoAlpha: 1, scaleX: 0.02 }, 0.2)
                  .to(p.face, { scaleX: 1, duration: 0.16, ease: 'power2.out' }, 0.201)
                  .to(p.label, { autoAlpha: 1, x: 0, duration: 0.3, ease: 'power2.out' }, 0.24);
            } else {
                tl.to(p.label, { autoAlpha: 0, x: -8, duration: 0.2, ease: 'power2.in' }, 0)
                  .to(p.face, { scaleX: 0.02, duration: 0.13, ease: 'power2.in' }, 0)
                  .set(p.face, { autoAlpha: 0 }, 0.14)
                  .set(p.back, { autoAlpha: 1, scaleX: 0.02 }, 0.14)
                  .to(p.back, { scaleX: 1, duration: 0.13, ease: 'power2.out' }, 0.141)
                  .to(p.card, { x: p.rest, rotation: p.rot, scale: 1, duration: 0.35, ease: 'power3.inOut' }, 0)
                  .set(p.card, { zIndex: parts.indexOf(p) });
            }
        }

        // called by script.js from the scroll handler; i indexes the section
        // cards, not the full stack
        window.railSetActive = function (i) {
            if (i === current) return;
            if (current >= 0 && items[current]) show(partOf.get(items[current]), false);
            current = i;
            if (i >= 0 && items[i]) show(partOf.get(items[i]), true);
        };

        // script.js runs first and its observer may already have marked a
        // card active before this file defined railSetActive — sync up
        const pre = items.findIndex((c) => c.classList.contains('active'));
        if (pre >= 0) window.railSetActive(pre);

        // hovering peeks a card out without turning it over
        items.forEach((card, i) => {
            const p = partOf.get(card);
            p.card.addEventListener('pointerenter', () => {
                if (i === current) return;
                gsap.to(p.card, { x: p.rest + 24, duration: 0.3, ease: 'power3.out' });
            });
            p.card.addEventListener('pointerleave', () => {
                if (i === current) return;
                gsap.to(p.card, { x: p.rest, duration: 0.3, ease: 'power3.out' });
            });
        });
    })();

    /* ---- cards drifting down the gutters, clickable ---- */
    (function drift() {
        const layer = document.getElementById('drift');
        if (!layer) return;

        // three depth tiers, back to front; the far ones are small, blurred
        // and slow, the near ones large and quicker — that spread is what
        // makes it read as depth rather than as scattered confetti
        const TIERS = [
            { cls: 'd-far',  n: 9, w: 86,  min: 70, max: 105 },
            { cls: 'd-mid',  n: 6, w: 140, min: 52, max: 78 },
            { cls: 'd-near', n: 3, w: 205, min: 38, max: 56 },
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

    ScrollTrigger.refresh();
})();
