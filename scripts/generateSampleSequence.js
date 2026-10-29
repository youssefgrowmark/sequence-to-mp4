const fs = require('fs');
const path = require('path');

/**
 * Generates an uncompressed 24-bit BMP file in pure Node without external dependencies
 */
function createBMP(width, height, colorGenerator) {
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;

  const buffer = Buffer.alloc(fileSize);

  // BMP Header
  buffer.write('BM', 0); // Signature
  buffer.writeUInt32LE(fileSize, 2); // File size
  buffer.writeUInt32LE(0, 6); // Reserved
  buffer.writeUInt32LE(54, 10); // Offset to pixel data

  // DIB Header (BITMAPINFOHEADER)
  buffer.writeUInt32LE(40, 14); // Header size
  buffer.writeInt32LE(width, 18); // Image width
  buffer.writeInt32LE(height, 22); // Image height (positive = bottom-to-top)
  buffer.writeUInt16LE(1, 26); // Color planes
  buffer.writeUInt16LE(24, 28); // Bits per pixel (24-bit RGB)
  buffer.writeUInt32LE(0, 30); // Compression (0 = none)
  buffer.writeUInt32LE(pixelArraySize, 34); // Image size
  buffer.writeInt32LE(2835, 38); // Horizontal resolution (pixels/meter)
  buffer.writeInt32LE(2835, 42); // Vertical resolution
  buffer.writeUInt32LE(0, 46); // Colors in color table
  buffer.writeUInt32LE(0, 50); // Important color count

  // Write pixel data (bottom row to top row)
  for (let y = 0; y < height; y++) {
    const rowOffset = 54 + y * rowSize;
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + x * 3;
      // BMP expects Blue, Green, Red
      const [r, g, b] = colorGenerator(x, height - 1 - y);
      buffer[pxOffset] = b;
      buffer[pxOffset + 1] = g;
      buffer[pxOffset + 2] = r;
    }
  }

  return buffer;
}

function generateSequence(outputDir = './sample_sequence', frameCount = 48) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const width = 640;
  const height = 360;

  console.log(`Generating ${frameCount} sample frames in ${outputDir}...`);

  for (let i = 1; i <= frameCount; i++) {
    const progress = i / frameCount;
    const hue = progress * 360;

    const bmpBuffer = createBMP(width, height, (x, y) => {
      // Dynamic gradient with moving wave
      const wave = Math.sin((x / width) * 4 * Math.PI + progress * 2 * Math.PI);
      const intensity = Math.min(255, Math.max(0, Math.floor(128 + 127 * wave)));
      
      const r = Math.floor((x / width) * 200 + 40);
      const g = Math.floor((y / height) * 150 + (1 - progress) * 100);
      const b = intensity;

      // Draw a center progress bar
      if (y >= height - 30 && y <= height - 15) {
        if (x <= width * progress) {
          return [255, 255, 255]; // White bar
        }
      }

      return [r, g, b];
    });

    const filename = `frame_${String(i).padStart(4, '0')}.bmp`;
    const filePath = path.join(outputDir, filename);
    fs.writeFileSync(filePath, bmpBuffer);
  }

  console.log(`Generated ${frameCount} frames successfully.`);
}

generateSequence();
