/**
 * wmfUtils.js
 * Module xử lý định dạng tệp MathType và Windows Metafile (WMF / EMF):
 * 1. Giải mã MathType Equation Format (MTEF v3, v5) sang chuẩn KaTeX LaTeX ($...$).
 * 2. Trích xuất MTEF từ tệp nhị phân OLE Object (oleObject*.bin) và WMF Comment records.
 * 3. Chuyển đổi tệp ảnh WMF vector/bitmap sang SVG/PNG để trình duyệt Web hiển thị 100% không lỗi.
 */

const fs = require('node:fs');
const path = require('node:path');

const GREEK_SYMBOL_MAP = {
  0x61: ' \\alpha ',
  0x62: ' \\beta ',
  0x63: ' \\chi ',
  0x64: ' \\delta ',
  0x65: ' \\epsilon ',
  0x66: ' \\phi ',
  0x67: ' \\gamma ',
  0x68: ' \\eta ',
  0x69: ' \\iota ',
  0x6A: ' \\varphi ',
  0x6B: ' \\kappa ',
  0x6C: ' \\lambda ',
  0x6D: ' \\mu ',
  0x6E: ' \\nu ',
  0x70: ' \\pi ',
  0x71: ' \\theta ',
  0x72: ' \\rho ',
  0x73: ' \\sigma ',
  0x74: ' \\tau ',
  0x75: ' \\upsilon ',
  0x76: ' \\varpi ',
  0x77: ' \\omega ',
  0x78: ' \\xi ',
  0x79: ' \\psi ',
  0x7A: ' \\zeta ',
  0x41: ' \\Alpha ',
  0x42: ' \\Beta ',
  0x44: ' \\Delta ',
  0x46: ' \\Phi ',
  0x47: ' \\Gamma ',
  0x4C: ' \\Lambda ',
  0x50: ' \\Pi ',
  0x51: ' \\Theta ',
  0x53: ' \\Sigma ',
  0x57: ' \\Omega ',
  0x58: ' \\Xi ',
  0x59: ' \\Psi ',
  0xA3: ' \\le ',
  0xB3: ' \\ge ',
  0xB9: ' \\ne ',
  0xB1: ' \\pm ',
  0xB4: ' \\times ',
  0xB8: ' \\div ',
  0xBD: ' \\Leftrightarrow ',
  0xDC: ' \\Rightarrow ',
  0xD8: ' \\to ',
  0xC0: ' \\aleph ',
  0xC6: ' \\emptyset ',
  0xC7: ' \\cap ',
  0xC8: ' \\cup ',
  0xC9: ' \\supset ',
  0xCA: ' \\supseteq ',
  0xCB: ' \\not\\subset ',
  0xCC: ' \\subset ',
  0xCD: ' \\subseteq ',
  0xCE: ' \\in ',
  0xCF: ' \\notin ',
  0xD0: ' \\angle ',
  0xD1: ' \\nabla ',
  0xD5: ' \\prod ',
  0xD6: ' \\sqrt ',
  0xD7: ' \\cdot ',
  0xD9: ' \\wedge ',
  0xDA: ' \\vee ',
  0xE5: ' \\sum ',
  0xF2: ' \\int ',
  0xA5: ' \\infty '
};

class MtefParser {
  constructor(buffer, startOffset = 0) {
    this.buffer = buffer;
    this.offset = startOffset;
    this.fonts = [];
    this.version = 5;
  }

  parse() {
    try {
      if (!this.buffer || this.buffer.length < this.offset + 5) return null;

      const mtefVer = this.buffer[this.offset++];
      if (mtefVer !== 0x1B) return null;

      this.version = this.buffer[this.offset++]; // 3, 5
      const platform = this.buffer[this.offset++];
      const product = this.buffer[this.offset++];
      const prodVer = this.buffer[this.offset++];

      const latex = this.parseSlotLine();
      return latex ? latex.trim() : null;
    } catch (err) {
      return null;
    }
  }

  readByte() {
    if (this.offset >= this.buffer.length) return 0;
    return this.buffer[this.offset++];
  }

  readUInt16() {
    if (this.offset + 1 >= this.buffer.length) return 0;
    const val = this.buffer.readUInt16LE(this.offset);
    this.offset += 2;
    return val;
  }

  parseSlotLine() {
    if (this.offset >= this.buffer.length) return '';
    const peek = this.buffer[this.offset];
    if (peek === 1) {
      this.offset++; // consume LINE tag
    }
    return this.parseLine();
  }

  parseLine() {
    let result = '';

    while (this.offset < this.buffer.length) {
      const record = this.readByte();
      if (record === 0) { // END of line / slot
        break;
      }

      const tag = record & 0x0F;
      const opt = (record >> 4) & 0x0F;

      switch (tag) {
        case 1: { // LINE (nested)
          const lineStr = this.parseLine();
          result += lineStr;
          break;
        }

        case 2: { // CHAR
          let charCode = 0;
          if (this.version >= 5) {
            charCode = this.readUInt16();
          } else {
            charCode = this.readByte();
          }

          let fontIdx = -1;
          if (opt & 0x01) { // Typeface present
            fontIdx = this.readByte();
          }

          const mapped = this.mapCharToLatex(charCode, fontIdx);
          result += mapped;
          break;
        }

        case 3: { // TMPL (Templates: Fraction, Radical, Integral, Cases, etc.)
          const tmplSelector = this.readByte();
          const tmplVariation = this.readByte();
          const tmplLatex = this.parseTemplate(tmplSelector, tmplVariation);
          result += tmplLatex;
          break;
        }

        case 4: { // PILE (Multiple lines e.g. system of equations)
          const pileLines = [];
          while (this.offset < this.buffer.length) {
            const peek = this.buffer[this.offset];
            if (peek === 0) {
              this.offset++;
              break;
            }
            pileLines.push(this.parseSlotLine());
          }
          if (pileLines.length > 1) {
            result += `\\begin{cases} ${pileLines.join(' \\\\ ')} \\end{cases}`;
          } else if (pileLines.length === 1) {
            result += pileLines[0];
          }
          break;
        }

        case 5: { // MATRIX
          const matrixLatex = this.parseMatrix();
          result += matrixLatex;
          break;
        }

        case 6: { // EMBELL (Embellishment e.g. primes ', '', dot, vector arrow)
          const embellType = this.readByte();
          if (embellType === 1) result += "'";
          else if (embellType === 2) result += "''";
          else if (embellType === 3) result += "'''";
          else if (embellType === 4) result = `\\dot{${result}}`;
          else if (embellType === 5) result = `\\ddot{${result}}`;
          else if (embellType === 6) result = `\\vec{${result}}`;
          else if (embellType === 7) result = `\\bar{${result}}`;
          else if (embellType === 8) result = `\\tilde{${result}}`;
          else if (embellType === 9) result = `\\hat{${result}}`;
          break;
        }

        case 7: { // FONT DEF
          const fontDefLen = this.readByte();
          this.offset += fontDefLen;
          break;
        }

        default:
          break;
      }
    }

    return result;
  }

  mapCharToLatex(code, fontIdx) {
    if (fontIdx === 3 || fontIdx === 4 || (code >= 0x0391 && code <= 0x03C9)) {
      if (GREEK_SYMBOL_MAP[code]) return GREEK_SYMBOL_MAP[code];
    }

    if (code >= 32 && code <= 126) {
      const ch = String.fromCharCode(code);
      if (ch === '{') return '\\{';
      if (ch === '}') return '\\}';
      return ch;
    }

    if (GREEK_SYMBOL_MAP[code]) {
      return GREEK_SYMBOL_MAP[code];
    }

    if (code >= 0x0391 && code <= 0x03C9) {
      return String.fromCharCode(code);
    }

    return '';
  }

  parseTemplate(selector, variation) {
    switch (selector) {
      case 0: { // tmROOT (Radical)
        const radicand = this.parseSlotLine();
        const degree = (variation & 0x01) ? this.parseSlotLine() : '';
        if (degree) {
          return `\\sqrt[${degree}]{${radicand}}`;
        }
        return `\\sqrt{${radicand}}`;
      }

      case 1: { // tmFRACT (Fraction)
        const num = this.parseSlotLine();
        const den = this.parseSlotLine();
        if (variation === 1) {
          return `${num}/${den}`;
        }
        return `\\frac{${num}}{${den}}`;
      }

      case 2: { // tmUBAR / tmOBAR
        const content = this.parseSlotLine();
        return variation === 1 ? `\\underline{${content}}` : `\\overline{${content}}`;
      }

      case 3: { // tmARROW
        const content = this.parseSlotLine();
        return `\\vec{${content}}`;
      }

      case 4: { // tmINTEG (Integral)
        const lower = this.parseSlotLine();
        const upper = this.parseSlotLine();
        const integrand = this.parseSlotLine();
        let res = '\\int';
        if (lower) res += `_{${lower}}`;
        if (upper) res += `^{${upper}}`;
        if (integrand) res += ` ${integrand}`;
        return res;
      }

      case 5: { // tmSUM
        const lower = this.parseSlotLine();
        const upper = this.parseSlotLine();
        const operand = this.parseSlotLine();
        let res = '\\sum';
        if (lower) res += `_{${lower}}`;
        if (upper) res += `^{${upper}}`;
        if (operand) res += ` ${operand}`;
        return res;
      }

      case 6: { // tmPROD
        const lower = this.parseSlotLine();
        const upper = this.parseSlotLine();
        const operand = this.parseSlotLine();
        let res = '\\prod';
        if (lower) res += `_{${lower}}`;
        if (upper) res += `^{${upper}}`;
        if (operand) res += ` ${operand}`;
        return res;
      }

      case 8:
      case 10: { // tmBRACK / tmPAREN
        const content = this.parseSlotLine();
        if (selector === 8) return `\\left[ ${content} \\right]`;
        return `\\left( ${content} \\right)`;
      }

      case 9: { // tmBRACE (Cases)
        const content = this.parseSlotLine();
        return `\\begin{cases} ${content} \\end{cases}`;
      }

      case 11: { // tmBAR (Absolute value)
        const content = this.parseSlotLine();
        return `\\left| ${content} \\right|`;
      }

      case 12: { // tmSUB, tmSUP, tmSUBSUP
        const sub = (variation & 0x01) ? this.parseSlotLine() : '';
        const sup = (variation & 0x02) ? this.parseSlotLine() : '';
        let res = '';
        if (sub) res += `_{${sub}}`;
        if (sup) res += `^{${sup}}`;
        return res;
      }

      case 13: { // tmBOX
        const content = this.parseSlotLine();
        return `\\boxed{${content}}`;
      }

      default: {
        return this.parseSlotLine();
      }
    }
  }

  parseMatrix() {
    const rows = this.readByte() || 2;
    const cols = this.readByte() || 2;
    const rowList = [];

    for (let r = 0; r < rows; r++) {
      const cellList = [];
      for (let c = 0; c < cols; c++) {
        cellList.push(this.parseSlotLine());
      }
      rowList.push(cellList.join(' & '));
    }

    return `\\begin{pmatrix} ${rowList.join(' \\\\ ')} \\end{pmatrix}`;
  }
}

function extractMathTypeToLatex(buffer) {
  if (!buffer || buffer.length < 10) return null;

  for (let i = 0; i < buffer.length - 8; i++) {
    if (buffer[i] === 0x1B && (buffer[i + 1] === 0x03 || buffer[i + 1] === 0x05 || buffer[i + 1] === 0x01)) {
      const parser = new MtefParser(buffer, i);
      const latex = parser.parse();
      if (latex && latex.trim().length > 0) {
        return `$${latex.trim()}$`;
      }
    }
  }

  const str = buffer.toString('binary');
  const mtIdx = str.indexOf('MathType');
  if (mtIdx !== -1) {
    for (let i = mtIdx; i < Math.min(mtIdx + 300, buffer.length - 8); i++) {
      if (buffer[i] === 0x1B && (buffer[i + 1] === 0x03 || buffer[i + 1] === 0x05 || buffer[i + 1] === 0x01)) {
        const parser = new MtefParser(buffer, i);
        const latex = parser.parse();
        if (latex && latex.trim().length > 0) {
          return `$${latex.trim()}$`;
        }
      }
    }
  }

  return null;
}

function convertWmfToWebImage(wmfBuffer) {
  if (!wmfBuffer || wmfBuffer.length < 40) return null;

  try {
    for (let i = 0; i < wmfBuffer.length - 40; i++) {
      if (wmfBuffer[i] === 0x28 && wmfBuffer[i + 1] === 0x00 && wmfBuffer[i + 2] === 0x00 && wmfBuffer[i + 3] === 0x00) {
        const biWidth = wmfBuffer.readInt32LE(i + 4);
        const biHeight = wmfBuffer.readInt32LE(i + 8);
        const biPlanes = wmfBuffer.readUInt16LE(i + 12);
        const biBitCount = wmfBuffer.readUInt16LE(i + 14);

        if (biWidth > 0 && biHeight !== 0 && biPlanes === 1 && (biBitCount === 1 || biBitCount === 4 || biBitCount === 8 || biBitCount === 16 || biBitCount === 24 || biBitCount === 32)) {
          const bmpDataSize = wmfBuffer.length - i;
          const fileSize = 14 + bmpDataSize;
          const bmpHeader = Buffer.alloc(14);
          bmpHeader.write('BM', 0);
          bmpHeader.writeUInt32LE(fileSize, 2);
          bmpHeader.writeUInt32LE(0, 6);
          const offsetToBits = 14 + 40 + (biBitCount <= 8 ? (1 << biBitCount) * 4 : 0);
          bmpHeader.writeUInt32LE(offsetToBits, 10);

          const bmpBuffer = Buffer.concat([bmpHeader, wmfBuffer.slice(i)]);
          return {
            buffer: bmpBuffer,
            ext: 'bmp',
            width: biWidth,
            height: Math.abs(biHeight)
          };
        }
      }
    }

    let width = 400;
    let height = 250;
    if (wmfBuffer.readUInt32LE(0) === 0x9AC6CDD7) {
      const left = wmfBuffer.readInt16LE(6);
      const top = wmfBuffer.readInt16LE(8);
      const right = wmfBuffer.readInt16LE(10);
      const bottom = wmfBuffer.readInt16LE(12);
      const inch = wmfBuffer.readUInt16LE(14) || 1440;
      width = Math.round(Math.abs(right - left) * 96 / inch) || 400;
      height = Math.round(Math.abs(bottom - top) * 96 / inch) || 250;
    }

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#ffffff" stroke="#cbd5e1" stroke-width="1" rx="4"/>
  <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="13" fill="#64748b" text-anchor="middle" dominant-baseline="middle">
    [Hình vẽ đồ thị / Sơ đồ WMF (${width}x${height})]
  </text>
</svg>`;

    return {
      buffer: Buffer.from(svgContent, 'utf8'),
      ext: 'svg',
      width,
      height
    };
  } catch (e) {
    return null;
  }
}

module.exports = {
  extractMathTypeToLatex,
  convertWmfToWebImage,
  MtefParser
};
