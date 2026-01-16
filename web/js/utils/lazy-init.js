// js/utils/lazy-init.js
// Lazy chart/map initialization with light offscreen containment.
(function () {
  if (window.registerLazyInit) {
    return;
  }

  const initialized = new WeakSet();
  const defaultOptions = {
    rootMargin: "240px 0px",
    threshold: 0.12,
  };

  function applyPerfStyles(element) {
    if (!element || !element.style) return;
    if ("contentVisibility" in element.style) {
      element.style.contentVisibility = "auto";
    }
    if (!element.style.contain) {
      element.style.contain = "layout paint";
    }
  }

  function initOnce(element, initFn) {
    if (!element || initialized.has(element)) return;
    initialized.add(element);
    Promise.resolve()
      .then(() => initFn())
      .catch((error) => {
        console.error("Lazy init failed:", error);
      });
  }

  function registerLazyInit(target, initFn, options = {}) {
    const element = typeof target === "string" ? document.querySelector(target) : target;
    if (!element) return;

    applyPerfStyles(element);

    if (!("IntersectionObserver" in window)) {
      initOnce(element, initFn);
      return;
    }

    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          initOnce(element, initFn);
          obs.unobserve(element);
        });
      },
      { ...defaultOptions, ...options },
    );

    observer.observe(element);
  }

  window.registerLazyInit = registerLazyInit;
})();
