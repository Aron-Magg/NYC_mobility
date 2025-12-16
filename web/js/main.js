document.addEventListener("DOMContentLoaded", () => {
  /* ========================================
     CONSTANTS
     ======================================== */

  // How far from the top of the viewport the chapter title should land
  const BASE_OFFSET = 10; // px extra sotto la navbar

  const navOuter = document.querySelector(".side-bar-outer");
  function getTopOffset() {
    if (!navOuter) return BASE_OFFSET;
    return navOuter.getBoundingClientRect().height + BASE_OFFSET;
  }


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
          const offsetPosition = elementPosition - getTopOffset();

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

  const barRect = sidebar.getBoundingClientRect();

  // Focus line: appena sotto la navbar fissa
  const focusY = getScrollY() + getTopOffset();

  const anchorPositions = items.map((item) => getDocumentY(item.anchor));

  // Centri X di ogni <li> rispetto alla barra (coordinate locali)
  const liCentersX = items.map((item) => {
    const liRect = item.li.getBoundingClientRect();
    const centerX = liRect.left + liRect.width / 2;
    return centerX - barRect.left;
  });

  let leftPos;

  if (focusY <= anchorPositions[0]) {
    leftPos = liCentersX[0];
  } else if (focusY >= anchorPositions[anchorPositions.length - 1]) {
    leftPos = liCentersX[liCentersX.length - 1];
  } else {
    let idx = 0;
    for (let i = 0; i < anchorPositions.length - 1; i++) {
      if (focusY >= anchorPositions[i] && focusY <= anchorPositions[i + 1]) {
        idx = i;
        break;
      }
    }

    const y0 = anchorPositions[idx];
    const y1 = anchorPositions[idx + 1];
    const t = (focusY - y0) / (y1 - y0);

    const p0 = liCentersX[idx];
    const p1 = liCentersX[idx + 1];

    leftPos = p0 + (p1 - p0) * t;
  }

  indicator.style.left = `${leftPos}px`;
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
