const fs = require('fs');
const path = require('path');

// 256x256 PNG 아이콘 생성 (스트레칭 심볼)
const size = 256;
const channels = 4; // RGBA

// PNG 파일 생성을 위한 간단한 구현
function createPNG(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);  // bit depth
  ihdr.writeUInt8(6, 9);  // color type (RGBA)
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  const ihdrChunk = createChunk('IHDR', ihdr);

  // IDAT chunk (uncompressed for simplicity - use zlib)
  const zlib = require('zlib');
  const rawData = Buffer.alloc(height * (1 + width * 4));

  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter type
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      rawData[dstIdx] = pixels[srcIdx];     // R
      rawData[dstIdx + 1] = pixels[srcIdx + 1]; // G
      rawData[dstIdx + 2] = pixels[srcIdx + 2]; // B
      rawData[dstIdx + 3] = pixels[srcIdx + 3]; // A
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);

  // IEND chunk
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

// 픽셀 데이터 생성
const pixels = Buffer.alloc(size * size * channels);

const cx = size / 2;
const cy = size / 2;
const radius = size / 2 - 10;

for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const idx = (y * size + x) * 4;
    const dx = x - cx;
    const dy = y - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < radius) {
      // 녹색 배경
      const gradient = 1 - (dist / radius) * 0.3;
      pixels[idx] = Math.floor(60 * gradient);      // R
      pixels[idx + 1] = Math.floor(180 * gradient); // G
      pixels[idx + 2] = Math.floor(75 * gradient);  // B
      pixels[idx + 3] = 255;                        // A

      // 사람 모양 (스트레칭 자세)
      const px = dx / radius;
      const py = dy / radius;

      // 머리
      const headDist = Math.sqrt((px) ** 2 + (py + 0.45) ** 2);
      if (headDist < 0.15) {
        pixels[idx] = 255;
        pixels[idx + 1] = 255;
        pixels[idx + 2] = 255;
        pixels[idx + 3] = 255;
      }

      // 몸통
      if (Math.abs(px) < 0.06 && py > -0.3 && py < 0.2) {
        pixels[idx] = 255;
        pixels[idx + 1] = 255;
        pixels[idx + 2] = 255;
        pixels[idx + 3] = 255;
      }

      // 팔 (위로 뻗음)
      const armAngle1 = Math.atan2(py + 0.25, px - 0);
      const armDist1 = Math.sqrt((px - 0) ** 2 + (py + 0.25) ** 2);
      if (armDist1 < 0.4 && armDist1 > 0.05) {
        const armAngleDeg = armAngle1 * 180 / Math.PI;
        if ((armAngleDeg > -150 && armAngleDeg < -120) || (armAngleDeg > -60 && armAngleDeg < -30)) {
          const thickness = 0.06;
          const perpDist = Math.abs(Math.sin(armAngle1 - (-135 * Math.PI / 180))) * armDist1;
          const perpDist2 = Math.abs(Math.sin(armAngle1 - (-45 * Math.PI / 180))) * armDist1;
          if (perpDist < thickness || perpDist2 < thickness) {
            pixels[idx] = 255;
            pixels[idx + 1] = 255;
            pixels[idx + 2] = 255;
            pixels[idx + 3] = 255;
          }
        }
      }

      // 다리
      const legAngle1 = Math.atan2(py - 0.2, px);
      const legDist = Math.sqrt(px ** 2 + (py - 0.2) ** 2);
      if (legDist < 0.35 && legDist > 0.05 && py > 0.15) {
        const legAngleDeg = legAngle1 * 180 / Math.PI;
        if ((legAngleDeg > 50 && legAngleDeg < 90) || (legAngleDeg > 90 && legAngleDeg < 130)) {
          pixels[idx] = 255;
          pixels[idx + 1] = 255;
          pixels[idx + 2] = 255;
          pixels[idx + 3] = 255;
        }
      }
    } else if (dist < radius + 3) {
      // 테두리
      pixels[idx] = 40;
      pixels[idx + 1] = 120;
      pixels[idx + 2] = 50;
      pixels[idx + 3] = 255;
    } else {
      // 투명
      pixels[idx] = 0;
      pixels[idx + 1] = 0;
      pixels[idx + 2] = 0;
      pixels[idx + 3] = 0;
    }
  }
}

const png = createPNG(size, size, pixels);
const outputPath = path.join(__dirname, '../assets/icon.png');
fs.writeFileSync(outputPath, png);
console.log('Icon created:', outputPath);
