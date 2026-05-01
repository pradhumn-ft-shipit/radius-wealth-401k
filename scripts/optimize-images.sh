#!/usr/bin/env bash
# One-off image optimization pipeline. macOS-only (uses `sips`).
#
# Output goes to public/assets/. JPEG q70 at max 700px on long edge for
# headshots — keeps total page weight well under 500KB.
#
# If `cwebp` is on PATH (`brew install webp`), we additionally produce
# WebP siblings and the HTML <picture> blocks will use them.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/Content"
OUT="$ROOT/public/assets"
mkdir -p "$OUT"

HAS_CWEBP=0
if command -v cwebp >/dev/null 2>&1; then HAS_CWEBP=1; fi

optimize_headshot() {
  local src="$1"
  local name="$2"
  local tmp="$OUT/${name}.tmp.jpg"
  local out_jpg="$OUT/${name}.jpg"

  echo "→ $name"
  sips -Z 700 -s format jpeg -s formatOptions 70 "$src" --out "$tmp" >/dev/null
  mv "$tmp" "$out_jpg"
  echo "   $(du -h "$out_jpg" | cut -f1)  $out_jpg"

  if [[ "$HAS_CWEBP" -eq 1 ]]; then
    local out_webp="$OUT/${name}.webp"
    cwebp -q 75 -quiet "$out_jpg" -o "$out_webp"
    echo "   $(du -h "$out_webp" | cut -f1)  $out_webp"
  fi
}

optimize_logo() {
  local src="$1"
  local out_png="$OUT/logo.png"
  echo "→ logo"
  # Wordmark — keep slightly higher res for retina, stay under ~30KB.
  sips -Z 600 -s format png "$src" --out "$out_png" >/dev/null
  echo "   $(du -h "$out_png" | cut -f1)  $out_png"
}

optimize_headshot "$SRC/Nancy.jpeg"    "nancy"
optimize_headshot "$SRC/Christian.jpg" "christian"
optimize_headshot "$SRC/Cole Brann.jpg" "cole"
optimize_logo     "$SRC/Radius Wealth Logo.png"

echo ""
echo "Done."
echo "Total assets size:"
du -sh "$OUT"
