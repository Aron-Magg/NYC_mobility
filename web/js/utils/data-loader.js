// js/utils/data-loader.js
// CSV loader that rebuilds datasets from split parts using a manifest file.
(function () {
  if (typeof d3 === "undefined") {
    return;
  }

  const cache = new Map();

  function loadCsvMaybeParts(path, row, cacheKey) {
    const key = cacheKey ? `${path}::${cacheKey}` : path;
    if (cache.has(key)) {
      return cache.get(key);
    }

    const request = d3.csv(path, row).catch(async (error) => {
      const base = path.replace(/\.csv$/i, "");
      const manifestPath = `${base}.parts.json`;

      try {
        const manifest = await d3.json(manifestPath);
        if (!manifest || !Array.isArray(manifest.parts) || manifest.parts.length === 0) {
          throw error;
        }

        const prefix = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
        const partPromises = manifest.parts.map((part) => d3.csv(`${prefix}${part}`, row));
        const parts = await Promise.all(partPromises);
        return parts.flat();
      } catch (manifestError) {
        throw error;
      }
    });

    cache.set(key, request);
    return request;
  }

  window.loadCsvMaybeParts = loadCsvMaybeParts;
})();
