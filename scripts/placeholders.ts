// Generates clearly-replaceable SVG placeholder illustrations for seeded
// products and brand logos. Replace any of them from Admin → Menu (image
// upload) or by overwriting files in public/seed/.

export type FoodKind =
  | "roll"
  | "set"
  | "nigiri"
  | "salad"
  | "soup"
  | "ramen"
  | "noodles"
  | "fish"
  | "chicken"
  | "mochi"
  | "cake"
  | "drink"
  | "tea"
  | "bao"
  | "dumplings"
  | "pizza"
  | "rice"
  | "chopsticks"
  | "bag";

const BACKGROUNDS: [string, string][] = [
  ["#f7a35c", "#e8612c"],
  ["#8e1b2b", "#4a0d18"],
  ["#f3d9b1", "#e2b47c"],
  ["#f6c26b", "#ef8a3a"],
  ["#2f4858", "#1b2b36"],
  ["#e9d5c1", "#cfa98a"],
  ["#c94f4f", "#7e2230"],
  ["#f4e1c6", "#e7c08f"],
  ["#5b8c5a", "#2e5230"],
  ["#f5b5a8", "#e0797b"],
];

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const board = `<rect x="110" y="300" width="580" height="300" rx="26" fill="#c98b4f"/><rect x="110" y="300" width="580" height="300" rx="26" fill="url(#wood)" opacity=".35"/>`;
const plate = (cx = 400, cy = 440, r = 250) =>
  `<ellipse cx="${cx}" cy="${cy + 18}" rx="${r}" ry="${r * 0.9}" fill="#000" opacity=".18"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#fbf8f3"/><circle cx="${cx}" cy="${cy}" r="${r * 0.78}" fill="none" stroke="#efe6da" stroke-width="6"/>`;
const bowl = (cx = 400, cy = 450, r = 230, inner = "#f3efe8") =>
  `<ellipse cx="${cx}" cy="${cy + 30}" rx="${r}" ry="${r * 0.85}" fill="#000" opacity=".2"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="#f6f1ea"/><circle cx="${cx}" cy="${cy}" r="${r * 0.86}" fill="${inner}"/>`;

function rollPiece(x: number, y: number, r: number, filling: string, topping?: string) {
  return `<g><circle cx="${x}" cy="${y + 8}" r="${r}" fill="#000" opacity=".15"/><circle cx="${x}" cy="${y}" r="${r}" fill="#1f2a24"/><circle cx="${x}" cy="${y}" r="${r * 0.86}" fill="#fbf8f2"/><circle cx="${x}" cy="${y}" r="${r * 0.42}" fill="${filling}"/><circle cx="${x - r * 0.12}" cy="${y + r * 0.1}" r="${r * 0.18}" fill="#8cc084"/>${
    topping ? `<ellipse cx="${x}" cy="${y - r * 0.55}" rx="${r * 0.7}" ry="${r * 0.35}" fill="${topping}"/>` : ""
  }</g>`;
}

function food(kind: FoodKind, rand: () => number, accent: string): string {
  const fillings = ["#f47b5a", "#e8563f", "#f59b6b", "#7fb069", "#c0392b"];
  const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];
  switch (kind) {
    case "roll": {
      let s = board;
      const f = pick(fillings);
      const top = rand() > 0.5 ? "#f58a5f" : undefined;
      for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++) s += rollPiece(200 + i * 133, 380 + row * 130, 58, f, top);
      return s;
    }
    case "set": {
      let s = `<rect x="80" y="220" width="640" height="440" rx="30" fill="#2b2b2b"/>`;
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 5; i++) s += rollPiece(160 + i * 120, 300 + row * 125, 50, fillings[(row + i) % fillings.length], (row + i) % 3 === 0 ? "#f58a5f" : undefined);
      return s;
    }
    case "nigiri": {
      let s = `<rect x="140" y="330" width="520" height="220" rx="30" fill="#2b2b2b"/>`;
      for (let i = 0; i < 2; i++) {
        const x = 270 + i * 260;
        s += `<ellipse cx="${x}" cy="450" rx="105" ry="55" fill="#fbf8f2"/><path d="M${x - 115} 430 q115 -95 230 0 q-115 40 -230 0z" fill="${pick(["#f47b5a", "#e8563f", "#d9432f"])}"/>`;
        for (let k = 0; k < 4; k++) s += `<path d="M${x - 80 + k * 45} 400 q10 25 20 45" stroke="#fde2d4" stroke-width="7" fill="none" opacity=".8"/>`;
      }
      return s;
    }
    case "salad":
    case "rice": {
      let s = bowl(400, 440, 240, kind === "rice" ? "#fbf8f2" : "#e7efdc");
      const colors = kind === "rice" ? ["#f47b5a", "#7fb069", "#f2c14e", "#e8563f"] : ["#e74c3c", "#7fb069", "#4f8a3b", "#f39c12", "#9b2d20", "#c9e27b"];
      for (let i = 0; i < 38; i++) {
        const a = rand() * Math.PI * 2;
        const d = rand() * 170;
        s += `<ellipse cx="${400 + Math.cos(a) * d}" cy="${440 + Math.sin(a) * d}" rx="${16 + rand() * 22}" ry="${10 + rand() * 14}" transform="rotate(${rand() * 180} ${400 + Math.cos(a) * d} ${440 + Math.sin(a) * d})" fill="${pick(colors)}"/>`;
      }
      return s;
    }
    case "soup":
    case "ramen": {
      let s = bowl(400, 440, 250, kind === "soup" ? "#e2572b" : "#e9b872");
      if (kind === "ramen") {
        for (let i = 0; i < 9; i++) s += `<path d="M${250 + i * 12} ${360 + i * 18} q60 -30 120 0 t120 0" stroke="#f7df9b" stroke-width="10" fill="none"/>`;
        s += `<rect x="420" y="300" width="120" height="150" rx="8" fill="#1f2a24" transform="rotate(12 480 375)"/>`;
      }
      s += `<circle cx="330" cy="500" r="52" fill="#fff"/><circle cx="330" cy="500" r="28" fill="#f2a01e"/>`;
      s += `<ellipse cx="480" cy="520" rx="60" ry="38" fill="#b5654a"/><ellipse cx="480" cy="520" rx="40" ry="22" fill="#e4a88f"/>`;
      for (let i = 0; i < 16; i++) s += `<circle cx="${300 + rand() * 200}" cy="${360 + rand() * 180}" r="7" fill="#6fae48"/>`;
      return s;
    }
    case "noodles": {
      let s = `<ellipse cx="400" cy="470" rx="300" ry="200" fill="#000" opacity=".15"/><ellipse cx="400" cy="450" rx="300" ry="200" fill="#f6efe2"/>`;
      for (let i = 0; i < 14; i++) s += `<path d="M${180 + rand() * 60} ${350 + i * 14} q80 -40 160 0 t160 0 t100 0" stroke="${pick(["#f2c14e", "#e8b23b"])}" stroke-width="11" fill="none"/>`;
      for (let i = 0; i < 9; i++) s += `<rect x="${260 + rand() * 260}" y="${360 + rand() * 150}" width="46" height="34" rx="10" fill="#b5652e"/>`;
      for (let i = 0; i < 14; i++) s += `<rect x="${240 + rand() * 300}" y="${340 + rand() * 180}" width="36" height="8" rx="3" fill="#e74c3c" transform="rotate(${rand() * 180} 400 450)"/>`;
      s += `<circle cx="470" cy="400" r="42" fill="#fff"/><circle cx="470" cy="400" r="22" fill="#f39c12"/>`;
      return s;
    }
    case "fish":
    case "chicken": {
      let s = plate();
      const main = kind === "fish" ? "#f07c3e" : "#c7772f";
      s += `<path d="M260 380 q140 -70 300 0 q20 80 -40 130 q-120 40 -240 0 q-50 -60 -20 -130z" fill="${main}"/>`;
      for (let i = 0; i < 5; i++) s += `<path d="M${300 + i * 50} 370 q-10 60 0 130" stroke="${kind === "fish" ? "#fbd2b3" : "#9a5220"}" stroke-width="7" fill="none" opacity=".8"/>`;
      s += `<path d="M260 520 q140 60 300 0" stroke="#7a2e14" stroke-width="16" fill="none" opacity=".7"/>`;
      s += `<circle cx="560" cy="340" r="46" fill="#f5d547"/><circle cx="560" cy="340" r="38" fill="#fbe98a"/>`;
      for (let i = 0; i < 12; i++) s += `<circle cx="${230 + rand() * 90}" cy="${320 + rand() * 90}" r="12" fill="${pick(["#6fae48", "#e74c3c", "#4f8a3b"])}"/>`;
      return s;
    }
    case "mochi": {
      let s = plate(400, 450, 230);
      const c = ["#f7c6d0", "#bfe3b4", "#f6e3a1"];
      [[320, 420], [480, 420], [400, 530]].forEach(([x, y], i) => {
        s += `<circle cx="${x}" cy="${y + 10}" r="80" fill="#000" opacity=".1"/><circle cx="${x}" cy="${y}" r="80" fill="${c[i]}"/><ellipse cx="${x - 25}" cy="${y - 30}" rx="22" ry="12" fill="#fff" opacity=".6"/>`;
      });
      return s;
    }
    case "cake": {
      let s = plate(400, 460, 230);
      s += `<path d="M260 520 L400 330 L560 520 Z" fill="#f4e6c8"/><path d="M260 520 L560 520 L560 560 L260 560 Z" fill="#c69c6d"/><path d="M285 490 L400 345 L535 490" stroke="${accent}" stroke-width="18" fill="none" opacity=".75"/>`;
      return s;
    }
    case "drink":
    case "tea": {
      if (kind === "tea") {
        return `<ellipse cx="400" cy="560" rx="200" ry="50" fill="#000" opacity=".15"/><path d="M270 330 h260 v160 a130 90 0 0 1 -260 0z" fill="#f6f1ea"/><ellipse cx="400" cy="330" rx="130" ry="30" fill="#8fae4a"/><path d="M530 370 q70 0 60 60 q-10 40 -60 40" stroke="#f6f1ea" stroke-width="18" fill="none"/>`;
      }
      const liquid = pick(["#f2c14e", "#e74c3c", "#8fd694", "#f39c12", "#b56576"]);
      return `<ellipse cx="400" cy="640" rx="170" ry="34" fill="#000" opacity=".15"/><path d="M290 220 L510 220 L480 630 L320 630 Z" fill="#fff" opacity=".35" stroke="#fff" stroke-width="6"/><path d="M300 330 L500 330 L480 620 L320 620 Z" fill="${liquid}" opacity=".9"/><rect x="340" y="360" width="60" height="60" rx="10" fill="#fff" opacity=".55"/><rect x="410" y="400" width="55" height="55" rx="10" fill="#fff" opacity=".5"/><rect x="430" y="140" width="16" height="260" rx="8" fill="${accent}" transform="rotate(12 438 270)"/><circle cx="470" cy="330" r="40" fill="#f5d547"/>`;
    }
    case "bao": {
      let s = plate();
      [[310, 430], [490, 430]].forEach(([x, y]) => {
        s += `<path d="M${x - 100} ${y} a100 70 0 0 1 200 0z" fill="#fbf6ec"/><rect x="${x - 95}" y="${y - 8}" width="190" height="26" rx="10" fill="#b5652e"/><rect x="${x - 90}" y="${y - 22}" width="180" height="14" rx="6" fill="#7fb069"/><path d="M${x - 100} ${y + 16} a100 60 0 0 0 200 0z" fill="#f4ecdc"/>`;
      });
      return s;
    }
    case "dumplings": {
      let s = `<circle cx="400" cy="460" r="250" fill="#b98a55"/><circle cx="400" cy="450" r="225" fill="#d9ad73"/>`;
      [[320, 380], [480, 380], [300, 510], [460, 520], [390, 450]].forEach(([x, y]) => {
        s += `<path d="M${x - 70} ${y + 20} q70 -110 140 0 z" fill="#fbf6ec"/><path d="M${x - 55} ${y - 5} q55 -60 110 0" stroke="#e8dcc6" stroke-width="6" fill="none"/>`;
      });
      return s;
    }
    case "pizza": {
      let s = `<circle cx="400" cy="460" r="270" fill="#8b5a2b"/><circle cx="400" cy="450" r="250" fill="#e8b36a"/><circle cx="400" cy="450" r="215" fill="#d64933"/><circle cx="400" cy="450" r="205" fill="#f3d27a" opacity=".85"/>`;
      for (let i = 0; i < 14; i++) {
        const a = rand() * Math.PI * 2;
        const d = 30 + rand() * 150;
        s += `<circle cx="${400 + Math.cos(a) * d}" cy="${450 + Math.sin(a) * d}" r="${16 + rand() * 12}" fill="${pick(["#c0392b", "#6fae48", "#f47b5a", "#2d2d2d"])}"/>`;
      }
      for (let k = 0; k < 4; k++) s += `<line x1="400" y1="450" x2="${400 + Math.cos((k * Math.PI) / 2 + 0.4) * 250}" y2="${450 + Math.sin((k * Math.PI) / 2 + 0.4) * 250}" stroke="#b98a55" stroke-width="4" opacity=".6"/>`;
      return s;
    }
    case "chopsticks":
      return `<g transform="rotate(-18 400 400)"><rect x="150" y="360" width="520" height="20" rx="10" fill="#f3e5c8"/><rect x="150" y="410" width="520" height="20" rx="10" fill="#f3e5c8"/><rect x="200" y="340" width="130" height="110" rx="8" fill="#fff" stroke="${accent}" stroke-width="6"/><circle cx="265" cy="395" r="22" fill="${accent}"/></g>`;
    case "bag":
      return `<ellipse cx="400" cy="660" rx="200" ry="30" fill="#000" opacity=".15"/><path d="M250 260 h300 l30 390 h-360z" fill="#f7f1e6"/><path d="M330 260 q0 -90 70 -90 q70 0 70 90" stroke="#b98a55" stroke-width="16" fill="none"/><circle cx="400" cy="440" r="80" fill="${accent}"/><text x="400" y="455" font-family="Arial, sans-serif" font-size="38" font-weight="700" fill="#fff" text-anchor="middle">SUSHI</text>`;
  }
}

export function foodSvg(kind: FoodKind, seed: number, label: string, accent = "#F52D36"): string {
  const rand = rng(seed * 7919 + kind.length);
  const [c1, c2] = BACKGROUNDS[seed % BACKGROUNDS.length];
  const service = kind === "chopsticks" || kind === "bag";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" role="img" aria-label="${label.replace(/"/g, "")}">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${service ? "#ffffff" : c1}"/><stop offset="1" stop-color="${service ? "#f1f1f1" : c2}"/></linearGradient>
<pattern id="wood" width="40" height="12" patternUnits="userSpaceOnUse"><path d="M0 6 q10 -4 20 0 t20 0" stroke="#7a4a22" stroke-width="2" fill="none"/></pattern>
<radialGradient id="light" cx=".3" cy=".25" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="800" height="800" fill="url(#bg)"/>
${service ? "" : '<rect width="800" height="800" fill="url(#light)"/>'}
${food(kind, rand, accent)}
<text x="780" y="780" font-family="Arial, sans-serif" font-size="18" fill="#fff" fill-opacity="${service ? 0 : 0.55}" text-anchor="end">placeholder</text>
</svg>`;
}
