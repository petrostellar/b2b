/** Design-token driven theme engine. Admin-configurable via `themes` table. */

const THEMES = {
  luxury: {
    code: 'luxury', name: 'Luxury Corporate',
    tokens: {
      '--bg': '#0b0d12', '--bg-2': '#11141c', '--surface': '#161a24',
      '--surface-2': '#1c2130', '--line': '#262c3c',
      '--text': '#f3f0e9', '--text-2': '#a6adbf', '--text-3': '#6f778c',
      '--accent': '#c8a15a', '--accent-2': '#e8cf9a', '--accent-ink': '#141008',
      '--ok': '#3fb984', '--warn': '#e0a83a', '--err': '#e2604f', '--info': '#5aa9e6',
      '--radius': '18px', '--radius-sm': '12px',
      '--shadow': '0 24px 60px -24px rgba(0,0,0,.75)',
      '--hero': 'radial-gradient(1200px 600px at 75% -10%, rgba(200,161,90,.22), transparent 60%), linear-gradient(180deg,#0b0d12,#11141c)',
      '--glass': 'rgba(255,255,255,.045)',
      '--font': "'Vazirmatn','Inter',system-ui,-apple-system,'Segoe UI',sans-serif",
    },
  },
  modern: {
    code: 'modern', name: 'Modern Marketplace',
    tokens: {
      '--bg': '#f6f7fb', '--bg-2': '#ffffff', '--surface': '#ffffff',
      '--surface-2': '#f1f3f9', '--line': '#e3e7f0',
      '--text': '#101426', '--text-2': '#5b6377', '--text-3': '#8b93a7',
      '--accent': '#2f5bea', '--accent-2': '#5f83ff', '--accent-ink': '#ffffff',
      '--ok': '#12996b', '--warn': '#c8860d', '--err': '#d9412f', '--info': '#1f7ae0',
      '--radius': '16px', '--radius-sm': '10px',
      '--shadow': '0 18px 40px -22px rgba(20,30,70,.35)',
      '--hero': 'radial-gradient(1000px 520px at 80% -20%, rgba(47,91,234,.18), transparent 60%), linear-gradient(180deg,#ffffff,#f6f7fb)',
      '--glass': 'rgba(16,20,38,.035)',
      '--font': "'Vazirmatn','Inter',system-ui,-apple-system,'Segoe UI',sans-serif",
    },
  },
  dark: {
    code: 'dark', name: 'Dark Premium',
    tokens: {
      '--bg': '#07080a', '--bg-2': '#0d0f13', '--surface': '#121419',
      '--surface-2': '#181b22', '--line': '#232732',
      '--text': '#eef1f6', '--text-2': '#99a1b2', '--text-3': '#666e80',
      '--accent': '#00d6a4', '--accent-2': '#5cf0cd', '--accent-ink': '#00251c',
      '--ok': '#00d6a4', '--warn': '#f0b429', '--err': '#ff5f56', '--info': '#4fc3f7',
      '--radius': '14px', '--radius-sm': '9px',
      '--shadow': '0 22px 50px -26px rgba(0,0,0,.9)',
      '--hero': 'radial-gradient(1100px 560px at 20% -10%, rgba(0,214,164,.18), transparent 60%), linear-gradient(180deg,#07080a,#0d0f13)',
      '--glass': 'rgba(255,255,255,.04)',
      '--font': "'Vazirmatn','Inter',system-ui,-apple-system,'Segoe UI',sans-serif",
    },
  },
  minimal: {
    code: 'minimal', name: 'Minimal Trade',
    tokens: {
      '--bg': '#fbfaf7', '--bg-2': '#ffffff', '--surface': '#ffffff',
      '--surface-2': '#f4f2ec', '--line': '#e6e2d8',
      '--text': '#1a1a18', '--text-2': '#5f5c55', '--text-3': '#8e8a80',
      '--accent': '#1a1a18', '--accent-2': '#4a4a45', '--accent-ink': '#ffffff',
      '--ok': '#2e7d5b', '--warn': '#a97d19', '--err': '#b23c2c', '--info': '#2d6ea3',
      '--radius': '6px', '--radius-sm': '4px',
      '--shadow': '0 10px 30px -18px rgba(0,0,0,.35)',
      '--hero': 'linear-gradient(180deg,#ffffff,#fbfaf7)',
      '--glass': 'rgba(0,0,0,.03)',
      '--font': "'Vazirmatn','Inter',system-ui,-apple-system,'Segoe UI',sans-serif",
    },
  },
};

const THEME_CODES = Object.keys(THEMES);

function cssVars(code) {
  const th = THEMES[code] || THEMES.luxury;
  return Object.entries(th.tokens).map(([k, v]) => `${k}:${v}`).join(';');
}

module.exports = { THEMES, THEME_CODES, cssVars };
