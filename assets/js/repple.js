// 简单全站水波：把两层遮罩加到 <body>，监听鼠标/触摸位置做扩散动画
(() => {
  const enable = () => {
    const outer = document.createElement('div');
    const inner = document.createElement('div');
    outer.className = 'ripple-layer';
    inner.className = 'ripple-layer--inner';
    document.body.appendChild(outer);
    document.body.appendChild(inner);

    let rafId = null;
    let lastX = innerWidth * 0.5;
    let lastY = innerHeight * 0.5;
    let start = 0;
    let playing = false;

    // 每次触发从 0 径向扩散到 maxR，然后自动淡出
    function spawn(x, y){
      lastX = x; lastY = y;
      start = performance.now();
      playing = true;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(tick);
    }

    function tick(t){
      const dur = 900; // 动画时长（毫秒）
      const e = Math.min((t - start) / dur, 1); // 0..1
      // 缓动：开始快，后段慢（cubic-bezier 近似）
      const k = e < 0.7 ? (e*e*1.8) : (0.7 + (e-0.7)*0.6);

      const maxR = Math.hypot(innerWidth, innerHeight) * 0.45; // 扩散半径
      const r = k * maxR;
      const alpha = (1 - e) * 0.35; // 透明度渐隐

      // 写入 CSS 变量
      const setVars = (el) => {
        el.style.setProperty('--mx', lastX + 'px');
        el.style.setProperty('--my', lastY + 'px');
        el.style.setProperty('--r',  r + 'px');
        el.style.setProperty('--alpha', alpha.toFixed(3));
      };
      setVars(outer);
      setVars(inner);

      if (e < 1) {
        rafId = requestAnimationFrame(tick);
      } else {
        playing = false;
      }
    }

    // 监听指针移动（节流：只在停顿/转折时触发一次新的扩散）
    let lastFire = 0;
    window.addEventListener('pointermove', (ev) => {
      const now = performance.now();
      if (now - lastFire > 80 || !playing) {
        lastFire = now;
        spawn(ev.clientX, ev.clientY);
      }
    }, { passive: true });

    // 触摸点击也触发一次
    window.addEventListener('pointerdown', (ev) => {
      spawn(ev.clientX, ev.clientY);
    }, { passive: true });

    // 窗口缩放更新位置（防止变量指向旧坐标）
    window.addEventListener('resize', () => {
      lastX = innerWidth * 0.5;
      lastY = innerHeight * 0.5;
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enable);
  } else {
    enable();
  }
})();