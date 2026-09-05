/**
 * unicodeMathToLatex.js
 * Tự động chuyển đổi các ký hiệu Toán học Unicode và biểu thức toán gõ tự nhiên
 * sang chuẩn LaTeX để KaTeX hiển thị đẹp mắt và chính xác 100% Offline.
 */

const SUPERSCRIPTS = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')',
  'ⁿ': 'n', 'ⁱ': 'i', 'ˣ': 'x', 'ʸ': 'y', 'ᵃ': 'a',
  'ᵇ': 'b', 'ᶜ': 'c', 'ᵈ': 'd', 'ᵉ': 'e', 'ᵏ': 'k', 'ᵐ': 'm'
};

const SUBSCRIPTS = {
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9',
  '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')',
  'ₐ': 'a', 'ₑ': 'e', 'ₕ': 'h', 'ᵢ': 'i', 'ⱼ': 'j',
  'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n', 'ₒ': 'o',
  'ₚ': 'p', 'ᵣ': 'r', 'ₛ': 's', 'ₜ': 't', 'ᵤ': 'u', 'ᵥ': 'v', 'ₓ': 'x'
};

const MATH_SYMBOLS = {
  '≤': ' \\le ',
  '≥': ' \\ge ',
  '≠': ' \\ne ',
  '±': ' \\pm ',
  '∓': ' \\mp ',
  '×': ' \\times ',
  '÷': ' \\div ',
  '≈': ' \\approx ',
  '≡': ' \\equiv ',
  '∼': ' \\sim ',
  '≅': ' \\cong ',
  '∞': ' \\infty ',
  '∈': ' \\in ',
  '∉': ' \\notin ',
  '⊂': ' \\subset ',
  '⊃': ' \\supset ',
  '⊆': ' \\subseteq ',
  '⊇': ' \\supseteq ',
  '∅': ' \\emptyset ',
  '∪': ' \\cup ',
  '∩': ' \\cap ',
  '∀': ' \\forall ',
  '∃': ' \\exists ',
  '∄': ' \\nexists ',
  '⇒': ' \\Rightarrow ',
  '⇔': ' \\Leftrightarrow ',
  '→': ' \\to ',
  '←': ' \\leftarrow ',
  '↔': ' \\leftrightarrow ',
  '↦': ' \\mapsto ',
  '⊥': ' \\perp ',
  '∥': ' \\parallel ',
  '∠': ' \\angle ',
  '°': '^{\\circ}',
  '′': "'",
  '″': "''",
  'π': ' \\pi ',
  'α': ' \\alpha ',
  'β': ' \\beta ',
  'γ': ' \\gamma ',
  'δ': ' \\delta ',
  'ε': ' \\epsilon ',
  'θ': ' \\theta ',
  'λ': ' \\lambda ',
  'μ': ' \\mu ',
  'σ': ' \\sigma ',
  'ω': ' \\omega ',
  'Δ': ' \\Delta ',
  'Ω': ' \\Omega ',
  'Σ': ' \\Sigma ',
  'Φ': ' \\Phi '
};

/**
 * Chuẩn hóa một biểu thức toán học hoặc chuỗi chứa Unicode toán học
 */
function normalizeMathString(str) {
  if (!str) return '';
  let res = str;

  // 1. Chuyển đổi số mũ Unicode (ví dụ: x², x³⁺¹, uⁿ, (a+b)²)
  const supKeys = Object.keys(SUPERSCRIPTS).join('');
  const supRegex = new RegExp('([a-zA-Z0-9)\\x5D\\x7D])([' + supKeys + ']+)', 'g');
  res = res.replace(supRegex, (match, base, sups) => {
    const val = (sups || '').split('').map(c => SUPERSCRIPTS[c] || c).join('');
    return base + '^{' + val + '}';
  });

  // Số mũ đứng riêng lẻ (không có base trước đó hoặc đứng đầu cụm)
  const soloSupRegex = new RegExp('([' + supKeys + ']+)', 'g');
  res = res.replace(soloSupRegex, (match, sups) => {
    const val = (sups || '').split('').map(c => SUPERSCRIPTS[c] || c).join('');
    return '^{' + val + '}';
  });

  // 2. Chuyển đổi chỉ số dưới Unicode (ví dụ: uₙ, x₁, aᵢ)
  const subKeys = Object.keys(SUBSCRIPTS).join('');
  const subRegex = new RegExp('([a-zA-Z0-9)\\x5D\\x7D])([' + subKeys + ']+)', 'g');
  res = res.replace(subRegex, (match, base, subs) => {
    const val = (subs || '').split('').map(c => SUBSCRIPTS[c] || c).join('');
    return base + '_{' + val + '}';
  });

  const soloSubRegex = new RegExp('([' + subKeys + ']+)', 'g');
  res = res.replace(soloSubRegex, (match, subs) => {
    const val = (subs || '').split('').map(c => SUBSCRIPTS[c] || c).join('');
    return '_{' + val + '}';
  });

  // 3. Căn bậc hai (ví dụ: √(x+1) -> \sqrt{x+1}, √2 -> \sqrt{2})
  res = res.replace(/√\(([^)]+)\)/g, '\\sqrt{$1}');
  res = res.replace(/√([a-zA-Z0-9]+)/g, '\\sqrt{$1}');

  // 4. Ký hiệu toán học
  for (const [sym, latex] of Object.entries(MATH_SYMBOLS)) {
    if (res.includes(sym)) {
      res = res.split(sym).join(latex);
    }
  }

  return res;
}

/**
 * Tự động tìm và bao bọc công thức toán học chưa có $...$ hoặc có ký hiệu toán học
 * Không làm ảnh hưởng đến code block HTML/Python hoặc thẻ hình ảnh Markdown
 */
function autoFormatMathInContent(text) {
  if (!text) return '';

  // Tách biệt các đoạn code block \`\`\`...\`\`\`, inline code \`...\`, latex $...$ và ảnh ![...](...)
  const tokenRegex = /(```[\s\S]*?```|`[^`\n]+`|\$\$[\s\S]+?\$\$|\$(?:\\\$|[^\$\n])+?\$|!\[.*?\]\(.*?\))/g;
  const parts = text.split(tokenRegex);

  return parts.map(part => {
    if (!part) return '';
    // Giữ nguyên các phần code, ảnh, hoặc đã có $...$
    if (part.startsWith('`') || part.startsWith('![') || part.startsWith('$')) {
      return part;
    }
    return normalizeTextWithMathSymbols(part);
  }).join('');
}

function normalizeTextWithMathSymbols(text) {
  if (!text) return '';
  // Kiểm tra nếu đoạn văn bản chứa ký hiệu toán học Unicode
  const hasMathChars = /[²³⁴⁵⁶⁷⁸⁹⁰⁺⁻ⁿⁱˣʸ₁₂₃₄₅₆₇₈₉₀ₙᵢ≤≥≠±∓×÷≈≡∼≅∞∈∉⊂⊃⊆⊇∅∪∩∀∃⇒⇔→⊥∥∠°′″πραγδεθλμσωΔΩΣΦ√]/.test(text);
  if (!hasMathChars) {
    return text;
  }
  return normalizeMathString(text);
}

module.exports = {
  SUPERSCRIPTS,
  SUBSCRIPTS,
  MATH_SYMBOLS,
  normalizeMathString,
  autoFormatMathInContent
};
