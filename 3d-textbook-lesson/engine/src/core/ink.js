// 墨水語言：排線材質、墨線輪廓、邊線、標籤、灑光
// 所有模型頂點以世界座標 y 壓平（uRise），讓線稿能從紙面升起；標籤只壓平錨點，不變形。
import * as THREE from 'three';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { INK, PAPER, PAPER_Y, CONCEPT, WASH, FONT } from './config.js';

export const RES = { value: new THREE.Vector2(1920, 1080) }; // 畫面像素（含 DPR）
export const PX = { value: 1 };                                  // DPR 倍率（線寬）
const INK_COLOR = new THREE.Color(INK);

export function color(c) {
  if (c instanceof THREE.Color) return c;
  if (typeof c === 'string' && WASH[c]) return new THREE.Color(WASH[c]);
  if (typeof c === 'string' && CONCEPT[c]) return new THREE.Color(CONCEPT[c].color);
  return new THREE.Color(c ?? PAPER);
}

// 每個圖（figure）一組共用 uniform
export function figUniforms() {
  return {
    uRise: { value: 1 }, uPaperY: { value: PAPER_Y + 0.0015 }, uDraw: { value: 1 }, uFace: { value: 1 },
    uRootInv: { value: new THREE.Matrix4() }, uFade: { value: 1 },
  };
}
const DEFAULT_U = figUniforms();

const FLATTEN_GLSL = /* glsl */`
uniform float uRise; uniform float uPaperY; uniform mat4 uRootInv;
vec4 inkFlatten(vec4 wp){ wp.y = uPaperY + (wp.y - uPaperY) * uRise; return wp; }
`;
const HASH_GLSL = /* glsl */`
float inkHash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
`;

/**
 * 排線材質
 * opts: { wash: 顏色或淡彩名, concept: 概念鍵, hatch: 排線強度(0-1), U: figUniforms, side, flat:false }
 */
export function inkMaterial(opts = {}) {
  const U = opts.U || DEFAULT_U;
  const base = opts.concept ? color(CONCEPT[opts.concept].color).lerp(color(PAPER), 0.35) : color(opts.wash ?? 'paper');
  const m = new THREE.MeshStandardMaterial({ color: base, roughness: 0.95, metalness: 0, side: opts.side ?? THREE.FrontSide, envMapIntensity: 0.25, transparent: !!opts.transparent, opacity: opts.opacity ?? 1, depthWrite: opts.depthWrite ?? true });
  const glow = { value: new THREE.Color(0, 0, 0) };
  const hatch = { value: opts.hatch ?? 1 };
  m.userData.glow = glow; m.userData.hatch = hatch; m.userData.ink = true; m.userData.baseColor = base.clone();
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uRise: U.uRise, uPaperY: U.uPaperY, uRootInv: U.uRootInv, uFace: U.uFace, uFade: U.uFade, uGlow: glow, uHatch: hatch, uInk: { value: INK_COLOR } });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + FLATTEN_GLSL + 'varying vec3 vHP; varying vec3 vHN;')
      .replace('#include <project_vertex>', /* glsl */`
        vec4 lp = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          lp = instanceMatrix * lp;
        #endif
        vec4 wp0 = modelMatrix * lp;
        vHP = (uRootInv * wp0).xyz;
        vec3 hn = objectNormal;
        #ifdef USE_INSTANCING
          hn = mat3(instanceMatrix) * hn;
        #endif
        vHN = normalize(mat3(uRootInv) * normalize(mat3(modelMatrix) * hn));
        vec4 wpF = inkFlatten(wp0);
        vec4 mvPosition = viewMatrix * wpF;
        gl_Position = projectionMatrix * mvPosition;`)
      .replace('#include <worldpos_vertex>', `
        #if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
          vec4 worldPosition = wpF;
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + HASH_GLSL + `
        uniform float uFace; uniform float uFade; uniform vec3 uGlow; uniform float uHatch; uniform vec3 uInk;
        varying vec3 vHP; varying vec3 vHN;
        float inkStripe(float c, float halfW){ float d = abs(fract(c) - 0.5); float fw = fwidth(c) * 0.75; return 1.0 - smoothstep(halfW - fw, halfW + fw, d); }
        float inkHatch(vec3 p, vec3 n, float dark){
          vec3 an = abs(n); an = pow(an, vec3(6.0)); an /= (an.x + an.y + an.z);
          float F = 85.0;
          vec2 px = p.zy, py = p.xz, pz = p.xy;
          float w1 = clamp((dark - 0.14) * 0.6, 0.0, 0.36);
          float w2 = clamp((dark - 0.48) * 0.5, 0.0, 0.3);
          float s1 = an.x * inkStripe((px.x + px.y) * F, w1) + an.y * inkStripe((py.x + py.y) * F, w1) + an.z * inkStripe((pz.x + pz.y) * F, w1);
          float s2 = an.x * inkStripe((px.x - px.y) * F, w2) + an.y * inkStripe((py.x - py.y) * F, w2) + an.z * inkStripe((pz.x - pz.y) * F, w2);
          return max(s1 * step(0.001, w1), s2 * step(0.001, w2));
        }`)
      .replace('void main() {', `void main() {
        if (uFace < 0.999 && inkHash(floor(gl_FragCoord.xy)) > uFace) discard;`)
      .replace('#include <opaque_fragment>', `
        {
          float lum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
          float baseL = max(dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)), 0.04);
          float lit = clamp(lum / (baseL * 0.78), 0.0, 1.3);
          float dark = clamp(1.0 - lit, 0.0, 1.0);
          vec3 washC = mix(outgoingLight, diffuseColor.rgb * max(lit, 0.62) * 1.12, 0.55);
          float h = inkHatch(vHP, vHN, dark) * uHatch;
          outgoingLight = mix(washC, uInk * 0.9, h * 0.78);
          outgoingLight += uGlow;
        }
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'ink-std';
  return m;
}

// 標準材質但套用壓平（布、金屬等不需要排線的零件）
export function flatMaterial(params = {}, U = DEFAULT_U, Ctor = THREE.MeshStandardMaterial) {
  const m = new Ctor(params);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uRise: U.uRise, uPaperY: U.uPaperY, uRootInv: U.uRootInv, uFace: U.uFace });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + FLATTEN_GLSL)
      .replace('#include <project_vertex>', `
        vec4 lp = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          lp = instanceMatrix * lp;
        #endif
        vec4 wpF = inkFlatten(modelMatrix * lp);
        vec4 mvPosition = viewMatrix * wpF;
        gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\n' + HASH_GLSL + 'uniform float uFace;')
      .replace('void main() {', 'void main() {\n if (uFace < 0.999 && inkHash(floor(gl_FragCoord.xy)) > uFace) discard;');
  };
  m.customProgramCacheKey = () => 'ink-flat-' + Ctor.name;
  return m;
}

// 陰影用深度材質（同樣壓平）
const depthCache = new WeakMap();
export function depthMaterial(U = DEFAULT_U) {
  if (depthCache.has(U)) return depthCache.get(U);
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uRise: U.uRise, uPaperY: U.uPaperY, uRootInv: U.uRootInv, uFace: U.uFace });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + FLATTEN_GLSL)
      .replace('#include <project_vertex>', `
        vec4 lp = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          lp = instanceMatrix * lp;
        #endif
        vec4 mvPosition = viewMatrix * inkFlatten(modelMatrix * lp);
        gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFace;')
      .replace('void main() {', 'void main() {\n if (uFace < 0.5) discard;');
  };
  m.customProgramCacheKey = () => 'ink-depth';
  depthCache.set(U, m);
  return m;
}

// 反向外殼輪廓：固定像素寬
const hullGeoCache = new WeakMap();
function hullGeometry(geo) {
  if (hullGeoCache.has(geo)) return hullGeoCache.get(geo);
  let g = geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g = mergeVertices(g, 1e-4);
  g.computeVertexNormals();
  hullGeoCache.set(geo, g);
  return g;
}
export function hullMaterial(U = DEFAULT_U, width = 1.6, col = INK) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uRise: U.uRise, uPaperY: U.uPaperY, uRootInv: U.uRootInv, uFace: U.uFace, uRes: RES, uPx: PX, uW: { value: width }, uCol: { value: new THREE.Color(col) } },
    vertexShader: FLATTEN_GLSL + /* glsl */`
      uniform vec2 uRes; uniform float uW; uniform float uPx;
      void main(){
        vec4 lp = vec4(position, 1.0);
        vec3 n = normal;
        #ifdef USE_INSTANCING
          lp = instanceMatrix * lp; n = mat3(instanceMatrix) * n;
        #endif
        vec4 wp = inkFlatten(modelMatrix * lp);
        vec4 clip = projectionMatrix * viewMatrix * wp;
        vec3 wn = normalize(mat3(modelMatrix) * n);
        wn.y *= max(uRise, 0.05);
        vec4 cn = projectionMatrix * viewMatrix * vec4(wn, 0.0);
        vec2 dir = cn.xy; float l = length(dir); dir = l > 1e-5 ? dir / l : vec2(0.0);
        clip.xy += dir * uW * uPx * 2.0 / uRes * clip.w;
        clip.z += 0.00002 * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: HASH_GLSL + /* glsl */`
      uniform vec3 uCol; uniform float uFace; uniform float uRise;
      void main(){ if (uRise < 0.25) discard; if (uFace < 0.999 && inkHash(floor(gl_FragCoord.xy)) > uFace) discard; gl_FragColor = vec4(uCol * 0.9, 1.0); }`,
  });
}

// 墨線（LineSegments2）壓平＋逐筆顯現
export function lineMaterial(U = DEFAULT_U, width = 1.4, col = INK, opts = {}) {
  const m = new LineMaterial({ color: new THREE.Color(col).getHex(), linewidth: width, worldUnits: false, dashed: !!opts.dashed, dashSize: opts.dashSize || 0.02, gapSize: opts.gapSize || 0.015, transparent: true });
  m.uniforms.resolution = RES;
  const range = { value: new THREE.Vector2(opts.o0 ?? 0, opts.o1 ?? 1) };
  m.userData.range = range;
  const baseW = width;
  m.userData.baseW = baseW;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uRise: U.uRise, uPaperY: U.uPaperY, uRootInv: U.uRootInv, uDraw: U.uDraw, uFade: U.uFade, uRange: range });
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', FLATTEN_GLSL + 'attribute float instanceOrder; uniform vec2 uRange; varying float vOrder;\nvoid main() {\n vOrder = mix(uRange.x, uRange.y, instanceOrder);')
      .replace('vec4 start = modelViewMatrix * vec4( instanceStart, 1.0 );', 'vec4 start = viewMatrix * inkFlatten(modelMatrix * vec4( instanceStart, 1.0 ));')
      .replace('vec4 end = modelViewMatrix * vec4( instanceEnd, 1.0 );', 'vec4 end = viewMatrix * inkFlatten(modelMatrix * vec4( instanceEnd, 1.0 ));');
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform float uDraw; uniform float uFade; varying float vOrder;\nvoid main() {\n if (vOrder > uDraw) discard;')
      .replace('gl_FragColor = vec4( diffuseColor.rgb, alpha );', 'gl_FragColor = vec4( diffuseColor.rgb, alpha * uFade );');
  };
  m.customProgramCacheKey = () => 'ink-line' + (opts.dashed ? 'd' : '');
  return m;
}

export function linesFromPositions(pos, U, width = 1.4, col = INK, opts = {}) {
  const g = new LineSegmentsGeometry();
  g.setPositions(pos);
  const n = pos.length / 6;
  const ord = new Float32Array(n);
  for (let i = 0; i < n; i++) ord[i] = n > 1 ? i / (n - 1) : 0;
  g.setAttribute('instanceOrder', new THREE.InstancedBufferAttribute(ord, 1));
  const l = new LineSegments2(g, lineMaterial(U, width, col, opts));
  if (opts.dashed) l.computeLineDistances();
  l.raycast = () => {};
  l.userData.inkLine = true;
  return l;
}

// 從網格建立墨線輪廓與邊線
export function outline(mesh, U, opts = {}) {
  if (opts.edges !== false && mesh.geometry) {
    const eg = new THREE.EdgesGeometry(mesh.geometry, opts.edgeAngle ?? 32);
    const p = eg.attributes.position.array;
    if (p.length) {
      const l = linesFromPositions(Array.from(p), U, opts.lineW ?? 1.3, opts.lineColor ?? INK);
      l.userData.part = 'edge';
      mesh.add(l);
    }
    eg.dispose();
  }
  if (opts.hull !== false && mesh.geometry && !mesh.isInstancedMesh) {
    const h = new THREE.Mesh(hullGeometry(mesh.geometry), hullMaterial(U, opts.hullW ?? 1.5, opts.lineColor ?? INK));
    h.raycast = () => {}; h.userData.part = 'hull'; h.castShadow = false;
    mesh.add(h);
  }
  return mesh;
}

/** 建立一個墨水風格網格（含輪廓） */
export function inkMesh(geometry, opts = {}) {
  const U = opts.U || DEFAULT_U;
  const mat = opts.material || inkMaterial({ ...opts, U });
  const m = new THREE.Mesh(geometry, mat);
  m.castShadow = opts.shadow ?? true; m.receiveShadow = true;
  m.customDepthMaterial = depthMaterial(U);
  if (opts.outline !== false) outline(m, U, opts);
  return m;
}

// ---------- 文字標籤 ----------
function makeTextCanvas(text, o) {
  const fontPx = 72;
  const lines = String(text).split('\n');
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  const fam = FONT[o.font || 'sans'];
  ctx.font = `${o.weight || 700} ${fontPx}px ${fam}`;
  const padX = o.bg === 'none' ? 8 : 28, padY = o.bg === 'none' ? 6 : 16;
  const lh = fontPx * 1.25;
  const w = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width))) + padX * 2;
  const h = Math.ceil(lh * lines.length) + padY * 2;
  cv.width = w; cv.height = h;
  ctx.font = `${o.weight || 700} ${fontPx}px ${fam}`;
  if (o.bg !== 'none') {
    ctx.fillStyle = o.bg || PAPER;
    const r = 14;
    ctx.beginPath(); ctx.roundRect(3, 3, w - 6, h - 6, r); ctx.fill();
    if (o.border !== false) { ctx.lineWidth = 5; ctx.strokeStyle = o.borderColor || INK; ctx.stroke(); }
  }
  ctx.fillStyle = o.color || INK; ctx.textBaseline = 'middle'; ctx.textAlign = o.align === 'left' ? 'left' : 'center';
  lines.forEach((l, i) => ctx.fillText(l, o.align === 'left' ? padX : w / 2, padY + lh * (i + 0.5) + 2));
  return cv;
}

/**
 * 標籤：等比縮放、只壓平錨點
 * opts: { size: 字高(世界單位), color, bg('none'|顏色), border, font, weight, billboard:boolean, flat:boolean(平貼紙面), persist:boolean(降下後仍顯示), U }
 */
export function label(text, opts = {}) {
  const U = opts.U || DEFAULT_U;
  const cv = makeTextCanvas(text, opts);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  const lines = String(text).split('\n').length;
  const size = opts.size || 0.035;
  const h = size * (cv.height / (72 * 1.25 * lines)) * lines / 1.0;
  const w = h * cv.width / cv.height;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const persist = { value: opts.persist ? 1 : 0 };
  const alphaU = { value: 1 };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uRise: U.uRise, uPaperY: U.uPaperY, uRootInv: U.uRootInv, uFace: U.uFace, uPersist: persist, uAlpha: alphaU, uFade: U.uFade });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\n' + FLATTEN_GLSL)
      .replace('#include <project_vertex>', `
        vec4 anc = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec4 wp = modelMatrix * vec4(transformed, 1.0);
        vec3 off = wp.xyz - anc.xyz;
        anc = inkFlatten(anc);
        vec4 mvPosition = viewMatrix * vec4(anc.xyz + off, 1.0);
        gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uRise; uniform float uFace; uniform float uPersist; uniform float uAlpha; uniform float uFade;')
      .replace('#include <opaque_fragment>', `
        float la = max(smoothstep(0.75, 1.0, uRise) * uFace, uPersist * uFade);
        diffuseColor.a *= la * uAlpha;
        outgoingLight = diffuseColor.rgb;
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'ink-label';
  const geo = new THREE.PlaneGeometry(w, h);
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 5;
  m.userData.label = { billboard: opts.billboard !== false && !opts.flat, w, h, alpha: alphaU, text, em: h * 72 / cv.height };
  if (opts.flat) m.rotation.x = -Math.PI / 2;
  if (m.userData.label.billboard) m.layers.set(1);
  m.raycast = opts.pickable ? THREE.Mesh.prototype.raycast : () => {};
  return m;
}

// 發光：設定子樹內所有墨水材質的發光色
export function setGlow(obj, key, strength = 1) {
  const c = key ? color(CONCEPT[key] ? CONCEPT[key].color : key).multiplyScalar(0.9 * strength) : new THREE.Color(0, 0, 0);
  // 材質可能是陣列（例如立體表格的儲存格：頂面印字、側面墨線）
  obj.traverse((o) => { for (const mt of [].concat(o.material || [])) if (mt.userData && mt.userData.glow) mt.userData.glow.value.copy(c); });
}

// 灑光貼花：落在紙面上的色光（乘法提亮，不降低墨字對比）
export function spillDecal(radius = 0.25) {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.OneFactor,
    uniforms: { uCol: { value: new THREE.Color(0, 0, 0) }, uK: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uCol; uniform float uK; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(1.0 - d, 0.0), 1.6) * uK; gl_FragColor = vec4(uCol * a, 1.0); }',
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  m.raycast = () => {};
  return m;
}
