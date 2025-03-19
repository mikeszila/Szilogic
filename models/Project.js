const mongoose = require('mongoose');

const ProjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  description: String,
  startDate: Date,
  status: { type: String, enum: ['Active', 'Completed', 'Archived'], default: 'Active' },
  inputDataConfig: [{
    name: String,
    rules: { type: Object }, // e.g., { type: 'string', startsWith: 'letter' }
    enabledIf: { type: Object } // e.g., { field: 'Unit_Type', value: 'Conveyor' }
  }],
  inputData: [[String]], // 2D array for spreadsheet data
  restorePoints: [{ data: [[String]], createdAt: Date }]
});

module.exports = mongoose.model('Project', ProjectSchema);