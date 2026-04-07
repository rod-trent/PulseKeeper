'use strict';

// Generates assets/icon.ico from assets/icon.png using png-to-ico.
// Produces proper BMP-format ICO entries that rcedit (used by electron-builder)
// can embed into the Windows executable correctly.

const { default: pngToIco } = require('png-to-ico');
const path     = require('path');
const fs       = require('fs');

const src  = path.join(__dirname, '../assets/icon.png');
const dest = path.join(__dirname, '../assets/icon.ico');

pngToIco(src)
  .then(buf => {
    fs.writeFileSync(dest, buf);
    console.log(`icon.ico written (${buf.length} bytes)`);
  })
  .catch(err => {
    console.error('Failed to generate icon.ico:', err.message);
    process.exit(1);
  });
