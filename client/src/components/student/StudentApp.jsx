import React, { useState } from 'react';
import StudentLogin from './StudentLogin';
import StudentWaitingRoom from './StudentWaitingRoom';
import StudentExam from './StudentExam';
import StudentResult from './StudentResult';

export default function StudentApp() {
  const [examData, setExamData] = useState(null);
  const [examResult, setExamResult] = useState(null);

  const handleLoginSuccess = (data) => {
    if (data.alreadySubmitted) {
      setExamResult({
        mcq_score: data.attempt.mcq_score,
        essay_score: data.attempt.essay_score,
        total_score: data.attempt.total_score,
        is_graded: data.attempt.is_graded
      });
    } else {
      setExamData(data);
    }
  };

  const handleExamStarted = (updatedData) => {
    setExamData(updatedData);
  };

  const handleExamFinished = (result) => {
    setExamResult(result);
  };

  const handleRestart = () => {
    setExamData(null);
    setExamResult(null);
  };

  if (examResult) {
    return <StudentResult result={examResult} onRestart={handleRestart} />;
  }

  if (examData) {
    // If waiting for teacher to start exam
    if (examData.waitingForTeacher || examData.session?.status === 'waiting') {
      return <StudentWaitingRoom examData={examData} onExamStarted={handleExamStarted} />;
    }
    return <StudentExam examData={examData} onExamFinished={handleExamFinished} />;
  }

  return <StudentLogin onLoginSuccess={handleLoginSuccess} />;
}
