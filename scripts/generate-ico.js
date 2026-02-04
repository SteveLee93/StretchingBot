const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ICO 파일 생성 (256x256, 48x48, 32x32, 16x16)
const sizes = [256, 48, 32, 16];

function createIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - (size > 32 ? 4 : 1);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < radius) {
        // 녹색 배경
        const gradient = 1 - (dist / radius) * 0.2;
        pixels[idx + 2] = Math.floor(60 * gradient);      // B (ICO is BGRA)
        pixels[idx + 1] = Math.floor(180 * gradient);     // G
        pixels[idx] = Math.floor(75 * gradient);          // R
        pixels[idx + 3] = 255;                            // A

        // 사람 모양
        const px = dx / radius;
        const py = dy / radius;

        // 머리
        const headDist = Math.sqrt(px ** 2 + (py + 0.4) ** 2);
        if (headDist < 0.18) {
          pixels[idx] = 255;
          pixels[idx + 1] = 255;
          pixels[idx + 2] = 255;
        }

        // 몸통
        if (Math.abs(px) < 0.08 && py > -0.22 && py < 0.25) {
          pixels[idx] = 255;
          pixels[idx + 1] = 255;
          pixels[idx + 2] = 255;
        }

        // 왼팔 (위로)
        const arm1x = px + 0.25;
        const arm1y = py + 0.15;
        if (Math.abs(arm1x + arm1y) < 0.12 && arm1x < 0.05 && arm1y < 0.1) {
          pixels[idx] = 255;
          pixels[idx + 1] = 255;
          pixels[idx + 2] = 255;
        }

        // 오른팔 (위로)
        const arm2x = px - 0.25;
        const arm2y = py + 0.15;
        if (Math.abs(-arm2x + arm2y) < 0.12 && arm2x > -0.05 && arm2y < 0.1) {
          pixels[idx] = 255;
          pixels[idx + 1] = 255;
          pixels[idx + 2] = 255;
        }

        // 다리
        if (py > 0.2) {
          const leg1 = Math.abs(px + 0.15 - (py - 0.2) * 0.3);
          const leg2 = Math.abs(px - 0.15 + (py - 0.2) * 0.3);
          if (leg1 < 0.08 || leg2 < 0.08) {
            pixels[idx] = 255;
            pixels[idx + 1] = 255;
            pixels[idx + 2] = 255;
          }
        }
      } else {
        // 투명
        pixels[idx] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 0;
      }
    }
  }

  return pixels;
}

function createICO(sizes) {
  const images = sizes.map(size => ({
    size,
    data: createIcon(size)
  }));

  // ICO 헤더
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);           // Reserved
  header.writeUInt16LE(1, 2);           // Type (1 = ICO)
  header.writeUInt16LE(images.length, 4); // Number of images

  // 이미지 디렉토리 엔트리들
  const entries = [];
  let offset = 6 + images.length * 16;

  const pngBuffers = [];

  for (const img of images) {
    // PNG 생성
    const pngData = createPNG(img.size, img.data);
    pngBuffers.push(pngData);

    const entry = Buffer.alloc(16);
    entry.writeUInt8(img.size === 256 ? 0 : img.size, 0);  // Width
    entry.writeUInt8(img.size === 256 ? 0 : img.size, 1);  // Height
    entry.writeUInt8(0, 2);              // Color palette
    entry.writeUInt8(0, 3);              // Reserved
    entry.writeUInt16LE(1, 4);           // Color planes
    entry.writeUInt16LE(32, 6);          // Bits per pixel
    entry.writeUInt32LE(pngData.length, 8);  // Image size
    entry.writeUInt32LE(offset, 12);     // Offset

    entries.push(entry);
    offset += pngData.length;
  }

  return Buffer.concat([header, ...entries, ...pngBuffers]);
}

function createPNG(size, pixelsBGRA) {
  // BGRA를 RGBA로 변환
  const pixelsRGBA = Buffer.alloc(pixelsBGRA.length);
  for (let i = 0; i < pixelsBGRA.length; i += 4) {
    pixelsRGBA[i] = pixelsBGRA[i + 2];     // R
    pixelsRGBA[i + 1] = pixelsBGRA[i + 1]; // G
    pixelsRGBA[i + 2] = pixelsBGRA[i];     // B
    pixelsRGBA[i + 3] = pixelsBGRA[i + 3]; // A
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const ihdrChunk = createChunk('IHDR', ihdr);

  const rawData = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    rawData[y * (1 + size * 4)] = 0;
    for (let x = 0; x < size; x++) {
      const srcIdx = (y * size + x) * 4;
      const dstIdx = y * (1 + size * 4) + 1 + x * 4;
      rawData[dstIdx] = pixelsRGBA[srcIdx];
      rawData[dstIdx + 1] = pixelsRGBA[srcIdx + 1];
      rawData[dstIdx + 2] = pixelsRGBA[srcIdx + 2];
      rawData[dstIdx + 3] = pixelsRGBA[srcIdx + 3];
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type);
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return crc ^ 0xFFFFFFFF;
}

const ico = createICO(sizes);
const outputPath = path.join(__dirname, '../assets/icon.ico');
fs.writeFileSync(outputPath, ico);
console.log('ICO created:', outputPath, `(${ico.length} bytes)`);
