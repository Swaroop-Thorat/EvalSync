const express = require('express');
const multer = require('multer');
const mongoose = require('mongoose');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const User = require('../models/User');
const { uploadBuffer, cloudinary } = require('../utils/cloudinary');
const extractText = require('../utils/extractText');
const generateEmbedding = require('../utils/embeddings');

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


router.get('/assignments', async (req, res) => {
  try {
    const student = await User.findById(req.user.id);
    if (!student || !student.divisionId) {
      return res.status(400).json({ message: 'Student division not configured' });
    }

    const assignments = await Assignment.find({
      targetDivisions: student.divisionId
    })
      .populate('teacherId', 'name email')
      .populate('targetDivisions', 'className division')
      .sort({ uploadedAt: -1 });

    return res.status(200).json(assignments);
  } catch (error) {
    console.error('Get student assignments error:', error);
    return res.status(500).json({ message: 'Error fetching assignments' });
  }
});


router.post(['/', '/submissions'], upload.single('file'), async (req, res) => {
  try {
    const { assignmentId } = req.body;

    const studentId = req.user.id;

    if (!req.file) {
      return res.status(400).json({ message: 'Submission PDF file is required.' });
    }

    if (!assignmentId || !mongoose.Types.ObjectId.isValid(assignmentId)) {
      return res.status(400).json({ message: 'Valid assignmentId is required.' });
    }

    const existingSubmission = await Submission.findOne({
      assignmentId,
      studentId
    });

    if (existingSubmission) {
      return res.status(400).json({ message: 'Already submitted.' });
    }

    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({ message: 'Assignment not found.' });
    }

    const student = await User.findById(studentId);
    const targetDivisionStrings = assignment.targetDivisions.map(d => d.toString());
    if (!targetDivisionStrings.includes(student.divisionId.toString())) {
      return res.status(403).json({ message: 'This assignment was not targeted at your division.' });
    }

    let plainText = '';
    try {
      plainText = await extractText(req.file.buffer);
    } catch (extractErr) {
      console.error('ExtractText failed:', extractErr);
      return res.status(500).json({ message: 'Failed to extract text from PDF. Ensure PDF contains readable text.' });
    }

    let embeddingVector = [];
    try {
      embeddingVector = await generateEmbedding(plainText);
    } catch (embedErr) {
      console.error('GenerateEmbedding failed:', embedErr);
      return res.status(500).json({ message: 'Failed to generate vector embedding from submission text.' });
    }

    let cloudinaryResult = null;
    try {
      cloudinaryResult = await uploadBuffer(req.file.buffer, 'evalsync_submissions');
    } catch (uploadErr) {
      console.error('UploadBuffer failed:', uploadErr);
      return res.status(500).json({ message: 'Failed to upload PDF file.' });
    }

    let newSubmission;
    try {
      newSubmission = await Submission.create({
        assignmentId,
        studentId,
        fileUrl: cloudinaryResult.secure_url,
        cloudinaryPublicId: cloudinaryResult.public_id,
        extractedText: plainText,
        embedding: embeddingVector,
        status: 'submitted',
        submittedAt: new Date()
      });
    } catch (createErr) {
      if (cloudinaryResult && cloudinaryResult.public_id) {
        await cloudinary.uploader.destroy(cloudinaryResult.public_id).catch(() => {});
      }
      throw createErr;
    }

    const submissionObj = newSubmission.toObject();
    delete submissionObj.embedding;

    return res.status(201).json(submissionObj);
  } catch (error) {
    console.error('Submission upload error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Already submitted.' });
    }
    return res.status(500).json({ message: error.message || 'Error processing submission' });
  }
});


router.get('/submissions/mine', async (req, res) => {
  try {
    const submissions = await Submission.find({ studentId: req.user.id })
      .select('-embedding')
      .populate('assignmentId', 'title subject topic deadline')
      .sort({ submittedAt: -1 });

    return res.status(200).json(submissions);
  } catch (error) {
    console.error('List student submissions error:', error);
    return res.status(500).json({ message: 'Error fetching submissions' });
  }
});


router.get('/history', async (req, res) => {
  try {
    const student = await User.findById(req.user.id);
    if (!student) {
      return res.status(404).json({ message: 'Student not found.' });
    }

    
    const submissions = await Submission.find({ studentId: req.user.id })
      .select('-embedding')
      .populate({
        path: 'assignmentId',
        select: 'title subject topic deadline plagiarismThreshold teacherId',
        populate: {
          path: 'teacherId',
          select: 'name email'
        }
      })
      .sort({ submittedAt: -1 });

    
    const allAssignments = await Assignment.find({
      targetDivisions: student.divisionId
    })
      .populate('teacherId', 'name email')
      .sort({ deadline: -1 });

    const submittedAssignmentIds = new Set(submissions.map(s => s.assignmentId?._id?.toString()));

    const pendingAssignments = allAssignments.filter(a => !submittedAssignmentIds.has(a._id.toString()));

    return res.status(200).json({
      student: {
        _id: student._id,
        name: student.name,
        email: student.email,
        classId: student.classId,
        divisionId: student.divisionId
      },
      submissions,
      pendingAssignments,
      totalAssigned: allAssignments.length,
      totalSubmitted: submissions.length,
      totalPending: pendingAssignments.length
    });
  } catch (error) {
    console.error('Student history error:', error);
    return res.status(500).json({ message: 'Error fetching student history' });
  }
});

module.exports = router;
