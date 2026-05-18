import sharp from 'sharp';

const iconSvg = (size) => {
  const fontSize = Math.round(size * 0.57);
  const y = Math.round(size * 0.705);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <radialGradient id="bg" cx="45%" cy="35%" r="75%">
      <stop offset="0%" stop-color="#3d2a80"/>
      <stop offset="100%" stop-color="#1a0635"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <text x="${size / 2}" y="${y}" text-anchor="middle"
    font-family="DejaVu Sans, FreeSans, Liberation Sans, sans-serif"
    font-size="${fontSize}" font-weight="700" fill="white">&#x20B9;</text>
</svg>`;
};

const maskableSvg = (size) => {
  const fontSize = Math.round(size * 0.44);
  const y = Math.round(size * 0.66);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <radialGradient id="bg" cx="45%" cy="35%" r="75%">
      <stop offset="0%" stop-color="#3d2a80"/>
      <stop offset="100%" stop-color="#1a0635"/>
    </radialGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#bg)"/>
  <text x="${size / 2}" y="${y}" text-anchor="middle"
    font-family="DejaVu Sans, FreeSans, Liberation Sans, sans-serif"
    font-size="${fontSize}" font-weight="700" fill="white">&#x20B9;</text>
</svg>`;
};

// Rounded corner mask — white rect on transparent, applied with dest-in
const roundedMask = (size) => {
  const rx = Math.round(size * 0.225);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${rx}" ry="${rx}" fill="white"/>
</svg>`;
};

const tasks = [
  { svg: iconSvg(512),     out: 'public/logo.png',              size: 512,  rounded: true  },
  { svg: iconSvg(192),     out: 'public/logo-192.png',          size: 192,  rounded: true  },
  { svg: maskableSvg(512), out: 'public/icon-maskable.png',     size: 512,  rounded: false },
  { svg: maskableSvg(192), out: 'public/icon-maskable-192.png', size: 192,  rounded: false },
];

for (const { svg, out, size, rounded } of tasks) {
  const base = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

  if (rounded) {
    await sharp(base)
      .composite([{ input: Buffer.from(roundedMask(size)), blend: 'dest-in' }])
      .png()
      .toFile(out);
  } else {
    await sharp(base).toFile(out);
  }
  console.log(`✓ ${out}`);
}
