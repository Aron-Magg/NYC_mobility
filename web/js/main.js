document.addEventListener("DOMContentLoaded", () => {
  /* ========================================
     CONSTANTS
     ======================================== */

  // How far from the top of the viewport the chapter title should land
  const BASE_OFFSET = 10; // px extra below the fixed nav

  // Duration of the smooth scroll between chapters (ms)
  const SCROLL_DURATION_MS = 1800;

  const navOuter = document.querySelector(".top-nav-outer");
  function getTopOffset() {
    if (!navOuter) return BASE_OFFSET;

    // Use "bottom" (not height) so we also account for the fixed top gap (e.g. top: 8px)
    return navOuter.getBoundingClientRect().bottom + BASE_OFFSET;
  }

  // Time window for the easter egg clicks (in ms)
  const CLICK_WINDOW = 2000;

  /* ========================================
     DOM REFERENCES
     ======================================== */

  const menuLinks = document.querySelectorAll(".menu a");
  const indicator = document.querySelector(".menu-indicator");
  const navRail = document.querySelector(".top-nav"); // renamed selector (ex .side-bar)
  const train = document.getElementById("easter-train");

  const items = []; // will store { section, li, anchor }
  let currentChapterIndex = -1;

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

  const homeSection = document.getElementById("home");
  function updateHomeOffset() {
    if (!homeSection) return;
    homeSection.style.paddingTop = `${getTopOffset()}px`;
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  let activeScrollRaf = null;

  function smoothScrollToTarget(getTargetY, durationMs, attempt = 0) {
    const prefersReduced =
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced || durationMs <= 0) {
      window.scrollTo(0, getTargetY());
      return;
    }

    if (activeScrollRaf) {
      cancelAnimationFrame(activeScrollRaf);
      activeScrollRaf = null;
    }

    const startY = getScrollY();
    const startTime = performance.now();
    const maxAttempts = 2;

    const step = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      const eased = easeInOutCubic(t);
      const targetY = getTargetY();
      window.scrollTo(0, startY + (targetY - startY) * eased);
      if (t < 1) {
        activeScrollRaf = requestAnimationFrame(step);
      } else {
        activeScrollRaf = null;
        const finalTarget = getTargetY();
        window.scrollTo(0, finalTarget);
        if (attempt < maxAttempts) {
          setTimeout(() => {
            const settleTarget = getTargetY();
            const diff = Math.abs(getScrollY() - settleTarget);
            if (diff > 2) {
              smoothScrollToTarget(getTargetY, Math.min(450, durationMs * 0.4), attempt + 1);
            }
          }, 80);
        }
      }
    };

    activeScrollRaf = requestAnimationFrame(step);
  }

  /**
   * Keeps the rail endpoints anchored to the first/last menu items.
   * This makes the "track" resilient under zoom and layout changes.
   *
   * It updates CSS variables used by .top-nav::before / ::after:
   *   --track-left  (px from left edge)
   *   --track-right (px from right edge)
   */
  function updateTrackBounds() {
    if (!navRail || items.length === 0) return;

    const barRect = navRail.getBoundingClientRect();

    // First/last <li> centers relative to the rail
    const firstLiRect = items[0].li.getBoundingClientRect();
    const lastLiRect = items[items.length - 1].li.getBoundingClientRect();

    const firstCenterX = firstLiRect.left + firstLiRect.width / 2 - barRect.left;
    const lastCenterX = lastLiRect.left + lastLiRect.width / 2 - barRect.left;

    // Small padding so the line doesn't look "cut" against the larger end dots
    // (doesn't change style, it just keeps the endpoints stable with zoom)
    const endPad = 15;

    const left = Math.max(0, firstCenterX - endPad);
    const right = Math.max(0, barRect.width - (lastCenterX + endPad));

    navRail.style.setProperty("--track-left", `${left}px`);
    navRail.style.setProperty("--track-right", `${right}px`);
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
     BUILD MENU -> SECTION MAP & CLICK HANDLERS
     ======================================== */

  menuLinks.forEach((link) => {
    const href = link.getAttribute("href");

    if (href && href.startsWith("#")) {
      const section = document.querySelector(href);
      const li = link.closest("li");

      if (section && li) {
        // Use the internal <h2> as the visual anchor if present
        const anchor = section.querySelector("h2") || section;
        if (!li.querySelector(".menu-time-row")) {
          const timeRow = document.createElement("div");
          timeRow.className = "menu-time-row";
          timeRow.innerHTML =
            "<span class=\"menu-time\"></span><span class=\"menu-delay\"></span>";
          li.appendChild(timeRow);
        }
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
          const anchor = section.querySelector("h2, h1") || section;

          const getTargetY = () => {
            const elementPosition = getDocumentY(anchor);
            const offsetPosition = elementPosition - getTopOffset();
            const maxScroll = Math.max(
              0,
              document.documentElement.scrollHeight - window.innerHeight,
            );
            return Math.max(0, Math.min(offsetPosition, maxScroll));
          };

          smoothScrollToTarget(getTargetY, SCROLL_DURATION_MS);
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
     SCROLL INDICATOR (RED DOT ON THE TOP NAV)
     ======================================== */

  /**
   * Updates the horizontal position of the red indicator dot
   * so that it matches the "current" section.
   *
   * The "current" section is defined as the last section whose
   * anchor is above a focus line TOP_OFFSET px from the top
   * of the viewport.
   */
  function updateIndicator() {
    if (!indicator || !navRail || items.length === 0) return;

    const barRect = navRail.getBoundingClientRect();

    // Focus line: just below the fixed nav
    const focusY = getScrollY() + getTopOffset();

    const anchorPositions = items.map((item) => getDocumentY(item.anchor));

    // X centers of each <li> relative to the rail (local coordinates)
    const liCentersX = items.map((item) => {
      const liRect = item.li.getBoundingClientRect();
      const centerX = liRect.left + liRect.width / 2;
      return centerX - barRect.left;
    });

    let leftPos;
    let idx = 0;

    if (focusY <= anchorPositions[0]) {
      leftPos = liCentersX[0];
    } else if (focusY >= anchorPositions[anchorPositions.length - 1]) {
      leftPos = liCentersX[liCentersX.length - 1];
      idx = anchorPositions.length - 1;
    } else {
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

    if (idx !== currentChapterIndex) {
      currentChapterIndex = idx;
    }
    updateSchedule(currentChapterIndex);
  }

  /* ========================================
     INITIALIZATION & EVENT BINDINGS
     ======================================== */

  /* ========================================
     MENU SCHEDULE
     ======================================== */

  const baseTime = new Date();
  const visitedChapters = new Set();

  const expectedTimes = items.map((_, index) => {
    return new Date(baseTime.getTime() + index * 60 * 1000);
  });

  function formatTime(date) {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  function getDelayMinutes(now, expected) {
    const diffMs = now.getTime() - expected.getTime();
    if (diffMs <= 0) return 0;
    return Math.floor(diffMs / 60000);
  }

  function updateSchedule(activeIndex) {
    const now = new Date();

    if (typeof activeIndex === "number" && !visitedChapters.has(activeIndex)) {
      visitedChapters.add(activeIndex);
      items[activeIndex].li.dataset.arrivalTime = now.toISOString();
    }

    let delayOffsetMinutes = 0;
    if (typeof activeIndex === "number" && activeIndex >= 0) {
      delayOffsetMinutes = getDelayMinutes(now, expectedTimes[activeIndex]);
    }

    items.forEach((item, index) => {
      const timeEl = item.li.querySelector(".menu-time");
      const delayEl = item.li.querySelector(".menu-delay");
      if (!timeEl || !delayEl) return;

      const scheduled = expectedTimes[index];
      let delayMinutes = 0;

      if (visitedChapters.has(index)) {
        const arrivalIso = item.li.dataset.arrivalTime;
        if (arrivalIso) {
          const arrivalTime = new Date(arrivalIso);
          delayMinutes = getDelayMinutes(arrivalTime, scheduled);
        }
      } else {
        if (delayOffsetMinutes > 0 && now.getTime() > scheduled.getTime()) {
          delayMinutes = delayOffsetMinutes;
        }
      }

      timeEl.textContent = formatTime(scheduled);
      if (delayMinutes > 0) {
        delayEl.textContent = `+${delayMinutes} min`;
      } else {
        delayEl.textContent = "";
      }
    });

  }

  updateSchedule(0);
  currentChapterIndex = 0;

  // Set initial track + indicator position on load (fonts/layout can shift things)
  updateTrackBounds();
  updateHomeOffset();
  updateIndicator();

  window.addEventListener("load", () => {
    updateTrackBounds();
    updateHomeOffset();
    updateIndicator();
  });

  // Update indicator while scrolling
  window.addEventListener("scroll", () => {
    window.requestAnimationFrame(updateIndicator);
  });

  // Update track + indicator when resizing (zoom triggers resize in most browsers)
  window.addEventListener("resize", () => {
    window.requestAnimationFrame(() => {
      updateTrackBounds();
      updateHomeOffset();
      updateIndicator();
    });
  });

  setInterval(() => {
    updateSchedule(currentChapterIndex);
  }, 60000);

  /* ========================================
     GRAND CENTRAL CLOCK
     ======================================== */

  function initFfsClock() {
    const minuteTicks = document.querySelector(".grand-central-clock__minute-ticks");
    const hourTicks = document.querySelector(".grand-central-clock__hour-ticks");
    const numerals = document.querySelector(".grand-central-clock__numbers");
    if (!minuteTicks || !hourTicks) return;

    minuteTicks.innerHTML = "";
    hourTicks.innerHTML = "";
    if (numerals) {
      numerals.innerHTML = "";
    }

    for (let i = 0; i < 60; i += 1) {
      const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", "100");
      dot.setAttribute("cy", "16");
      dot.setAttribute("r", "1.6");
      dot.setAttribute("class", "grand-central-clock__tick");
      dot.setAttribute("transform", `rotate(${i * 6} 100 100)`);
      minuteTicks.appendChild(dot);
    }

    if (numerals) {
      const labels = ["12", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];
      const radius = 72;
      labels.forEach((label, index) => {
        const angle = (index * 30 - 90) * (Math.PI / 180);
        const x = 100 + Math.cos(angle) * radius;
        const y = 100 + Math.sin(angle) * radius;
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("class", "grand-central-clock__numeral");
        text.setAttribute("x", x.toFixed(2));
        text.setAttribute("y", y.toFixed(2));
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "middle");
        text.textContent = label;
        numerals.appendChild(text);
      });
    }

    const hourHand = document.querySelector(".grand-central-clock__hand--hour");
    const minuteHand = document.querySelector(".grand-central-clock__hand--minute");

    function updateClock() {
      const now = new Date();
      const minutes = now.getMinutes();
      const hours = now.getHours() % 12;

      const minuteAngle = minutes * 6;
      const hourAngle = hours * 30 + minutes * 0.5;

      if (hourHand) hourHand.style.transform = `rotate(${hourAngle}deg)`;
      if (minuteHand) minuteHand.style.transform = `rotate(${minuteAngle}deg)`;
    }

    updateClock();
    setInterval(updateClock, 1000);
  }

  initFfsClock();
});
