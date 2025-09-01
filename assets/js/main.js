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
      { href: "lambda-7.html",                                   label: "Lambda-7" },
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
    startIndex: 0
  };

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

    // 入口：1 -> 0
    enter() {
      if (this.reduce) { this.hide(); return; }
      const o = this.ensureOverlay();
      requestAnimationFrame(() => { o.style.opacity = "0"; });
    },

    // 退出：0 -> 1
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
      a.title = item.label; // ★ 新增：用于悬浮提示
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

  /** ========= 首帧预加载 ========= */
  function preloadMediaItem(item) {
    if (!item) return Promise.resolve();

    const isImg = (typeof item === "string") || item.type === "image";
    const src   = (typeof item === "string") ? item : item.src;

    if (isImg) {
      const img = new Image();
      img.decoding = "async";
      img.loading  = "eager";
      img.src = src;
      if (img.decode) {
        return img.decode().catch(() => {});
      }
      return new Promise(res => { img.onload = img.onerror = () => res(); });
    } else {
      return new Promise(res => {
        const v = document.createElement("video");
        v.preload = "auto";
        v.muted = true;
        v.playsInline = true;
        v.src = src;
        const done = () => { v.removeAttribute("src"); v.load(); res(); };
        v.addEventListener("loadeddata", done, { once: true });
        v.addEventListener("error",      done, { once: true });
      });
    }
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

    if (!menuEl || !btnEl) {
      console.error("Menu elements not found.");
      return;
    }

    if (!Array.isArray(cfg.media) || cfg.media.length === 0) {
      wireMenu(menuEl, btnEl);
      return;
    }

    if (!imgEl || !vidEl) {
      console.error("Media elements not found.");
      wireMenu(menuEl, btnEl);
      return;
    }

    let index = Math.max(0, Math.min(+cfg.startIndex || 0, cfg.media.length - 1));
    let busy  = false;
    let currentType = "image";

    function fadeTo(el, opacity) {
      el.style.transition = `opacity ${cfg.transitionMs}ms ease`;
      el.style.opacity = opacity;
    }
    function onTransitionEndOnce(el, cb) {
      let called = false;
      const handler = () => {
        if (called) return;
        called = true;
        el.removeEventListener("transitionend", handler);
        cb();
      };
      el.addEventListener("transitionend", handler, { once: true });
      setTimeout(() => {
        if (!called) { el.removeEventListener("transitionend", handler); cb(); }
      }, cfg.transitionMs + 50);
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
          vidEl.pause();
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
      if (currentType === "image") {
        fadeTo(imgEl, 0);
        onTransitionEndOnce(imgEl, () => {
          imgEl.style.display = "none";
          let source = vidEl.querySelector("source");
          if (!source) {
            source = document.createElement("source");
            source.type = "video/mp4";
            vidEl.appendChild(source);
          }
          source.src = src;
          vidEl.load();
          vidEl.style.display = "block";
          vidEl.style.opacity = 0;
          vidEl.onloadeddata = () => {
            vidEl.play().catch(()=>{});
            requestAnimationFrame(() => {
              fadeTo(vidEl, 1);
              currentType = "video";
              setTimeout(() => { busy = false; }, cfg.transitionMs);
            });
          };
        });
      } else {
        fadeTo(vidEl, 0);
        onTransitionEndOnce(vidEl, () => {
          let source = vidEl.querySelector("source");
          if (!source) {
            source = document.createElement("source");
            source.type = "video/mp4";
            vidEl.appendChild(source);
          }
          source.src = src;
          vidEl.load();
          vidEl.onloadeddata = () => {
            vidEl.play().catch(()=>{});
            requestAnimationFrame(() => {
              fadeTo(vidEl, 1);
              currentType = "video";
              setTimeout(() => { busy = false; }, cfg.transitionMs);
            });
          };
        });
      }
    }
    function showByIndex(i, instant=false) {
      const item = cfg.media[i];
      if (!item) return;

      if (typeof item === "string" || item.type === "image") {
        const src = (typeof item === "string") ? item : item.src;
        if (instant) {
          vidEl.pause();
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
          if (!source) {
            source = document.createElement("source");
            source.type = "video/mp4";
            vidEl.appendChild(source);
          }
          source.src = src;
          vidEl.load();
          vidEl.style.display = "block";
          vidEl.style.opacity = 1;
          vidEl.play().catch(()=>{});
          currentType = "video";
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

    // 初始渲染：瞬时，避免与遮罩重复动画（此时首帧已被预加载）
    showByIndex(index, true);

    wireMenu(menuEl, btnEl);

    // 初始视频状态（保守处理）
    window.addEventListener("load", () => {
      vidEl.pause();
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
      // 先插入遮罩 & 禁用媒体过渡，避免与入口遮罩打架
      EnterGuard.on();
      FADE.ensureOverlay();

      // 黑幕已就位，解除预启动隐藏（内容可见但仍被黑幕覆盖）
      document.documentElement.classList.remove('ivt-preboot');

      injectSidebar();

      const cfg = await loadConfig();

      // —— 计算首项并预加载 —— //
      const mediaArr = Array.isArray(cfg.media) ? cfg.media : [];
      const startIdx = Math.max(0, Math.min(+cfg.startIndex || 0, mediaArr.length - 1));
      const firstItem = mediaArr[startIdx];
      if (firstItem) {
        await preloadMediaItem(firstItem);
      }

      // —— 等待网页字体就绪，避免淡入后字体替换导致的闪字/跳动 —— //
      if (document.fonts && document.fonts.ready) {
        try { await document.fonts.ready; } catch {}
      }

      // 初始化媒体
      initMedia(cfg);

      wireExitFade();

      // 一帧后开始淡入；淡入结束再恢复媒体元素自身的过渡
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
