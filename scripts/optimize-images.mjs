import path from "path";
import fs from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "assets/optimized");
const TARGET_WIDTHS = [320, 480, 640, 960, 1280, 1600, 1920];

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function getImageSize(filePath) {
  const { stdout } = await execFileAsync("sips", [
    "-g",
    "pixelWidth",
    "-g",
    "pixelHeight",
    filePath,
  ]);
  const widthMatch = stdout.match(/pixelWidth:\s*(\d+)/);
  const heightMatch = stdout.match(/pixelHeight:\s*(\d+)/);
  return {
    width: widthMatch ? Number(widthMatch[1]) : null,
    height: heightMatch ? Number(heightMatch[1]) : null,
  };
}

async function listImages(dirPath, files = []) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (fullPath.startsWith(OUTPUT_DIR)) {
        continue;
      }
      await listImages(fullPath, files);
    } else if (/\.(png|jpe?g)$/i.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function pickWidths(originalWidth) {
  const widths = TARGET_WIDTHS.filter((w) => w <= originalWidth);
  if (!widths.includes(originalWidth)) {
    widths.push(originalWidth);
  }
  return widths.sort((a, b) => a - b);
}

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

async function optimizeImage(inputPath, manifest) {
  const { width, height } = await getImageSize(inputPath);
  if (!width || !height) {
    return;
  }

  const widths = pickWidths(width);
  const relPath = toPosix(path.relative(ROOT, inputPath));
  const relAssetDir = path.relative(path.join(ROOT, "assets"), path.dirname(inputPath));
  const outDir = path.join(OUTPUT_DIR, relAssetDir);
  const name = path.parse(inputPath).name;

  await ensureDir(outDir);

  const sources = { avif: [], webp: [] };
  for (const targetWidth of widths) {
    const tempPng = path.join(outDir, `${name}-${targetWidth}-tmp.png`);
    await execFileAsync("sips", [
      "-Z",
      String(targetWidth),
      inputPath,
      "--out",
      tempPng,
    ]);

    const avifPath = path.join(outDir, `${name}-${targetWidth}.avif`);
    await execFileAsync("avifenc", [
      "-q",
      "55",
      "-s",
      "6",
      tempPng,
      avifPath,
    ]);

    const webpPath = path.join(outDir, `${name}-${targetWidth}.webp`);
    await execFileAsync("cwebp", ["-q", "75", tempPng, "-o", webpPath]);

    await fs.unlink(tempPng);

    sources.avif.push(toPosix(path.relative(ROOT, avifPath)));
    sources.webp.push(toPosix(path.relative(ROOT, webpPath)));
  }

  manifest[relPath] = { width, height, sources };
}

async function main() {
  const assetsDir = path.join(ROOT, "assets");
  const inputPaths = await listImages(assetsDir);

  const manifest = {};
  for (const inputPath of inputPaths) {
    await optimizeImage(inputPath, manifest);
  }

  const manifestPath = path.join(OUTPUT_DIR, "manifest.json");
  await ensureDir(path.dirname(manifestPath));
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log(`Optimized ${Object.keys(manifest).length} images.`);
  console.log(`Manifest: ${toPosix(path.relative(ROOT, manifestPath))}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
