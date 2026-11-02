/* Entry for /diwali-webgl.js: every WebGL scene on /diwali in one bundle, so three.js
   and postprocessing load once. Build from a folder with three, postprocessing and esbuild:
     npx esbuild scripts/diwali-webgl.src.js --bundle --minify --format=esm --target=es2020 \
       --legal-comments=eof --outfile=diwali-webgl.js */
import './diwali-fireworks.src.js';
import './diwali-scenes.src.js';
