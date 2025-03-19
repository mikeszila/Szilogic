const express = require('express');
const router = express.Router();
const passport = require('passport');
const Project = require('../models/Project');
const Company = require('../models/Company');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Store SSE clients
const clients = new Map();

// Apply JWT auth to all routes except SSE (we'll handle it manually)
router.use((req, res, next) => {
  if (req.path.startsWith('/events/')) return next(); // Skip Passport for SSE
  passport.authenticate('jwt', { session: false })(req, res, next);
});

// Create Project
router.post('/', async (req, res) => {
  const { name, companyId } = req.body;
  const company = await Company.findById(companyId);
  if (!company || !company.users.some(u => u.user.equals(req.user._id))) {
    return res.status(403).json({ message: 'Unauthorized' });
  }
  const project = new Project({
    name,
    company: companyId,
    inputDataConfig: [
      { name: 'Name', rules: { type: 'string', startsWith: 'letter' }, enabledIf: { always: true } },
      { name: 'Next', rules: { type: 'string', optional: true }, enabledIf: { always: true } },
      { name: 'Panel', rules: { type: 'string', startsWith: 'letter' }, enabledIf: { field: 'Unit_Type', value: 'Conveyor' } },
      { name: 'Unit_Type', rules: { type: 'enum', values: ['Conveyor', 'System', 'Area', 'Estop_Zone', 'Robot'] }, enabledIf: { always: true } },
      { name: 'Type', rules: { type: 'enum', values: ['Belt', 'Roller Gate', 'Roller Curve', 'Roller', 'Spiral', 'Accumulation'] }, enabledIf: { always: true } },
      { name: 'Power', rules: { type: 'enum', values: ['Starter', 'Gravity', 'MDR', 'VFD'] }, enabledIf: { field: 'Unit_Type', value: 'Conveyor' } },
      { name: 'Run_Type', rules: { type: 'enum', values: ['Transport', 'Gravity', 'Singulate Slug', 'Singulate'] }, enabledIf: { field: 'Unit_Type', value: 'Conveyor' } },
      { name: 'HP', rules: { type: 'number', format: 'X|X.X|X.XX', min: 0 }, enabledIf: { field: 'Power', values: ['Starter', 'VFD'] } },
      { name: 'Length', rules: { type: 'number', min: 1, max: 9999999 }, enabledIf: { field: 'Type', values: ['Belt', 'Roller Gate', 'Roller', 'Accumulation'] } },
      { name: 'FPM', rules: { type: 'number', min: 1, max: 99999 }, enabledIf: { field: 'Power', not: 'Gravity' } },
      { name: 'Disconnect', rules: { type: 'boolean' }, enabledIf: { field: 'Power', values: ['Starter', 'VFD'] } },
      { name: 'Exit_PE', rules: { type: 'boolean' }, enabledIf: { field: 'Unit_Type', value: 'Conveyor' } },
      { name: 'MDR', rules: { type: 'enum', values: ['IBE', 'HB510'] }, enabledIf: { field: 'Power', value: 'MDR' } },
      { name: 'MDR_Zones', rules: { type: 'number', min: 1, max: 99999 }, enabledIf: { field: 'MDR', exists: true } },
      { name: 'MDR_Zone_Length', rules: { type: 'number', min: 1, max: 9999 }, enabledIf: { field: 'MDR', exists: true } },
      { name: 'Curve_Angle', rules: { type: 'number', min: -360, max: 360 }, enabledIf: { field: 'Type', contains: 'Curve' } },
      { name: 'Elevation_In', rules: { type: 'number', min: 0, max: 99999 }, enabledIf: { field: 'Unit_Type', value: 'Conveyor' } },
      { name: 'Elevation_Out', rules: { type: 'number', min: 0, max: 99999 }, enabledIf: { field: 'Unit_Type', value: 'Conveyor' } },
      { name: 'Spiral_Angle', rules: { type: 'number', min: -360, max: 360 }, enabledIf: { field: 'Type', value: 'Spiral' } }
    ],
    inputData: [[]]
  });
  await project.save();
  res.status(201).json(project);
});

// Get Projects by Company ID
router.get('/:companyId', async (req, res) => {
  console.log(`Fetching projects for companyId: ${req.params.companyId}`);
  const { companyId } = req.params;
  if (!companyId || !mongoose.Types.ObjectId.isValid(companyId)) {
    return res.status(400).json({ message: 'Invalid companyId' });
  }
  const projects = await Project.find({ company: companyId, status: { $ne: 'Archived' } });
  res.json(projects);
});

// Update Project Input Data and Config
router.put('/:id/inputData', async (req, res) => {
  console.log(`Updating project ${req.params.id} with data:`, req.body);
  const project = await Project.findById(req.params.id);
  if (!project) return res.status(404).json({ message: 'Project not found' });
  if (req.body.inputData) project.inputData = req.body.inputData;
  if (req.body.inputDataConfig) project.inputDataConfig = req.body.inputDataConfig;
  await project.save();

  const clientsForProject = clients.get(req.params.id) || [];
  console.log(`Broadcasting to ${clientsForProject.length} clients for project ${req.params.id}`);
  clientsForProject.forEach(client => {
    client.res.write(`data: ${JSON.stringify({ projectId: req.params.id, inputData: project.inputData, inputDataConfig: project.inputDataConfig })}\n\n`);
  });

  res.json(project);
});

// Get Project by ID
router.get('/project/:id', async (req, res) => {
  console.log(`Fetching project by ID: ${req.params.id}`);
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid project ID' });
  }
  const project = await Project.findById(id);
  if (!project) {
    return res.status(404).json({ message: 'Project not found' });
  }
  res.json(project);
});

// SSE Endpoint for Real-Time Updates
router.get('/events/:projectId', async (req, res) => {
  const projectId = req.params.projectId;
  console.log(`SSE connection requested for projectId: ${projectId}`);
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    console.log(`Invalid projectId: ${projectId}`);
    return res.status(400).json({ message: 'Invalid project ID' });
  }

  // Manual JWT verification from query parameter
  const token = req.query.token;
  if (!token) {
    console.log(`No token provided for SSE connection to ${projectId}`);
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(`Token verified for user: ${decoded.id} on project ${projectId}`);
  } catch (err) {
    console.log(`Invalid token for SSE connection to ${projectId}:`, err.message);
    return res.status(401).json({ message: 'Invalid token' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const client = { id: Date.now(), res };
  if (!clients.has(projectId)) clients.set(projectId, []);
  clients.get(projectId).push(client);
  console.log(`Client ${client.id} added to project ${projectId}, total clients: ${clients.get(projectId).length}`);

  req.on('close', () => {
    const projectClients = clients.get(projectId);
    clients.set(projectId, projectClients.filter(c => c.id !== client.id));
    console.log(`Client ${client.id} disconnected from project ${projectId}, remaining clients: ${clients.get(projectId).length}`);
  });
});

module.exports = router;