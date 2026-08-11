const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const sourcePath = path.join(root, "resources", "icon-source.png");
const resRoot = path.join(root, "android", "app", "src", "main", "res");
const previewDir = path.join(root, "resources", "previews");
const frontendPublic = path.join(root, "..", "frontend", "public");

/**
 * Wide logo: size by WIDTH, not by diagonal.
 * ~74% width looks full on squircle; still mostly inside Android safe zone.
 */
// Wide enough to look full, with margin so OEM masks don't clip tails.
const ICON_WIDTH_RATIO = 0.70;
const WEB_WIDTH_RATIO = 0.78;

const densities = [
  { folder: "mipmap-mdpi", launcher: 48, foreground: 108 },
  { folder: "mipmap-hdpi", launcher: 72, foreground: 162 },
  { folder: "mipmap-xhdpi", launcher: 96, foreground: 216 },
  { folder: "mipmap-xxhdpi", launcher: 144, foreground: 324 },
  { folder: "mipmap-xxxhdpi", launcher: 192, foreground: 432 }
];

/** Extract mark and make background truly transparent (no letterbox plate). */
async function extractMarkTransparent() {
  const cropped = await sharp(sourcePath)
    .extract({ left: 230, top: 165, width: 560, height: 410 })
    .png()
    .toBuffer();

  const trimmed = await sharp(cropped).trim({ threshold: 30 }).png().toBuffer();

  const { data, info } = await sharp(trimmed)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    // Pale / near-white → fully transparent (kills letterbox plate).
    const isPale = min > 195 && max - min < 50;
    const isNearWhite = r > 220 && g > 220 && b > 225;
    if (isNearWhite || isPale) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 0;
    }
  }

  // Trim transparent edges after keying.
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 }
  })
    .trim({ threshold: 0 })
    .png()
    .toBuffer();
}

/** Place transparent mark large and centered on pure white square. */
async function placeLarge(markBuffer, size, widthRatio = ICON_WIDTH_RATIO) {
  const markMeta = await sharp(markBuffer).metadata();
  const mw = markMeta.width || 1;
  const mh = markMeta.height || 1;

  const targetW = Math.max(1, Math.round(size * widthRatio));
  const targetH = Math.max(1, Math.round((mh / mw) * targetW));

  // If height would overflow, clamp by height instead.
  const maxH = Math.round(size * 0.78);
  let finalW = targetW;
  let finalH = targetH;
  if (finalH > maxH) {
    finalH = maxH;
    finalW = Math.max(1, Math.round((mw / mh) * finalH));
  }

  const resized = await sharp(markBuffer)
    .resize(finalW, finalH, { fit: "fill" })
    .png()
    .toBuffer();

  const left = Math.round((size - finalW) / 2);
  const top = Math.round((size - finalH) / 2);

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  })
    .composite([{ input: resized, left, top }])
    .png()
    .toBuffer();
}

async function makeRound(squareBuffer, size) {
  const radius = Math.round(size / 2);
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${radius}" cy="${radius}" r="${radius}" fill="white"/></svg>`
  );
  return sharp(squareBuffer)
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function makeSquirclePreview(squareBuffer, size) {
  const r = Math.round(size * 0.22);
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="white"/></svg>`
  );
  return sharp(squareBuffer)
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function writeWebAssets(markBuffer) {
  fs.mkdirSync(frontendPublic, { recursive: true });

  const mark512 = await placeLarge(markBuffer, 512, WEB_WIDTH_RATIO);
  const favicon32 = await placeLarge(markBuffer, 32, WEB_WIDTH_RATIO);
  const favicon192 = await placeLarge(markBuffer, 192, WEB_WIDTH_RATIO);
  const brandMark = await placeLarge(markBuffer, 128, 0.86);

  const fullLogo = await sharp(sourcePath)
    .resize(512, 512, { fit: "cover" })
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(frontendPublic, "logo-mark.png"), brandMark);
  fs.writeFileSync(path.join(frontendPublic, "logo.png"), fullLogo);
  fs.writeFileSync(path.join(frontendPublic, "favicon.png"), favicon32);
  fs.writeFileSync(path.join(frontendPublic, "icon-192.png"), favicon192);
  fs.writeFileSync(path.join(frontendPublic, "apple-touch-icon.png"), favicon192);
  fs.writeFileSync(path.join(root, "resources", "icon-mark.png"), markBuffer);
  fs.writeFileSync(path.join(root, "resources", "logo-mark-512.png"), mark512);

  console.log("Web logo assets written");
}

async function writePreview(markBuffer) {
  fs.mkdirSync(previewDir, { recursive: true });

  const master = await placeLarge(markBuffer, 512, ICON_WIDTH_RATIO);
  const squircle = await makeSquirclePreview(master, 512);
  const round = await makeRound(master, 512);

  const wallpaper = await sharp({
    create: {
      width: 720,
      height: 980,
      channels: 3,
      background: { r: 30, g: 80, b: 120 }
    }
  })
    .png()
    .toBuffer();

  const iconOnHome = await sharp(squircle).resize(180, 180).png().toBuffer();
  const labelSvg = Buffer.from(`
    <svg width="300" height="44">
      <text x="150" y="30" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif"
        font-size="28" fill="#ffffff" font-weight="600">Light CRM</text>
    </svg>
  `);

  const homePreview = await sharp(wallpaper)
    .composite([
      { input: iconOnHome, left: 270, top: 320 },
      { input: labelSvg, left: 210, top: 520 }
    ])
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(previewDir, "icon-square.png"), master);
  fs.writeFileSync(path.join(previewDir, "icon-squircle.png"), squircle);
  fs.writeFileSync(path.join(previewDir, "icon-round.png"), round);
  fs.writeFileSync(path.join(previewDir, "home-preview.png"), homePreview);

  console.log("Previews written");
}

async function main() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source icon: ${sourcePath}`);
  }

  const mark = await extractMarkTransparent();
  await writePreview(mark);
  await writeWebAssets(mark);

  for (const density of densities) {
    const dir = path.join(resRoot, density.folder);
    fs.mkdirSync(dir, { recursive: true });

    const launcher = await placeLarge(mark, density.launcher, ICON_WIDTH_RATIO);
    const round = await makeRound(launcher, density.launcher);
    // Adaptive foreground: same large placement on white.
    const foreground = await placeLarge(mark, density.foreground, ICON_WIDTH_RATIO);

    fs.writeFileSync(path.join(dir, "ic_launcher.png"), launcher);
    fs.writeFileSync(path.join(dir, "ic_launcher_round.png"), round);
    fs.writeFileSync(path.join(dir, "ic_launcher_foreground.png"), foreground);
    console.log(`Updated ${density.folder}`);
  }

  // Do NOT write mipmap-anydpi-v26 adaptive XML.
  // Many OEM launchers cache/composite adaptive icons poorly; baked PNGs are reliable.

  fs.writeFileSync(
    path.join(resRoot, "values", "ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#FFFFFF</color>
</resources>
`
  );

  console.log("Done: large baked PNG icons (no adaptive XML).");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
