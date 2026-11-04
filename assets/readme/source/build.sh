#!/bin/sh
# Rebuild the README images (needs python3 + Pillow; uses macOS system fonts).
# First export the sample at the size these scripts expect:
#   npm start, then open http://localhost:5177/?wind=35&width=1200&fps=10&export=ascii,flow
set -e
cd "$(dirname "$0")/../../.."
python3 assets/readme/source/hero.py out/grass-ascii assets/readme/hero.webp
python3 assets/readme/source/board.py examples/grass.png out/grass-flow/f_0030.png out/grass-ascii/f_0030.png assets/readme
python3 assets/readme/source/sections.py
