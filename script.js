/* ============================================================
   Small helpers: scroll progress bar, nav jumps, hash deep links.
   Section navigation goes through window.jumpToSection, which
   animations.js provides in live mode; the fallback below covers
   the static layout (no JS motion / reduced motion).
   ============================================================ */

(function () {
    'use strict';

    // static-mode fallback: cards carry the section ids, just scroll to them
    if (!window.jumpToSection) {
        window.jumpToSection = function (section) {
            const el = document.getElementById(section);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
    }

    // nav + hero cue
    document.querySelectorAll('[data-jump]').forEach((btn) => {
        btn.addEventListener('click', () => window.jumpToSection(btn.dataset.jump));
    });

    // ---- side nav: acts + every card, generated from the spread itself ----
    const cards = Array.from(document.querySelectorAll('.spread-card'));
    const sideNav = document.createElement('nav');
    sideNav.id = 'side-nav';
    sideNav.setAttribute('aria-label', 'All cards');

    const itemBtns = [];
    const actGroups = [];
    let currentAct = null;
    let currentList = null;

    function goToCard(card, i) {
        if (window.jumpToCardIndex) {
            window.jumpToCardIndex(i);
        } else {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    cards.forEach((card, i) => {
        const act = card.dataset.act;
        if (act !== currentAct) {
            currentAct = act;
            const group = document.createElement('div');
            group.className = 'side-act';
            const actBtn = document.createElement('button');
            actBtn.className = 'side-act-btn';
            actBtn.textContent = act;
            actBtn.addEventListener('click', () => goToCard(card, i));
            currentList = document.createElement('ul');
            currentList.className = 'side-list';
            group.appendChild(actBtn);
            group.appendChild(currentList);
            sideNav.appendChild(group);
            actGroups.push({ group: group, firstIndex: i });
        }
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.className = 'side-item';
        btn.textContent = card.querySelector('h3').textContent;
        btn.addEventListener('click', () => goToCard(card, i));
        li.appendChild(btn);
        currentList.appendChild(li);
        itemBtns.push(btn);
    });
    document.body.appendChild(sideNav);

    // called by animations.js as the scrubbed show advances (-1 = no card up)
    let lastActive = null;
    window.highlightNavCard = function (idx) {
        if (idx === lastActive) return;
        lastActive = idx;
        itemBtns.forEach((btn, i) => btn.classList.toggle('active', i === idx));
        actGroups.forEach((g, gi) => {
            const next = actGroups[gi + 1];
            const on = idx >= g.firstIndex && (!next || idx < next.firstIndex);
            g.group.classList.toggle('active', on);
        });
    };

    // hash deep links: #projects lands on the first projects card
    function handleHash(behavior) {
        const section = window.location.hash.slice(1);
        if (!section) return;
        window.jumpToSection(section, behavior);
    }
    window.addEventListener('hashchange', () => handleHash('smooth'));
    window.addEventListener('load', () => handleHash('instant'));

    // scroll progress bar
    const progress = document.getElementById('progress');
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            const max = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            const p = max > 0 ? window.scrollY / max : 0;
            progress.style.transform = 'scaleX(' + p + ')';
            ticking = false;
        });
    });
})();
