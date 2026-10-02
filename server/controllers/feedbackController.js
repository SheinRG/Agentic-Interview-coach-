import Feedback from '../models/Feedback.js';
import Session from '../models/Session.js';
import { analyseAnswer } from '../services/groqService.js';

/**
 * POST /api/feedback
 * Create feedback for a session by analyzing the answers with AI.
 */
export const createFeedback = async (req, res) => {
  try {
    const { sessionId, answers, questions: submittedQuestions, snapshots } = req.body;

    if (!sessionId || !answers) {
      return res.status(400).json({ message: 'Session ID and answers are required' });
    }

    // Scope by userId so a caller can only grade — and overwrite — their own session.
    const session = await Session.findOne({ _id: sessionId, userId: req.user.userId });
    if (!session) return res.status(404).json({ message: 'Session not found' });

    // Use the frontend's questions array (correct order with follow-ups
    // spliced in and reaction text prepended) if provided,
    // otherwise fall back to the DB's questions.
    const orderedQuestions = (submittedQuestions && submittedQuestions.length > 0)
      ? submittedQuestions
      : session.questions;

    // The two arrays are positionally correlated, so a length mismatch would
    // pair the wrong answer with the wrong question in the transcript.
    if (!Array.isArray(answers) || answers.length !== orderedQuestions.length) {
      return res.status(400).json({ message: 'Answers must align with the session questions' });
    }

    // Save both the correctly-ordered questions and answers to the session
    session.questions = orderedQuestions;
    session.answers = answers;
    await session.save();

    // Combine all questions and answers into a transcript
    let transcript = '';
    for (let i = 0; i < orderedQuestions.length; i++) {
      const ans = answers[i] && answers[i].trim().length > 0 ? answers[i] : '[NO ANSWER PROVIDED BY CANDIDATE / SKIPPED]';
      transcript += `Q: ${orderedQuestions[i]}\nA: ${ans}\n\n`;
    }

    const analysis = await analyseAnswer(transcript, snapshots);

    const feedback = await Feedback.create({
      sessionId,
      userId: req.user.userId,
      scores: {
        clarity: analysis.clarity,
        relevance: analysis.relevance,
        structure: analysis.structure,
        confidence: analysis.confidence,
      },
      fillerWordCount: analysis.fillerWordCount,
      fillerWordsList: analysis.fillerWordsList,
      overallScore: analysis.overallScore,
      feedback: analysis.feedback,
      starFeedback: analysis.starFeedback, // new field
      modelAnswer: analysis.modelAnswer,
    });

    res.status(201).json({ message: 'Feedback generated successfully', feedback });
  } catch (err) {
    console.error('Feedback creation error:', err);
    res.status(500).json({ message: 'Error generating feedback' });
  }
};

/**
 * GET /api/feedback/:sessionId
 * Return feedback for a given session.
 */
export const getFeedbackBySession = async (req, res) => {
  try {
    const feedback = await Feedback.findOne({
      sessionId: req.params.sessionId,
      userId: req.user.userId,
    });
    if (!feedback) return res.status(404).json({ message: 'Feedback not found' });
    res.status(200).json({ feedback });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching feedback' });
  }
};

/**
 * GET /api/feedback/stats
 * Return aggregated feedback stats for readiness score.
 */
export const getFeedbackStats = async (req, res) => {
  try {
    const feedbacks = await Feedback.find({ userId: req.user.userId }).sort({ createdAt: 1 });
    if (!feedbacks.length) {
      return res.status(200).json({ averageScore: 0, trend: [] });
    }

    const trend = feedbacks.map(f => f.overallScore);
    const averageScore = Math.round(trend.reduce((a, b) => a + b, 0) / trend.length);

    res.status(200).json({ averageScore, trend });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching feedback stats' });
  }
};

/**
 * POST /api/feedback/single
 * Target Rep Practice: Analyze a single question and answer.
 */
export const analyzeSingleAnswer = async (req, res) => {
  try {
    const { question, answer } = req.body;
    if (!question || !answer) {
      return res.status(400).json({ message: 'Question and answer are required' });
    }

    const transcript = `Q: ${question}\nA: ${answer}\n\n`;
    const analysis = await analyseAnswer(transcript);

    res.status(200).json({ analysis });
  } catch (err) {
    console.error('analyzeSingleAnswer error:', err);
    res.status(500).json({ message: 'Error analyzing answer' });
  }
};
