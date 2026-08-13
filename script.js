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
