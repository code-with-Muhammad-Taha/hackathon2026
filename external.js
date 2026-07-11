/* =====================================================================
   MaintainIQ — external.js
   One shared script for index.html, admin.html, technician.html, user.html
   Each page sets <body data-page="admin|technician|user|index"> so this
   file knows which portal to initialize. All portal-specific code lives
   inside its own namespace object (Admin / Technician / User) to avoid
   name clashes now that everything ships in a single file.
   ===================================================================== */

/* =====================  SHARED DATA LAYER  ===================== */

const DB_KEY = 'maintainiq_db';

function uid(prefix) {
  return prefix + '-' + Date.now().toString(36).slice(-4).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}

function nowISO() { return new Date().toISOString(); }

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function seedDB() {
  const db = {
    admins: [
      { id: uid('ADM'), username: 'admin', password: 'admin123', name: 'Site Admin' }
    ],
    technicians: [],
    users: [],
    assets: [],
    issues: [],
    notifications: { admin: [], technician: {} },
    counters: { asset: 0, issue: 0 }
  };

  const sampleAssets = [
    ['Classroom Projector 01', 'Electronics', 'Block A · Room 101', 'Good'],
    ['Central AC Unit 03', 'HVAC', 'Admin Block · Roof', 'Fair'],
    ['Water Cooler 02', 'Plumbing', 'Cafeteria', 'Good'],
    ['Server Rack UPS 01', 'Electrical', 'IT Server Room', 'Good'],
    ['Main Gate Generator', 'Electrical', 'Security Gate', 'Fair']
  ];

  sampleAssets.forEach(([name, category, location, condition]) => {
    db.counters.asset++;
    db.assets.push({
      id: uid('AST'),
      code: 'AST-' + String(db.counters.asset).padStart(4, '0'),
      name, category, location, condition,
      status: 'Operational',
      lastService: nowISO(),
      nextService: null,
      assignedTechnician: null,
      createdAt: nowISO(),
      history: [{ date: nowISO(), action: 'Asset registered', actor: 'Site Admin' }]
    });
  });

  return db;
}

function getDB() {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) {
    const db = seedDB();
    localStorage.setItem(DB_KEY, JSON.stringify(db));
    return db;
  }
  return JSON.parse(raw);
}

function saveDB(db) { localStorage.setItem(DB_KEY, JSON.stringify(db)); }

function resetDB() {
  localStorage.removeItem(DB_KEY);
  localStorage.removeItem('mi_session_admin');
  localStorage.removeItem('mi_session_technician');
  localStorage.removeItem('mi_session_user');
  return getDB();
}

function setSession(portal, userId) { localStorage.setItem('mi_session_' + portal, userId); }
function getSession(portal) { return localStorage.getItem('mi_session_' + portal); }
function clearSession(portal) { localStorage.removeItem('mi_session_' + portal); }

function addAdminNotification(db, text, issueId) {
  db.notifications.admin.unshift({ id: uid('NTF'), text, issueId, read: false, date: nowISO() });
}
function addTechNotification(db, techId, text, issueId) {
  if (!db.notifications.technician[techId]) db.notifications.technician[techId] = [];
  db.notifications.technician[techId].unshift({ id: uid('NTF'), text, issueId, read: false, date: nowISO() });
}

function addAssetHistory(asset, action, actor) {
  asset.history.unshift({ date: nowISO(), action, actor });
}

const STATUS_CLASS = {
  'Operational': 'ok', 'Resolved': 'ok',
  'Issue Reported': 'warn', 'Under Inspection': 'warn', 'Under Maintenance': 'warn',
  'Reported': 'warn', 'Assigned': 'warn', 'In Progress': 'warn',
  'Out of Service': 'bad',
  'Retired': 'muted'
};

function toast(msg, type = 'info') {
  let box = document.getElementById('mi-toast-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'mi-toast-box';
    document.body.appendChild(box);
  }
  const t = document.createElement('div');
  t.className = 'mi-toast mi-toast-' + type;
  t.textContent = msg;
  box.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 3000);
}

function escapeHTML(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

function notifItemHTML(n) {
  return `<div class="notif-item ${n.read ? '' : 'unread'}">
    ${escapeHTML(n.text)}
    <span class="notif-date">${formatDate(n.date)}</span>
  </div>`;
}

/* =====================  INDEX PAGE  ===================== */

function initIndexPage() {
  const btn = document.getElementById('resetBtn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    if (confirm('This clears all assets, issues, accounts and notifications stored in this browser. Continue?')) {
      resetDB();
      toast('Demo data reset.', 'success');
    }
  });
}

/* =====================  ADMIN PORTAL  ===================== */

const Admin = {
  current: null,
  assignTargetIssueId: null,

  init() {
    getDB();
    const sessionId = getSession('admin');
    if (sessionId) {
      const db = getDB();
      const found = db.admins.find(a => a.id === sessionId);
      if (found) { this.current = found; this.showPortal(); return; }
    }
    this.showAuth();
    this.wireAuthTabs();
    this.wireAuthForms();
  },

  showAuth() {
    document.getElementById('authShell').classList.remove('hidden');
    document.getElementById('portalShell').classList.add('hidden');
  },

  showPortal() {
    document.getElementById('authShell').classList.add('hidden');
    document.getElementById('portalShell').classList.remove('hidden');
    document.getElementById('sbUserName').textContent = this.current.name;
    this.wireNav();
    this.wireForms();
    this.wireModal();
    document.getElementById('logoutBtn').addEventListener('click', () => {
      clearSession('admin');
      this.current = null;
      location.reload();
    });
    this.renderAll();
  },

  wireAuthTabs() {
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    tabLogin.addEventListener('click', () => {
      tabLogin.classList.add('active'); tabRegister.classList.remove('active');
      loginForm.classList.remove('hidden'); registerForm.classList.add('hidden');
    });
    tabRegister.addEventListener('click', () => {
      tabRegister.classList.add('active'); tabLogin.classList.remove('active');
      registerForm.classList.remove('hidden'); loginForm.classList.add('hidden');
    });
  },

  wireAuthForms() {
    document.getElementById('loginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('loginUser').value.trim();
      const password = document.getElementById('loginPass').value;
      const db = getDB();
      const found = db.admins.find(a => a.username === username && a.password === password);
      const errEl = document.getElementById('loginError');
      if (!found) { errEl.textContent = 'Incorrect username or password.'; return; }
      errEl.textContent = '';
      setSession('admin', found.id);
      this.current = found;
      this.showPortal();
    });

    document.getElementById('registerForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('regName').value.trim();
      const username = document.getElementById('regUser').value.trim();
      const password = document.getElementById('regPass').value;
      const errEl = document.getElementById('registerError');
      const db = getDB();
      if (db.admins.some(a => a.username === username)) {
        errEl.textContent = 'That username is already taken.'; return;
      }
      errEl.textContent = '';
      const newAdmin = { id: uid('ADM'), username, password, name };
      db.admins.push(newAdmin);
      saveDB(db);
      setSession('admin', newAdmin.id);
      this.current = newAdmin;
      this.showPortal();
    });
  },

  wireNav() {
    document.querySelectorAll('.sb-link').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sb-link').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById('view-' + btn.dataset.view).classList.remove('hidden');
        if (btn.dataset.view === 'notifications') this.markAllNotifsRead();
        this.renderAll();
      });
    });
  },

  renderAll() {
    const db = getDB();
    this.renderDashboard(db);
    this.renderAssets(db);
    this.renderTechnicians(db);
    this.renderIssues(db);
    this.renderNotifications(db);
  },

  renderDashboard(db) {
    const totalAssets = db.assets.length;
    const openIssues = db.issues.filter(i => i.status !== 'Resolved').length;
    const resolved = db.issues.filter(i => i.status === 'Resolved').length;
    const techCount = db.technicians.length;
    const stats = [
      { num: totalAssets, label: 'Total Assets' },
      { num: openIssues, label: 'Open Issues' },
      { num: resolved, label: 'Resolved Issues' },
      { num: techCount, label: 'Technicians' }
    ];
    document.getElementById('statRow').innerHTML = stats.map(s => `
      <div class="stat-card"><div class="stat-num">${s.num}</div><div class="stat-label">${s.label}</div></div>
    `).join('');
    const recent = db.notifications.admin.slice(0, 5);
    document.getElementById('dashNotifList').innerHTML = recent.length ? recent.map(notifItemHTML).join('') :
      '<div class="empty-state">No notifications yet. Issues reported by users will appear here.</div>';
  },

  wireForms() {
    document.getElementById('assetForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const db = getDB();
      db.counters.asset++;
      const asset = {
        id: uid('AST'),
        code: 'AST-' + String(db.counters.asset).padStart(4, '0'),
        name: document.getElementById('astName').value.trim(),
        category: document.getElementById('astCategory').value.trim(),
        location: document.getElementById('astLocation').value.trim(),
        condition: document.getElementById('astCondition').value,
        status: 'Operational',
        lastService: nowISO(),
        nextService: null,
        assignedTechnician: null,
        createdAt: nowISO(),
        history: []
      };
      addAssetHistory(asset, 'Asset registered', this.current.name);
      db.assets.unshift(asset);
      saveDB(db);
      e.target.reset();
      toast('Asset "' + asset.name + '" registered.', 'success');
      this.renderAll();
    });

    document.getElementById('techForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const db = getDB();
      const username = document.getElementById('techUser').value.trim();
      if (db.technicians.some(t => t.username === username)) {
        toast('That technician username already exists.', 'error');
        return;
      }
      const tech = {
        id: uid('TEC'),
        name: document.getElementById('techName').value.trim(),
        specialty: document.getElementById('techSpecialty').value.trim(),
        username,
        password: document.getElementById('techPass').value
      };
      db.technicians.push(tech);
      saveDB(db);
      e.target.reset();
      toast('Technician "' + tech.name + '" added.', 'success');
      this.renderAll();
    });
  },

  renderAssets(db) {
    document.getElementById('assetCountLabel').textContent = '(' + db.assets.length + ')';
    const grid = document.getElementById('assetGrid');
    if (!db.assets.length) {
      grid.innerHTML = '<div class="empty-state">No assets registered yet.</div>';
      return;
    }
    grid.innerHTML = db.assets.map(a => `
      <div class="ticket">
        <div class="ticket-top">
          <span class="ticket-code mono">${a.code}</span>
          <span class="badge ${STATUS_CLASS[a.status] || 'muted'}">${a.status}</span>
        </div>
        <div class="ticket-name">${escapeHTML(a.name)}</div>
        <div class="ticket-meta">${escapeHTML(a.category)} · ${escapeHTML(a.location)}<br>Condition: ${escapeHTML(a.condition)} · Last service: ${formatDate(a.lastService)}</div>
      </div>
    `).join('');
  },

  renderTechnicians(db) {
    const tbody = document.querySelector('#techTable tbody');
    if (!db.technicians.length) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No technicians added yet.</td></tr>';
      return;
    }
    tbody.innerHTML = db.technicians.map(t => {
      const active = db.issues.filter(i => i.assignedTechId === t.id && i.status !== 'Resolved').length;
      return `<tr>
        <td>${escapeHTML(t.name)}</td>
        <td>${escapeHTML(t.specialty)}</td>
        <td class="mono">${escapeHTML(t.username)}</td>
        <td class="mono">${escapeHTML(t.password)}</td>
        <td>${active}</td>
      </tr>`;
    }).join('');
  },

  renderIssues(db) {
    const grid = document.getElementById('issueGrid');
    if (!db.issues.length) {
      grid.innerHTML = '<div class="empty-state">No issues reported yet.</div>';
      return;
    }
    const sorted = [...db.issues].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    grid.innerHTML = sorted.map(issue => {
      const asset = db.assets.find(a => a.id === issue.assetId);
      const tech = db.technicians.find(t => t.id === issue.assignedTechId);
      let actionHTML = '';
      if (issue.status === 'Reported') {
        actionHTML = `<button class="btn small" onclick="Admin.openAssignModal('${issue.id}')">Assign Technician</button>`;
      } else if (tech) {
        actionHTML = `<span class="hint">Assigned to <strong>${escapeHTML(tech.name)}</strong></span>`;
      }
      const resolutionHTML = issue.resolutionMessage
        ? `<div class="ticket-meta" style="margin-top:8px;padding-top:8px;border-top:1px dashed #c9c2b0;"><strong>Technician note:</strong> ${escapeHTML(issue.resolutionMessage)}</div>`
        : '';
      return `
        <div class="ticket">
          <div class="ticket-top">
            <span class="ticket-code mono">${issue.issueNumber}</span>
            <span class="badge ${STATUS_CLASS[issue.status] || 'muted'}">${issue.status}</span>
          </div>
          <div class="ticket-name">${escapeHTML(issue.title)}</div>
          <div class="ticket-meta">
            Asset: ${asset ? escapeHTML(asset.name) : 'Unknown'} (${asset ? asset.code : '—'})<br>
            Priority: ${escapeHTML(issue.priority)} · Category: ${escapeHTML(issue.category)}<br>
            Reported by ${escapeHTML(issue.reporterName)} on ${formatDate(issue.createdAt)}
          </div>
          <div class="ticket-meta" style="margin-top:6px;">${escapeHTML(issue.description)}</div>
          ${resolutionHTML}
          <div class="ticket-actions">${actionHTML}</div>
        </div>
      `;
    }).join('');
  },

  wireModal() {
    document.getElementById('assignCancel').addEventListener('click', () => this.closeAssignModal());
    document.getElementById('assignConfirm').addEventListener('click', () => this.confirmAssign());
  },

  openAssignModal(issueId) {
    const db = getDB();
    if (!db.technicians.length) {
      toast('Add a technician first before assigning issues.', 'error');
      return;
    }
    this.assignTargetIssueId = issueId;
    const select = document.getElementById('assignTechSelect');
    select.innerHTML = db.technicians.map(t => `<option value="${t.id}">${escapeHTML(t.name)} — ${escapeHTML(t.specialty)}</option>`).join('');
    document.getElementById('assignModal').classList.remove('hidden');
  },

  closeAssignModal() {
    this.assignTargetIssueId = null;
    document.getElementById('assignModal').classList.add('hidden');
  },

  confirmAssign() {
    if (!this.assignTargetIssueId) return;
    const techId = document.getElementById('assignTechSelect').value;
    const db = getDB();
    const issue = db.issues.find(i => i.id === this.assignTargetIssueId);
    const tech = db.technicians.find(t => t.id === techId);
    const asset = db.assets.find(a => a.id === issue.assetId);
    if (!issue || !tech) return;

    issue.status = 'Assigned';
    issue.assignedTechId = tech.id;
    if (asset) {
      asset.status = 'Issue Reported';
      addAssetHistory(asset, `Issue ${issue.issueNumber} assigned to ${tech.name}`, this.current.name);
    }
    addTechNotification(db, tech.id, `New task assigned: "${issue.title}" (${issue.issueNumber}) on ${asset ? asset.name : 'asset'}.`, issue.id);

    saveDB(db);
    this.closeAssignModal();
    toast('Issue assigned to ' + tech.name + '.', 'success');
    this.renderAll();
  },

  renderNotifications(db) {
    const unread = db.notifications.admin.filter(n => !n.read).length;
    const badge = document.getElementById('notifCount');
    if (unread > 0) { badge.textContent = unread; badge.classList.remove('hidden'); }
    else { badge.classList.add('hidden'); }
    const list = document.getElementById('fullNotifList');
    list.innerHTML = db.notifications.admin.length
      ? db.notifications.admin.map(notifItemHTML).join('')
      : '<div class="empty-state">No notifications yet.</div>';
  },

  markAllNotifsRead() {
    const db = getDB();
    db.notifications.admin.forEach(n => n.read = true);
    saveDB(db);
  }
};

/* =====================  TECHNICIAN PORTAL  ===================== */

const Technician = {
  current: null,
  resolveTargetIssueId: null,

  init() {
    getDB();
    const sessionId = getSession('technician');
    if (sessionId) {
      const db = getDB();
      const found = db.technicians.find(t => t.id === sessionId);
      if (found) { this.current = found; this.showPortal(); return; }
    }
    this.showAuth();
    this.wireAuthForm();
  },

  showAuth() {
    document.getElementById('authShell').classList.remove('hidden');
    document.getElementById('portalShell').classList.add('hidden');
  },

  showPortal() {
    document.getElementById('authShell').classList.add('hidden');
    document.getElementById('portalShell').classList.remove('hidden');
    document.getElementById('sbUserName').textContent = this.current.name;
    document.getElementById('sbSpecialty').textContent = this.current.specialty;
    this.wireNav();
    this.wireResolveModal();
    document.getElementById('logoutBtn').addEventListener('click', () => {
      clearSession('technician');
      this.current = null;
      location.reload();
    });
    this.renderAll();
  },

  wireAuthForm() {
    document.getElementById('loginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('loginUser').value.trim();
      const password = document.getElementById('loginPass').value;
      const db = getDB();
      const found = db.technicians.find(t => t.username === username && t.password === password);
      const errEl = document.getElementById('loginError');
      if (!found) { errEl.textContent = 'Incorrect username or password. Ask your admin for access.'; return; }
      errEl.textContent = '';
      setSession('technician', found.id);
      this.current = found;
      this.showPortal();
    });
  },

  wireNav() {
    document.querySelectorAll('.sb-link').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sb-link').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById('view-' + btn.dataset.view).classList.remove('hidden');
        if (btn.dataset.view === 'notifications') this.markAllNotifsRead();
        this.renderAll();
      });
    });
  },

  renderAll() {
    const db = getDB();
    this.renderTasks(db);
    this.renderNotifications(db);
  },

  renderTasks(db) {
    const grid = document.getElementById('taskGrid');
    const mine = db.issues.filter(i => i.assignedTechId === this.current.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (!mine.length) {
      grid.innerHTML = '<div class="empty-state">No tasks assigned to you yet. Check back after the admin assigns an issue.</div>';
      return;
    }
    grid.innerHTML = mine.map(issue => {
      const asset = db.assets.find(a => a.id === issue.assetId);
      let actionHTML = '';
      if (issue.status === 'Assigned') {
        actionHTML = `<button class="btn small" onclick="Technician.startInspection('${issue.id}')">Start Inspection</button>`;
      } else if (issue.status === 'In Progress') {
        actionHTML = `<button class="btn small teal" onclick="Technician.openResolveModal('${issue.id}')">Resolve</button>`;
      } else if (issue.status === 'Resolved') {
        actionHTML = `<span class="hint">Resolved ✓</span>`;
      }
      const resolutionHTML = issue.resolutionMessage
        ? `<div class="ticket-meta" style="margin-top:8px;padding-top:8px;border-top:1px dashed #c9c2b0;"><strong>Your note:</strong> ${escapeHTML(issue.resolutionMessage)}</div>`
        : '';
      return `
        <div class="ticket">
          <div class="ticket-top">
            <span class="ticket-code mono">${issue.issueNumber}</span>
            <span class="badge ${STATUS_CLASS[issue.status] || 'muted'}">${issue.status}</span>
          </div>
          <div class="ticket-name">${escapeHTML(issue.title)}</div>
          <div class="ticket-meta">
            Asset: ${asset ? escapeHTML(asset.name) : 'Unknown'} · ${asset ? escapeHTML(asset.location) : ''}<br>
            Priority: ${escapeHTML(issue.priority)} · Reported by ${escapeHTML(issue.reporterName)}
          </div>
          <div class="ticket-meta" style="margin-top:6px;">${escapeHTML(issue.description)}</div>
          ${resolutionHTML}
          <div class="ticket-actions">${actionHTML}</div>
        </div>
      `;
    }).join('');
  },

  startInspection(issueId) {
    const db = getDB();
    const issue = db.issues.find(i => i.id === issueId);
    if (!issue) return;
    const asset = db.assets.find(a => a.id === issue.assetId);
    issue.status = 'In Progress';
    if (asset) {
      asset.status = 'Under Maintenance';
      addAssetHistory(asset, `Inspection started on ${issue.issueNumber}`, this.current.name);
    }
    saveDB(db);
    toast('Inspection started.', 'success');
    this.renderAll();
  },

  wireResolveModal() {
    document.getElementById('resolveCancel').addEventListener('click', () => this.closeResolveModal());
    document.getElementById('resolveForm').addEventListener('submit', (e) => this.submitResolve(e));
  },

  openResolveModal(issueId) {
    this.resolveTargetIssueId = issueId;
    document.getElementById('resolveForm').reset();
    document.getElementById('resolveModal').classList.remove('hidden');
  },

  closeResolveModal() {
    this.resolveTargetIssueId = null;
    document.getElementById('resolveModal').classList.add('hidden');
  },

  submitResolve(e) {
    e.preventDefault();
    const db = getDB();
    const issue = db.issues.find(i => i.id === this.resolveTargetIssueId);
    if (!issue) return;
    const asset = db.assets.find(a => a.id === issue.assetId);
    const message = document.getElementById('resolveMessage').value.trim();

    issue.status = 'Resolved';
    issue.resolutionMessage = message;
    if (asset) {
      asset.status = 'Operational';
      asset.lastService = nowISO();
      addAssetHistory(asset, `Issue ${issue.issueNumber} resolved by ${this.current.name}`, this.current.name);
    }
    addAdminNotification(db, `${this.current.name} resolved "${issue.title}" (${issue.issueNumber}): ${message}`, issue.id);

    saveDB(db);
    this.closeResolveModal();
    toast('Issue marked resolved. Admin notified.', 'success');
    this.renderAll();
  },

  renderNotifications(db) {
    const list = (db.notifications.technician[this.current.id] || []);
    const unread = list.filter(n => !n.read).length;
    const badge = document.getElementById('notifCount');
    if (unread > 0) { badge.textContent = unread; badge.classList.remove('hidden'); }
    else { badge.classList.add('hidden'); }
    const container = document.getElementById('fullNotifList');
    container.innerHTML = list.length
      ? list.map(notifItemHTML).join('')
      : '<div class="empty-state">No notifications yet.</div>';
  },

  markAllNotifsRead() {
    const db = getDB();
    const list = db.notifications.technician[this.current.id];
    if (list) list.forEach(n => n.read = true);
    saveDB(db);
  }
};

/* =====================  USER PORTAL  ===================== */

const User = {
  current: null,
  reportTargetAssetId: null,

  init() {
    getDB();
    const sessionId = getSession('user');
    if (sessionId) {
      const db = getDB();
      const found = db.users.find(u => u.id === sessionId);
      if (found) { this.current = found; this.showPortal(); return; }
    }
    this.showAuth();
    this.wireAuthTabs();
    this.wireAuthForms();
  },

  showAuth() {
    document.getElementById('authShell').classList.remove('hidden');
    document.getElementById('portalShell').classList.add('hidden');
  },

  showPortal() {
    document.getElementById('authShell').classList.add('hidden');
    document.getElementById('portalShell').classList.remove('hidden');
    document.getElementById('sbUserName').textContent = this.current.name;
    this.wireNav();
    this.wireReportModal();
    document.getElementById('logoutBtn').addEventListener('click', () => {
      clearSession('user');
      this.current = null;
      location.reload();
    });
    this.renderAll();
  },

  wireAuthTabs() {
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    tabLogin.addEventListener('click', () => {
      tabLogin.classList.add('active'); tabRegister.classList.remove('active');
      loginForm.classList.remove('hidden'); registerForm.classList.add('hidden');
    });
    tabRegister.addEventListener('click', () => {
      tabRegister.classList.add('active'); tabLogin.classList.remove('active');
      registerForm.classList.remove('hidden'); loginForm.classList.add('hidden');
    });
  },

  wireAuthForms() {
    document.getElementById('loginForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('loginUser').value.trim();
      const password = document.getElementById('loginPass').value;
      const db = getDB();
      const found = db.users.find(u => u.username === username && u.password === password);
      const errEl = document.getElementById('loginError');
      if (!found) { errEl.textContent = 'Incorrect username or password.'; return; }
      errEl.textContent = '';
      setSession('user', found.id);
      this.current = found;
      this.showPortal();
    });

    document.getElementById('registerForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('regName').value.trim();
      const username = document.getElementById('regUser').value.trim();
      const password = document.getElementById('regPass').value;
      const errEl = document.getElementById('registerError');
      const db = getDB();
      if (db.users.some(u => u.username === username)) {
        errEl.textContent = 'That username is already taken.'; return;
      }
      errEl.textContent = '';
      const newUser = { id: uid('USR'), username, password, name };
      db.users.push(newUser);
      saveDB(db);
      setSession('user', newUser.id);
      this.current = newUser;
      this.showPortal();
    });
  },

  wireNav() {
    document.querySelectorAll('.sb-link').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sb-link').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById('view-' + btn.dataset.view).classList.remove('hidden');
        this.renderAll();
      });
    });
  },

  renderAll() {
    const db = getDB();
    this.renderAssets(db);
    this.renderMyReports(db);
  },

  renderAssets(db) {
    const grid = document.getElementById('assetGrid');
    if (!db.assets.length) {
      grid.innerHTML = '<div class="empty-state">No assets registered yet.</div>';
      return;
    }
    grid.innerHTML = db.assets.map(a => `
      <div class="ticket">
        <div class="ticket-top">
          <span class="ticket-code mono">${a.code}</span>
          <span class="badge ${STATUS_CLASS[a.status] || 'muted'}">${a.status}</span>
        </div>
        <div class="ticket-name">${escapeHTML(a.name)}</div>
        <div class="ticket-meta">${escapeHTML(a.category)} · ${escapeHTML(a.location)}<br>Condition: ${escapeHTML(a.condition)}</div>
        <div class="ticket-actions">
          ${a.status === 'Retired'
            ? '<span class="hint">Retired — reporting disabled</span>'
            : `<button class="btn small" onclick="User.openReportModal('${a.id}')">Report Issue</button>`}
        </div>
      </div>
    `).join('');
  },

  wireReportModal() {
    document.getElementById('reportCancel').addEventListener('click', () => this.closeReportModal());
    document.getElementById('reportForm').addEventListener('submit', (e) => this.submitReport(e));
  },

  openReportModal(assetId) {
    const db = getDB();
    const asset = db.assets.find(a => a.id === assetId);
    this.reportTargetAssetId = assetId;
    document.getElementById('reportModalSub').textContent = 'Reporting a problem on: ' + (asset ? asset.name : '');
    document.getElementById('reportForm').reset();
    document.getElementById('reportModal').classList.remove('hidden');
  },

  closeReportModal() {
    this.reportTargetAssetId = null;
    document.getElementById('reportModal').classList.add('hidden');
  },

  submitReport(e) {
    e.preventDefault();
    const db = getDB();
    const asset = db.assets.find(a => a.id === this.reportTargetAssetId);
    if (!asset) { toast('Asset not found.', 'error'); return; }

    db.counters.issue++;
    const issue = {
      id: uid('ISS'),
      issueNumber: 'ISS-' + String(db.counters.issue).padStart(4, '0'),
      assetId: asset.id,
      title: document.getElementById('repTitle').value.trim(),
      description: document.getElementById('repDescription').value.trim(),
      priority: document.getElementById('repPriority').value,
      category: document.getElementById('repCategory').value.trim(),
      reporterUsername: this.current.username,
      reporterName: this.current.name,
      status: 'Reported',
      assignedTechId: null,
      resolutionMessage: null,
      createdAt: nowISO(),
      history: [{ date: nowISO(), action: 'Issue reported', actor: this.current.name }]
    };
    db.issues.unshift(issue);
    addAssetHistory(asset, `Issue reported: ${issue.title}`, this.current.name);
    addAdminNotification(db, `${this.current.name} reported "${issue.title}" (${issue.issueNumber}) on ${asset.name}.`, issue.id);

    saveDB(db);
    this.closeReportModal();
    toast('Issue reported. The admin has been notified.', 'success');
    this.renderAll();
  },

  renderMyReports(db) {
    const grid = document.getElementById('myReportGrid');
    const mine = db.issues.filter(i => i.reporterUsername === this.current.username)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (!mine.length) {
      grid.innerHTML = '<div class="empty-state">You haven\'t reported any issues yet.</div>';
      return;
    }
    grid.innerHTML = mine.map(issue => {
      const asset = db.assets.find(a => a.id === issue.assetId);
      const tech = db.technicians.find(t => t.id === issue.assignedTechId);
      const resolutionHTML = issue.resolutionMessage
        ? `<div class="ticket-meta" style="margin-top:8px;padding-top:8px;border-top:1px dashed #c9c2b0;"><strong>Resolution:</strong> ${escapeHTML(issue.resolutionMessage)}</div>`
        : '';
      return `
        <div class="ticket">
          <div class="ticket-top">
            <span class="ticket-code mono">${issue.issueNumber}</span>
            <span class="badge ${STATUS_CLASS[issue.status] || 'muted'}">${issue.status}</span>
          </div>
          <div class="ticket-name">${escapeHTML(issue.title)}</div>
          <div class="ticket-meta">
            Asset: ${asset ? escapeHTML(asset.name) : 'Unknown'}<br>
            Reported ${formatDate(issue.createdAt)}
            ${tech ? `<br>Technician: ${escapeHTML(tech.name)}` : ''}
          </div>
          ${resolutionHTML}
        </div>
      `;
    }).join('');
  }
};

/* =====================  ENTRY POINT  ===================== */

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (page === 'index') initIndexPage();
  else if (page === 'admin') Admin.init();
  else if (page === 'technician') Technician.init();
  else if (page === 'user') User.init();
});
