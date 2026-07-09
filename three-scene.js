// Three.js Hero Scene — Scroll-driven Icosahedron
(function () {
    const canvas = document.getElementById('hero-3d');
    if (!canvas) return;

    // Skip Three.js on mobile or reduced motion
    const isMobile = window.innerWidth < 768;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (isMobile || prefersReducedMotion) {
        canvas.style.display = 'none';
        return;
    }

    // Scene setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    camera.position.z = 4;

    // --- Icosahedron wireframe ---
    const icoGeometry = new THREE.IcosahedronGeometry(1.8, 1);
    const edges = new THREE.EdgesGeometry(icoGeometry, 15);
    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.8 });
    const edgeMesh = new THREE.LineSegments(edges, edgeMaterial);
    scene.add(edgeMesh);

    // --- Vertex points ---
    const pointsGeometry = new THREE.BufferGeometry();
    const icoPositions = icoGeometry.getAttribute('position');
    // Deduplicate vertices (IcosahedronGeometry has duplicates)
    const uniqueVerts = [];
    const seen = new Set();
    for (let i = 0; i < icoPositions.count; i++) {
        const key = `${icoPositions.getX(i).toFixed(3)},${icoPositions.getY(i).toFixed(3)},${icoPositions.getZ(i).toFixed(3)}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueVerts.push(icoPositions.getX(i), icoPositions.getY(i), icoPositions.getZ(i));
        }
    }
    pointsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(uniqueVerts, 3));
    const pointsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0.9 });
    const points = new THREE.Points(pointsGeometry, pointsMaterial);
    scene.add(points);

    // --- Background particles ---
    const particleCount = 200;
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
        particlePositions[i * 3] = (Math.random() - 0.5) * 20;
        particlePositions[i * 3 + 1] = (Math.random() - 0.5) * 20;
        particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    const bgParticlesGeometry = new THREE.BufferGeometry();
    bgParticlesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(particlePositions, 3));
    const bgParticlesMaterial = new THREE.PointsMaterial({ color: 0xef4444, size: 0.02, transparent: true, opacity: 0.4 });
    const bgParticles = new THREE.Points(bgParticlesGeometry, bgParticlesMaterial);
    scene.add(bgParticles);

    // --- Store original positions for explosion ---
    const edgeOrigPositions = new Float32Array(edges.getAttribute('position').array);
    const pointOrigPositions = new Float32Array(pointsGeometry.getAttribute('position').array);

    // --- Scroll progress (written by GSAP ScrollTrigger) ---
    window.heroScrollProgress = 0;
    let isHeroVisible = true;

    // --- Animation loop ---
    const clock = new THREE.Clock();

    function animate() {
        if (!isHeroVisible) {
            requestAnimationFrame(animate);
            return;
        }

        const elapsed = clock.getElapsedTime();
        const progress = window.heroScrollProgress || 0;

        // Base rotation (slows as scroll progresses)
        const rotationSpeed = Math.max(0.1, 1 - progress);
        edgeMesh.rotation.y = elapsed * 0.3 * rotationSpeed;
        edgeMesh.rotation.x = elapsed * 0.15 * rotationSpeed;
        points.rotation.y = edgeMesh.rotation.y;
        points.rotation.x = edgeMesh.rotation.x;

        // Background particles slow rotation
        bgParticles.rotation.y = elapsed * 0.02;

        // --- Explosion effect (progress 0.2 - 0.7) ---
        const explosionProgress = Math.max(0, Math.min(1, (progress - 0.2) / 0.5));
        const explosionStrength = explosionProgress * 3.0;

        // Displace edge vertices outward
        const edgePos = edges.getAttribute('position');
        for (let i = 0; i < edgePos.count; i++) {
            const ox = edgeOrigPositions[i * 3];
            const oy = edgeOrigPositions[i * 3 + 1];
            const oz = edgeOrigPositions[i * 3 + 2];
            const len = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
            const nx = ox / len;
            const ny = oy / len;
            const nz = oz / len;
            edgePos.setXYZ(
                i,
                ox + nx * explosionStrength + Math.sin(elapsed + i) * explosionProgress * 0.3,
                oy + ny * explosionStrength + Math.cos(elapsed + i * 0.7) * explosionProgress * 0.3,
                oz + nz * explosionStrength + Math.sin(elapsed * 0.5 + i * 1.3) * explosionProgress * 0.3
            );
        }
        edgePos.needsUpdate = true;

        // Displace vertex points
        const ptPos = pointsGeometry.getAttribute('position');
        for (let i = 0; i < ptPos.count; i++) {
            const ox = pointOrigPositions[i * 3];
            const oy = pointOrigPositions[i * 3 + 1];
            const oz = pointOrigPositions[i * 3 + 2];
            const len = Math.sqrt(ox * ox + oy * oy + oz * oz) || 1;
            const nx = ox / len;
            const ny = oy / len;
            const nz = oz / len;
            ptPos.setXYZ(
                i,
                ox + nx * explosionStrength * 1.2 + Math.sin(elapsed * 2 + i) * explosionProgress * 0.5,
                oy + ny * explosionStrength * 1.2 + Math.cos(elapsed * 2 + i) * explosionProgress * 0.5,
                oz + nz * explosionStrength * 1.2
            );
        }
        ptPos.needsUpdate = true;

        // --- Scale (slight grow then shrink) ---
        const scaleVal = 1 + progress * 0.3 - explosionProgress * 0.2;
        edgeMesh.scale.setScalar(scaleVal);
        points.scale.setScalar(scaleVal);

        // --- Fade out (progress 0.7 - 1.0) ---
        const fadeProgress = Math.max(0, Math.min(1, (progress - 0.7) / 0.3));
        edgeMaterial.opacity = 0.8 * (1 - fadeProgress);
        pointsMaterial.opacity = 0.9 * (1 - fadeProgress);
        bgParticlesMaterial.opacity = 0.4 * (1 - fadeProgress);

        // Stop rendering when fully faded
        isHeroVisible = fadeProgress < 1;

        renderer.render(scene, camera);
        requestAnimationFrame(animate);
    }
    animate();

    // --- Resize handler ---
    function onResize() {
        const header = canvas.closest('header');
        if (!header) return;
        const w = header.clientWidth;
        const h = header.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }
    window.addEventListener('resize', onResize);

    // Re-enable rendering when scrolling back up
    window.addEventListener('scroll', function () {
        if (!isHeroVisible && window.heroScrollProgress < 0.95) {
            isHeroVisible = true;
        }
    });
})();
