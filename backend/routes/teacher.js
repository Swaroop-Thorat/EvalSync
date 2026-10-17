const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const PlagiarismReport = require('../models/PlagiarismReport');
const User = require('../models/User');
const Class = require('../models/Class');
const { uploadBuffer, cloudinary } = require('../utils/cloudinary');
const { cosineSimilarity, generatePairs } = require('../utils/similarity');

const router = express.Router();


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, 
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed!'), false);
    }
  }
});


router.get('/divisions', async (req, res) => {
  try {
    const teacher = await User.findById(req.user.id).populate('divisions', 'className division');
    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }
    return res.status(200).json(teacher.divisions || []);
  } catch (error) {
    console.error('Get teacher divisions error:', error);
    return res.status(500).json({ message: 'Error fetching divisions' });
  }
});


router.post('/', upload.single('file'), async (req, res) => {
  try {
    const { title, subject, topic, targetDivisions, deadline, plagiarismThreshold } = req.body;


    if (!req.file) {
      return res.status(400).json({ message: 'Assignment PDF file is required.' });
    }

    if (!title || !subject || !topic || !targetDivisions || !deadline) {
      return res.status(400).json({ message: 'Title, subject, topic, targetDivisions, and deadline are required.' });
    }

    
    let parsedDivisions = [];
    if (Array.isArray(targetDivisions)) {
      parsedDivisions = targetDivisions;
    } else if (typeof targetDivisions === 'string') {
      try {
        parsedDivisions = JSON.parse(targetDivisions);
      } catch (_) {
        parsedDivisions = targetDivisions.split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    if (!parsedDivisions.length) {
      return res.status(400).json({ message: 'At least one target division is required.' });
    }

    
    const teacher = await User.findById(req.user.id);
    const teacherDivIds = (teacher.divisions || []).map(id => id.toString());

    for (const dId of parsedDivisions) {
      if (!teacherDivIds.includes(dId.toString())) {
        return res.status(403).json({ message: `Teacher is not authorized to assign work to division ${dId}` });
      }
    }

    const cloudinaryResult = await uploadBuffer(req.file.buffer, 'evalsync_assignments');

    let assignment;
    try {
      assignment = await Assignment.create({
        title: title.trim(),
        subject: subject.trim(),
        topic: topic.trim(),
        teacherId: req.user.id,
        targetDivisions: parsedDivisions,
        fileUrl: cloudinaryResult.secure_url,
        cloudinaryPublicId: cloudinaryResult.public_id,
        deadline: new Date(deadline),
        plagiarismThreshold: Number(plagiarismThreshold) || 70
      });
    } catch (createErr) {
      if (cloudinaryResult && cloudinaryResult.public_id) {
        await cloudinary.uploader.destroy(cloudinaryResult.public_id).catch(() => {});
      }
      throw createErr;
    }

    const populatedAssignment = await Assignment.findById(assignment._id)
      .populate('targetDivisions', 'className division')
      .populate('teacherId', 'name email');

    return res.status(201).json(populatedAssignment);
  } catch (error) {
    console.error('Upload assignment error:', error);
    return res.status(500).json({ message: error.message || 'Error uploading assignment' });
  }
});


router.get('/', async (req, res) => {
  try {
    const { divisionId } = req.query;
    const query = { teacherId: req.user.id };


    if (divisionId) {
      query.targetDivisions = divisionId;
    }

    const assignments = await Assignment.find(query)
      .populate('targetDivisions', 'className division')
      .sort({ uploadedAt: -1 });

    return res.status(200).json(assignments);
  } catch (error) {
    console.error('List teacher assignments error:', error);
    return res.status(500).json({ message: 'Error fetching assignments' });
  }
});




router.get('/:id/submissions', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid assignment ID.' });
    }

    
    const assignment = await Assignment.findById(id);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found.' });
    }
    if (assignment.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to view submissions for this assignment.' });
    }

    const submissions = await Submission.find({ assignmentId: id })
      .select('-embedding')
      .populate('studentId', 'name email classId divisionId')
      .sort({ submittedAt: -1 });

    return res.status(200).json(submissions);
  } catch (error) {
    console.error('List submissions error:', error);
    return res.status(500).json({ message: 'Error fetching submissions' });
  }
});


router.post('/:id/check-plagiarism', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid assignment ID.' });
    }

    
    const assignment = await Assignment.findById(id);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found.' });
    }
    if (assignment.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to run plagiarism check on this assignment.' });
    }

    
    const submissions = await Submission.find({ assignmentId: id })
      .select('studentId embedding');

    if (submissions.length < 2) {
      return res.status(400).json({
        message: `Need at least 2 submissions to run plagiarism check. Currently ${submissions.length}.`
      });
    }

    
    const allPairs = generatePairs(submissions);

    const threshold = assignment.plagiarismThreshold / 100; 

    
    const flaggedStudentIds = new Set();
    const reportPairs = allPairs.map(p => {
      const flagged = p.score >= threshold;
      if (flagged) {
        flaggedStudentIds.add(p.studentA);
        flaggedStudentIds.add(p.studentB);
      }
      return {
        studentA: p.studentA,
        studentB: p.studentB,
        score: Math.round(p.score * 100), 
        flagged
      };
    });

    
    
    await Submission.updateMany(
      { assignmentId: id },
      { $set: { status: 'submitted' } }
    );

    
    if (flaggedStudentIds.size > 0) {
      await Submission.updateMany(
        {
          assignmentId: id,
          studentId: { $in: Array.from(flaggedStudentIds) }
        },
        { $set: { status: 'flagged' } }
      );
    }

    
    const report = await PlagiarismReport.create({
      assignmentId: id,
      pairs: reportPairs,
      generatedAt: new Date()
    });

    
    const updatedSubmissions = await Submission.find({ assignmentId: id })
      .select('-embedding')
      .populate('studentId', 'name email');

    return res.status(200).json({
      report,
      submissions: updatedSubmissions,
      totalPairs: allPairs.length,
      flaggedPairs: reportPairs.filter(p => p.flagged).length,
      threshold: assignment.plagiarismThreshold
    });
  } catch (error) {
    console.error('Plagiarism check error:', error);
    return res.status(500).json({ message: 'Error running plagiarism check' });
  }
});


router.get('/:id/non-submitters', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid assignment ID.' });
    }

    const assignment = await Assignment.findById(id);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found.' });
    }
    if (assignment.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized.' });
    }

    
    const allStudents = await User.find({
      role: 'student',
      divisionId: { $in: assignment.targetDivisions }
    }).select('name email classId divisionId');

    
    const submittedStudentIds = await Submission.find({ assignmentId: id })
      .distinct('studentId');

    const submittedSet = new Set(submittedStudentIds.map(id => id.toString()));

    
    const nonSubmitters = allStudents.filter(s => !submittedSet.has(s._id.toString()));

    return res.status(200).json({
      total: allStudents.length,
      submitted: submittedStudentIds.length,
      nonSubmitters
    });
  } catch (error) {
    console.error('Non-submitters error:', error);
    return res.status(500).json({ message: 'Error fetching non-submitters' });
  }
});


router.get('/:id/plagiarism-reports', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid assignment ID.' });
    }

    const assignment = await Assignment.findById(id);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found.' });
    }
    if (assignment.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized.' });
    }

    const reports = await PlagiarismReport.find({ assignmentId: id })
      .populate('pairs.studentA', 'name email')
      .populate('pairs.studentB', 'name email')
      .sort({ generatedAt: -1 });

    return res.status(200).json(reports);
  } catch (error) {
    console.error('Plagiarism reports error:', error);
    return res.status(500).json({ message: 'Error fetching plagiarism reports' });
  }
});


router.get('/:id/diff', async (req, res) => {
  try {
    const { id } = req.params;
    const { studentA, studentB } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid assignment ID.' });
    }

    if (!studentA || !studentB || !mongoose.Types.ObjectId.isValid(studentA) || !mongoose.Types.ObjectId.isValid(studentB)) {
      return res.status(400).json({ message: 'Valid studentA and studentB query parameters are required.' });
    }

    const assignment = await Assignment.findById(id);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found.' });
    }
    if (assignment.teacherId.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to view diff for this assignment.' });
    }

    const submissionA = await Submission.findOne({ assignmentId: id, studentId: studentA })
      .select('extractedText studentId assignmentId fileUrl')
      .populate('studentId', 'name email');

    const submissionB = await Submission.findOne({ assignmentId: id, studentId: studentB })
      .select('extractedText studentId assignmentId fileUrl')
      .populate('studentId', 'name email');

    if (!submissionA || !submissionB) {
      return res.status(404).json({ message: 'Submissions for one or both students not found for this assignment.' });
    }

    return res.status(200).json({
      assignment: {
        _id: assignment._id,
        title: assignment.title,
        subject: assignment.subject,
        topic: assignment.topic
      },
      submissionA: {
        _id: submissionA._id,
        student: submissionA.studentId,
        extractedText: submissionA.extractedText,
        fileUrl: submissionA.fileUrl
      },
      submissionB: {
        _id: submissionB._id,
        student: submissionB.studentId,
        extractedText: submissionB.extractedText,
        fileUrl: submissionB.fileUrl
      }
    });
  } catch (error) {
    console.error('Diff error:', error);
    return res.status(500).json({ message: 'Error fetching diff data' });
  }
});

module.exports = router;
