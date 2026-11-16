import fs from 'node:fs';
import path from 'node:path';

const USERNAME = 'Minhajh2o';
const TOKEN = process.env.GITHUB_TOKEN;

const LANGUAGE_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Python: '#3572A5',
  C: '#555555',
  'C++': '#f34b7d',
  Java: '#b07219',
  Shell: '#89e051',
  PHP: '#4F5D95',
  Go: '#00ADD8',
  Rust: '#dea584'
};

const DEFAULT_COLOR = '#8b949e';

// Exclude data formats or markup/notebook blobs that skew code metrics
const IGNORED_LANGUAGES = new Set(['Batchfile', 'Jupyter Notebook']);

async function fetchStats() {
  const headers = {
    'User-Agent': 'TopLangsGenerator',
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
  };

  const reposRes = await fetch(
    `https://api.github.com/users/${USERNAME}/repos?per_page=100`,
    { headers }
  );

  if (!reposRes.ok) {
    throw new Error(`Failed to fetch repos: ${reposRes.status} ${reposRes.statusText}`);
  }

  const repos = await reposRes.json();
  const totals = {};

  for (const repo of repos) {
    if (repo.fork) continue;
    try {
      const langRes = await fetch(repo.languages_url, { headers });
      if (!langRes.ok) continue;
      const langs = await langRes.json();
      for (const [name, bytes] of Object.entries(langs)) {
        if (IGNORED_LANGUAGES.has(name)) continue;
        totals[name] = (totals[name] || 0) + bytes;
      }
    } catch (e) {
      console.warn(`Warning: failed to fetch langs for ${repo.name}:`, e.message);
    }
  }

  const totalBytes = Object.values(totals).reduce((a, b) => a + b, 0);
  if (totalBytes === 0) {
    throw new Error('No language data found');
  }

  const sorted = Object.entries(totals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([name, bytes]) => {
      const pct = (bytes / totalBytes) * 100;
      return {
        name,
        bytes,
        percent: pct >= 0.1 ? pct.toFixed(1) : '<0.1',
        pctNum: pct,
        color: LANGUAGE_COLORS[name] || DEFAULT_COLOR
      };
    });

  return sorted;
}

function generateSvg(langs) {
  const width = 340;
  const barWidth = 280;
  const barHeight = 8;
  const cardHeight = 165;

  // Build segmented progress bar
  let currentX = 30;
  const barSegments = langs
    .map((lang, idx) => {
      const segWidth = Math.max(1, (lang.pctNum / 100) * barWidth);
      const isFirst = idx === 0;
      const isLast = idx === langs.length - 1;
      const radius = isFirst && isLast ? 'rx="4"' : isFirst ? 'rx="4" clip-path="url(#left-rounded)"' : '';
      const rect = `<rect x="${currentX.toFixed(1)}" y="52" width="${segWidth.toFixed(1)}" height="${barHeight}" fill="${lang.color}" />`;
      currentX += segWidth;
      return rect;
    })
    .join('\n      ');

  // Build 2-column language list
  const col1 = langs.filter((_, i) => i % 2 === 0);
  const col2 = langs.filter((_, i) => i % 2 === 1);

  const renderCol = (items, startX) => {
    return items
      .map((l, i) => {
        const y = 82 + i * 24;
        return `
      <g transform="translate(${startX}, ${y})">
        <circle cx="5" cy="5" r="4.5" fill="${l.color}" />
        <text x="16" y="8.5" class="lang-name">${l.name}</text>
        <text x="120" y="8.5" class="lang-pct">${l.percent}%</text>
      </g>`;
      })
      .join('');
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${cardHeight}" viewBox="0 0 ${width} ${cardHeight}" fill="none">
  <style>
    .title { font: 600 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Ubuntu, sans-serif; fill: #6C63FF; }
    .lang-name { font: 500 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Ubuntu, sans-serif; fill: #c9d1d9; }
    .lang-pct { font: 400 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Ubuntu, sans-serif; fill: #8b949e; text-anchor: end; }
  </style>

  <rect width="${width}" height="${cardHeight}" rx="10" fill="#0d1117" stroke="#30363d" stroke-width="1" />

  <text x="30" y="34" class="title">Most Used Languages</text>

  <!-- Progress Bar Container -->
  <rect x="30" y="52" width="${barWidth}" height="${barHeight}" rx="4" fill="#21262d" />
  
  <g clip-path="url(#bar-clip)">
    <clipPath id="bar-clip">
      <rect x="30" y="52" width="${barWidth}" height="${barHeight}" rx="4" />
    </clipPath>
    <g>
      ${barSegments}
    </g>
  </g>

  <!-- Language Breakdown -->
  ${renderCol(col1, 30)}
  ${renderCol(col2, 175)}
</svg>`;
}

async function run() {
  console.log('Fetching language statistics...');
  const langs = await fetchStats();
  console.log('Top languages:', langs.map(l => `${l.name} (${l.percent}%)`).join(', '));
  const svg = generateSvg(langs);

  const outDir = path.resolve('assets');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const outPath = path.join(outDir, 'top-langs.svg');
  fs.writeFileSync(outPath, svg, 'utf8');
  console.log(`Saved SVG to ${outPath}`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
