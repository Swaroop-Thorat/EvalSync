const express = require('express');
const mongoose = require('mongoose');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const { generateVivaQuestions, checkRelevance, detectAiLikelihood, analyzeStylisticPatterns } = require('../utils/aiSuggest');

const router = express.Router();


router.post('/suggest-questions', async (req, res) => {
  try {
    const { assignmentId, submissionId } = req.body;

    if (!assignmentId || !mongoose.Types.ObjectId.isValid(assignmentId)) {
      return res.status(400).json({ message: 'Valid assignmentId is required.' });
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found.' });
    }

    if (assignment.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized for this assignment.' });
    }

    let studentText = '';
    let studentName = 'General Assignment Context';

    if (submissionId) {
      if (!mongoose.Types.ObjectId.isValid(submissionId)) {
        return res.status(400).json({ message: 'Invalid submissionId.' });
      }
      const sub = await Submission.findById(submissionId).populate('studentId', 'name email');
      if (sub) {
        studentText = sub.extractedText || '';
        studentName = sub.studentId?.name || 'Student';
      }
    } else {
      
      const sub = await Submission.findOne({ assignmentId }).populate('studentId', 'name email');
      if (sub) {
        studentText = sub.extractedText || '';
        studentName = sub.studentId?.name || 'Student';
      }
    }

    const questions = await generateVivaQuestions(assignment.title, assignment.topic, studentText);

    return res.status(200).json({
      assignment: {
        _id: assignment._id,
        title: assignment.title,
        topic: assignment.topic
      },
      studentName,
      questions
    });
  } catch (error) {
    console.error('Suggest questions error:', error);
    return res.status(500).json({ message: error.message || 'Error generating AI questions' });
  }
});


router.post('/check-relevance', async (req, res) => {
  try {
    const { assignmentId, submissionId } = req.body;

    if (!assignmentId || !mongoose.Types.ObjectId.isValid(assignmentId) || !submissionId || !mongoose.Types.ObjectId.isValid(submissionId)) {
      return res.status(400).json({ message: 'Valid assignmentId and submissionId are required.' });
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found.' });
    }

    if (assignment.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized for this assignment.' });
    }

    const submission = await Submission.findById(submissionId).populate('studentId', 'name email');
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found.' });
    }

    const result = await checkRelevance(assignment.title, assignment.topic, submission.extractedText);

    return res.status(200).json({
      assignment: {
        _id: assignment._id,
        title: assignment.title,
        topic: assignment.topic
      },
      student: submission.studentId,
      relevance: result
    });
  } catch (error) {
    console.error('Check relevance error:', error);
    return res.status(500).json({ message: error.message || 'Error checking content relevance' });
  }
});


const detectionCache = new Map();


router.post('/detect-ai', async (req, res) => {
  try {
    const { submissionId } = req.body;

    if (!submissionId || !mongoose.Types.ObjectId.isValid(submissionId)) {
      return res.status(400).json({ message: 'Valid submissionId is required.' });
    }

    const submission = await Submission.findById(submissionId).populate('studentId', 'name email').populate('assignmentId', 'title teacherId');
    if (!submission) {
      return res.status(404).json({ message: 'Submission not found.' });
    }

    if (submission.assignmentId.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized for this submission.' });
    }

    const subIdStr = submission._id.toString();

    
    if (detectionCache.has(subIdStr)) {
      const cached = detectionCache.get(subIdStr);
      return res.status(200).json({
        ...cached,
        cached: true
      });
    }

    if (submission.gptzeroResult && !submission.gptzeroResult.limitReached && submission.gptzeroResult.aiProbability !== null) {
      detectionCache.set(subIdStr, submission.gptzeroResult);
      return res.status(200).json({
        ...submission.gptzeroResult,
        cached: true
      });
    }

    
    const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!geminiKey) {
      return res.status(200).json({
        submissionId: submission._id,
        student: submission.studentId,
        provider: 'Gemini AI Detector',
        limitReached: true,
        warning: 'GEMINI_API_KEY not configured in backend environment.',
        aiProbability: null,
        verdict: 'Service Unconfigured',
        label: 'AI-Likelihood Estimate Unavailable',
        disclaimer: 'Detection unavailable.'
      });
    }

    try {
      const aiDetection = await detectAiLikelihood(submission.extractedText || '');

      const result = {
        submissionId: submission._id,
        student: submission.studentId,
        provider: aiDetection.provider || 'Gemini AI Detector',
        limitReached: false,
        aiProbability: aiDetection.aiProbability,
        label: aiDetection.label,
        verdict: aiDetection.verdict,
        disclaimer: aiDetection.isFallback
          ? 'Score generated via EvalSync stylistic analysis (Gemini standby mode). This is an advisory estimate and not proof of AI authorship.'
          : 'This score is a statistical AI-likelihood estimate powered by Google Gemini and does NOT constitute definitive proof of AI authorship or academic misconduct.',
        data: {
          explanation: aiDetection.explanation
        }
      };

      
      detectionCache.set(subIdStr, result);
      await Submission.findByIdAndUpdate(submission._id, { $set: { gptzeroResult: result } }).catch(e => console.warn('Could not persist cache to DB:', e.message));

      return res.status(200).json(result);
    } catch (detErr) {
      console.warn('Gemini detection error, engaging stylistic fallback:', detErr.message);
      const fallback = analyzeStylisticPatterns(submission.extractedText || '');
      const fallbackResult = {
        submissionId: submission._id,
        student: submission.studentId,
        provider: 'EvalSync Stylistic Analyzer (Standby)',
        limitReached: false,
        aiProbability: fallback.aiProbability,
        label: fallback.label,
        verdict: fallback.verdict,
        disclaimer: 'Score generated via EvalSync stylistic analysis (Gemini quota standby). This is an advisory estimate and not proof of AI authorship.',
        data: {
          explanation: fallback.explanation
        }
      };
      detectionCache.set(subIdStr, fallbackResult);
      return res.status(200).json(fallbackResult);
    }
  } catch (error) {
    console.error('Detect AI error:', error);
    return res.status(500).json({ message: error.message || 'Error running AI detection' });
  }
});

module.exports = router;
