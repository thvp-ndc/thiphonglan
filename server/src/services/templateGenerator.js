const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

async function generateOfficialWordTemplate() {
  const zip = new JSZip();

  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

  const lines = [
    'SỞ GD&ĐT • TRƯỜNG THCS - THPT ĐẶNG CHÍ THANH',
    'ĐỀ THI KIỂM TRA ĐỊNH KỲ THEO CẤU TRÚC BGDĐT 2025',
    'Môn thi: Tin Học (Thời gian làm bài: 45 phút)',
    '------------------------------------------------------------------',
    'HƯỚNG DẪN DÀNH CHO GIÁO VIÊN SOẠN ĐỀ:',
    '1. Đề thi gồm 3 phần chuẩn Bộ GD&ĐT: Phần I (Trắc nghiệm nhiều lựa chọn), Phần II (Trắc nghiệm Đúng/Sai 4 ý a, b, c, d), Phần III (Tự luận).',
    '2. Để chọn đáp án đúng cho Phần I: Thêm dấu * trước chữ cái đáp án đúng (ví dụ: *B. Bàn phím) HOẶC ghi dòng "Đáp án: B" ở cuối câu.',
    '3. Để chọn đáp án cho Phần II (Đúng/Sai): Ghi dòng "Đáp án: a - Đ, b - S, c - Đ, d - Đ" ở cuối câu HOẶC thêm dấu * trước các ý ĐÚNG (*a), *c)...).',
    '4. Phần III (Tự luận): Có thể ghi điểm số "(2.0 điểm)" và các dòng "Barem:" để hệ thống tự động nhận diện tiêu chí chấm.',
    '------------------------------------------------------------------',
    '',
    'PHẦN I. CÂU TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN',
    'Thí sinh trả lời từ câu 1 đến câu 2. Mỗi câu hỏi thí sinh chỉ chọn một phương án A, B, C hoặc D. (Mỗi câu 0.25 điểm)',
    '',
    'Câu 1: Thiết bị nào sau đây là thiết bị nhập dữ liệu (Input) của máy tính?',
    'A. Màn hình máy tính',
    '*B. Bàn phím máy tính',
    'C. Máy in laser',
    'D. Loa âm thanh',
    '',
    'Câu 2: Hệ điều hành Windows là phần mềm thuộc loại nào sau đây?',
    'A. Phần mềm ứng dụng',
    'B. Phần mềm tiện ích',
    '*C. Phần mềm hệ thống',
    'D. Phần mềm độc hại',
    '',
    'PHẦN II. CÂU TRẮC NGHIỆM ĐÚNG SAI',
    'Thí sinh trả lời từ câu 3 đến câu 4. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn đúng hoặc sai. Điểm tối đa 1 câu là 1.0 điểm (Đúng 1 ý = 0.1đ; Đúng 2 ý = 0.25đ; Đúng 3 ý = 0.5đ; Đúng 4 ý = 1.0đ).',
    '',
    'Câu 3: Một trường học đang xây dựng mạng cục bộ LAN cho phòng máy tính khảo thí.',
    'a) Mạng LAN của trường học giúp các máy trạm kết nối và truyền dữ liệu bài thi nội bộ với tốc độ cao.',
    'b) Khi không có kết nối Internet ra bên ngoài, các máy trạm trong phòng máy không thể nộp bài thi về máy chủ giáo viên.',
    'c) Địa chỉ IP 192.168.1.13 là địa chỉ IP hợp lệ thuộc dải mạng riêng cục bộ (Private IP).',
    'd) Thiết bị Switch dùng để kết nối các máy tính trong cùng một phòng máy.',
    'Đáp án: a - Đ, b - S, c - Đ, d - Đ',
    '',
    'Câu 4: Về an toàn thông tin và bảo mật dữ liệu trong kỳ thi tin học trên máy tính:',
    '*a) Việc khóa màn hình và ngăn chuyển tab giúp giảm thiểu tối đa hành vi gian lận của thí sinh.',
    'b) Thí sinh được phép tự do cắm USB vào máy trạm để sao chép dữ liệu trong suốt thời gian làm bài.',
    '*c) Bài làm của thí sinh được tự động đồng bộ liên tục về máy chủ theo thời gian thực để chống mất bài khi sự cố điện.',
    '*d) Mỗi thí sinh chỉ được phép đăng nhập làm bài trên 1 máy tính duy nhất trong suốt ca thi.',
    '',
    'PHẦN III. TỰ LUẬN',
    'Thí sinh làm bài tự luận trực tiếp vào phần mềm. (Tổng điểm: 2.0 điểm)',
    '',
    'Câu 5 (Tự luận): Phân tích các ưu điểm của việc tổ chức thi trắc nghiệm trên mạng LAN nội bộ so với thi trực tuyến qua Internet. Nêu ít nhất 3 ưu điểm nổi bật. (2.0 điểm)',
    'Barem:',
    '- Tốc độ truy xuất cao và ổn định, độ trễ cực thấp trong mạng dây 100Mbps/1Gbps (0.5đ)',
    '- Bảo mật cao, cô lập hoàn toàn với mạng xã hội và Google tra cứu tài liệu (1.0đ)',
    '- Độc lập đường truyền Internet, không lo sự cố đứt cáp quang biển (0.5đ)'
  ];

  const paragraphsXml = lines.map(line => {
    const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<w:p><w:r><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
  }).join('');

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraphsXml}
  </w:body>
</w:document>`;

  zip.file('word/document.xml', docXml);

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });

  // Save to root directory
  const rootPath = path.resolve(__dirname, '../../..', 'Mau_De_Thi_Chuan_BGDDT_2025.docx');
  fs.writeFileSync(rootPath, buffer);

  // Save to server public/templates directory for direct web downloading
  const publicTemplatesDir = path.resolve(__dirname, '../../public/templates');
  if (!fs.existsSync(publicTemplatesDir)) {
    fs.mkdirSync(publicTemplatesDir, { recursive: true });
  }
  const publicPath = path.join(publicTemplatesDir, 'Mau_De_Thi_Chuan_BGDDT_2025.docx');
  fs.writeFileSync(publicPath, buffer);

  console.log('Template generated at:', rootPath);
  console.log('Template generated at:', publicPath);
  return { rootPath, publicPath, buffer };
}

module.exports = { generateOfficialWordTemplate };

if (require.main === module) {
  generateOfficialWordTemplate().catch(console.error);
}
