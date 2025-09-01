(() => {
  // —— 开机即加 preboot（防首帧抖动）——
  try { document.documentElement.classList.add('ivt-preboot'); } catch(e){}

  /** ========= Site-wide nav config ========= */
  var NAV = {
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
  var defaults = {
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
  var FADE = {
    IN_DURATION: 700,
    OUT_DURATION: 700,
    EASING: "ease",
    overlay: null,
    reduce: (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) || false,
    exiting: false,

    ensureOverlay: function() {
      if (this.overlay) return this.overlay;
      var el = document.createElement("div");
      el.className = "ivt-fade-overlay";
      var st = el.style;
      st.position = "fixed";
      st.inset = "0";
      st.background = "#000";
      st.zIndex = "99999";
      st.opacity = "1"; // 初始黑场
      st.pointerEvents = "none";
      st.willChange = "opacity";
      st.transition = "opacity " + this.IN_DURATION + "ms " + this.EASING;
      document.body.appendChild(el);
      this.overlay = el;
      return el;
    },

    // 入口：1 -> 0
    enter: function() {
      if (this.reduce) { this.hide(); return; }
      var o = this.ensureOverlay();
      // iOS: 强制 reflow + 双 rAF，确保触发过渡
      void o.offsetHeight;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { o.style.opacity = "0"; });
      });
    },

    // 退出：0 -> 1
    exitAndNavigate: function(url) {
      if (this.reduce) { location.href = url; return; }
      if (this.exiting) return;
      this.exiting = true;

      var o = this.ensureOverlay();
      o.style.transition = "opacity " + this.OUT_DURATION + "ms " + this.EASING;
      o.style.pointerEvents = "auto";
      // 强制 reflow 再置 1
      void o.offsetHeight;
      o.style.opacity = "1";

      var self = this;
      setTimeout(function(){ location.href = url; }, this.OUT_DURATION + 80);
    },

    hide: function() {
      if (!this.overlay) return;
      this.overlay.style.opacity = "0";
      this.overlay.style.pointerEvents = "none";
      // 不移除节点，避免后续复用产生布局跳变
    },

    destroy: function() {
      if (this.overlay && this.overlay.parentNode) {
        this.overlay.parentNode.removeChild(this.overlay);
      }
      this.overlay = null;
    }
  };

  /** ========= 入口期禁用媒体自身过渡 ========= */
  var EnterGuard = {
    styleEl: null,
    on: function() {
      if (this.styleEl) return;
      var css = ".work-image, .work-video { transition: none !important; }";
      var el = document.createElement("style");
      el.id = "ivt-enter-guard";
      el.textContent = css;
      document.head.appendChild(el);
      this.styleEl = el;
    },
    off: function() {
      if (!this.styleEl) return;
      this.styleEl.parentNode.removeChild(this.styleEl);
      this.styleEl = null;
    }
  };

  /** ========= 注入侧栏 ========= */
  function injectSidebar() {
    var btn = document.createElement("button");
    btn.className = "menu-button";
    btn.id = "menuButton";
    btn.setAttribute("aria-label", "Open menu");

    var nav = document.createElement("nav");
    nav.className = "sidebar-menu";
    nav.id = "sidebarMenu";
    nav.setAttribute("aria-label", "Site");

    var here = (location.pathname.split("/").pop() || "index.html");
    var base = NAV.basePath ? (NAV.basePath.charAt(NAV.basePath.length - 1) === "/" ? NAV.basePath : NAV.basePath + "/") : "";

    NAV.links.forEach(function(item){
      if (item.divider) {
        var div = document.createElement("div");
        div.className = "space";
        nav.appendChild(div);
        return;
      }
      var a = document.createElement("a");
      a.href = base + item.href;
      a.textContent = item.label;
      a.title = item.label;
      if (item.href === here) a.setAttribute("aria-current", "page");
      nav.appendChild(a);
    });

    document.body.prepend(nav);
    document.body.prepend(btn);
  }

  /** ========= 读取页面媒体配置（无可选链） ========= */
  function loadConfig() {
    return new Promise(function(resolve){
      try {
        var inline = document.getElementById("page-media-config");
        if (inline && inline.type === "application/json") {
          try { resolve(JSON.parse(inline.textContent)); return; }
          catch(e){ /* 走默认 */ }
        }
        var script = (function(){
          // 找到当前这个 <script> 标签（保守：按最后一个外链脚本猜测）
          var scripts = document.getElementsByTagName('script');
          return scripts[scripts.length - 1] || null;
        })();
        var url = null;
        if (script && script.dataset && script.dataset.config) {
          url = script.dataset.config;
        }
        if (!url) { resolve({ media: [] }); return; }

        fetch(url, { cache: "no-store" })
          .then(function(res){ if(!res.ok) throw new Error("Config fetch failed: " + res.status); return res.json(); })
          .then(function(json){ resolve(json); })
          .catch(function(){ resolve({ media: [] }); });
      } catch(e) {
        resolve({ media: [] });
      }
    });
  }

  /** ========= 首帧预加载 ========= */
  function preloadMediaItem(item) {
    if (!item) return Promise.resolve();
    var isImg = (typeof item === "string") || item.type === "image";
    var src   = (typeof item === "string") ? item : item.src;

    if (isImg) {
      return new Promise(function(res){
        var img = new Image();
        img.decoding = "async";
        img.loading  = "eager";
        img.onload = function(){ res(); };
        img.onerror = function(){ res(); };
        img.src = src;
      });
    } else {
      return new Promise(function(res){
        var v = document.createElement("video");
        v.preload = "auto";
        v.muted = true;
        v.setAttribute("playsinline", "playsinline");
        v.setAttribute("webkit-playsinline", "webkit-playsinline");
        v.src = src;
        var done = function(){ v.removeAttribute("src"); try{ v.load(); }catch(e){} res(); };
        v.addEventListener("loadeddata", done, { once: true });
        v.addEventListener("error",      done, { once: true });
      });
    }
  }

  /** ========= 媒体交叉淡入 ========= */
  function initMedia(raw) {
    var cfg = {
      selectors: {
        image: defaults.selectors.image,
        video: defaults.selectors.video,
        menu:  defaults.selectors.menu,
        menuButton: defaults.selectors.menuButton
      },
      transitionMs: defaults.transitionMs,
      startIndex: defaults.startIndex,
      media: []
    };
    if (raw) {
      if (raw.selectors) {
        for (var k in raw.selectors) { cfg.selectors[k] = raw.selectors[k]; }
      }
      if (typeof raw.transitionMs === "number") cfg.transitionMs = raw.transitionMs;
      if (typeof raw.startIndex === "number")  cfg.startIndex = raw.startIndex;
      if (raw.media && raw.media.length) cfg.media = raw.media.slice();
    }

    var imgEl  = document.querySelector(cfg.selectors.image);
    var vidEl  = document.querySelector(cfg.selectors.video);
    var menuEl = document.querySelector(cfg.selectors.menu);
    var btnEl  = document.querySelector(cfg.selectors.menuButton);

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

    var index = Math.max(0, Math.min(+cfg.startIndex || 0, cfg.media.length - 1));
    var busy  = false;
    var currentType = "image";

    function fadeTo(el, opacity) {
      el.style.transition = "opacity " + cfg.transitionMs + "ms ease";
      // 强制 reflow 再改值：iOS 更稳
      void el.offsetHeight;
      el.style.opacity = opacity;
    }
    function onTransitionEndOnce(el, cb) {
      var called = false;
      var handler = function() {
        if (called) return;
        called = true;
        el.removeEventListener("transitionend", handler);
        cb();
      };
      el.addEventListener("transitionend", handler, { once: true });
      setTimeout(function(){
        if (!called) { el.removeEventListener("transitionend", handler); cb(); }
      }, cfg.transitionMs + 80);
    }
    function preloadImage(src) {
      return new Promise(function(resolve){
        var t = new Image();
        t.onload = function(){ resolve(); };
        t.onerror = function(){ resolve(); };
        t.src = src;
      });
    }
    function ensureVideoSource(vid, src) {
      var source = vid.querySelector("source");
      if (!source) {
        source = document.createElement("source");
        source.type = "video/mp4";
        vid.appendChild(source);
      }
      source.src = src;
      try { vid.load(); } catch(e){}
      vid.setAttribute("playsinline", "playsinline");
      vid.setAttribute("webkit-playsinline", "webkit-playsinline");
      vid.muted = true; // iOS 自动播放需要
    }

    function crossfadeToImage(src) {
      busy = true;
      preloadImage(src).then(function(){
        if (currentType === "video") {
          fadeTo(vidEl, 0);
          onTransitionEndOnce(vidEl, function(){
            try { vidEl.pause(); } catch(e){}
            vidEl.style.display = "none";
            imgEl.style.display = "block";
            imgEl.src = src;
            imgEl.style.opacity = 0;
            requestAnimationFrame(function(){
              fadeTo(imgEl, 1);
              currentType = "image";
              setTimeout(function(){ busy = false; }, cfg.transitionMs);
            });
          });
        } else {
          fadeTo(imgEl, 0);
          onTransitionEndOnce(imgEl, function(){
            imgEl.src = src;
            void imgEl.offsetWidth;
            fadeTo(imgEl, 1);
            currentType = "image";
            setTimeout(function(){ busy = false; }, cfg.transitionMs);
          });
        }
      });
    }

    function crossfadeToVideo(src) {
      busy = true;
      if (currentType === "image") {
        fadeTo(imgEl, 0);
        onTransitionEndOnce(imgEl, function(){
          imgEl.style.display = "none";
          ensureVideoSource(vidEl, src);
          vidEl.style.display = "block";
          vidEl.style.opacity = 0;
          vidEl.onloadeddata = function() {
            vidEl.play().catch(function(){});
            requestAnimationFrame(function(){
              fadeTo(vidEl, 1);
              currentType = "video";
              setTimeout(function(){ busy = false; }, cfg.transitionMs);
            });
          };
        });
      } else {
        fadeTo(vidEl, 0);
        onTransitionEndOnce(vidEl, function(){
          ensureVideoSource(vidEl, src);
          vidEl.onloadeddata = function() {
            vidEl.play().catch(function(){});
            requestAnimationFrame(function(){
              fadeTo(vidEl, 1);
              currentType = "video";
              setTimeout(function(){ busy = false; }, cfg.transitionMs);
            });
          };
        });
      }
    }

    function showByIndex(i, instant) {
      if (instant !== true) instant = false;
      var item = cfg.media[i];
      if (!item) return;

      if (typeof item === "string" || item.type === "image") {
        var srcI = (typeof item === "string") ? item : item.src;
        if (instant) {
          try { vidEl.pause(); } catch(e){}
          vidEl.style.display = "none";
          imgEl.style.display = "block";
          imgEl.src = srcI;
          imgEl.style.opacity = 1;
          currentType = "image";
        } else {
          crossfadeToImage(srcI);
        }
      } else if (item.type === "video") {
        var srcV = item.src;
        if (instant) {
          imgEl.style.display = "none";
          ensureVideoSource(vidEl, srcV);
          vidEl.style.display = "block";
          vidEl.style.opacity = 1;
          vidEl.play().catch(function(){});
          currentType = "video";
        } else {
          crossfadeToVideo(srcV);
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

    // 初始视频状态（保守）
    window.addEventListener("load", function(){
      try { vidEl.pause(); } catch(e){}
      vidEl.style.opacity = 0;
    });

    // 点击媒体切换
    document.addEventListener("click", function(ev){
      var inMenu = false;
      var t = ev.target;
      while (t) {
        if (t.matches && (t.matches(cfg.selectors.menu) || t.matches(cfg.selectors.menuButton))) { inMenu = true; break; }
        t = t.parentNode;
      }
      if (inMenu) return;

      var isMedia = false; t = ev.target;
      while (t) {
        if (t.matches && (t.matches(cfg.selectors.image) || t.matches(cfg.selectors.video))) { isMedia = true; break; }
        t = t.parentNode;
      }
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
    document.addEventListener("click", function(ev){
      var t = ev.target;
      var inMenu = false;
      while (t) {
        if (t.matches && (t.matches(".sidebar-menu") || t.matches(".menu-button"))) { inMenu = true; break; }
        t = t.parentNode;
      }
      if (inMenu) { ev.stopPropagation(); toggleMenu(ev); return; }
      menuEl.classList.remove("active");
      btnEl.classList.remove("hide");
    });
  }

  /** ========= 拦截站内链接，执行退出淡出 ========= */
  function wireExitFade() {
    document.addEventListener("click", function(e){
      var t = e.target;
      while (t && !(t.tagName && t.tagName.toLowerCase() === "a")) { t = t.parentNode; }
      var a = t;
      if (!a) return;
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      if (a.hasAttribute("download")) return;
      if (a.target && a.target !== "_self") return;

      var href = a.getAttribute("href");
      if (!href || href.charAt(0) === "#") return;

      var url;
      try { url = new URL(href, location.href); } catch(err){ return; }
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return;

      e.preventDefault();
      FADE.exitAndNavigate(url.href);
    });
  }

  // —— 安全等待字体，最多 1200ms —— //
  function waitFontsReady(maxMs) {
    return new Promise(function(resolve){
      var done = false;
      var timer = setTimeout(function(){
        if (done) return;
        done = true; resolve();
      }, maxMs || 1200);
      try {
        if (document.fonts && document.fonts.ready) {
          document.fonts.ready.then(function(){
            if (done) return;
            done = true; clearTimeout(timer); resolve();
          }).catch(function(){
            if (done) return;
            done = true; clearTimeout(timer); resolve();
          });
        } else {
          // 不支持 fonts API，直接过
          done = true; clearTimeout(timer); resolve();
        }
      } catch(e){
        done = true; clearTimeout(timer); resolve();
      }
    });
  }

  /** ========= Boot ========= */
  document.addEventListener("DOMContentLoaded", function(){
    (async function(){
      try {
        // 黑幕就位 & 禁用媒体过渡
        EnterGuard.on();
        FADE.ensureOverlay();

        // 先解除预启动隐藏（内容可见，但仍被黑幕覆盖）
        document.documentElement.classList.remove('ivt-preboot');

        injectSidebar();

        var cfg = await loadConfig();

        // 预加载首帧
        var mediaArr = Array.isArray(cfg.media) ? cfg.media : [];
        var startIdx = Math.max(0, Math.min(+cfg.startIndex || 0, mediaArr.length - 1));
        var firstItem = mediaArr[startIdx];
        if (firstItem) {
          await preloadMediaItem(firstItem);
        }

        // 最多等 1200ms 字体
        await waitFontsReady(1200);

        // 初始化媒体 & 退出拦截
        initMedia(cfg);
        wireExitFade();

        // 下一帧开始淡入；淡入结束再恢复媒体自身过渡
        requestAnimationFrame(function(){
          FADE.enter();
          setTimeout(function(){ EnterGuard.off(); }, FADE.IN_DURATION + 120);
        });
      } catch (e) {
        console.error(e);
        // 任何异常：立刻放行页面
        EnterGuard.off();
        FADE.hide();
        document.documentElement.classList.remove('ivt-preboot');
      }
    })();
  });

  // 终极兜底（即便上面全挂，也确保不黑屏）
  window.addEventListener('load', function(){
    try {
      document.documentElement.classList.remove('ivt-preboot');
      FADE.hide();
      // 若 overlay 仍存在且已透明太久，直接销毁
      setTimeout(function(){ FADE.destroy(); }, 1500);
    } catch(e){}
  });
})();
