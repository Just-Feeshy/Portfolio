import path from "path";
import fs from "fs/promises";

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, "assets/optimized/manifest.json");
const HTML_GLOB = [
  "index.html",
  "project-1.html",
  "project-2.html",
  "project-3.html",
  "project-4.html",
  "project-5.html",
  "project-6.html",
  "jtc-gallery.html",
  "slides.html",
];
const CSS_GLOB = ["css/style.css"];

function toPosix(filePath) {
  return filePath.split(path.sep).join("/");
}

function toHtmlPath(fromHtml, targetPath) {
  const rel = path.posix.relative(path.posix.dirname(fromHtml), targetPath);
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function extractWidth(src) {
  const match = src.match(/-(\d+)\.(?:avif|webp)$/);
  return match ? Number(match[1]) : null;
}

function buildSourceSet(htmlPath, sources) {
  return sources
    .map((src) => {
      const width = extractWidth(src);
      if (!width) {
        return null;
      }
      return `${toHtmlPath(htmlPath, src)} ${width}w`;
    })
    .filter(Boolean)
    .join(", ");
}

function normalizeSrc(src) {
  return src.replace(/^\.?\//, "");
}

function getClassList(imgTag) {
  const match = imgTag.match(/\bclass=["']([^"']+)["']/);
  return match ? match[1].trim().split(/\s+/) : [];
}

function pickSizes(imgTag) {
  const classes = getClassList(imgTag);
  if (classes.includes("header__logo-img")) {
    return "(max-width: 56.25em) 45px, 50px";
  }
  if (classes.includes("home-hero__social-icon")) {
    return "50px";
  }
  if (classes.includes("main-footer__icon")) {
    return "25px";
  }
  if (classes.includes("projects__row-img")) {
    return "(max-width: 56.25em) 100vw, 60vw";
  }
  if (classes.includes("project-details__showcase-img")) {
    return "(max-width: 56.25em) 100vw, 90rem";
  }
  if (classes.includes("project-details__overview-icon-img")) {
    return "(max-width: 37.5em) 70vw, 220px";
  }
  return null;
}

function addAttributes(imgTag, entry) {
  let updated = imgTag;
  if (!/\bwidth=/.test(updated) && !/\bheight=/.test(updated)) {
    const injection = ` width="${entry.width}" height="${entry.height}"`;
    if (updated.endsWith("/>")) {
      updated = updated.replace(/\s*\/>$/, `${injection} />`);
    } else {
      updated = updated.replace(/>$/, `${injection}>`);
    }
  }
  if (!/\bsizes=/.test(updated)) {
    const sizes = pickSizes(updated);
    if (sizes) {
      const sizesAttr = ` sizes="${sizes}"`;
      if (updated.endsWith("/>")) {
        updated = updated.replace(/\s*\/>$/, `${sizesAttr} />`);
      } else {
        updated = updated.replace(/>$/, `${sizesAttr}>`);
      }
    }
  }
  return updated;
}

function buildCssImageSet(cssFile, entry) {
  const pickDensityPair = (sources) => {
    const sized = sources
      .map((src) => ({ src, width: extractWidth(src) }))
      .filter((item) => item.width)
      .sort((a, b) => a.width - b.width);
    if (!sized.length) {
      return null;
    }
    const max = sized[sized.length - 1];
    const target = Math.round(max.width / 2);
    const oneX =
      sized.reduce((best, item) => {
        if (!best) {
          return item;
        }
        return Math.abs(item.width - target) < Math.abs(best.width - target)
          ? item
          : best;
      }, null) || max;
    return { oneX, twoX: max };
  };

  const avifPair = pickDensityPair(entry.sources.avif);
  const webpPair = pickDensityPair(entry.sources.webp);
  if (!avifPair || !webpPair) {
    return null;
  }

  const avif1x = path.posix.relative(path.posix.dirname(cssFile), avifPair.oneX.src);
  const avif2x = path.posix.relative(path.posix.dirname(cssFile), avifPair.twoX.src);
  const webp1x = path.posix.relative(path.posix.dirname(cssFile), webpPair.oneX.src);
  const webp2x = path.posix.relative(path.posix.dirname(cssFile), webpPair.twoX.src);

  return (
    "image-set(" +
    `url(${avif1x}) type("image/avif") 1x, ` +
    `url(${avif2x}) type("image/avif") 2x, ` +
    `url(${webp1x}) type("image/webp") 1x, ` +
    `url(${webp2x}) type("image/webp") 2x` +
    ")"
  );
}

async function main() {
  const manifestRaw = await fs.readFile(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(manifestRaw);

  for (const htmlFile of HTML_GLOB) {
    const htmlPath = path.join(ROOT, htmlFile);
    const htmlRaw = await fs.readFile(htmlPath, "utf8");

    const updated = htmlRaw.replace(
      /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,
      (match, src, offset) => {
        const normalized = normalizeSrc(src);
        const entry = manifest[normalized];
        if (!entry) {
          return match;
        }
        if (!entry.sources || !entry.sources.avif || !entry.sources.webp) {
          return match;
        }

        const htmlRel = toPosix(path.relative(ROOT, htmlPath));
        const avifSet = buildSourceSet(htmlRel, entry.sources.avif);
        const webpSet = buildSourceSet(htmlRel, entry.sources.webp);

        if (!avifSet || !webpSet) {
          return match;
        }

        const imgWithSize = addAttributes(match, entry);
        const lastOpen = htmlRaw.lastIndexOf("<picture", offset);
        const lastClose = htmlRaw.lastIndexOf("</picture>", offset);
        const insidePicture = lastOpen > lastClose;
        if (insidePicture) {
          return imgWithSize;
        }

        return [
          "<picture>",
          `  <source type=\"image/avif\" srcset=\"${avifSet}\" />`,
          `  <source type=\"image/webp\" srcset=\"${webpSet}\" />`,
          `  ${imgWithSize}`,
          "</picture>",
        ].join("\n");
      }
    );

    if (updated !== htmlRaw) {
      await fs.writeFile(htmlPath, updated, "utf8");
    }
  }

  for (const cssFile of CSS_GLOB) {
    const cssPath = path.join(ROOT, cssFile);
    const cssRaw = await fs.readFile(cssPath, "utf8");
    const updatedCss = cssRaw.replace(
      /background-image:\s*url\(([^)]+)\);/gi,
      (match, urlPath, offset) => {
        if (cssRaw.slice(offset, offset + 200).includes("image-set(")) {
          return match;
        }
        const cleaned = urlPath.replace(/["']/g, "").trim();
        const resolved = path.resolve(path.dirname(cssPath), cleaned);
        const rel = toPosix(path.relative(ROOT, resolved));
        const entry = manifest[rel];
        if (!entry) {
          return match;
        }
        const imageSet = buildCssImageSet(cssFile, entry);
        if (!imageSet) {
          return match;
        }
        return `${match}\n  background-image: ${imageSet};`;
      }
    );
    if (updatedCss !== cssRaw) {
      await fs.writeFile(cssPath, updatedCss, "utf8");
    }
  }

  console.log("Wired responsive image sources into HTML and CSS.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
