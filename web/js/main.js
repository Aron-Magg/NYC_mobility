document.addEventListener("DOMContentLoaded", () => {
  /* ========================================
     CONSTANTS
     ======================================== */

  // How far from the top of the viewport the chapter title should land
  const TOP_OFFSET = 10; // px

  // Time window for the easter egg clicks (in ms)
  const CLICK_WINDOW = 2000;

  /* ========================================
     DOM REFERENCES
     ======================================== */

  const menuLinks = document.querySelectorAll(".menu a");
  const indicator = document.querySelector(".menu-indicator");
  const sidebar = document.querySelector(".side-bar");
  const train = document.getElementById("easter-train");

  const items = []; // will store { section, li, anchor }

  /* Helpers
     ======================================== */

  // Cross-browser scroll Y
  function getScrollY() {
    return (
      window.scrollY ||
      window.pageYOffset ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0
    );
  }

  // Document-relative Y position of an element
  function getDocumentY(el) {
    const rect = el.getBoundingClientRect();
    return rect.top + getScrollY();
  }

  /* ========================================
     EASTER EGG: LITTLE TRAIN
     ======================================== */

  // The last "station" in the menu triggers the easter egg
  const lastLink = menuLinks[menuLinks.length - 1];

  let eggClicks = 0; // how many consecutive clicks so far
  let lastClickTime = 0; // timestamp of the last click (ms)

  /**
   * Triggers the train animation by toggling the CSS class.
   * The forced reflow ensures the animation can be restarted.
   */
  function triggerTrain() {
    if (!train) return;

    // Reset animation so it can play again
    train.classList.remove("easter-train--active");
    void train.offsetWidth; // force reflow
    train.classList.add("easter-train--active");
  }

  /* ========================================
     BUILD MENU → SECTION MAP & CLICK HANDLERS
     ======================================== */

  menuLinks.forEach((link) => {
    const href = link.getAttribute("href");

    if (href && href.startsWith("#")) {
      const section = document.querySelector(href);
      const li = link.closest("li");

      if (section && li) {
        // Use the internal <h2> as the visual anchor if present
        const anchor = section.querySelector("h2") || section;
        items.push({ section, li, anchor });
      }
    }

    // Smooth scroll + easter egg logic on click
    link.addEventListener("click", (e) => {
      const href = link.getAttribute("href");

      // ----- Smooth scroll to section -----
      if (href && href.startsWith("#")) {
        e.preventDefault();

        const section = document.querySelector(href);
        if (section) {
          const anchor = section.querySelector("h2") || section;

          // Element's Y position in the document
          const elementPosition = getDocumentY(anchor);

          // We want the anchor to end up TOP_OFFSET px from the top of the viewport
          const offsetPosition = elementPosition - TOP_OFFSET;

          // Clamp target scroll so we never go beyond [0, maxScroll]
          const maxScroll = Math.max(
            0,
            document.documentElement.scrollHeight - window.innerHeight,
          );

          const target = Math.max(0, Math.min(offsetPosition, maxScroll));

          window.scrollTo({
            top: target,
            behavior: "smooth",
          });
        }
      }

      // ----- Easter egg: detect 5 rapid clicks on the last station -----
      if (link === lastLink) {
        const now = Date.now();

        // If too much time has passed since the last click, reset the counter
        if (now - lastClickTime > CLICK_WINDOW) {
          eggClicks = 0;
        }

        eggClicks += 1;
        lastClickTime = now;

        if (eggClicks >= 5) {
          eggClicks = 0;
          triggerTrain();
        }
      } else {
        // Clicking any other station resets the easter egg counter
        eggClicks = 0;
      }
    });
  });

  /* ========================================
     SCROLL INDICATOR (RED DOT ON THE SIDEBAR)
     ======================================== */

  /**
   * Updates the vertical position of the red indicator dot
   * so that it matches the "current" section.
   *
   * The "current" section is defined as the last section whose
   * anchor is above a focus line TOP_OFFSET px from the top
   * of the viewport.
   */
  function updateIndicator() {
    if (!indicator || !sidebar || items.length === 0) return;

    const sidebarRect = sidebar.getBoundingClientRect();

    // Focus line: TOP_OFFSET px from the top of the viewport
    const focusY = getScrollY() + TOP_OFFSET;

    // Document Y positions of each section anchor (<h2> or section)
    const anchorPositions = items.map((item) => getDocumentY(item.anchor));

    // Vertical centers of each <li> within the sidebar's coordinate system
    const liCenters = items.map((item) => {
      const liRect = item.li.getBoundingClientRect();
      const centerY = liRect.top + liRect.height / 2;
      return centerY - sidebarRect.top;
    });

    let topPos;

    // Before the first section → pin indicator to the first dot
    if (focusY <= anchorPositions[0]) {
      topPos = liCenters[0];
    }
    // After the last section → pin indicator to the last dot
    else if (focusY >= anchorPositions[anchorPositions.length - 1]) {
      topPos = liCenters[liCenters.length - 1];
    }
    // In between → interpolate between section i and i+1
    else {
      let idx = 0;

      // Find the segment [i, i+1] where focusY lies
      for (let i = 0; i < anchorPositions.length - 1; i++) {
        if (focusY >= anchorPositions[i] && focusY <= anchorPositions[i + 1]) {
          idx = i;
          break;
        }
      }

      const y0 = anchorPositions[idx];
      const y1 = anchorPositions[idx + 1];
      const t = (focusY - y0) / (y1 - y0); // progression between section i and i+1 (0 → 1)

      const p0 = liCenters[idx];
      const p1 = liCenters[idx + 1];

      topPos = p0 + (p1 - p0) * t;
    }

    indicator.style.top = `${topPos}px`;
  }

  /* ========================================
     INITIALIZATION & EVENT BINDINGS
     ======================================== */

  // Set initial indicator position on load (in case fonts/layout change)
  updateIndicator();
  window.addEventListener("load", updateIndicator);

  // Update indicator while scrolling
  window.addEventListener("scroll", () => {
    window.requestAnimationFrame(updateIndicator);
  });

  // Update indicator when resizing the window
  window.addEventListener("resize", () => {
    window.requestAnimationFrame(updateIndicator);
  });
});
