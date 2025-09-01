(() => {
  // —— 将 ivt-preboot 整合进 JS：脚本加载时立即加上，防止首帧抖动 ——
  try { document.documentElement.classList.add('ivt-preboot'); } catch(e){}

  /** ========= Site-wide nav config ========= */
  const NAV = {
    basePath: "",
    links: [
      { href: "index.html",                                      label: "In Vitro" },
      { divider: true },
      { href: "desert-star.html",                                label: "Desert Star" },
      { href: "sunlight-trapped-under-the-earth.html",           label: "Sunlight Trapped Under the Earth" },
      { href: "temporary-soul.html",                             label: "Temporary Soul" },
      { href: "lambda-7.html",                                   label: "Λ-7" },
      { href: "standing-at-the-center-of-the-continental-shelf.html", label: "Standing at the center of the continental shelf" },
      { href: "palace-of-oblivion.html",                         label: "Palace of oblivion" },
      { href: "biography.html",                                  label: "Biography" }
    ]
  };

  /** ========= Defaults ========= */
  const defaults = {
    selectors: {
      image: ".work-image",
      video: ".work-video",
      menu:  ".sidebar-menu",
      menuButton: "#menuButton"
    },
    transitionMs: 500,
    startIndex: 0,
    fastStartMaxWaitMs: 600   // ★ 最多等这么久就开始淡入（可调）
  };

  /** ========= 统一设置 <video> 属性（静音/自动播放/内联；不循环） ========= */
  function ensureVideoAttrs(vid){
    if (!vid) return;
    vid.muted = true;
    vid.autoplay = true;
    vid.playsInline = true;
    vid.removeAttribute('loop');                // 不循环：播放完切下一个
    vid.setAttribute('playsinline','');
    vid.setAttribute('webkit-playsinline','');
    try { vid.preload = 'metadata'; } catch(e){}// ★ 只拉元信息，首触更快
  }

  /** ========= Page Fade (enter/exit) ========= */
  const FADE = {
    IN_DURATION: 700,
    OUT_DURATION: 700,
    EASING: "ease",
    overlay: null,
    reduce: window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    exiting: false,

    ensureOverlay() {
      if (this.overlay) return this.overlay;
      const el = document.createElement("div");
      el.className = "ivt-fade-overlay";
      Object.assign(el.style, {
        position: "fixed",
        inset: "0",
        background: "#000",
        zIndex: "99999",
        opacity: "1",                  // 初始黑场
        pointerEvents: "none",
        willChange: "opacity",
        transition: `opacity ${this.IN_DURATION}ms ${this.EASING}`
      });
      document.body.appendChild(el);
      this.overlay = el;
      return el;
    },

    enter() {
      if (this.reduce) { this.hide(); return; }
      const o = this.ensureOverlay();
      requestAnimationFrame(() => { o.style.opacity = "0"; });
    },

    exitAndNavigate(url) {
      if (this.reduce) { location.href = url; return; }
      if (this.exiting) return;
      this.exiting = true;

      const o = this.ensureOverlay();
      o.style.transition = `opacity ${this.OUT_DURATION}ms ${this.EASING}`;
      o.style.pointerEvents = "auto";
      requestAnimationFrame(() => { o.style.opacity = "1"; });

      setTimeout(() => { location.href = url; }, this.OUT_DURATION + 60);
    },

    hide() {
      if (!this.overlay) return;
      this.overlay.style.opacity = "0";
      this.overlay.style.pointerEvents = "none";
    }
  };

  /** ========= 入口期禁用媒体自身过渡，避免与黑幕叠加 ========= */
  const EnterGuard = {
    styleEl: null,
    on() {
      if (this.styleEl) return;
      const css = `.work-image, .work-video { transition: none !important; }`;
      const el = document.createElement("style");
      el.id = "ivt-enter-guard";
      el.textContent = css;
      document.head.appendChild(el);
      this.styleEl = el;
    },
    off() {
      if (!this.styleEl) return;
      this.styleEl.remove();
      this.styleEl = null;
    }
  };

  /** ========= 注入侧栏（按钮 + 导航） ========= */
  function injectSidebar() {
    const btn = document.createElement("button");
    btn.className = "menu-button";
    btn.id = "menuButton";
    btn.setAttribute("aria-label", "Open menu");

    const nav = document.createElement("nav");
    nav.className = "sidebar-menu";
    nav.id = "sidebarMenu";
    nav.setAttribute("aria-label", "Site");

    const here = (location.pathname.split("/").pop() || "index.html");
    const base = NAV.basePath
      ? (NAV.basePath.endsWith("/") ? NAV.basePath : NAV.basePath + "/")
      : "";

    NAV.links.forEach(item => {
      if (item.divider) {
        const div = document.createElement("div");
        div.className = "space";
        nav.appendChild(div);
        return;
      }
      const a = document.createElement("a");
      a.href = base + item.href;
      a.textContent = item.label;
      a.title = item.label;
      if (item.href === here) a.setAttribute("aria-current", "page");
      nav.appendChild(a);
    });

    document.body.prepend(nav);
    document.body.prepend(btn);
  }

  /** ========= 读取页面媒体配置 ========= */
  async function loadConfig() {
    const inline = document.getElementById("page-media-config");
    if (inline && inline.type === "application/json") {
      try { return JSON.parse(inline.textContent); }
      catch { throw new Error("Invalid inline JSON in #page-media-config"); }
    }
    const script = document.currentScript;
    const url = script?.dataset?.config;
    if (url) {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("Config fetch failed: " + res.status);
      return res.json();
    }
    return { media: [] };
  }

  /** ========= 首帧预加载（视频仅触发一次 metadata） ========= */
  function preloadMediaItem(item) {
    if (!item) return Promise.resolve();

    const isImg = (typeof item === "string") || item.type === "image";
    const src   = (typeof item === "string") ? item : item.src;

    if (isImg) {
      const img = new Image();
      img.decoding = "async";
      img.loading  = "eager";
      img.src = src;
      if (img.decode) { return img.decode().catch(() => {}); }
      return new Promise(res => { img.onload = img.onerror = () => res(); });
    } else {
      // 轻量：只等 metadata，尽快返回
      return new Promise(res => {
        const v = document.createElement("video");
        ensureVideoAttrs(v);
        v.src = src;
        const done = () => { v.removeAttribute("src"); v.load(); res(); };
        v.addEventListener("loadedmetadata", done, { once: true });
        v.addEventListener("error",           done, { once: true });
      });
    }
  }

  /** ========= 快速起播：尽快 play，等到 canplay 或超时就淡入 ========= */
  function playWhenReady(vid, onReady, maxWaitMs){
    if (!vid) { onReady(); return; }
    ensureVideoAttrs(vid);

    // 1) 立即尝试播放（可能被策略/缓存阻塞，但我们不依赖其成功）
    try {
      const p = vid.play();
      if (p && typeof p.catch === 'function') p.catch(()=>{ /* 忽略 */ });
    } catch(e){ /* 忽略 */ }

    // 2) 如果已有足够数据，直接 ready
    const READY = 2; // HAVE_CURRENT_DATA
    if (vid.readyState >= READY) { onReady(); return; }

    let done = false;
    const finish = () => { if (done) return; done = true; cleanup(); onReady(); };
    const onCanPlay = () => finish();
    const to = setTimeout(finish, Math.max(0, maxWaitMs|0));

    function cleanup(){
      clearTimeout(to);
      vid.removeEventListener('canplay', onCanPlay);
    }
    vid.addEventListener('canplay', onCanPlay, { once: true });
  }

  /** ========= 媒体交叉淡入 ========= */
  function initMedia(raw) {
    const cfg = {
      ...defaults,
      ...raw,
      selectors: { ...defaults.selectors, ...(raw?.selectors || {}) }
    };

    const imgEl  = document.querySelector(cfg.selectors.image);
    const vidEl  = document.querySelector(cfg.selectors.video);
    const menuEl = document.querySelector(cfg.selectors.menu);
    const btnEl  = document.querySelector(cfg.selectors.menuButton);

    if (!menuEl || !btnEl) { console.error("Menu elements not found."); return; }
    if (!Array.isArray(cfg.media) || cfg.media.length === 0) { wireMenu(menuEl, btnEl); return; }
    if (!imgEl || !vidEl) { console.error("Media elements not found."); wireMenu(menuEl, btnEl); return; }

    ensureVideoAttrs(vidEl);

    let index = Math.max(0, Math.min(+cfg.startIndex || 0, cfg.media.length - 1));
    let busy  = false;
    let currentType = "image";

    function fadeTo(el, opacity) {
      el.style.transition = `opacity ${cfg.transitionMs}ms ease`;
      el.style.opacity = opacity;
    }
    function onTransitionEndOnce(el, cb) {
      let called = false;
      const handler = () => { if (called) return; called = true; el.removeEventListener("transitionend", handler); cb(); };
      el.addEventListener("transitionend", handler, { once: true });
      setTimeout(() => { if (!called) { el.removeEventListener("transitionend", handler); cb(); } }, cfg.transitionMs + 60);
    }
    function preloadImage(src) {
      return new Promise((resolve, reject) => {
        const t = new Image();
        t.onload = () => resolve();
        t.onerror = reject;
        t.src = src;
      });
    }

    async function crossfadeToImage(src) {
      try { await preloadImage(src); } catch(_) {}
      busy = true;

      if (currentType === "video") {
        fadeTo(vidEl, 0);
        onTransitionEndOnce(vidEl, () => {
          try { vidEl.pause(); } catch(e){}
          vidEl.style.display = "none";
          imgEl.style.display = "block";
          imgEl.src = src;
          imgEl.style.opacity = 0;
          requestAnimationFrame(() => {
            fadeTo(imgEl, 1);
            currentType = "image";
            setTimeout(() => { busy = false; }, cfg.transitionMs);
          });
        });
      } else {
        fadeTo(imgEl, 0);
        onTransitionEndOnce(imgEl, () => {
          imgEl.src = src;
          void imgEl.offsetWidth;
          fadeTo(imgEl, 1);
          currentType = "image";
          setTimeout(() => { busy = false; }, cfg.transitionMs);
        });
      }
    }

    function crossfadeToVideo(src) {
      busy = true;
      const start = () => {
        requestAnimationFrame(() => {
          fadeTo(vidEl, 1);
          currentType = "video";
          setTimeout(() => { busy = false; }, cfg.transitionMs);
        });
      };

      if (currentType === "image") {
        fadeTo(imgEl, 0);
        onTransitionEndOnce(imgEl, () => {
          imgEl.style.display = "none";
          let source = vidEl.querySelector("source");
          if (!source) { source = document.createElement("source"); source.type = "video/mp4"; vidEl.appendChild(source); }
          source.src = src;
          ensureVideoAttrs(vidEl);
          // 为了更快起播，不阻塞在 load/loadeddata 上
          try { vidEl.load(); } catch(e){}
          vidEl.style.display = "block";
          vidEl.style.opacity = 0;

          playWhenReady(vidEl, start, cfg.fastStartMaxWaitMs);
        });
      } else {
        fadeTo(vidEl, 0);
        onTransitionEndOnce(vidEl, () => {
          let source = vidEl.querySelector("source");
          if (!source) { source = document.createElement("source"); source.type = "video/mp4"; vidEl.appendChild(source); }
          source.src = src;
          ensureVideoAttrs(vidEl);
          try { vidEl.load(); } catch(e){}

          playWhenReady(vidEl, () => {
            requestAnimationFrame(() => {
              fadeTo(vidEl, 1);
              currentType = "video";
              setTimeout(() => { busy = false; }, cfg.transitionMs);
            });
          }, cfg.fastStartMaxWaitMs);
        });
      }
    }

    // —— 自动切换：视频结束后，进入下一个素材 —— //
    let endedBound = false;
    function onVideoEnded(){ if (busy) return; next(); }
    if (!endedBound) { vidEl.addEventListener('ended', onVideoEnded); endedBound = true; }

    function showByIndex(i, instant=false) {
      const item = cfg.media[i];
      if (!item) return;

      if (typeof item === "string" || item.type === "image") {
        const src = (typeof item === "string") ? item : item.src;
        if (instant) {
          try { vidEl.pause(); } catch(e){}
          vidEl.style.display = "none";
          imgEl.style.display = "block";
          imgEl.src = src;
          imgEl.style.opacity = 1;
          currentType = "image";
        } else {
          crossfadeToImage(src);
        }
      } else if (item.type === "video") {
        const src = item.src;
        if (instant) {
          imgEl.style.display = "none";
          let source = vidEl.querySelector("source");
          if (!source) { source = document.createElement("source"); source.type = "video/mp4"; vidEl.appendChild(source); }
          source.src = src;
          ensureVideoAttrs(vidEl);
          try { vidEl.load(); } catch(e){}
          vidEl.style.display = "block";
          vidEl.style.opacity = 0;

          playWhenReady(vidEl, () => {
            vidEl.style.opacity = 1;    // 即时模式直接显，避免双过渡
            currentType = "video";
          }, cfg.fastStartMaxWaitMs);
        } else {
          crossfadeToVideo(src);
        }
      }
    }

    function next() {
      if (busy) return;
      index = (index + 1) % cfg.media.length;
      showByIndex(index, false);
    }

    // 初始渲染：瞬时
    showByIndex(index, true);

    wireMenu(menuEl, btnEl);

    // 初始视频状态（保守处理）
    window.addEventListener("load", () => {
      try { vidEl.pause(); } catch(e){}
      vidEl.style.opacity = 0;
    });

    // 点击媒体切换
    document.addEventListener("click", (ev) => {
      const inMenu = ev.target.closest(`${cfg.selectors.menu}, ${cfg.selectors.menuButton}`);
      if (inMenu) return;
      const isMedia = ev.target.closest(`${cfg.selectors.image}, ${cfg.selectors.video}`);
      if (isMedia && !menuEl.classList.contains("active")) next();
      else { menuEl.classList.remove("active"); btnEl.classList.remove("hide"); }
    });
  }

  function wireMenu(menuEl, btnEl) {
    function toggleMenu(ev){
      if (ev) ev.stopPropagation();
      menuEl.classList.toggle("active");
      btnEl.classList.toggle("hide");
    }
    btnEl.addEventListener("click", toggleMenu);
    document.addEventListener("click", (ev) => {
      const inMenu = ev.target.closest(".sidebar-menu, .menu-button");
      if (inMenu) { ev.stopPropagation(); toggleMenu(ev); return; }
      menuEl.classList.remove("active");
      btnEl.classList.remove("hide");
    });
  }

  /** ========= 拦截站内链接，执行退出淡出 ========= */
  function wireExitFade() {
    document.addEventListener("click", (e) => {
      const a = e.target.closest("a");
      if (!a) return;
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      if (a.hasAttribute("download")) return;
      if (a.target && a.target !== "_self") return;

      const href = a.getAttribute("href");
      if (!href || href.startsWith("#")) return;

      const url = new URL(href, location.href);
      if (url.origin !== location.origin) return;

      if (url.pathname === location.pathname && url.search === location.search && url.hash) return;

      e.preventDefault();
      FADE.exitAndNavigate(url.href);
    });
  }

  /** ========= Boot ========= */
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      EnterGuard.on();
      FADE.ensureOverlay();

      document.documentElement.classList.remove('ivt-preboot');

      injectSidebar();

      const cfg = await loadConfig();

      const mediaArr = Array.isArray(cfg.media) ? cfg.media : [];
      const startIdx = Math.max(0, Math.min(+cfg.startIndex || 0, mediaArr.length - 1));
      const firstItem = mediaArr[startIdx];
      if (firstItem) { await preloadMediaItem(firstItem); }

      if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch {} }

      initMedia(cfg);
      wireExitFade();

      requestAnimationFrame(() => {
        FADE.enter();
        setTimeout(() => EnterGuard.off(), FADE.IN_DURATION + 80);
      });
    } catch (e) {
      console.error(e);
      wireExitFade();
      EnterGuard.off();
      FADE.hide();
    }
  });
})();
