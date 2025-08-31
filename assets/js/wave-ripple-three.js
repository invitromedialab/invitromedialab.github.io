/* Three.js 水波叠加（安全版）：不隐藏 DOM 媒体；纹理未就绪时完全透明 */
(() => {
  const reduce = matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !window.THREE) return;

  const imgEl = document.querySelector('.work-image');
  const vidEl = document.querySelector('.work-video');
  if (!imgEl || !vidEl) return;

  // —— 判定就绪 —— //
  const imageReady = () => imgEl.complete && imgEl.naturalWidth > 0 && imgEl.naturalHeight > 0;
  const videoReady = () => vidEl.readyState >= vidEl.HAVE_CURRENT_DATA && vidEl.videoWidth > 0 && vidEl.videoHeight > 0;

  // —— 同域检测：外链且无 CORS 时，不创建对应纹理，叠加层会自动透明 —— //
  function sameOrigin(u){ try{ return new URL(u, location.href).origin === location.origin; }catch{ return true; } }
  const allowImg = !imgEl.src || sameOrigin(imgEl.src);
  const allowVid = !vidEl.src || sameOrigin(vidEl.currentSrc || vidEl.src);

  // —— Three 基础 —— //
  const renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true, premultipliedAlpha:true });
  const canvas = renderer.domElement;
  renderer.setClearColor(0x000000, 0);            // 画布背景透明
  Object.assign(canvas.style, {
    position:'fixed', inset:'0', zIndex:'100',    // 在媒体之上、文字/菜单之下
    pointerEvents:'none'
  });
  document.body.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);

  // 透明占位纹理：A=0（关键！），没准备好时叠加层完全透明
  const placeholder = new THREE.DataTexture(new Uint8Array([0,0,0,0]), 1, 1, THREE.RGBAFormat);
  placeholder.needsUpdate = true;

  // 纹理（延迟创建）
  let texImg = null;
  let texVid = null;

  // 着色器
  const MAX = 6;
  const vtx = `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `;
  const frg = `
    precision highp float;
    varying vec2 vUv;

    uniform sampler2D uTex0;   // image
    uniform sampler2D uTex1;   // video
    uniform float uMix;        // 0..1
    uniform vec2  uRes;

    uniform float uSpeed, uRing, uFreq, uRefract, uFalloff;
    uniform vec2  uCenters[${MAX}];
    uniform float uAges[${MAX}];

    // 当采样的是占位（A=0）时，输出透明；否则输出扭曲后的像素
    vec4 safeSample(sampler2D tex, vec2 uv){
      uv = clamp(uv, 0.001, 0.999);
      vec4 c = texture2D(tex, uv);
      return c.a == 0.0 ? vec4(0.0) : c;
    }

    void main(){
      vec2 uv = vUv;
      vec2 disp = vec2(0.0);

      for(int i=0;i<${MAX};i++){
        float age = uAges[i];
        if (age < 0.0) continue;
        vec2  c = uCenters[i];
        vec2  to = uv - c;
        float d  = length(to) + 1e-6;

        float r   = age * uSpeed;
        float band= smoothstep(r, r - uRing, d);
        float osc = sin(d * uFreq - age * (uFreq*0.6));
        float att = exp(-d * uFalloff);
        disp += normalize(to) * (band * osc * att) * uRefract;
      }

      vec4 a = safeSample(uTex0, uv + disp);
      vec4 b = safeSample(uTex1, uv + disp);

      // 两路都透明 → 整体透明（相当于“关闭效果”，看见底下 DOM）
      if (a.a == 0.0 && b.a == 0.0) { gl_FragColor = vec4(0.0); return; }

      // 按 uMix 混合；alpha 固定为 1（完全覆盖底图的同一区域，但画布整体仍透明背景）
      vec3 rgb = mix(a.rgb, b.rgb, uMix);
      gl_FragColor = vec4(rgb, 1.0);
    }
  `;

  // 参数（稍强一点，效果明显）
  const uniforms = {
    uTex0: { value: placeholder },
    uTex1: { value: placeholder },
    uMix:  { value: 0.0 },
    uRes:  { value: new THREE.Vector2(innerWidth, innerHeight) },

    uSpeed:   { value: 0.6 },
    uRing:    { value: 0.12 },
    uFreq:    { value: 22.0 },
    uRefract: { value: 0.028 },
    uFalloff: { value: 2.2 },

    uCenters: { value: Array.from({length:MAX}, () => new THREE.Vector2(-1,-1)) },
    uAges:    { value: Array.from({length:MAX}, () => -999.0) }
  };

  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),
    new THREE.ShaderMaterial({ uniforms, vertexShader:vtx, fragmentShader:frg, transparent:true })
  ));

  function resize(){
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(innerWidth, innerHeight, false);
    uniforms.uRes.value.set(innerWidth, innerHeight);
  }
  addEventListener('resize', resize);
  resize();

  // 严格读取“谁在显示”：display:none → 0；否则用真实 opacity
  function visOpacity(el){
    const cs = getComputedStyle(el);
    if (cs.display === 'none') return 0;
    const op = parseFloat(cs.opacity);
    return isFinite(op) ? op : 1;
  }
  function getMix(){
    const io = visOpacity(imgEl);
    const vo = visOpacity(vidEl);
    const s = io + vo;
    return s > 0 ? (vo / s) : 0;
  }

  // 只在“就绪 + 允许”时创建纹理；否则保持占位（透明）
  function tryInitImage(){
    if (texImg || !allowImg || !imageReady()) return;
    texImg = new THREE.Texture(imgEl);
    texImg.minFilter = THREE.LinearFilter;
    texImg.magFilter = THREE.LinearFilter;
    texImg.wrapS = texImg.wrapT = THREE.ClampToEdgeWrapping;
    texImg.needsUpdate = true;
    uniforms.uTex0.value = texImg;
  }
  function tryInitVideo(){
    if (texVid || !allowVid || !videoReady()) return;
    texVid = new THREE.VideoTexture(vidEl);
    texVid.minFilter = THREE.LinearFilter;
    texVid.magFilter = THREE.LinearFilter;
    texVid.generateMipmaps = false;
    texVid.wrapS = texVid.wrapT = THREE.ClampToEdgeWrapping;
    uniforms.uTex1.value = texVid;
  }

  imgEl.addEventListener('load', tryInitImage);
  vidEl.addEventListener('loadeddata', tryInitVideo);
  imgEl.addEventListener('error', ()=>{ texImg=null; uniforms.uTex0.value=placeholder; });
  vidEl.addEventListener('error', ()=>{ texVid=null; uniforms.uTex1.value=placeholder; });

  const mo = new MutationObserver(muts => {
    for (const m of muts){
      if (m.target === imgEl && m.attributeName === 'src'){ texImg=null; uniforms.uTex0.value=placeholder; tryInitImage(); }
      if (m.target === vidEl && m.attributeName === 'src'){ texVid=null; uniforms.uTex1.value=placeholder; tryInitVideo(); }
    }
  });
  mo.observe(imgEl, { attributes:true, attributeFilter:['src'] });
  mo.observe(vidEl, { attributes:true, attributeFilter:['src'] });

  // 涟漪交互
  const centers = uniforms.uCenters.value;
  const agesArr = uniforms.uAges.value;
  function addRipple(px, py){
    const x = px / innerWidth;
    const y = 1.0 - (py / innerHeight);
    let idx = agesArr.indexOf(-999);
    if (idx === -1){ idx = 0; for(let i=1;i<MAX;i++){ if (agesArr[i] > agesArr[idx]) idx = i; } }
    centers[idx].set(x,y);
    agesArr[idx] = 0.0;
  }
  let lastFire = 0;
  addEventListener('pointermove', e => {
    const now = performance.now();
    if (now - lastFire > 90){ lastFire = now; addRipple(e.clientX, e.clientY); }
  }, { passive:true });
  addEventListener('pointerdown', e => addRipple(e.clientX, e.clientY), { passive:true });

  // 动画
  let last = performance.now();
  function tick(t){
    const dt = (t - last) * 0.001; last = t;

    // 纹理就绪检测（防止首次 0×0）
    tryInitImage();
    tryInitVideo();

    // 视频逐帧更新
    if (texVid && videoReady()) texVid.needsUpdate = !vidEl.paused;

    // ripple 更新
    for (let i=0;i<MAX;i++){
      if (agesArr[i] >= 0){
        agesArr[i] += dt;
        if (agesArr[i] > 3.0) agesArr[i] = -999.0;
      }
    }

    // 与 DOM 混合保持一致
    uniforms.uMix.value = getMix();

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // 调试：按 R 在中心打一圈
  addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'r') addRipple(innerWidth*0.5, innerHeight*0.5);
  });
})();
