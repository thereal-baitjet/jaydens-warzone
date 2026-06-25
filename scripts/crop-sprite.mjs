import sharp from "sharp";

const [, , src, x, y, w, h, out] = process.argv;

if (!src || !out) {
  console.error("Usage: node scripts/crop-sprite.mjs <src.png> <x> <y> <w> <h> <out.png>");
  process.exit(1);
}

await sharp(src)
  .extract({
    left: Math.round(Number(x)),
    top: Math.round(Number(y)),
    width: Math.round(Number(w)),
    height: Math.round(Number(h))
  })
  .toFile(out);

console.log(`cropped ${out}`);
