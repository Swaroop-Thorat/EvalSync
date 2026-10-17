const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  assignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assignment',
    required: true
  },
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fileUrl: {
    type: String,
    required: true
  },
  cloudinaryPublicId: {
    type: String,
    required: true
  },
  extractedText: {
    type: String,
    required: true
  },
  embedding: {
    type: [Number],
    required: true
  },
  status: {
    type: String,
    enum: ['submitted', 'flagged'],
    default: 'submitted'
  },
  gptzeroResult: {
    type: Object,
    default: null
  },
  relevanceResult: {
    type: Object,
    default: null
  },
  submittedAt: {
    type: Date,
    default: Date.now
  }
});


submissionSchema.index({ assignmentId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model('Submission', submissionSchema);
