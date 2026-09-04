const examService = require('./src/services/examService');
const wordExamParser = require('./src/services/wordExamParser');

async function test() {
  console.log('--- 1. TESTING WORD PARSER ---');
  const sampleWordText = `ĐỀ KIỂM TRA TIN HỌC LỚP 10
Câu 1: Thiết bị nào sau đây là thiết bị vào?
A. Màn hình
*B. Bàn phím
C. Máy in
D. Loa

Câu 2: Hệ điều hành Windows là loại phần mềm gì?
A. Phần mềm ứng dụng
B. Phần mềm tiện ích
*C. Phần mềm hệ thống
D. Phần mềm độc hại

PHẦN II. TỰ LUẬN
Câu 3 (Tự luận): Trình bày sự khác nhau giữa RAM và ROM. (2.5 điểm)
Barem:
- RAM: Bộ nhớ truy cập ngẫu nhiên, dữ liệu bị mất khi mất điện (1.25đ)
- ROM: Bộ nhớ chỉ đọc, dữ liệu không mất khi mất điện (1.25đ)

Câu 4 (Tự luận): Nêu các biện pháp an toàn khi sử dụng mạng Internet tại trường học. (2.5 điểm)
Barem:
- Không chia sẻ mật khẩu cá nhân (1.0đ)
- Không truy cập trang web độc hại (1.5đ)
`;

  const parsed = wordExamParser.parseExamText(sampleWordText);
  console.log('Exam Title:', parsed.title);
  console.log('Total Questions Detected:', parsed.total_questions);
  console.log('Q1:', parsed.questions[0].question_type, 'Options:', parsed.questions[0].options.length, 'Correct:', parsed.questions[0].correct_answers);
  console.log('Q2:', parsed.questions[1].question_type, 'Correct:', parsed.questions[1].correct_answers);
  console.log('Q3 (Essay):', parsed.questions[2].question_type, 'Score:', parsed.questions[2].max_score, 'Rubric length:', parsed.questions[2].rubric_guide.length);
  console.log('Q4 (Essay):', parsed.questions[3].question_type, 'Score:', parsed.questions[3].max_score);

  console.log('\n--- 2. CREATING EXAM WITH PARSED QUESTIONS ---');
  const createdExam = examService.createExam({
    title: parsed.title,
    subject: 'Tin Học',
    total_score: 10.0,
    shuffle_questions: 1,
    shuffle_options: 1,
    questions: parsed.questions
  });
  console.log('Created exam with ID:', createdExam.id, 'Total questions:', createdExam.questions.length);

  console.log('\n--- 3. TESTING UNSHUFFLED ESSAY ACROSS 5 STUDENT PAPERS ---');
  for (let i = 1; i <= 5; i++) {
    const studentPaper = examService.generateStudentExamPaper(createdExam.id, true, true);
    const questionSequence = studentPaper.questions.map(q => `[Câu ${q.display_order}: ${q.question_type === 'essay' ? 'Tự Luận - ' + q.content.slice(0, 20) : 'Trắc Nghiệm - ' + q.content.slice(0, 20)}]`);
    console.log(`Student ${i} Paper:`);
    questionSequence.forEach(line => console.log('   ', line));

    // Verify: The last 2 questions MUST be the exact 2 essay questions in exact order!
    const q3 = studentPaper.questions[2];
    const q4 = studentPaper.questions[3];
    if (q3.question_type !== 'essay' || !q3.content.includes('RAM') ||
        q4.question_type !== 'essay' || !q4.content.includes('Internet')) {
      throw new Error(`Student ${i} essay order violated!`);
    }
  }

  console.log('\n======================================================');
  console.log('>>> VERIFICATION PASSED: ESSAY QUESTIONS REMAIN FIXED IN ORDER! <<<');
  console.log('======================================================');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
