import path from "path";
import fs from "fs/promises";
import sharp from "sharp";
import fg from "fast-glob";

const ROOT = process.cwd();
const OUTPUT_DIR = "assets/optimized";
const INPUT_GLOB = ["assets/**/*.{png,jpg,jpeg}"];
const IGNORE_GLOB = [`${OUTPUT_DIR}/**`];
const TARGET_WIDTHS = [320, 480, 640, 960, 1280, 1600, 1920];
const FORMATS = [
  { ext: "avif", options: { quality: 55, effort: 6 } },
  { ext: "webp", options: { quality: 75 } },
];

function getOutputBase(inputPath) {
  const rel = path.relative(ROOT, inputPath);
  const relDir = path.dirname(rel);
  const name = path.parse(rel).name;
  return {
    rel,
    outDir: path.join(ROOT, OUTPUT_DIR, relDir.replace(/^assets[\\/]/, "")),
    name,
  };
}

function pickWidths(originalWidth) {
  return TARGET_WIDTHS.filter((w) => w <= originalWidth);
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function optimizeImage(inputPath, manifest) {
  const image = sharp(inputPath);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    return;
  }

  const widths = pickWidths(metadata.width);
  if (!widths.length) {
    return;
  }

  const { rel, outDir, name } = getOutputBase(inputPath);
  await ensureDir(outDir);

  const sources = {};
  for (const format of FORMATS) {
    sources[format.ext] = [];
    for (const width of widths) {
      const outFile = `${name}-${width}.${format.ext}`;
      const outPath = path.join(outDir, outFile);
      await sharp(inputPath)
        .resize({ width, withoutEnlargement: true })
        .toFormat(format.ext, format.options)
        .toFile(outPath);
      sources[format.ext].push(
        path
          .relative(ROOT, outPath)
          .split(path.sep)
          .join("/")
      );
    }
  }

  manifest[rel.split(path.sep).join("/")] = {
    width: metadata.width,
    height: metadata.height,
    sources,
  };
}

async function main() {
  const inputPaths = await fg(INPUT_GLOB, {
    cwd: ROOT,
    ignore: IGNORE_GLOB,
    onlyFiles: true,
    absolute: true,
  });

  const manifest = {};
  for (const inputPath of inputPaths) {
    await optimizeImage(inputPath, manifest);
  }

  const manifestPath = path.join(ROOT, OUTPUT_DIR, "manifest.json");
  await ensureDir(path.dirname(manifestPath));
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log(`Optimized ${Object.keys(manifest).length} images.`);
  console.log(`Manifest: ${path.relative(ROOT, manifestPath)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
