const mongoose = require('mongoose');

const pairSchema = new mongoose.Schema({
  studentA: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  studentB: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  score: {
    type: Number,
    required: true
  },
  flagged: {
    type: Boolean,
    required: true
  }
}, { _id: false });

const plagiarismReportSchema = new mongoose.Schema({
  assignmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assignment',
    required: true
  },
  generatedAt: {
    type: Date,
    default: Date.now
  },
  pairs: [pairSchema]
});

module.exports = mongoose.model('PlagiarismReport', plagiarismReportSchema);
