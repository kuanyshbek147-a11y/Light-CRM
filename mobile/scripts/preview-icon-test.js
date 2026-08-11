const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const sourcePath = path.join(root, "resources", "icon-source.png");
const previewDir = path.join(root, "resources", "previews");

async function extractMark() {
  const cropped = await sharp(sourcePath)
    .extract({ left: 160, top: 70, width: 700, height: 520 })
    .png()
    .toBuffer();

  const trimmed = await sharp(cropped).trim({ threshold: 22 }).png().toBuffer();

  // Force near-white JPEG noise to pure white so no box edge remains.
  const { data, info } = await sharp(trimmed)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r > 245 && g > 245 && b > 245) {
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
    .resize(inner, inner, { fit: "contain", background: "#ffffff" })
    .png()
    .toBuffer();
  const meta = await sharp(resized).metadata();
  const left = Math.round((size - (meta.width || inner)) / 2);
  const top = Math.round((size - (meta.height || inner)) / 2);
  return sharp({
    create: { width: size, height: size, channels: 3, background: "#ffffff" }
  })
    .composite([{ input: resized, left, top }])
    .png()
    .toBuffer();
}

async function main() {
  fs.mkdirSync(previewDir, { recursive: true });
  const mark = await extractMark();
  fs.writeFileSync(path.join(root, "resources", "icon-mark.png"), mark);

  const master = await placeOnCanvas(mark, 512, 0.07);
  const r = Math.round(512 * 0.22);
  const mask = Buffer.from(
    `<svg width="512" height="512"><rect width="512" height="512" rx="${r}" ry="${r}" fill="white"/></svg>`
  );
  const squircle = await sharp(master)
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();

  fs.writeFileSync(path.join(previewDir, "icon-test-large.png"), master);
  fs.writeFileSync(path.join(previewDir, "icon-test-squircle.png"), squircle);
  console.log("test previews ready");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
