const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const sourcePath = path.join(root, "resources", "icon-source.png");
const resRoot = path.join(root, "android", "app", "src", "main", "res");
const previewDir = path.join(root, "resources", "previews");
const frontendPublic = path.join(root, "..", "frontend", "public");

const densities = [
  { folder: "mipmap-mdpi", launcher: 48, foreground: 108 },
  { folder: "mipmap-hdpi", launcher: 72, foreground: 162 },
  { folder: "mipmap-xhdpi", launcher: 96, foreground: 216 },
  { folder: "mipmap-xxhdpi", launcher: 144, foreground: 324 },
  { folder: "mipmap-xxxhdpi", launcher: 192, foreground: 432 }
];

async function extractMark() {
  // New logo: mark centered above wordmark on decorative background.
  const cropped = await sharp(sourcePath)
    .extract({ left: 210, top: 150, width: 600, height: 440 })
    .png()
    .toBuffer();

  const trimmed = await sharp(cropped).trim({ threshold: 22 }).png().toBuffer();

  const { data, info } = await sharp(trimmed)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Flatten near-white / pale decorative background to pure white.
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const isPale = min > 210 && max - min < 35;
    const isNearWhite = r > 232 && g > 232 && b > 235;
    if (isNearWhite || isPale) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }

  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 }
  })
    .png()
    .toBuffer();
}

async function placeOnCanvas(markBuffer, size, padRatio) {
  const pad = Math.round(size * padRatio);
  const inner = Math.max(1, size - pad * 2);

  const resized = await sharp(markBuffer)
    .resize(inner, inner, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .png()
    .toBuffer();

  const resizedMeta = await sharp(resized).metadata();
  const rw = resizedMeta.width || inner;
  const rh = resizedMeta.height || inner;
  const left = Math.round((size - rw) / 2);
  const top = Math.round((size - rh) / 2);

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
    `<svg width="${size}" height="${size}"><rect x="0" y="0" width="${size}" height="${size}" rx="${r}" ry="${r}" fill="white"/></svg>`
  );
  return sharp(squareBuffer)
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function writeWebAssets(markBuffer) {
  fs.mkdirSync(frontendPublic, { recursive: true });

  const mark512 = await placeOnCanvas(markBuffer, 512, 0.08);
  const favicon32 = await placeOnCanvas(markBuffer, 32, 0.08);
  const favicon192 = await placeOnCanvas(markBuffer, 192, 0.08);
  const brandMark = await placeOnCanvas(markBuffer, 128, 0.06);

  // Full branded square for splash / share (source as-is, cleaned).
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

  console.log("Web logo assets written to frontend/public");
}

async function writePreview(markBuffer) {
  fs.mkdirSync(previewDir, { recursive: true });

  const master = await placeOnCanvas(markBuffer, 512, 0.08);
  const squircle = await makeSquirclePreview(master, 512);
  const round = await makeRound(master, 512);

  const wallpaper = await sharp({
    create: {
      width: 720,
      height: 1280,
      channels: 3,
      background: { r: 18, g: 22, b: 40 }
    }
  })
    .png()
    .toBuffer();

  const iconOnHome = await sharp(squircle).resize(168, 168).png().toBuffer();
  const labelSvg = Buffer.from(`
    <svg width="280" height="40">
      <text x="140" y="28" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif"
        font-size="26" fill="#ffffff" font-weight="600">Light CRM</text>
    </svg>
  `);

  const homePreview = await sharp(wallpaper)
    .composite([
      { input: iconOnHome, left: 276, top: 420 },
      { input: labelSvg, left: 220, top: 600 }
    ])
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(previewDir, "icon-square.png"), master);
  fs.writeFileSync(path.join(previewDir, "icon-squircle.png"), squircle);
  fs.writeFileSync(path.join(previewDir, "icon-round.png"), round);
  fs.writeFileSync(path.join(previewDir, "home-preview.png"), homePreview);

  console.log(`Previews written to ${previewDir}`);
}

async function main() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source icon: ${sourcePath}`);
  }

  const mark = await extractMark();
  await writePreview(mark);
  await writeWebAssets(mark);

  for (const density of densities) {
    const dir = path.join(resRoot, density.folder);
    fs.mkdirSync(dir, { recursive: true });

    const launcher = await placeOnCanvas(mark, density.launcher, 0.08);
    const round = await makeRound(launcher, density.launcher);
    const foreground = await placeOnCanvas(mark, density.foreground, 0.16);

    fs.writeFileSync(path.join(dir, "ic_launcher.png"), launcher);
    fs.writeFileSync(path.join(dir, "ic_launcher_round.png"), round);
    fs.writeFileSync(path.join(dir, "ic_launcher_foreground.png"), foreground);
    console.log(`Updated ${density.folder}`);
  }

  const anyDpi = path.join(resRoot, "mipmap-anydpi-v26");
  fs.mkdirSync(anyDpi, { recursive: true });
  const adaptive = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`;
  fs.writeFileSync(path.join(anyDpi, "ic_launcher.xml"), adaptive);
  fs.writeFileSync(path.join(anyDpi, "ic_launcher_round.xml"), adaptive);

  const bgXml = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#FFFFFF</color>
</resources>
`;
  fs.writeFileSync(path.join(resRoot, "values", "ic_launcher_background.xml"), bgXml);

  console.log("Launcher icons regenerated.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
