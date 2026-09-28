// stats.js — pure logic, no DOM. Works in browser (window.Stats) and Node (for testing).
const Stats = (() => {
  const isMissing = v =>
    v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

  const nonMissing = arr => arr.filter(v => !isMissing(v));

  // ---------- 1. Column type detection ----------
  function detectType(values) {
    const vals = nonMissing(values);
    if (vals.length === 0) return 'empty';

    // PapaParse with dynamicTyping already turns "42" into 42
    if (vals.every(v => typeof v === 'number' && Number.isFinite(v))) return 'numeric';

    const strs = vals.map(String);

    // Date: must contain - or / and parse as a valid date (avoids "Room 5" counting as a date)
    const dateLike = strs.filter(s => /[-\/]/.test(s) && /\d/.test(s) && !isNaN(Date.parse(s)));
    if (dateLike.length / strs.length >= 0.9) return 'date';

    // Categorical: few unique values, or values repeat a lot
    const unique = new Set(strs).size;
    if (unique <= 20 || unique / strs.length <= 0.5) return 'categorical';

    return 'text';
  }

  // ---------- 2. Math helpers ----------
  const sum = a => a.reduce((s, x) => s + x, 0);
  const mean = a => sum(a) / a.length;

  // Linear-interpolated quantile on a SORTED array
  function quantile(sorted, q) {
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  function std(a, m = mean(a)) {
    if (a.length < 2) return 0;
    return Math.sqrt(sum(a.map(x => (x - m) ** 2)) / (a.length - 1)); // sample std dev
  }

  // ---------- 3. Per-type column stats ----------
  function numericStats(values) {
    const nums = nonMissing(values).sort((a, b) => a - b);
    const m = mean(nums);
    const q1 = quantile(nums, 0.25);
    const q3 = quantile(nums, 0.75);
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    const outliers = nums.filter(x => x < lower || x > upper);
    return {
      min: nums[0],
      max: nums[nums.length - 1],
      mean: m,
      median: quantile(nums, 0.5),
      std: std(nums, m),
      q1, q3,
      outlierCount: outliers.length,
      outlierBounds: [lower, upper],
    };
  }

  function categoricalStats(values, topN = 5) {
    const counts = new Map();
    nonMissing(values).forEach(v => counts.set(String(v), (counts.get(String(v)) || 0) + 1));
    const top = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([value, count]) => ({ value, count }));
    return { uniqueCount: counts.size, top };
  }

  function dateStats(values) {
    const times = nonMissing(values).map(v => Date.parse(String(v))).filter(t => !isNaN(t));
    return {
      earliest: new Date(Math.min(...times)).toISOString().slice(0, 10),
      latest: new Date(Math.max(...times)).toISOString().slice(0, 10),
    };
  }

  // ---------- 4. Correlation (Pearson, pairwise-complete rows) ----------
  function pearson(xs, ys) {
    const px = [], py = [];
    for (let i = 0; i < xs.length; i++) {
      if (typeof xs[i] === 'number' && typeof ys[i] === 'number') {
        px.push(xs[i]); py.push(ys[i]);
      }
    }
    if (px.length < 3) return null;
    const mx = mean(px), my = mean(py);
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < px.length; i++) {
      num += (px[i] - mx) * (py[i] - my);
      dx += (px[i] - mx) ** 2;
      dy += (py[i] - my) ** 2;
    }
    const denom = Math.sqrt(dx * dy);
    return denom === 0 ? null : num / denom;
  }

  function correlationMatrix(rows, numericCols) {
    const data = {};
    numericCols.forEach(c => (data[c] = rows.map(r => r[c])));
    const matrix = numericCols.map(a => numericCols.map(b => (a === b ? 1 : pearson(data[a], data[b]))));
    return { columns: numericCols, matrix };
  }

  // ---------- 5. Main entry point ----------
  function analyze(rows) {
    if (!rows.length) return null;
    const columnNames = Object.keys(rows[0]);

    const columns = columnNames.map(name => {
      const values = rows.map(r => r[name]);
      const type = detectType(values);
      const missing = values.filter(isMissing).length;
      const info = {
        name,
        type,
        missing,
        missingPct: (missing / rows.length) * 100,
      };
      if (type === 'numeric') info.stats = numericStats(values);
      else if (type === 'categorical' || type === 'text') info.stats = categoricalStats(values);
      else if (type === 'date') info.stats = dateStats(values);
      return info;
    });

    const seen = new Set();
    let duplicateRows = 0;
    rows.forEach(r => {
      const key = JSON.stringify(r);
      seen.has(key) ? duplicateRows++ : seen.add(key);
    });

    const numericCols = columns.filter(c => c.type === 'numeric').map(c => c.name);

    return {
      rowCount: rows.length,
      colCount: columnNames.length,
      totalMissing: columns.reduce((s, c) => s + c.missing, 0),
      duplicateRows,
      columns,
      correlations: numericCols.length >= 2 ? correlationMatrix(rows, numericCols) : null,
    };
  }

  return { analyze, detectType, numericStats, categoricalStats, pearson };
})();

if (typeof module !== 'undefined') module.exports = Stats;
