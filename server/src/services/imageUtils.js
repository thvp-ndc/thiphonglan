const fs = require('node:fs');

/**
 * imageUtils.js
 * Đọc kích thước thật (Width x Height pixel) của các tệp ảnh (PNG, JPG, GIF, WebP, BMP, SVG)
 * Giúp tính toán kích thước EMU chính xác 100% khi xuất sang Word không bị méo tỷ lệ.
 */

function getImageDimensions(imageBufferOrPath) {
  let buffer;
  if (typeof imageBufferOrPath === 'string') {
    if (!fs.existsSync(imageBufferOrPath)) return null;
    buffer = fs.readFileSync(imageBufferOrPath);
  } else if (Buffer.isBuffer(imageBufferOrPath)) {
    buffer = imageBufferOrPath;
  } else {
    return null;
  }

  if (!buffer || buffer.length < 8) return null;

  try {
    // 1. PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      if (buffer.length >= 24) {
        const width = buffer.readUInt32BE(16);
        const height = buffer.readUInt32BE(20);
        return { width, height, type: 'png' };
      }
    }

    // 2. GIF: GIF87a or GIF89a
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      if (buffer.length >= 10) {
        const width = buffer.readUInt16LE(6);
        const height = buffer.readUInt16LE(8);
        return { width, height, type: 'gif' };
      }
    }

    // 3. BMP: 42 4D
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) {
      if (buffer.length >= 26) {
        const width = Math.abs(buffer.readInt32LE(18));
        const height = Math.abs(buffer.readInt32LE(22));
        return { width, height, type: 'bmp' };
      }
    }

    // 4. WebP: RIFF ... WEBP
    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
      const chunkType = buffer.toString('ascii', 12, 16);
      if (chunkType === 'VP8 ' && buffer.length >= 30) {
        const width = buffer.readUInt16LE(26) & 0x3fff;
        const height = buffer.readUInt16LE(28) & 0x3fff;
        return { width, height, type: 'webp' };
      } else if (chunkType === 'VP8L' && buffer.length >= 25) {
        const b0 = buffer[21], b1 = buffer[22], b2 = buffer[23], b3 = buffer[24];
        const width = 1 + (((b1 & 0x3F) << 8) | b0);
        const height = 1 + (((b3 & 0xF) << 10) | (b2 << 2) | ((b1 & 0xC0) >> 6));
        return { width, height, type: 'webp' };
      } else if (chunkType === 'VP8X' && buffer.length >= 30) {
        const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
        const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
        return { width, height, type: 'webp' };
      }
    }

    // 5. JPEG: FF D8
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) {
      let offset = 2;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xFF) {
          offset++;
          continue;
        }
        const marker = buffer[offset + 1];
        if ((marker >= 0xC0 && marker <= 0xC3) || (marker >= 0xC5 && marker <= 0xC7) || (marker >= 0xC9 && marker <= 0xCB) || (marker >= 0xCD && marker <= 0xCF)) {
          if (offset + 8 < buffer.length) {
            const height = buffer.readUInt16BE(offset + 5);
            const width = buffer.readUInt16BE(offset + 7);
            return { width, height, type: 'jpeg' };
          }
        }
        if (marker === 0xD9 || marker === 0xDA) break;
        const len = buffer.readUInt16BE(offset + 2);
        offset += 2 + len;
      }
    }

    // 6. SVG
    const str = buffer.slice(0, 1000).toString('utf8');
    if (str.includes('<svg')) {
      const wMatch = str.match(/width=["'](d+(?:.d+)?)(?:px)?["']/i);
      const hMatch = str.match(/height=["'](d+(?:.d+)?)(?:px)?["']/i);
      if (wMatch && hMatch) {
        return { width: parseFloat(wMatch[1]), height: parseFloat(hMatch[1]), type: 'svg' };
      }
      const vbMatch = str.match(/viewBox=["'][d.s,-]+["']/i);
      if (vbMatch) {
        const parts = vbMatch[0].replace(/viewBox=["']|["']/gi, '').trim().split(/[s,]+/);
        if (parts.length === 4) {
          return { width: parseFloat(parts[2]), height: parseFloat(parts[3]), type: 'svg' };
        }
      }
    }
  } catch (err) {}

  return { width: 600, height: 400, type: 'unknown' };
}

/**
 * Tính toán kích thước EMU (English Metric Units) cho Word DrawingML
 * 1 px = 9525 EMU (tại 96 DPI chuẩn)
 * Khổ rộng tối đa trang in A4 trong Word: ~5.5 inch = 5,029,200 EMU (~528px)
 */
function calculateWordEmuSize(originalWidth, originalHeight, maxPageWidthPx = 520) {
  let w = Number(originalWidth) || 500;
  let h = Number(originalHeight) || 350;

  if (w <= 0) w = 500;
  if (h <= 0) h = 350;

  const aspectRatio = h / w;

  if (w > maxPageWidthPx) {
    w = maxPageWidthPx;
    h = Math.round(w * aspectRatio);
  }

  const maxPageHeightPx = 650;
  if (h > maxPageHeightPx) {
    h = maxPageHeightPx;
    w = Math.round(h / aspectRatio);
  }

  const cx = Math.round(w * 9525);
  const cy = Math.round(h * 9525);

  return { cx, cy, widthPx: w, heightPx: h };
}

module.exports = {
  getImageDimensions,
  calculateWordEmuSize
};
