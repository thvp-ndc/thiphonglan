const mammoth = require('mammoth');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');
const { parseOMMLNode } = require('./ommlToLatex');
const { autoFormatMathInContent } = require('./unicodeMathToLatex');
const { normalizeTrueFalseMap } = require('./trueFalseUtils');
const { extractMathTypeToLatex, convertWmfToWebImage } = require('./wmfUtils');
const { formatImageMarkdown } = require('./imageUtils');

/**
 * Service bóc tách đề thi từ file Word (.docx)
 * Hỗ trợ nhận diện tự động chuẩn Bộ GD&ĐT 2025:
 * - PHẦN I: Trắc nghiệm nhiều lựa chọn (A, B, C, D)
 * - PHẦN II: Trắc nghiệm Đúng/Sai (4 ý a, b, c, d; đáp án Đ/S hoặc đánh dấu *)
 * - PHẦN III: Tự luận (kèm điểm số và barem chấm)
 * Hỗ trợ bóc tách công thức toán học Word Equation (OMML sang LaTeX)
 * Hỗ trợ bóc tách công thức MathType (MTEF sang LaTeX)
 * Hỗ trợ bóc tách hình ảnh nhúng và kích thước hiển thị chính xác (EMU / pt / px)
 */
class WordExamParser {
  async parseWordBuffer(buffer) {
    try {
      if (buffer && buffer[0] === 0x50 && buffer[1] === 0x4b) {
        const parsed = await this.parseDocxWithOmmlAndMedia(buffer);
        if (parsed && parsed.questions && parsed.questions.length > 0) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn('[WordExamParser] parseDocx failed, falling back to mammoth:', err.message);
    }

    const result = await mammoth.extractRawText({ buffer });
    const fullText = result.value || '';
    return this.parseExamText(fullText);
  }

  async parseDocxWithOmmlAndMedia(buffer) {
    const zip = await JSZip.loadAsync(buffer);
    const docXmlFile = zip.file('word/document.xml');
    if (!docXmlFile) {
      throw new Error('word/document.xml không tồn tại trong file .docx');
    }

    // 1. Trích xuất quan hệ hình ảnh & đối tượng nhúng từ word/_rels/document.xml.rels
    const relMap = {};
    const relsFile = zip.file('word/_rels/document.xml.rels');
    const uploadsDir = path.resolve(__dirname, '../../uploads/images');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    if (relsFile) {
      try {
        const relsXml = await relsFile.async('text');
        const relsDom = new DOMParser().parseFromString(relsXml, 'text/xml');
        const relElements = relsDom.getElementsByTagName('Relationship');

        for (let i = 0; i < relElements.length; i++) {
          const rel = relElements[i];
          const type = rel.getAttribute('Type') || '';
          const rId = rel.getAttribute('Id') || '';
          let target = rel.getAttribute('Target') || '';

          if (!rId || !target) continue;

          let zipPath = target;
          if (zipPath.startsWith('../')) {
            zipPath = zipPath.replace(/^\.\.\//, 'word/');
          } else if (!zipPath.startsWith('word/')) {
            zipPath = 'word/' + zipPath.replace(/^\//, '');
          }
          
          try {
            const fileInZip = zip.file(zipPath);
            if (!fileInZip) continue;

            const fileBuffer = await fileInZip.async('nodebuffer');
            let ext = path.extname(zipPath).toLowerCase().replace('.', '') || 'png';
            const isMathCandidate = ext === 'bin' || ext === 'wmf' || ext === 'emf' || zipPath.includes('embeddings') || zipPath.includes('oleObject');

            // A. Kiểm tra nếu là tệp nhúng MathType OLE (.bin) hoặc WMF/EMF chứa công thức
            let mathTypeLatex = null;
            if (isMathCandidate) {
              mathTypeLatex = extractMathTypeToLatex(fileBuffer);
            }

            if (mathTypeLatex) {
              relMap[rId] = { isMath: true, latex: mathTypeLatex };
              continue;
            }

            // B. Xử lý ảnh thông thường hoặc chuyển đổi WMF/EMF sang định dạng web
            let finalBuffer = fileBuffer;

            if (ext === 'wmf' || ext === 'emf') {
              const converted = convertWmfToWebImage(fileBuffer);
              if (converted) {
                finalBuffer = converted.buffer;
                ext = converted.ext;
              }
            }

            const fileName = `word_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
            const diskPath = path.join(uploadsDir, fileName);
            fs.writeFileSync(diskPath, finalBuffer);

            relMap[rId] = {
              isMath: false,
              url: `/uploads/images/${fileName}`,
              fileName
            };
          } catch (itemErr) {
            console.warn(`[WordExamParser] Lỗi xử lý relationship ${rId} (${zipPath}):`, itemErr.message);
          }
        }
      } catch (e) {
        console.warn('[WordExamParser] Lỗi trích xuất quan hệ ảnh rels:', e.message);
      }
    }

    // 2. Phân tích nội dung XML của document.xml
    const docXml = await docXmlFile.async('text');
    const dom = new DOMParser().parseFromString(docXml, 'text/xml');

    const rawParagraphs = [];
    const bodyElements = dom.getElementsByTagName('w:body');
    const root = bodyElements.length > 0 ? bodyElements[0] : dom.documentElement;

    this.collectParagraphs(root, rawParagraphs, relMap);
    const paragraphs = this.processCollectedParagraphs(rawParagraphs);

    const fullText = paragraphs.join('\n');
    return this.parseExamText(fullText);
  }

  isCodeParagraph(pNode) {
    if (!pNode || pNode.nodeType !== 1) return false;

    const pPr = pNode.getElementsByTagName('w:pPr')[0];
    if (pPr) {
      const pStyle = pPr.getElementsByTagName('w:pStyle')[0];
      if (pStyle) {
        const val = pStyle.getAttribute('w:val') || pStyle.getAttribute('val') || '';
        if (/code|program|listing|pre|html|python|consolas/i.test(val)) return true;
      }
    }

    const rFontsList = pNode.getElementsByTagName('w:rFonts');
    if (rFontsList.length > 0) {
      for (let i = 0; i < rFontsList.length; i++) {
        const rf = rFontsList[i];
        const ascii = rf.getAttribute('w:ascii') || rf.getAttribute('ascii') || '';
        const hAnsi = rf.getAttribute('w:hAnsi') || rf.getAttribute('hAnsi') || '';
        if (/consolas|courier|monospace|fira|source code|lucida console/i.test(ascii) ||
            /consolas|courier|monospace|fira|source code|lucida console/i.test(hAnsi)) {
          return true;
        }
      }
    }

    return false;
  }

  collectParagraphs(node, rawParagraphs, relMap) {
    if (!node) return;

    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.nodeType !== 1) continue;
      const tag = child.localName || child.nodeName.split(':').pop();

      if (tag === 'p' || tag === 'oMathPara' || tag === 'oMath') {
        const isCode = tag === 'p' ? this.isCodeParagraph(child) : false;
        const pText = this.extractNodeText(child, relMap).trimEnd();
        if (pText.trim()) {
          rawParagraphs.push({ text: pText, isCode });
        }
      } else if (tag === 'tbl') {
        const rows = child.getElementsByTagName('w:tr');
        for (let r = 0; r < rows.length; r++) {
          const cells = rows[r].getElementsByTagName('w:tc');
          for (let c = 0; c < cells.length; c++) {
            const cellPs = cells[c].getElementsByTagName('w:p');
            for (let cp = 0; cp < cellPs.length; cp++) {
              const isCode = this.isCodeParagraph(cellPs[cp]);
              const cpText = this.extractNodeText(cellPs[cp], relMap).trimEnd();
              if (cpText.trim()) rawParagraphs.push({ text: cpText, isCode });
            }
          }
        }
      } else {
        this.collectParagraphs(child, rawParagraphs, relMap);
      }
    }
  }

  processCollectedParagraphs(rawParagraphs) {
    const finalParagraphs = [];
    let codeBuffer = [];

    const flushCodeBuffer = () => {
      if (codeBuffer.length === 0) return;
      const joinedCode = codeBuffer.join('\n');
      codeBuffer = [];

      if (joinedCode.trim().startsWith('```') && joinedCode.trim().endsWith('```')) {
        finalParagraphs.push(joinedCode);
        return;
      }

      const isHtml = /<!DOCTYPE|<html|<body|<div|<table|<tr|<td|<form|<style|<script|<\//i.test(joinedCode);
      const lang = isHtml ? 'html' : 'python';
      finalParagraphs.push(`\`\`\`${lang}\n${joinedCode}\n\`\`\``);
    };

    for (let i = 0; i < rawParagraphs.length; i++) {
      const item = rawParagraphs[i];
      if (item.isCode) {
        codeBuffer.push(item.text);
      } else {
        flushCodeBuffer();
        finalParagraphs.push(item.text);
      }
    }
    flushCodeBuffer();

    return finalParagraphs;
  }

  findAllEmbedIds(element) {
    const ids = [];
    if (!element) return ids;

    const traverse = (el) => {
      if (el.attributes) {
        for (let i = 0; i < el.attributes.length; i++) {
          const attr = el.attributes[i];
          const name = (attr.name || attr.localName || '').toLowerCase();
          if (
            name === 'r:embed' ||
            name === 'embed' ||
            name === 'r:id' ||
            name === 'id' ||
            name === 'o:relid' ||
            name === 'relid'
          ) {
            if (attr.value && (attr.value.startsWith('rId') || attr.value.startsWith('RId') || attr.value.startsWith('rIdImg'))) {
              if (!ids.includes(attr.value)) ids.push(attr.value);
            }
          }
        }
      }
      for (let child = el.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 1) traverse(child);
      }
    };
    traverse(element);
    return ids;
  }

  extractNodeText(node, relMap) {
    if (!node) return '';
    if (node.nodeType === 3) return node.nodeValue || '';
    if (node.nodeType !== 1) return '';

    const tag = node.localName || node.nodeName.split(':').pop();

    // 1. Công thức Word OMML
    if (tag === 'oMath' || tag === 'oMathPara') {
      const latex = parseOMMLNode(node);
      return latex ? ` ${latex} ` : '';
    }

    // 2. Hình ảnh hoặc đối tượng nhúng MathType OLE / DrawingML / VML
    if (tag === 'drawing' || tag === 'pict' || tag === 'object' || tag === 'shape' || tag === 'imagedata' || tag === 'graphic') {
      const embedIds = this.findAllEmbedIds(node);
      // Ưu tiên 1: Tìm bất kỳ đối tượng nhúng nào là công thức MathType
      for (const rId of embedIds) {
        if (relMap && relMap[rId] && relMap[rId].isMath && relMap[rId].latex) {
          return ` ${relMap[rId].latex} `;
        }
      }

      // Ưu tiên 2: Tìm ảnh thông thường
      for (const rId of embedIds) {
        if (relMap && relMap[rId] && !relMap[rId].isMath) {
          const mediaInfo = relMap[rId];
          const dims = this.extractImageDisplayDimensions(node);
          const imgMd = formatImageMarkdown('Hình ảnh', mediaInfo.url, dims.width, dims.height);
          return `\n${imgMd}\n`;
        }
      }
    }

    if (tag === 't') {
      return node.textContent || '';
    }

    if (tag === 'tab') {
      return '    ';
    }

    if (tag === 'br' || tag === 'cr') {
      return '\n';
    }

    let text = '';
    for (let child = node.firstChild; child; child = child.nextSibling) {
      text += this.extractNodeText(child, relMap);
    }
    return text;
  }

  extractImageDisplayDimensions(element) {
    let width = null;
    let height = null;
    if (!element) return { width, height };

    // 1. DrawingML: <wp:extent cx="..." cy="..."/>
    const extElements = element.getElementsByTagName('wp:extent');
    if (extElements.length > 0) {
      const cx = parseInt(extElements[0].getAttribute('cx'), 10);
      const cy = parseInt(extElements[0].getAttribute('cy'), 10);
      if (cx > 0 && cy > 0) {
        width = Math.round(cx / 9525);
        height = Math.round(cy / 9525);
        return { width, height };
      }
    }

    // 2. DrawingML a:ext: <a:ext cx="..." cy="..."/>
    const aExtElements = element.getElementsByTagName('a:ext');
    if (aExtElements.length > 0) {
      const cx = parseInt(aExtElements[0].getAttribute('cx'), 10);
      const cy = parseInt(aExtElements[0].getAttribute('cy'), 10);
      if (cx > 0 && cy > 0) {
        width = Math.round(cx / 9525);
        height = Math.round(cy / 9525);
        return { width, height };
      }
    }

    // 3. VML style: Kiểm tra thuộc tính style trên chính element hoặc các thẻ con (v:shape, shape...)
    const findStyleAttr = (el) => {
      if (!el) return null;
      if (el.getAttribute && el.getAttribute('style')) {
        const st = el.getAttribute('style');
        if (/width/i.test(st)) return st;
      }
      for (let child = el.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === 1) {
          const res = findStyleAttr(child);
          if (res) return res;
        }
      }
      return null;
    };

    const styleAttr = findStyleAttr(element);
    if (styleAttr) {
      const wMatch = styleAttr.match(/width\s*:\s*([\d.]+)(pt|in|cm|px)?/i);
      const hMatch = styleAttr.match(/height\s*:\s*([\d.]+)(pt|in|cm|px)?/i);
      if (wMatch && hMatch) {
        const parseUnit = (val, unit) => {
          const num = parseFloat(val);
          if (unit === 'pt') return num * 1.3333;
          if (unit === 'in') return num * 96;
          if (unit === 'cm') return num * 37.8;
          return num;
        };
        width = Math.round(parseUnit(wMatch[1], wMatch[2]?.toLowerCase()));
        height = Math.round(parseUnit(hMatch[1], hMatch[2]?.toLowerCase()));
      }
    }

    return { width, height };
  }

  findEmbedId(element) {
    if (!element || !element.attributes) return null;
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      const name = (attr.name || attr.localName || '').toLowerCase();
      if (
        name === 'r:embed' ||
        name === 'embed' ||
        name === 'r:id' ||
        name === 'id' ||
        name === 'o:relid' ||
        name === 'relid'
      ) {
        if (attr.value && (attr.value.startsWith('rId') || attr.value.startsWith('RId') || attr.value.startsWith('rIdImg'))) {
          return attr.value;
        }
      }
    }
    for (let child = element.firstChild; child; child = child.nextSibling) {
      if (child.nodeType === 1) {
        const found = this.findEmbedId(child);
        if (found) return found;
      }
    }
    return null;
  }

  parseExamText(text) {
    const rawLines = text.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l.trim().length > 0);
    if (rawLines.length === 0) {
      throw new Error('File Word rỗng hoặc không có văn bản');
    }

    const lines = [];
    let insidePreFence = false;
    for (const line of rawLines) {
      if (line.trim().startsWith('```')) {
        insidePreFence = !insidePreFence;
        lines.push(line);
        continue;
      }
      if (insidePreFence) {
        lines.push(line);
        continue;
      }
      const inlineSplit = this.splitInlineOptions(line);
      lines.push(...inlineSplit);
    }

    let examTitle = 'Đề Thi Nhập Từ File Word';
    if (lines[0] && !lines[0].match(/^(?:Câu|CÂU|Bài|BÀI)\s+\d+/i) && !lines[0].startsWith('```')) {
      examTitle = lines[0].replace(/^[\s#*_-]+/, '').trim();
    }

    const questions = [];
    let currentQ = null;
    let currentSection = 'single_choice';
    let insideCodeFence = false;

    const part1Regex = /^\s*(?:PHẦN|Phần)\s*(?:I|1|A)?[.:\s-]*(?:CÂU\s+(?:HỎI\s+)?)?(?:TRẮC\s*NGHIỆM\s+)?(?:NHIỀU|NHIEU)/i;
    const part2Regex = /^\s*(?:PHẦN|Phần)\s*(?:II|2|B)?[.:\s-]*(?:CÂU\s+(?:HỎI\s+)?)?(?:TRẮC\s*NGHIỆM\s+)?(?:ĐÚNG|DUNG)/i;
    const part3Regex = /^\s*(?:PHẦN|Phần)\s*(?:III|3|C)?[.:\s-]*(?:CÂU\s+(?:HỎI\s+)?)?(?:TỰ|TƯ|TU)\s*LUẬN/i;

    const questionHeaderRegex = /^\s*(?:Câu|CÂU|Bài|BÀI)\s*(\d+)[\s:.-]+(.*)/i;
    const mcqOptionRegex = /^\s*([*]?[A-D][*]?|[A-D]\*|\([A-D]\)|\[[A-D]\])(?:[.):\-]|(?<=\])\s*|(?<=\))\s*)\s*(.*)/;
    const tfSubItemRegex = /^\s*([*]?[a-d][*]?|[a-d]\*|\([a-d]\)|\[[a-d]\])(?:[.):\-]|(?<=\])\s*|(?<=\))\s*)\s*(.*)/;
    const answerTagRegex = /^\s*(?:Đáp án|ĐA|Đáp án đúng|ĐÁP ÁN)[\s:.-]*(.*)/i;
    const scoreRegex = /\((\d+(?:[,.]\d+)?)\s*(?:điểm|đ|d)\)/i;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.trim().startsWith('```')) {
        insideCodeFence = !insideCodeFence;
        if (currentQ) {
          if (currentQ.options.length === 0 && !currentQ.rubric_guide) {
            currentQ.content += (currentQ.content ? '\n' : '') + line;
          } else if (currentQ.options.length > 0 && !currentQ.rubric_guide && currentQ.question_type !== 'essay') {
            const lastOpt = currentQ.options[currentQ.options.length - 1];
            lastOpt.text += (lastOpt.text ? '\n' : '') + line;
          } else if (currentQ.rubric_guide) {
            currentQ.rubric_guide += line + '\n';
          }
        }
        continue;
      }

      if (insideCodeFence && currentQ) {
        if (currentQ.options.length === 0 && !currentQ.rubric_guide) {
          currentQ.content += (currentQ.content ? '\n' : '') + line;
        } else if (currentQ.options.length > 0 && !currentQ.rubric_guide && currentQ.question_type !== 'essay') {
          const lastOpt = currentQ.options[currentQ.options.length - 1];
          lastOpt.text += (lastOpt.text ? '\n' : '') + line;
        } else if (currentQ.rubric_guide) {
          currentQ.rubric_guide += line + '\n';
        }
        continue;
      }

      if (part3Regex.test(line)) {
        currentSection = 'essay';
        if (currentQ) {
          this.finalizeQuestion(currentQ, questions);
          currentQ = null;
        }
        continue;
      }
      if (part2Regex.test(line)) {
        currentSection = 'true_false';
        if (currentQ) {
          this.finalizeQuestion(currentQ, questions);
          currentQ = null;
        }
        continue;
      }
      if (part1Regex.test(line) && !part2Regex.test(line) && !part3Regex.test(line)) {
        currentSection = 'single_choice';
        if (currentQ) {
          this.finalizeQuestion(currentQ, questions);
          currentQ = null;
        }
        continue;
      }

      const qMatch = line.match(questionHeaderRegex);
      if (qMatch) {
        if (currentQ) {
          this.finalizeQuestion(currentQ, questions);
        }

        const qNum = parseInt(qMatch[1], 10);
        let content = qMatch[2].trim();

        let maxScore = null;
        const scoreMatch = content.match(scoreRegex) || line.match(scoreRegex);
        if (scoreMatch) {
          maxScore = parseFloat(scoreMatch[1].replace(',', '.'));
          content = content.replace(scoreRegex, '').trim();
        }

        const isExplicitEssay = /tự luận|TL/i.test(line);
        const isExplicitTF = /đúng[\s/]*sai|Đ\/S/i.test(line);

        let qType = currentSection;
        if (isExplicitEssay) qType = 'essay';
        else if (isExplicitTF) qType = 'true_false';

        if (maxScore === null) {
          if (qType === 'essay') maxScore = 2.5;
          else if (qType === 'true_false') maxScore = 1.0;
          else maxScore = 0.25;
        }

        currentQ = {
          order_index: questions.length + 1,
          question_type: qType,
          content: content,
          max_score: maxScore,
          options: [],
          correct_answers: qType === 'true_false' ? { a: 'F', b: 'F', c: 'F', d: 'F' } : [],
          rubric_guide: '',
          raw_lines: []
        };
        continue;
      }

      if (!currentQ) continue;

      const tfMatch = line.match(tfSubItemRegex);
      if (tfMatch && currentQ.question_type !== 'essay') {
        currentQ.question_type = 'true_false';
        if (!currentQ.correct_answers || Array.isArray(currentQ.correct_answers)) {
          currentQ.correct_answers = { a: 'F', b: 'F', c: 'F', d: 'F' };
        }

        let prefix = tfMatch[1];
        let subText = tfMatch[2].trim();
        let isCorrect = false;

        if (prefix.includes('*')) {
          isCorrect = true;
          prefix = prefix.replace(/\*/g, '');
        }

        const subId = prefix.toLowerCase().replace(/[^a-d]/g, '');
        if (subId) {
          currentQ.options.push({
            id: subId,
            text: subText
          });
          if (isCorrect) {
            currentQ.correct_answers[subId] = 'T';
          }
        }
        continue;
      }

      const mcqMatch = line.match(mcqOptionRegex);
      if (mcqMatch && currentQ.question_type !== 'essay' && currentQ.question_type !== 'true_false') {
        let optPrefix = mcqMatch[1];
        let optText = mcqMatch[2].trim();
        let isCorrect = false;

        if (optPrefix.includes('*')) {
          isCorrect = true;
          optPrefix = optPrefix.replace(/\*/g, '');
        }

        const cleanOptId = optPrefix.replace(/[^A-D]/g, '');
        if (cleanOptId) {
          currentQ.options.push({
            id: cleanOptId,
            text: optText
          });

          if (isCorrect) {
            if (!Array.isArray(currentQ.correct_answers)) currentQ.correct_answers = [];
            currentQ.correct_answers.push(cleanOptId);
          }
        }
        continue;
      }

      const ansMatch = line.match(answerTagRegex);
      if (ansMatch && currentQ.question_type !== 'essay') {
        const ansRaw = ansMatch[1].trim();
        const tfPairRegex = /([a-d])[\s:.-]+([ĐSđsTFtf]|Đúng|Sai|True|False)/gi;
        const matches = [...ansRaw.matchAll(tfPairRegex)];

        if (matches.length > 0 || currentQ.question_type === 'true_false') {
          currentQ.question_type = 'true_false';
          if (!currentQ.correct_answers || Array.isArray(currentQ.correct_answers)) {
            currentQ.correct_answers = { a: 'F', b: 'F', c: 'F', d: 'F' };
          }
          matches.forEach(m => {
            const subKey = m[1].toLowerCase();
            const valStr = m[2].toUpperCase();
            const isT = valStr.startsWith('Đ') || valStr.startsWith('D') || valStr.startsWith('T');
            currentQ.correct_answers[subKey] = isT ? 'T' : 'F';
          });
        } else {
          const correctLetters = ansRaw.replace(/[^A-D]/g, '').split('');
          if (correctLetters.length > 0) {
            currentQ.correct_answers = correctLetters;
          }
        }
        continue;
      }

      if (currentQ.question_type === 'essay' && /^(?:Hướng dẫn chấm|Barem|Đáp án mẫu|Gợi ý)[\s:.-]/i.test(line)) {
        currentQ.rubric_guide += line + '\n';
        continue;
      }

      if (currentQ.options.length === 0 && !currentQ.rubric_guide) {
        currentQ.content += (currentQ.content ? '\n' : '') + line;
      } else if (currentQ.options.length > 0 && !currentQ.rubric_guide && currentQ.question_type !== 'essay') {
        const lastOpt = currentQ.options[currentQ.options.length - 1];
        lastOpt.text += (lastOpt.text ? '\n' : '') + line;
      } else if (currentQ.rubric_guide) {
        currentQ.rubric_guide += line + '\n';
      }
    }

    if (currentQ) {
      this.finalizeQuestion(currentQ, questions);
    }

    if (questions.length === 0) {
      throw new Error('Không thể nhận diện câu hỏi từ file Word. Vui lòng đảm bảo các câu hỏi bắt đầu bằng "Câu 1:", "Câu 2:"');
    }

    return {
      title: examTitle,
      total_questions: questions.length,
      questions
    };
  }

  splitInlineOptions(line) {
    if (line.trim().startsWith('```') || line.startsWith('    ') || line.startsWith('\t')) {
      return [line];
    }

    // Tách phương án nội dòng khi có ít nhất 2 phương án trở lên (A. B. C. D. hoặc A) B) C) D.)
    const pattern = /(?:^|[\s\t]+)((?:[*]?)[A-D][*]?|[A-D]\*|\([A-D]\)|\[[A-D]\])(?:[.):\-]|(?<=\])|(?<=\)))\s+/g;
    const matches = [...line.matchAll(pattern)];

    if (matches.length >= 2 && matches[0].index === line.search(/\S/)) {
      const parts = [];
      for (let i = 0; i < matches.length; i++) {
        const start = matches[i].index;
        const end = (i + 1 < matches.length) ? matches[i + 1].index : line.length;
        parts.push(line.substring(start, end).trim());
      }
      return parts;
    }

    return [line];
  }

  autoFenceCodeInText(text) {
    if (!text || text.includes('```')) return text;

    const htmlBlockRegex = /(<(?:table|form|html|body|div|ul|ol)[\s\S]*?<\/(?:table|form|html|body|div|ul|ol)>)/i;
    if (htmlBlockRegex.test(text)) {
      return text.replace(htmlBlockRegex, '\n```html\n$1\n```\n');
    }

    const lines = text.split('\n');
    const newLines = [];
    let pyBlock = [];
    let inPy = false;

    const flushPy = () => {
      if (pyBlock.length > 0) {
        if (pyBlock.length >= 2 || /^\s*(?:def |class |for .* in |while |import |from .* import )/i.test(pyBlock[0])) {
          newLines.push('```python');
          newLines.push(...pyBlock);
          newLines.push('```');
        } else {
          newLines.push(...pyBlock);
        }
        pyBlock = [];
      }
      inPy = false;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isPyStart = /^\s*(?:def\s+[a-zA-Z0-9_]+\s*\(|class\s+[a-zA-Z0-9_]+|for\s+[a-zA-Z0-9_]+\s+in\s+|while\s+|import\s+[a-zA-Z0-9_]+|from\s+[a-zA-Z0-9_]+\s+import)/.test(line);
      const isIndented = /^(?: {2,}|\t)/.test(line);
      const isPyKeyword = /^\s*(?:if\s+.*:|elif\s+.*:|else:|return\b|print\(|input\()/.test(line);

      if (isPyStart) {
        if (!inPy) {
          flushPy();
          inPy = true;
        }
        pyBlock.push(line);
      } else if (inPy && (isIndented || isPyKeyword || line.trim() === '')) {
        pyBlock.push(line);
      } else {
        flushPy();
        newLines.push(line);
      }
    }
    flushPy();

    return newLines.join('\n');
  }

  finalizeQuestion(q, questionsList) {
    if (q.question_type === 'true_false') {
      if (!q.options || q.options.length < 2) {
        q.question_type = 'essay';
        q.max_score = q.max_score === 1.0 ? 2.5 : q.max_score;
      } else {
        if (!q.max_score || q.max_score === 0.25) {
          q.max_score = 1.0;
        }
        q.correct_answers = normalizeTrueFalseMap(q.correct_answers);
      }
    } else if (q.question_type !== 'essay') {
      if (!q.options || q.options.length < 2) {
        q.question_type = 'essay';
        q.max_score = q.max_score === 1.0 ? 2.5 : q.max_score;
      } else {
        if (!q.correct_answers || q.correct_answers.length === 0) {
          q.correct_answers = ['A'];
        } else if (q.correct_answers.length > 1) {
          q.question_type = 'multiple_choice';
        }
      }
    }

    q.content = this.autoFenceCodeInText(autoFormatMathInContent(q.content.trim()));
    if (q.rubric_guide) q.rubric_guide = this.autoFenceCodeInText(autoFormatMathInContent(q.rubric_guide.trim()));
    if (Array.isArray(q.options)) {
      q.options.forEach(opt => {
        if (opt.text) opt.text = autoFormatMathInContent(opt.text.trim());
      });
    }

    questionsList.push(q);
  }
}

module.exports = new WordExamParser();
