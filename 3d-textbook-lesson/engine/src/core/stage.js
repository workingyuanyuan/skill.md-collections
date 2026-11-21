// 渲染器、燈光、書桌、後製、放大鏡
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { N8AOPass } from 'n8ao';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RES, PX } from './ink.js';

const NEUTRAL_GLSL = /* glsl */`
vec3 neutralTM(vec3 color){
  const float S = 0.8 - 0.04; const float D = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float off = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= off;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < S) return color;
  float d = 1.0 - S;
  float np = 1.0 - d * d / (peak + d - S);
  color *= np / peak;
  float g = 1.0 - 1.0 / (D * (peak - np) + 1.0);
  return mix(color, vec3(np), g);
}
vec3 toSRGB(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
`;

function woodTexture() {
  const W = 2048, H = 1024;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const bump = document.createElement('canvas'); bump.width = W; bump.height = H;
  const bctx = bump.getContext('2d');
  ctx.fillStyle = '#7a5434'; ctx.fillRect(0, 0, W, H);
  bctx.fillStyle = '#808080'; bctx.fillRect(0, 0, W, H);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // 木板接縫與木紋
  const planks = 4;
  for (let p = 0; p < planks; p++) {
    const y0 = (H / planks) * p, ph = H / planks;
    const tone = 0.85 + rnd() * 0.3;
    ctx.fillStyle = `rgba(${Math.round(122 * tone)},${Math.round(84 * tone)},${Math.round(52 * tone)},1)`;
    ctx.fillRect(0, y0, W, ph);
    for (let i = 0; i < 160; i++) {
      const yy = y0 + rnd() * ph;
      const amp = 2 + rnd() * 8, fr = 0.002 + rnd() * 0.006, ph0 = rnd() * 10;
      const dark = rnd() < 0.5;
      ctx.strokeStyle = dark ? `rgba(60,36,18,${0.08 + rnd() * 0.18})` : `rgba(170,120,80,${0.05 + rnd() * 0.12})`;
      bctx.strokeStyle = dark ? 'rgba(40,40,40,0.35)' : 'rgba(200,200,200,0.2)';
      ctx.lineWidth = bctx.lineWidth = 0.6 + rnd() * 2.2;
      ctx.beginPath(); bctx.beginPath();
      for (let x = 0; x <= W; x += 16) {
        const yv = yy + Math.sin(x * fr + ph0) * amp + Math.sin(x * fr * 3.1) * amp * 0.3;
        if (x === 0) { ctx.moveTo(x, yv); bctx.moveTo(x, yv); } else { ctx.lineTo(x, yv); bctx.lineTo(x, yv); }
      }
      ctx.stroke(); bctx.stroke();
    }
    ctx.fillStyle = 'rgba(30,18,8,0.55)'; ctx.fillRect(0, y0, W, 3);
    bctx.fillStyle = '#202020'; bctx.fillRect(0, y0, W, 4);
  }
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace;
  const bm = new THREE.CanvasTexture(bump);
  for (const t of [map, bm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.anisotropy = 8; }
  return { map, bump: bm };
}

export class Stage {
  constructor(container) {
    this.container = container;
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(r.domElement);

    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#2a1d14');
    const pm = new THREE.PMREMGenerator(r);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.25;

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
    // 立起的標籤放在圖層 1：後製之後另外畫，不受泛光、遮蔽、暗角影響
    this.overCam = new THREE.PerspectiveCamera();

    // 窗邊斜射的日光：聚光燈＋柔邊，形成光池
    const sun = this.sun = new THREE.SpotLight('#fff1dc', 3.0, 0, 0.25, 1.0, 0);
    sun.position.set(-5.5, 9.5, -6.5);
    sun.target.position.set(0.35, 0, 0.25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.bias = -0.00012; sun.shadow.normalBias = 0.004;
    sun.shadow.radius = 5; sun.shadow.intensity = 0.8; // 模型落在紙上的影子：邊緣柔一點、淡一點
    sun.shadow.camera.near = 4; sun.shadow.camera.far = 22;
    scene.add(sun, sun.target);
    this.hemi = new THREE.HemisphereLight('#fff4e4', '#5a4330', 0.32);
    scene.add(this.hemi);
    const fill = new THREE.DirectionalLight('#dfe8ff', 0.25);
    fill.position.set(4, 5, 6); scene.add(fill);

    // 書桌
    const wood = woodTexture();
    const desk = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ map: wood.map, bumpMap: wood.bump, bumpScale: 1.4, roughness: 0.62, metalness: 0, envMapIntensity: 0.6 }));
    desk.rotation.x = -Math.PI / 2; desk.receiveShadow = true; desk.userData.desk = true;
    scene.add(desk);
    this.desk = desk;

    // 後製
    const size = new THREE.Vector2();
    r.getSize(size);
    const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, samples: 0 });
    const comp = this.composer = new EffectComposer(r, rt);
    // 環境光遮蔽（N8AO，同時負責場景渲染）
    const ao = this.ao = new N8AOPass(scene, this.camera, 2, 2);
    Object.assign(ao.configuration, { aoRadius: 0.12, distanceFalloff: 0.6, intensity: 2.2, aoSamples: 16, denoiseSamples: 8, denoiseRadius: 10, gammaCorrection: false, halfRes: false, screenSpaceRadius: false, color: new THREE.Color('#2a1c10') });
    comp.addPass(ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(2, 2), 0.55, 0.45, 1.3);
    comp.addPass(this.bloom);
    this.vignette = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uK: { value: 0.55 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse; uniform float uK; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = (vUv - 0.5) * vec2(1.25, 1.0); float v = smoothstep(0.42, 0.95, length(d)); c.rgb *= 1.0 - v * uK; gl_FragColor = c; }',
    });
    comp.addPass(this.vignette);
    comp.addPass(new OutputPass());
    this.smaa = new SMAAPass(2, 2);
    comp.addPass(this.smaa);

    // 放大鏡
    this.zoomRT = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType, samples: 4 });
    this.zoomCam = this.camera.clone();
    this.zoomCam.layers.enableAll();
    this.mag = { on: false, x: 0, y: 0, r: 150, zoom: 2.2 };
    this.magPass = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, tZoom: { value: null }, uC: { value: new THREE.Vector2() }, uR: { value: 150 }, uRes: { value: new THREE.Vector2(1, 1) }, uOn: { value: 0 }, uExp: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: NEUTRAL_GLSL + /* glsl */`
        uniform sampler2D tDiffuse; uniform sampler2D tZoom; uniform vec2 uC; uniform float uR; uniform vec2 uRes; uniform float uOn; uniform float uExp;
        varying vec2 vUv;
        vec3 zs(vec2 q){ return toSRGB(neutralTM(texture2D(tZoom, q).rgb * uExp)); }
        void main(){
          vec4 base = texture2D(tDiffuse, vUv);
          if (uOn < 0.5) { gl_FragColor = base; return; }
          vec2 p = vUv * uRes; vec2 d = p - uC; float r = length(d) / uR;
          // 鏡外陰影
          float sh = smoothstep(1.25, 1.0, length(d - vec2(6.0, -8.0)) / uR) * (1.0 - smoothstep(0.98, 1.0, r));
          if (r > 1.04) { gl_FragColor = vec4(base.rgb * (1.0 - 0.25 * sh), 1.0); return; }
          // 折射：邊緣桶狀變形＋色散
          float k = pow(r, 3.0) * 0.18;
          vec2 dir = r > 0.0 ? d / (r * uR) : vec2(0.0);
          vec2 q = vec2(0.5) + d / (2.0 * uR) * (1.0 - k);
          float disp = smoothstep(0.55, 1.0, r) * 0.012;
          vec3 c;
          c.r = zs(q + dir * disp * 0.5 * vec2(1.0, 1.0) * 0.5).r;
          c.g = zs(q).g;
          c.b = zs(q - dir * disp * 0.5).b;
          // 鏡面高光與邊框
          float hl = smoothstep(0.35, 0.0, length((d / uR) - vec2(-0.45, 0.5))) * 0.18;
          c += hl;
          float rim = smoothstep(0.93, 0.985, r) * (1.0 - smoothstep(1.0, 1.04, r));
          c = mix(c, vec3(0.11, 0.14, 0.2), rim * 0.9);
          float ao = smoothstep(0.75, 1.0, r) * 0.12; c *= 1.0 - ao;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.magPass.uniforms.tZoom.value = this.zoomRT.texture; // ShaderPass 會複製 uniform，需重新指定
    comp.addPass(this.magPass);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight;
    const dpr = this.renderer.getPixelRatio();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    RES.value.set(w * dpr, h * dpr);
    PX.value = dpr;
    this.magPass.uniforms.uRes.value.set(w * dpr, h * dpr);
    this.w = w; this.h = h;
  }

  render() {
    const m = this.mag, mp = this.magPass.uniforms;
    if (m.on) {
      const dpr = this.renderer.getPixelRatio();
      const zc = this.zoomCam;
      zc.copy(this.camera); zc.layers.enableAll();
      const W = this.w, H = this.h;
      const vw = (2 * m.r) / m.zoom, vh = vw;
      zc.setViewOffset(W, H, m.x - vw / 2, m.y - vh / 2, vw, vh);
      zc.aspect = 1; zc.updateProjectionMatrix();
      const rtS = Math.round(2 * m.r * dpr);
      if (this.zoomRT.width !== rtS) this.zoomRT.setSize(rtS, rtS);
      this.renderer.setRenderTarget(this.zoomRT);
      this.renderer.render(this.scene, zc);
      this.renderer.setRenderTarget(null);
      mp.uOn.value = 1; mp.uC.value.set(m.x * dpr, (H - m.y) * dpr); mp.uR.value = m.r * dpr;
      mp.uExp.value = this.renderer.toneMappingExposure;
    } else mp.uOn.value = 0;
    // 放大鏡開著時標籤隨場景一起放大；否則後製後另畫
    const cam = this.camera;
    if (m.on) cam.layers.enableAll(); else cam.layers.set(0);
    this.composer.render();
    if (!m.on) {
      const r = this.renderer, oc = this.overCam;
      oc.copy(cam); oc.layers.set(1);
      const bg = this.scene.background;
      this.scene.background = null;
      r.autoClear = false; r.shadowMap.autoUpdate = false;
      r.setRenderTarget(null);
      r.clearDepth();
      r.render(this.scene, oc);
      r.autoClear = true; r.shadowMap.autoUpdate = true;
      this.scene.background = bg;
    }
    this.paper?.render();
  }
}
