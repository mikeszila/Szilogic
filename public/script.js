let token, user, companyId, projectId, inputData = [], undoStack = [], redoStack = [];
const headers = [
  'Name', 'Next', 'Panel', 'Unit_Type', 'Type', 'Power', 'Run_Type', 'HP', 'Length', 'FPM',
  'Disconnect', 'Exit_PE', 'MDR', 'MDR_Zones', 'MDR_Zone_Length', 'Curve_Angle', 'Elevation_In', 'Elevation_Out', 'Spiral_Angle'
];

// Default config if missing from server response
const defaultInputDataConfig = [
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
];

// Function definitions
async function fetchUserData() {
  console.log('Starting fetchUserData with token:', token);
  try {
    const res = await fetch('/api/auth/me', { 
      headers: { Authorization: `Bearer ${token}` },
      method: 'GET'
    });
    console.log('Fetch completed, status:', res.status, 'ok:', res.ok);
    const text = await res.text();
    console.log('Raw /me response:', text);
    console.log('Response headers:', Object.fromEntries(res.headers.entries()));
    if (!res.ok) {
      console.error('Fetch user data failed with status:', res.status);
      throw new Error('Invalid token');
    }
    try {
      user = JSON.parse(text);
      console.log('Parsed user data:', user);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr, 'Raw text:', text);
      throw parseErr;
    }
    document.getElementById('username').textContent = user.username;
    await loadCompanies();
  } catch (err) {
    console.error('fetchUserData error:', err);
    throw err;
  }
}

async function loadCompanies() {
  console.log('Loading companies...');
  try {
    const res = await fetch('/api/company', { headers: { Authorization: `Bearer ${token}` } });
    const text = await res.text();
    console.log('Raw companies response:', text);
    if (!res.ok) {
      console.error('Fetch companies failed with status:', res.status);
      throw new Error('Failed to load companies');
    }
    const companies = JSON.parse(text);
    const select = document.getElementById('company-select');
    if (!Array.isArray(companies) || companies.length === 0) {
      select.innerHTML = '<option value="">No companies found</option>';
      companyId = null;
      console.log('No companies available');
      return;
    }
    select.innerHTML = companies.map(c => `<option value="${c._id}">${c.name}</option>`).join('');
    companyId = select.value;
    select.addEventListener('change', () => {
      companyId = select.value;
      loadProjects();
    });
    await loadProjects();
  } catch (err) {
    console.error('loadCompanies error:', err);
    throw err;
  }
}

async function loadProjects() {
  console.log('Loading projects for companyId:', companyId);
  if (!companyId) {
    console.log('No company selected, skipping loadProjects');
    const select = document.getElementById('project-select');
    select.innerHTML = '<option value="">No projects (select a company)</option>';
    return;
  }
  try {
    const res = await fetch(`/api/project/${companyId}`, { headers: { Authorization: `Bearer ${token}` } });
    const text = await res.text();
    console.log('Raw projects response:', text);
    if (!res.ok) {
      console.error('Fetch projects failed with status:', res.status);
      throw new Error('Failed to load projects');
    }
    const projects = JSON.parse(text);
    const select = document.getElementById('project-select');
    if (!Array.isArray(projects)) {
      console.error('Projects response is not an array:', projects);
      select.innerHTML = '<option value="">Error loading projects</option>';
      return;
    }
    select.innerHTML = projects.map(p => `<option value="${p._id}">${p.name}</option>`).join('');
    projectId = select.value;
    select.addEventListener('change', () => {
      projectId = select.value;
      loadInputData();
      setupSSE();
    });
    await loadInputData();
    setupSSE();
  } catch (err) {
    console.error('loadProjects error:', err);
    throw err;
  }
}

async function loadInputData() {
  console.log('Loading input data for projectId:', projectId);
  if (!projectId) {
    console.log('No project selected, skipping loadInputData');
    return;
  }
  try {
    const res = await fetch(`/api/project/project/${projectId}`, { headers: { Authorization: `Bearer ${token}` } });
    const text = await res.text();
    console.log('Raw project input data response:', text);
    if (!res.ok) {
      console.error('Fetch project input data failed with status:', res.status);
      throw new Error('Failed to load project input data');
    }
    const project = JSON.parse(text);
    inputData = Array.isArray(project.inputData) ? project.inputData : [[]];
    console.log('Loaded inputData:', inputData);
    const config = Array.isArray(project.inputDataConfig) ? project.inputDataConfig : defaultInputDataConfig;
    headers.length = 0;
    headers.push(...config.map(c => c.name));
    renderTable(config);
    return config;
  } catch (err) {
    console.error('loadInputData error:', err);
    throw err;
  }
}

async function createCompany() {
  const name = document.getElementById('company-name').value.trim();
  if (!name) {
    alert('Company name is required');
    return;
  }
  try {
    const res = await fetch('/api/company', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ name })
    });
    const text = await res.text();
    console.log('Create company response:', text);
    if (!res.ok) {
      const data = JSON.parse(text);
      throw new Error(data.message || 'Failed to create company');
    }
    closeCompanyModal();
    await loadCompanies();
  } catch (err) {
    console.error('createCompany error:', err);
    alert(err.message);
  }
}

async function createProject() {
  const name = document.getElementById('project-name').value.trim();
  if (!name) {
    alert('Project name is required');
    return;
  }
  if (!companyId) {
    alert('Please select a company first');
    return;
  }
  try {
    const res = await fetch('/api/project', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`, 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ name, companyId })
    });
    const text = await res.text();
    console.log('Create project response:', text);
    if (!res.ok) {
      const data = JSON.parse(text);
      throw new Error(data.message || 'Failed to create project');
    }
    closeProjectModal();
    await loadProjects();
  } catch (err) {
    console.error('createProject error:', err);
    alert(err.message);
  }
}

function renderTable(config) {
  const table = document.getElementById('input-data');
  table.innerHTML = '';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  inputData.forEach((row, i) => {
    const tr = document.createElement('tr');
    tr.dataset.rowIndex = i; // Store row index for context menu
    headers.forEach((header, j) => {
      const td = document.createElement('td');
      td.contentEditable = true;
      td.textContent = row[j] || '';
      td.addEventListener('focus', () => undoStack.push([...inputData]));
      td.addEventListener('blur', () => updateCell(i, j, td.textContent, config));
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  validateAndEnable(config);

  // Context menu setup
  table.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const row = e.target.closest('tr');
    if (!row) return;
    const rowIndex = parseInt(row.dataset.rowIndex);
    const menu = document.getElementById('context-menu');
    menu.style.top = `${e.pageY}px`;
    menu.style.left = `${e.pageX}px`;
    menu.classList.remove('hidden');
    menu.dataset.rowIndex = rowIndex;
  });
}

function updateCell(row, col, value, config) {
  inputData[row][col] = value;
  validateAndEnable(config);
  saveAndBroadcast(row, col, value);
}

async function saveAndBroadcast(row, col, value) {
  if (!projectId) return;
  try {
    const res = await fetch(`/api/project/${projectId}/inputData`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputData })
    });
    const text = await res.text();
    console.log('Save and broadcast response:', text);
    if (!res.ok) {
      const data = JSON.parse(text);
      throw new Error(data.message || 'Failed to save data');
    }
  } catch (err) {
    console.error('saveAndBroadcast error:', err);
    alert(err.message);
  }
}

function validateAndEnable(config) {
  const table = document.getElementById('input-data');
  inputData.forEach((row, i) => {
    row.forEach((cell, j) => {
      const td = table.rows[i + 1]?.cells[j];
      if (!td) return;
      const colConfig = config[j];
      const isEnabled = colConfig.enabledIf.always || checkCondition(row, colConfig.enabledIf);
      td.className = isEnabled ? validateCell(cell, colConfig.rules) ? '' : 'invalid' : 'disabled';
      if (!isEnabled) inputData[i][j] = '';
    });
  });
}

function checkCondition(row, condition) {
  if (!condition.field) return false;
  const colIdx = headers.indexOf(condition.field);
  const value = row[colIdx];
  if (condition.value) return value === condition.value;
  if (condition.values) return condition.values.includes(value);
  if (condition.not) return value !== condition.not;
  if (condition.contains) return value.includes(condition.contains);
  if (condition.exists) return !!value;
  return false;
}

function validateCell(value, rules) {
  if (rules.optional && !value) return true;
  if (rules.type === 'string' && rules.startsWith === 'letter') return /^[a-zA-Z]/.test(value);
  if (rules.type === 'enum') return rules.values.includes(value);
  if (rules.type === 'number') {
    const num = parseFloat(value);
    return !isNaN(num) && num >= (rules.min || -Infinity) && num <= (rules.max || Infinity);
  }
  if (rules.type === 'boolean') return ['true', 'false'].includes(value.toLowerCase());
  return true;
}

async function saveData() {
  console.log('Saving data for projectId:', projectId, 'inputData:', inputData);
  if (!projectId) {
    alert('Please select a project to save');
    return;
  }
  try {
    document.getElementById('progress').classList.remove('hidden');
    const res = await fetch(`/api/project/${projectId}/inputData`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputData })
    });
    const text = await res.text();
    console.log('Save data response:', text);
    if (!res.ok) {
      const data = JSON.parse(text);
      throw new Error(data.message || 'Failed to save data');
    }
    document.getElementById('progress').classList.add('hidden');
  } catch (err) {
    console.error('saveData error:', err);
    alert(err.message);
    document.getElementById('progress').classList.add('hidden');
  }
}

function setupSSE() {
  if (!projectId) return;
  console.log(`Setting up SSE for projectId: ${projectId}`);
  const source = new EventSource(`/api/project/events/${projectId}?token=${token}`);
  source.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.projectId === projectId && JSON.stringify(data.inputData) !== JSON.stringify(inputData)) {
      inputData = data.inputData;
      console.log('Received SSE update:', inputData);
      const config = Array.isArray(data.inputDataConfig) ? data.inputDataConfig : defaultInputDataConfig;
      headers.length = 0;
      headers.push(...config.map(c => c.name));
      renderTable(config);
    }
  };
  source.onerror = () => {
    console.error(`SSE connection error for projectId: ${projectId}`);
    source.close();
    setTimeout(setupSSE, 2000);
  };
  source.onopen = () => {
    console.log(`SSE connection opened for projectId: ${projectId}`);
  };
}

function sortByFlow() {
  const graph = {};
  inputData.forEach((row, i) => graph[row[0]] = row[1] || null);
  const sorted = [];
  const visited = new Set();
  function dfs(node) {
    if (!node || visited.has(node)) return;
    visited.add(node);
    dfs(graph[node]);
    sorted.unshift(inputData.find(r => r[0] === node));
  }
  Object.keys(graph).forEach(dfs);
  inputData = sorted;
}

function undo() {
  if (undoStack.length) {
    redoStack.push([...inputData]);
    inputData = undoStack.pop();
  }
}

function redo() {
  if (redoStack.length) {
    undoStack.push([...inputData]);
    inputData = redoStack.pop();
  }
}

function newRow(config) {
  const newRowData = Array(headers.length).fill('');
  inputData.push(newRowData);
  renderTable(config);
  saveAndBroadcast(null, null, null); // Null values since it's a structural change
}

function insertRow(rowIndex, config) {
  const newRowData = Array(headers.length).fill('');
  inputData.splice(rowIndex, 0, newRowData);
  renderTable(config);
  saveAndBroadcast(null, null, null);
}

function deleteRow(rowIndex, config) {
  if (inputData.length <= 1) {
    alert('Cannot delete the last row');
    return;
  }
  inputData.splice(rowIndex, 1);
  renderTable(config);
  saveAndBroadcast(null, null, null);
}

function updateDateTime() {
  const now = new Date();
  document.getElementById('datetime').textContent = now.toLocaleString('en-US', {
    weekday: 'long', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true
  });
  setTimeout(updateDateTime, 1000);
}

function showCompanyModal() {
  document.getElementById('create-company-modal').classList.remove('hidden');
  document.getElementById('company-name').value = '';
}

function closeCompanyModal() {
  document.getElementById('create-company-modal').classList.add('hidden');
}

function showProjectModal() {
  document.getElementById('create-project-modal').classList.remove('hidden');
  document.getElementById('project-name').value = '';
}

function closeProjectModal() {
  document.getElementById('create-project-modal').classList.add('hidden');
}

function showConfigModal() {
  if (!projectId) {
    alert('Please select a project to configure columns');
    return;
  }
  document.getElementById('configure-columns-modal').classList.remove('hidden');
  loadConfigForm();
}

function closeConfigModal() {
  document.getElementById('configure-columns-modal').classList.add('hidden');
}

async function loadConfigForm() {
  const config = await loadInputData();
  const form = document.getElementById('config-form');
  form.innerHTML = '';
  config.forEach((col, i) => {
    const div = document.createElement('div');
    div.className = 'config-row';
    div.innerHTML = `
      <label>Name:</label><input type="text" class="config-name" value="${col.name}" data-index="${i}">
      <label>Type:</label>
      <select class="config-type" data-index="${i}">
        <option value="string" ${col.rules.type === 'string' ? 'selected' : ''}>String</option>
        <option value="enum" ${col.rules.type === 'enum' ? 'selected' : ''}>Enum</option>
        <option value="number" ${col.rules.type === 'number' ? 'selected' : ''}>Number</option>
        <option value="boolean" ${col.rules.type === 'boolean' ? 'selected' : ''}>Boolean</option>
      </select>
      <div class="rules-extra" data-index="${i}">
        ${col.rules.type === 'string' ? `<label>Starts With:</label><input type="text" class="config-startsWith" value="${col.rules.startsWith || ''}">` : ''}
        ${col.rules.type === 'enum' ? `<label>Values (comma-separated):</label><input type="text" class="config-values" value="${col.rules.values ? col.rules.values.join(',') : ''}">` : ''}
        ${col.rules.type === 'number' ? `
          <label>Min:</label><input type="number" class="config-min" value="${col.rules.min || ''}">
          <label>Max:</label><input type="number" class="config-max" value="${col.rules.max || ''}">
        ` : ''}
        <label>Optional:</label><input type="checkbox" class="config-optional" ${col.rules.optional ? 'checked' : ''}>
      </div>
      <label>Enabled If:</label>
      <select class="config-condition-type" data-index="${i}">
        <option value="always" ${col.enabledIf.always ? 'selected' : ''}>Always</option>
        <option value="fieldValue" ${col.enabledIf.field && col.enabledIf.value ? 'selected' : ''}>Field = Value</option>
        <option value="fieldValues" ${col.enabledIf.field && col.enabledIf.values ? 'selected' : ''}>Field in Values</option>
        <option value="fieldNot" ${col.enabledIf.field && col.enabledIf.not ? 'selected' : ''}>Field ≠ Value</option>
        <option value="fieldContains" ${col.enabledIf.field && col.enabledIf.contains ? 'selected' : ''}>Field Contains</option>
        <option value="fieldExists" ${col.enabledIf.field && col.enabledIf.exists ? 'selected' : ''}>Field Exists</option>
      </select>
      <div class="enabledIf-extra" data-index="${i}">
        <label>Field:</label><input type="text" class="config-field" value="${col.enabledIf.field || ''}">
        ${col.enabledIf.value ? `<label>Value:</label><input type="text" class="config-value" value="${col.enabledIf.value}">` : ''}
        ${col.enabledIf.values ? `<label>Values (comma-separated):</label><input type="text" class="config-values-enabled" value="${col.enabledIf.values.join(',')}">` : ''}
        ${col.enabledIf.not ? `<label>Not Value:</label><input type="text" class="config-not" value="${col.enabledIf.not}">` : ''}
        ${col.enabledIf.contains ? `<label>Contains:</label><input type="text" class="config-contains" value="${col.enabledIf.contains}">` : ''}
      </div>
    `;
    form.appendChild(div);
  });

  document.querySelectorAll('.config-type, .config-condition-type').forEach(select => {
    select.addEventListener('change', updateConfigRow);
  });
}

function updateConfigRow(event) {
  const index = event.target.dataset.index;
  const typeSelect = document.querySelector(`.config-type[data-index="${index}"]`);
  const conditionSelect = document.querySelector(`.config-condition-type[data-index="${index}"]`);
  const rulesExtra = document.querySelector(`.rules-extra[data-index="${index}"]`);
  const enabledIfExtra = document.querySelector(`.enabledIf-extra[data-index="${index}"]`);

  rulesExtra.innerHTML = '';
  if (typeSelect.value === 'string') {
    rulesExtra.innerHTML = `
      <label>Starts With:</label><input type="text" class="config-startsWith" value="">
      <label>Optional:</label><input type="checkbox" class="config-optional">
    `;
  } else if (typeSelect.value === 'enum') {
    rulesExtra.innerHTML = `
      <label>Values (comma-separated):</label><input type="text" class="config-values" value="">
      <label>Optional:</label><input type="checkbox" class="config-optional">
    `;
  } else if (typeSelect.value === 'number') {
    rulesExtra.innerHTML = `
      <label>Min:</label><input type="number" class="config-min" value="">
      <label>Max:</label><input type="number" class="config-max" value="">
      <label>Optional:</label><input type="checkbox" class="config-optional">
    `;
  } else if (typeSelect.value === 'boolean') {
    rulesExtra.innerHTML = `
      <label>Optional:</label><input type="checkbox" class="config-optional">
    `;
  }

  enabledIfExtra.innerHTML = '<label>Field:</label><input type="text" class="config-field" value="">';
  if (conditionSelect.value === 'fieldValue') {
    enabledIfExtra.innerHTML += '<label>Value:</label><input type="text" class="config-value" value="">';
  } else if (conditionSelect.value === 'fieldValues') {
    enabledIfExtra.innerHTML += '<label>Values (comma-separated):</label><input type="text" class="config-values-enabled" value="">';
  } else if (conditionSelect.value === 'fieldNot') {
    enabledIfExtra.innerHTML += '<label>Not Value:</label><input type="text" class="config-not" value="">';
  } else if (conditionSelect.value === 'fieldContains') {
    enabledIfExtra.innerHTML += '<label>Contains:</label><input type="text" class="config-contains" value="">';
  }
}

function addConfigColumn() {
  const form = document.getElementById('config-form');
  const index = form.children.length;
  const div = document.createElement('div');
  div.className = 'config-row';
  div.innerHTML = `
    <label>Name:</label><input type="text" class="config-name" data-index="${index}">
    <label>Type:</label>
    <select class="config-type" data-index="${index}">
      <option value="string">String</option>
      <option value="enum">Enum</option>
      <option value="number">Number</option>
      <option value="boolean">Boolean</option>
    </select>
    <div class="rules-extra" data-index="${index}">
      <label>Starts With:</label><input type="text" class="config-startsWith" value="">
      <label>Optional:</label><input type="checkbox" class="config-optional">
    </div>
    <label>Enabled If:</label>
    <select class="config-condition-type" data-index="${index}">
      <option value="always">Always</option>
      <option value="fieldValue">Field = Value</option>
      <option value="fieldValues">Field in Values</option>
      <option value="fieldNot">Field ≠ Value</option>
      <option value="fieldContains">Field Contains</option>
      <option value="fieldExists">Field Exists</option>
    </select>
    <div class="enabledIf-extra" data-index="${index}">
      <label>Field:</label><input type="text" class="config-field" value="">
    </div>
  `;
  form.appendChild(div);
  document.querySelector(`.config-type[data-index="${index}"]`).addEventListener('change', updateConfigRow);
  document.querySelector(`.config-condition-type[data-index="${index}"]`).addEventListener('change', updateConfigRow);
}

async function saveConfig() {
  if (!projectId) {
    alert('Please select a project to save configuration');
    return;
  }
  const form = document.getElementById('config-form');
  const newConfig = Array.from(form.children).map((row, i) => {
    const name = row.querySelector('.config-name').value;
    const type = row.querySelector('.config-type').value;
    const rules = { type };
    if (type === 'string') {
      const startsWith = row.querySelector('.config-startsWith')?.value;
      if (startsWith) rules.startsWith = startsWith;
    } else if (type === 'enum') {
      const values = row.querySelector('.config-values')?.value.split(',').map(v => v.trim());
      if (values) rules.values = values;
    } else if (type === 'number') {
      const min = row.querySelector('.config-min')?.value;
      const max = row.querySelector('.config-max')?.value;
      if (min) rules.min = parseFloat(min);
      if (max) rules.max = parseFloat(max);
    }
    if (row.querySelector('.config-optional')?.checked) rules.optional = true;

    const conditionType = row.querySelector('.config-condition-type').value;
    const enabledIf = {};
    if (conditionType === 'always') {
      enabledIf.always = true;
    } else {
      enabledIf.field = row.querySelector('.config-field').value;
      if (conditionType === 'fieldValue') enabledIf.value = row.querySelector('.config-value')?.value;
      if (conditionType === 'fieldValues') enabledIf.values = row.querySelector('.config-values-enabled')?.value.split(',').map(v => v.trim());
      if (conditionType === 'fieldNot') enabledIf.not = row.querySelector('.config-not')?.value;
      if (conditionType === 'fieldContains') enabledIf.contains = row.querySelector('.config-contains')?.value;
      if (conditionType === 'fieldExists') enabledIf.exists = true;
    }
    return { name, rules, enabledIf };
  });

  try {
    document.getElementById('progress').classList.remove('hidden');
    const res = await fetch(`/api/project/${projectId}/inputData`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputData, inputDataConfig: newConfig })
    });
    const text = await res.text();
    console.log('Save config response:', text);
    if (!res.ok) {
      const data = JSON.parse(text);
      throw new Error(data.message || 'Failed to save configuration');
    }
    closeConfigModal();
    await loadInputData();
    document.getElementById('progress').classList.add('hidden');
  } catch (err) {
    console.error('saveConfig error:', err);
    alert(err.message);
    document.getElementById('progress').classList.add('hidden');
  }
}

// Event listeners
document.addEventListener('DOMContentLoaded', async () => {
  token = localStorage.getItem('token');
  if (!token) {
    window.location.replace('/login.html');
    return;
  }

  closeCompanyModal();
  closeProjectModal();
  closeConfigModal();

  try {
    await fetchUserData();
    document.getElementById('save').addEventListener('click', saveData);
    document.getElementById('sort-flow').addEventListener('click', sortByFlow);
    document.getElementById('undo').addEventListener('click', undo);
    document.getElementById('redo').addEventListener('click', redo);
    document.getElementById('new-row').addEventListener('click', async () => {
      const config = await loadInputData();
      newRow(config);
    });
    document.getElementById('logout').addEventListener('click', () => {
      localStorage.removeItem('token');
      window.location.replace('/login.html');
    });
    document.getElementById('create-company-btn').addEventListener('click', showCompanyModal);
    document.getElementById('submit-company').addEventListener('click', async () => {
      await createCompany();
      closeCompanyModal();
    });
    document.getElementById('cancel-company').addEventListener('click', closeCompanyModal);
    document.getElementById('create-project-btn').addEventListener('click', showProjectModal);
    document.getElementById('submit-project').addEventListener('click', async () => {
      await createProject();
      closeProjectModal();
    });
    document.getElementById('cancel-project').addEventListener('click', closeProjectModal);
    document.getElementById('configure-columns-btn').addEventListener('click', showConfigModal);
    document.getElementById('add-column').addEventListener('click', addConfigColumn);
    document.getElementById('save-config').addEventListener('click', saveConfig);
    document.getElementById('cancel-config').addEventListener('click', closeConfigModal);

    // Context menu handlers
    document.getElementById('insert-row').addEventListener('click', async () => {
      const menu = document.getElementById('context-menu');
      const rowIndex = parseInt(menu.dataset.rowIndex);
      const config = await loadInputData();
      insertRow(rowIndex, config);
      menu.classList.add('hidden');
    });
    document.getElementById('delete-row').addEventListener('click', async () => {
      const menu = document.getElementById('context-menu');
      const rowIndex = parseInt(menu.dataset.rowIndex);
      const config = await loadInputData();
      deleteRow(rowIndex, config);
      menu.classList.add('hidden');
    });
    document.addEventListener('click', () => {
      document.getElementById('context-menu').classList.add('hidden');
    });

    updateDateTime();
  } catch (err) {
    console.error('Error loading user data:', err);
    localStorage.removeItem('token');
    window.location.replace('/login.html');
  }
});