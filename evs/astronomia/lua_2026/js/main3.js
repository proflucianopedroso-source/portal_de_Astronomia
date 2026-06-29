const THREE = window.THREE;

// --- Configuração Inicial ---
let scene, camera, renderer, controls;
let observerViewCamera, observerViewRenderer;
let sun, earth, moon, observerMarker, earthOrbitGroup;
let sunLight;
let guideline, raycaster;

// Elementos da UI
const sceneContainer = document.getElementById('scene-container');
const observerViewContainer = document.getElementById('observer-sky-view-container');
const moonOrbitSlider = document.getElementById('moon-orbit-slider');
const moonOrbitValue = document.getElementById('moon-orbit-value');
const observerLatSlider = document.getElementById('observer-lat-slider');
const observerLatValue = document.getElementById('observer-lat-value');
const observerLonSlider = document.getElementById('observer-lon-slider');
const observerLonValue = document.getElementById('observer-lon-value');
const timeDisplay = document.getElementById('time-display');
const playButton = document.getElementById('play-button');
const pauseButton = document.getElementById('pause-button');
const mainPhaseDisplay = document.getElementById('main-phase-display');
const speedSlider = document.getElementById('speed-slider');
const speedValue = document.getElementById('speed-value');
const scaleToggleButton = document.getElementById('scale-toggle-button');
// Elementos do Modal de Ajuda
const helpButton = document.getElementById('help-button');
const helpModal = document.getElementById('help-modal');
const closeHelpModalButton = document.getElementById('close-help-modal');


// Constantes Base
const EARTH_RADIUS = 5;
const MOON_RADIUS = EARTH_RADIUS * 0.27;
const SUN_RADIUS_FACTOR = 4;

// Constantes para Escalas
const REALISTIC_SCALE = {
    name: "Realistic",
    sunDistance: EARTH_RADIUS * 150,
    moonOrbitRadius: EARTH_RADIUS * 10,
    cameraMaxDistance: EARTH_RADIUS * 180,
    sunVisualRadius: EARTH_RADIUS * SUN_RADIUS_FACTOR
};
const APPROXIMATE_SCALE = {
    name: "Approximate",
    sunDistance: EARTH_RADIUS * 18,
    moonOrbitRadius: EARTH_RADIUS * 4,
    cameraMaxDistance: EARTH_RADIUS * 30,
    sunVisualRadius: EARTH_RADIUS * 2
};

// Variáveis de estado da escala
let currentScale = APPROXIMATE_SCALE;
let isApproximateScale = true;

// Constantes de Simulação
const EARTH_ROTATION_SPEED = 0.005;
const MOON_ORBITAL_SPEED_FACTOR = 1 / 29.53;
const DAY_COLOR = new THREE.Color(0x1a2b3c);
const NIGHT_COLOR = new THREE.Color(0x050510);
const HOURS_PER_DAY = 24;
const RADIANS_PER_DAY = Math.PI * 2;
const TWO_PI = Math.PI * 2;

// Estado da Simulação
let isPlaying = true;
let simulatedDays = 0;
let simulatedHours = 0;
let earthRotationAngle = 0;
let moonOrbitAngle = 0;
let mainRendererHasSize = false;
let simulationSpeedMultiplier = 1.0;

// Loader compartilhado
const textureLoader = new THREE.TextureLoader();

// -----------------------------------------------------------------
//  URLS DAS TEXTURAS (Incluindo agora o fundo estelar via Web)
// -----------------------------------------------------------------
const TEXTURE_URLS = {
    earth: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg',
    earthSpecular: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_specular_2048.jpg',
    earthNormal: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_normal_2048.jpg',
    moon: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/moon_1024.jpg',
    // Textura estelar hospedada na web (pode substituir por um link do seu próprio github se preferir)
    stars: 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/cube/MilkyWay/dark-s_px.jpg' 
};

// -----------------------------------------------------------------
//  FUNDO ESTELAR ATUALIZADO VIA REPOSITÓRIO WEB
// -----------------------------------------------------------------
let starSphere = null;

function buildStarfieldSkybox(scene) {
    const geo = new THREE.SphereGeometry(2000, 64, 64);
    const mat = new THREE.MeshBasicMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        color: 0x000000
    });
    starSphere = new THREE.Mesh(geo, mat);
    starSphere.renderOrder = -1;
    scene.add(starSphere);

    // Buscando a textura direto do link da Web cadastrado no objeto TEXTURE_URLS
    textureLoader.load(
        TEXTURE_URLS.stars, 
        (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            // Configura para repetir e cobrir a esfera perfeitamente
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(4, 4); 

            starSphere.material.map   = tex;
            starSphere.material.color = new THREE.Color(1.5, 1.5, 1.5); // Brilho levemente ajustado
            starSphere.material.needsUpdate = true;
            console.log("Fundo estelar remoto carregado com sucesso via Web!");
        },
        undefined,
        (err) => {
            console.error('Falha ao carregar textura estelar da Web. Usando fundo escuro de segurança.', err);
            starSphere.material.color = new THREE.Color(0x050615);
            starSphere.material.needsUpdate = true;
        }
    );
}

// -----------------------------------------------------------------
//  TEXTURA E ELEMENTOS DO SOL
// -----------------------------------------------------------------
function createSunTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    g.addColorStop(0,   '#ffffff');
    g.addColorStop(0.4, '#fffbe0');
    g.addColorStop(0.8, '#fff5b0');
    g.addColorStop(1,   '#ffe080');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    return new THREE.CanvasTexture(canvas);
}

function loadSunTexture(sunMesh) {
    textureLoader.load(
        'sun.jpg',
        (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            if (sunMesh && sunMesh.material) {
                sunMesh.material.map         = tex;
                sunMesh.material.needsUpdate = true;
            }
        },
        undefined,
        (err) => console.warn('sun.jpg local não encontrado – usando fallback procedural.', err)
    );
}

function addSunCorona(sunMesh) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
    g.addColorStop(0,    'rgba(255, 255, 220, 0.7)');
    g.addColorStop(0.15, 'rgba(255, 245, 180, 0.4)');
    g.addColorStop(0.40, 'rgba(255, 220, 100, 0.12)');
    g.addColorStop(0.70, 'rgba(255, 180, 50,  0.04)');
    g.addColorStop(1,    'rgba(255, 140, 0,   0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const coronaTex = new THREE.CanvasTexture(canvas);
    const coronaMat = new THREE.SpriteMaterial({
        map: coronaTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const corona = new THREE.Sprite(coronaMat);
    const r = sunMesh.geometry.parameters.radius;
    const s = r * 5.6;
    corona.scale.set(s, s, 1);
    corona.renderOrder = 1;
    sunMesh.add(corona);
}

function createEarthTextureFallback() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#2288ff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const continents = [
        { x: 0.35, y: 0.55, w: 0.12, h: 0.18 },
        { x: 0.45, y: 0.50, w: 0.12, h: 0.16 },
        { x: 0.25, y: 0.35, w: 0.14, h: 0.14 },
        { x: 0.52, y: 0.30, w: 0.22, h: 0.16 },
        { x: 0.68, y: 0.65, w: 0.09, h: 0.10 },
        { x: 0.40, y: 0.20, w: 0.08, h: 0.08 },
        { x: 0.60, y: 0.52, w: 0.05, h: 0.08 }
    ];
    continents.forEach(c => {
        ctx.fillStyle = '#44aa44';
        ctx.fillRect(c.x * canvas.width, c.y * canvas.height, c.w * canvas.width, c.h * canvas.height);
    });
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 800; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, Math.random() * 2 + 1, 0, Math.PI * 2);
        ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    return tex;
}

function createMoonTextureFallback() {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#aaaaaa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 200; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const r = Math.random() * 12 + 2;
        ctx.fillStyle = '#888888';
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#cccccc';
        ctx.beginPath(); ctx.arc(x, y, r - 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#666666';
    for (let i = 0; i < 30; i++) {
        ctx.beginPath();
        ctx.ellipse(Math.random() * canvas.width, Math.random() * canvas.height,
            Math.random() * 30 + 10, Math.random() * 40 + 15, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    return new THREE.CanvasTexture(canvas);
}

function createEarthTexture() {
    const result = { map: createEarthTextureFallback(), specularMap: null, normalMap: null };
    textureLoader.load(
        TEXTURE_URLS.earth,
        (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            if (earth && earth.material) {
                earth.material.map = tex;
                earth.material.needsUpdate = true;
            }
            result.map = tex;
        },
        undefined,
        (err) => console.warn('Textura da Terra não carregou, usando fallback procedural.', err)
    );
    textureLoader.load(
        TEXTURE_URLS.earthSpecular,
        (tex) => {
            if (earth && earth.material) {
                earth.material.metalnessMap = tex;
                earth.material.needsUpdate = true;
            }
            result.specularMap = tex;
        },
        undefined,
        () => {}
    );
    textureLoader.load(
        TEXTURE_URLS.earthNormal,
        (tex) => {
            if (earth && earth.material) {
                earth.material.normalMap = tex;
                earth.material.needsUpdate = true;
            }
            result.normalMap = tex;
        },
        undefined,
        () => {}
    );
    return result.map;
}

function createMoonTexture() {
    const fallback = createMoonTextureFallback();
    textureLoader.load(
        TEXTURE_URLS.moon,
        (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            if (moon && moon.material) {
                moon.material.map = tex;
                moon.material.needsUpdate = true;
            }
        },
        undefined,
        (err) => console.warn('Textura da Lua não carregou, usando fallback procedural.', err)
    );
    return fallback;
}

function setScale(scaleType) {
    currentScale = scaleType;
    isApproximateScale = (scaleType === APPROXIMATE_SCALE);

    if (sun) sun.position.set(-currentScale.sunDistance, 0, 0);
    if (sunLight) sunLight.position.copy(sun.position);

    if (sun) {
        scene.remove(sun);
        sun.geometry.dispose();
        const newSunGeometry = new THREE.SphereGeometry(currentScale.sunVisualRadius, 64, 64);
        sun.geometry = newSunGeometry;
        scene.add(sun);
    }

    if (controls) {
        controls.maxDistance = currentScale.cameraMaxDistance;
        controls.object.position.setLength(
             Math.min(controls.object.position.length(), currentScale.cameraMaxDistance * 0.95)
        );
        controls.update();
    }
    
    if (camera) {
         camera.far = 5000;
         camera.updateProjectionMatrix();
    }

    if (scaleToggleButton) {
        scaleToggleButton.textContent = isApproximateScale ? "Proporções de Distância" : "Escala Didática";
    }

    updatePositions();
}

function init() {
    scene = new THREE.Scene();
    scene.background = null;
    buildStarfieldSkybox(scene);

    camera = new THREE.PerspectiveCamera(75, 1, 0.1, 5000);
    camera.position.set(0, EARTH_RADIUS * 3, EARTH_RADIUS * 10);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(1, 1);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    sceneContainer.appendChild(renderer.domElement);

    sunLight = new THREE.PointLight(0xffffff, 2, currentScale.sunDistance * 3);
    sunLight.position.set(-currentScale.sunDistance, 0, 0);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    scene.add(sunLight);
    
    const ambientLight = new THREE.AmbientLight(0x404060, 0.3);
    scene.add(ambientLight);
    
    const fillLight = new THREE.DirectionalLight(0x88aaff, 0.2);
    fillLight.position.set(1, 1, 1);
    scene.add(fillLight);

    const sunGeometry = new THREE.SphereGeometry(currentScale.sunVisualRadius, 64, 64);
    const sunFallbackTex = createSunTexture();
    const sunMaterial = new THREE.MeshBasicMaterial({
        map:   sunFallbackTex,
        color: new THREE.Color(1.0, 0.98, 0.92),
    });
    sun = new THREE.Mesh(sunGeometry, sunMaterial);
    sun.position.copy(sunLight.position);
    scene.add(sun);
    loadSunTexture(sun);
    addSunCorona(sun);

    earthOrbitGroup = new THREE.Group();
    scene.add(earthOrbitGroup);

    const earthGeometry = new THREE.SphereGeometry(EARTH_RADIUS, 128, 128);
    const earthTexture = createEarthTexture();
    const earthMaterial = new THREE.MeshStandardMaterial({ 
        map: earthTexture,
        metalness: 0.05,
        roughness: 0.7
    });
    earth = new THREE.Mesh(earthGeometry, earthMaterial);
    earth.castShadow = true;
    earth.receiveShadow = true;
    earthOrbitGroup.add(earth);

    const moonGeometry = new THREE.SphereGeometry(MOON_RADIUS, 64, 64);
    const moonTexture = createMoonTexture();
    const moonMaterial = new THREE.MeshStandardMaterial({ 
        map: moonTexture, 
        roughness: 0.9,
        metalness: 0.0
    });
    moon = new THREE.Mesh(moonGeometry, moonMaterial);
    moon.receiveShadow = true;
    moon.castShadow = true;
    earthOrbitGroup.add(moon);

    const markerGeometry = new THREE.SphereGeometry(EARTH_RADIUS * 0.08, 32, 32);
    const markerMaterial = new THREE.MeshStandardMaterial({ color: 0xff3333, emissive: 0x440000 });
    observerMarker = new THREE.Mesh(markerGeometry, markerMaterial);
    earth.add(observerMarker);

    const linePoints = [new THREE.Vector3(), new THREE.Vector3()];
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
    lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage));
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffff00 });
    guideline = new THREE.Line(lineGeometry, lineMaterial);
    guideline.frustumCulled = false;
    guideline.visible = false;
    scene.add(guideline);

    raycaster = new THREE.Raycaster();
    raycaster.params.Line.threshold = 0.1;

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = EARTH_RADIUS * 1.5;
    controls.maxDistance = currentScale.cameraMaxDistance;
    controls.target.set(0, 0, 0);
    controls.zoomSpeed = -1;

    observerViewCamera = new THREE.PerspectiveCamera(15, 1, 0.2, REALISTIC_SCALE.moonOrbitRadius * 3);
    observerViewRenderer = new THREE.WebGLRenderer({ antialias: true });
    observerViewRenderer.setSize(1, 1);
    observerViewContainer.appendChild(observerViewRenderer.domElement);

    moonOrbitSlider.addEventListener('input', () => {
        if (!moonOrbitSlider.disabled) {
            const angleDeg = parseFloat(moonOrbitSlider.value);
            moonOrbitValue.textContent = `${Math.round(angleDeg)}°`;
            moonOrbitAngle = THREE.MathUtils.degToRad(angleDeg);
            updatePositions();
        }
    });
    
    observerLatSlider.addEventListener('input', () => { 
        observerLatValue.textContent = `${observerLatSlider.value}°`; 
        updateObserverMarkerLocalPosition(); 
        if (!isPlaying) updatePositions(); 
    });
    
    observerLonSlider.addEventListener('input', () => { 
        observerLonValue.textContent = `${observerLonSlider.value}°`; 
        updateObserverMarkerLocalPosition(); 
        if (!isPlaying) updatePositions(); 
    });

    playButton.addEventListener('click', () => {
        if (!isPlaying) {
            isPlaying = true;
            playButton.style.display = 'none';
            pauseButton.style.display = 'inline-block';
            if (moonOrbitSlider) {
                moonOrbitSlider.disabled = true;
            }
        }
    });
    
    pauseButton.addEventListener('click', () => {
        if (isPlaying) {
            isPlaying = false;
            playButton.style.display = 'inline-block';
            pauseButton.style.display = 'none';
            if (moonOrbitSlider) {
                moonOrbitSlider.disabled = false;
            }
        }
    });
    
    speedSlider.addEventListener('input', () => { 
        simulationSpeedMultiplier = parseFloat(speedSlider.value); 
        speedValue.textContent = `${simulationSpeedMultiplier.toFixed(1)}x`; 
    });
    
    scaleToggleButton.addEventListener('click', () => {
        setScale(isApproximateScale ? REALISTIC_SCALE : APPROXIMATE_SCALE);
    });

    if (helpButton && helpModal && closeHelpModalButton) {
        helpButton.addEventListener('click', () => { helpModal.classList.add('show'); });
        closeHelpModalButton.addEventListener('click', () => { helpModal.classList.remove('show'); });
        helpModal.addEventListener('click', (event) => { 
            if (event.target === helpModal) { helpModal.classList.remove('show'); } 
        });
    }

    window.addEventListener('resize', onWindowResize);

    const initialMoonAngleDeg = 17;
    moonOrbitAngle = THREE.MathUtils.degToRad(initialMoonAngleDeg);
    earthRotationAngle = 0;
    
    if (moonOrbitSlider) moonOrbitSlider.value = initialMoonAngleDeg;
    if (moonOrbitValue) moonOrbitValue.textContent = `${initialMoonAngleDeg}°`;

    if (moonOrbitSlider) {
         moonOrbitSlider.disabled = true;
    }
    if (scaleToggleButton) {
        scaleToggleButton.textContent = isApproximateScale ? "Proporções de Distância" : "Escala Didática";
    }

    updateObserverMarkerLocalPosition();
    updatePositions();
    updateTimeDisplay();

    animate();
}

function updateObserverMarkerLocalPosition() {
    const obsLatRad = THREE.MathUtils.degToRad(parseFloat(observerLatSlider.value));
    const obsLonRad = THREE.MathUtils.degToRad(parseFloat(observerLonSlider.value));
    const localX = EARTH_RADIUS * Math.cos(obsLatRad) * Math.cos(obsLonRad);
    const localY = EARTH_RADIUS * Math.sin(obsLatRad);
    const localZ = EARTH_RADIUS * Math.cos(obsLatRad) * Math.sin(obsLonRad);
    if(observerMarker) observerMarker.position.set(localX, localY, localZ);
}

function updatePositions() {
    if (isPlaying) {
        if (moonOrbitSlider) {
             const currentSliderValue = Math.round(THREE.MathUtils.radToDeg(moonOrbitAngle));
             if (parseInt(moonOrbitSlider.value) !== currentSliderValue) {
                  moonOrbitSlider.value = currentSliderValue;
                  if(moonOrbitValue) moonOrbitValue.textContent = `${currentSliderValue}°`;
             }
        }
    } else {
        if (moonOrbitSlider) {
             moonOrbitAngle = THREE.MathUtils.degToRad(parseFloat(moonOrbitSlider.value));
        }
    }

    const moonAngleRad = moonOrbitAngle;

    if(moon && earth) {
        moon.position.x = Math.cos(moonAngleRad) * currentScale.moonOrbitRadius;
        moon.position.z = Math.sin(moonAngleRad) * currentScale.moonOrbitRadius;
        moon.position.y = 0;
        moon.rotation.y = moonAngleRad - Math.PI / 2;
    }

    if (!observerMarker || !sun || !moon || !earthOrbitGroup || !earth) { return; }

    const observerGlobalPos = new THREE.Vector3(); 
    observerMarker.getWorldPosition(observerGlobalPos);
    const earthGlobalPos = new THREE.Vector3(); 
    earth.getWorldPosition(earthGlobalPos);
    const sunGlobalPos = new THREE.Vector3(); 
    sun.getWorldPosition(sunGlobalPos);
    const moonGlobalPos = new THREE.Vector3(); 
    moon.getWorldPosition(moonGlobalPos);

    const surfaceNormal = observerGlobalPos.clone().sub(earthGlobalPos).normalize();
    let observerToSunDir = sunGlobalPos.clone().sub(observerGlobalPos);
    if (observerToSunDir.lengthSq() > 1e-6) observerToSunDir.normalize(); else observerToSunDir.set(1,0,0);
    let observerToMoonDir = moonGlobalPos.clone().sub(observerGlobalPos);
    if (observerToMoonDir.lengthSq() > 1e-6) observerToMoonDir.normalize(); else observerToMoonDir.set(1,0,0);

    if (observerViewCamera && observerViewRenderer) {
        observerViewCamera.position.copy(observerGlobalPos);
        observerViewCamera.up.copy(surfaceNormal);
        observerViewCamera.lookAt(moonGlobalPos);
        const sunDot = surfaceNormal.dot(observerToSunDir);
        const isSunUp = sunDot > -0.05;
        observerViewRenderer.setClearColor(isSunUp ? DAY_COLOR : NIGHT_COLOR);
    }

    if (guideline && raycaster && earth) {
        const positions = guideline.geometry.attributes.position.array;
        observerGlobalPos.toArray(positions, 0);
        moonGlobalPos.toArray(positions, 3);
        guideline.geometry.attributes.position.needsUpdate = true;
        guideline.geometry.computeBoundingSphere();

        const distanceObserverMoon = observerGlobalPos.distanceTo(moonGlobalPos);
        raycaster.set(observerGlobalPos, observerToMoonDir);
        const intersects = raycaster.intersectObject(earth, false);
        guideline.visible = !(intersects.length > 0 && intersects[0].distance < distanceObserverMoon - 0.1);
    }

    if(earthOrbitGroup && sun && moon && mainPhaseDisplay) {
        const earthCenterPos = new THREE.Vector3();
        earthOrbitGroup.getWorldPosition(earthCenterPos);
        const sunPos = new THREE.Vector3(); 
        sun.getWorldPosition(sunPos);
        const moonWorldPos = new THREE.Vector3(); 
        moon.getWorldPosition(moonWorldPos);

        let earthToSun = sunPos.clone().sub(earthCenterPos);
        let earthToMoon = moonWorldPos.clone().sub(earthCenterPos);

        earthToSun.y = 0; 
        earthToMoon.y = 0;

        let mainPhaseName = "...";
        if (earthToSun.lengthSq() > 1e-6 && earthToMoon.lengthSq() > 1e-6) {
            earthToSun.normalize(); 
            earthToMoon.normalize();
            let phaseAngleRad = earthToMoon.angleTo(earthToSun);
            const cross = new THREE.Vector3().crossVectors(earthToMoon, earthToSun);
            if (cross.y < 0) { phaseAngleRad = TWO_PI - phaseAngleRad; }
            if (!isNaN(phaseAngleRad)) {
                 const phaseAngleDeg = THREE.MathUtils.radToDeg(phaseAngleRad);
                 mainPhaseName = getMainMoonPhaseName(phaseAngleDeg);
            }
        }
        mainPhaseDisplay.textContent = `Fase da Lua atual: ${mainPhaseName}`;
    }
}

function getMainMoonPhaseName(angleDeg) {
    const tolerance = 15.0;
    if (isNaN(angleDeg)) return "...";
    angleDeg = angleDeg % 360;
    if (angleDeg < 0) angleDeg += 360;

    if (angleDeg < tolerance || angleDeg >= 360 - tolerance) return "Lua Nova";
    if (angleDeg >= 90 - tolerance && angleDeg < 90 + tolerance) return "Quarto Crescente";
    if (angleDeg >= 180 - tolerance && angleDeg < 180 + tolerance) return "Lua Cheia";
    if (angleDeg >= 270 - tolerance && angleDeg < 270 + tolerance) return "Quarto Minguante";

    return "...";
}

function updateTimeDisplay() {
    if(timeDisplay) timeDisplay.textContent = `Tempo Simulado: Dia ${simulatedDays}, ${Math.floor(simulatedHours)}h`;
}

function onWindowResize() {
    try {
        let mainWidth = sceneContainer.clientWidth; 
        let mainHeight = sceneContainer.clientHeight;
        if (camera && renderer) {
             if (mainWidth > 1 && mainHeight > 1) {
                  camera.aspect = mainWidth / mainHeight;
                  camera.updateProjectionMatrix();
                  renderer.setSize(mainWidth, mainHeight);
                  if (!mainRendererHasSize) { mainRendererHasSize = true; }
             }
        }
        let obsWidth = observerViewContainer.clientWidth; 
        let obsHeight = observerViewContainer.clientHeight;
        if (obsWidth > 0 && obsHeight > 0 && observerViewCamera && observerViewRenderer) {
            observerViewCamera.aspect = obsWidth / obsHeight;
            observerViewCamera.updateProjectionMatrix();
            observerViewRenderer.setSize(obsWidth, obsHeight);
        }
     } catch(error) { console.error("Erro em onWindowResize:", error); }
}

function animate() {
    requestAnimationFrame(animate);

    if (!mainRendererHasSize) { onWindowResize(); }

    if (!scene || !camera || !renderer || !earth || !controls || !observerViewRenderer || !observerViewCamera || !guideline || !raycaster) {
        return;
    }

    if (isPlaying) {
        const deltaRotation = EARTH_ROTATION_SPEED * simulationSpeedMultiplier;
        
        earthRotationAngle += deltaRotation;
        earth.rotation.y = earthRotationAngle % TWO_PI;
        
        const deltaMoon = deltaRotation * MOON_ORBITAL_SPEED_FACTOR;
        moonOrbitAngle += deltaMoon;
        moonOrbitAngle = moonOrbitAngle % TWO_PI;

        if (sun) sun.rotation.y += deltaRotation * 0.04;

        const hoursIncrement = (deltaRotation / RADIANS_PER_DAY) * HOURS_PER_DAY;
        simulatedHours += hoursIncrement;
        if (simulatedHours >= HOURS_PER_DAY) {
            simulatedDays += Math.floor(simulatedHours / HOURS_PER_DAY);
            simulatedHours %= HOURS_PER_DAY;
        }
        updateTimeDisplay();
        updatePositions();
    }

    try {
        controls.update();

        if (guideline && guideline.visible) {
            observerViewRenderer.render(scene, observerViewCamera);
        } else {
            if (observerViewRenderer && observerViewContainer.clientWidth > 0 && observerViewContainer.clientHeight > 0) {
                 observerViewRenderer.clear(true, false, false);
            }
        }

        if (mainRendererHasSize) {
             renderer.render(scene, camera);
        }

    } catch (error) {
         console.error(`Erro no loop animate:`, error);
    }
}

try {
    init();
} catch (error) {
    console.error("Erro fatal durante a inicialização:", error);
}