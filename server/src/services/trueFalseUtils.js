/**
 * Utility cho câu hỏi trắc nghiệm Đúng/Sai theo chuẩn Bộ GD&ĐT 2025
 * Quy chế chấm lũy tiến:
 * - Đúng 1 ý: 0.10 điểm (10% maxScore)
 * - Đúng 2 ý: 0.25 điểm (25% maxScore)
 * - Đúng 3 ý: 0.50 điểm (50% maxScore)
 * - Đúng 4 ý: 1.00 điểm (100% maxScore)
 * - Đúng 0 ý: 0.00 điểm
 */

function normalizeTrueFalseMap(val) {
  const result = { a: 'F', b: 'F', c: 'F', d: 'F' };
  if (!val) return result;

  if (typeof val === 'object' && !Array.isArray(val)) {
    for (const k of ['a', 'b', 'c', 'd']) {
      if (val[k] !== undefined && val[k] !== null && val[k] !== '') {
        const v = String(val[k]).trim().toUpperCase();
        result[k] = (v === 'T' || v === 'Đ' || v === 'D' || v === 'TRUE' || v === '1') ? 'T' : 'F';
      }
    }
    return result;
  }

  if (Array.isArray(val)) {
    let hasKeyValue = false;
    val.forEach(item => {
      if (typeof item === 'string' && (item.includes(':') || item.includes('-') || item.includes('='))) {
        hasKeyValue = true;
        const [subKey, subVal] = item.split(/[:\-=]/);
        const k = subKey.trim().toLowerCase();
        if (['a', 'b', 'c', 'd'].includes(k)) {
          const v = (subVal || '').trim().toUpperCase();
          result[k] = (v === 'T' || v === 'Đ' || v === 'D' || v === 'TRUE' || v === '1') ? 'T' : 'F';
        }
      }
    });

    if (!hasKeyValue && val.length > 0) {
      const set = new Set(val.map(x => String(x).trim().toLowerCase()));
      ['a', 'b', 'c', 'd'].forEach(k => {
        result[k] = set.has(k) ? 'T' : 'F';
      });
    }
  }

  return result;
}

function calculateTrueFalseScore(studentSelected, correctAnswer, maxScore = 1.0, subKeys = ['a', 'b', 'c', 'd']) {
  const studentMap = normalizeTrueFalseMap(studentSelected);
  const correctMap = normalizeTrueFalseMap(correctAnswer);

  let correctCount = 0;
  const details = {};

  subKeys.forEach(k => {
    const studentChoice = studentMap[k];
    const keyChoice = correctMap[k];
    const isItemCorrect = (studentChoice === keyChoice);
    if (isItemCorrect) correctCount++;
    details[k] = {
      studentChoice, // 'T' or 'F'
      keyChoice,     // 'T' or 'F'
      isCorrect: isItemCorrect
    };
  });

  const ratios = [0.0, 0.10, 0.25, 0.50, 1.00];
  const ratio = (subKeys.length === 4 && correctCount <= 4)
    ? (ratios[correctCount] ?? 0.0)
    : (correctCount / (subKeys.length || 1));

  const scoreObtained = Math.round(Number(maxScore) * ratio * 100) / 100;

  return {
    correctCount,
    totalSubItems: subKeys.length,
    ratio,
    scoreObtained,
    isAllCorrect: correctCount === subKeys.length,
    details
  };
}

module.exports = {
  normalizeTrueFalseMap,
  calculateTrueFalseScore
};
