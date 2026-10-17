document.addEventListener('DOMContentLoaded', async () => {
  
  const session = EvalSyncAuth.requireRole('admin');
  if (!session) return;

  const contentEl = document.getElementById('app-content');
  const pageTitleEl = document.getElementById('page-title');
  const userCountEl = document.getElementById('user-count');
  const navButtons = document.querySelectorAll('.sidebar .nav');

  
  const logoutBtn = document.getElementById('logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => EvalSyncAuth.signOut());
  }

  function renderRealtimeDate() {
    const todayEl = document.querySelector('.today');
    if (todayEl) {
      const now = new Date();
      const options = { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' };
      todayEl.textContent = now.toLocaleDateString('en-US', options).toUpperCase();
    }
  }
  renderRealtimeDate();

  
  let currentView = 'overview';
  let cachedClasses = [];
  let cachedUsers = [];

  
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.dataset.view;
      renderView();
    });
  });

  async function loadData() {
    try {
      const [users, classes] = await Promise.all([
        EvalSyncAPI.get('/admin/users'),
        EvalSyncAPI.get('/admin/classes')
      ]);
      cachedUsers = users;
      cachedClasses = classes;
      if (userCountEl) {
        userCountEl.textContent = String(users.length).padStart(2, '0');
      }
    } catch (err) {
      console.error('Error loading initial admin data:', err);
    }
  }

  function showAlert(msg, type = 'success') {
    const existing = document.getElementById('action-alert');
    if (existing) existing.remove();
    const alert = document.createElement('div');
    alert.id = 'action-alert';
    alert.className = `alert alert-${type}`;
    alert.innerHTML = `<span>${msg}</span><button onclick="this.parentElement.remove()" style="background:none;border:0;cursor:pointer;"></button>`;
    contentEl.prepend(alert);
    setTimeout(() => {
      if (alert.parentElement) alert.remove();
    }, 4500);
  }

  async function renderView() {
    await loadData();

    if (currentView === 'overview') {
      pageTitleEl.textContent = 'Admin Overview';
      renderOverview();
    } else if (currentView === 'users') {
      pageTitleEl.textContent = 'Manage People';
      renderUsers();
    } else if (currentView === 'classes') {
      pageTitleEl.textContent = 'Classes & Divisions';
      renderClasses();
    }
  }

  
  function renderOverview() {
    const studentCount = cachedUsers.filter(u => u.role === 'student').length;
    const teacherCount = cachedUsers.filter(u => u.role === 'teacher').length;
    const classCount = cachedClasses.length;

    contentEl.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="label">Total Students</div>
          <div class="val">${studentCount}</div>
        </div>
        <div class="stat-card">
          <div class="label">Total Teachers</div>
          <div class="val">${teacherCount}</div>
        </div>
        <div class="stat-card">
          <div class="label">Class-Divisions</div>
          <div class="val">${classCount}</div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Quick Actions</h2>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <button class="btn btn-primary" id="btn-goto-create-user">Create New User</button>
          <button class="btn btn-outline" id="btn-goto-create-class">Create Class & Division</button>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Recent Registered Users</h2>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Class / Division</th>
              </tr>
            </thead>
            <tbody>
              ${cachedUsers.slice(0, 5).map(u => `
                <tr>
                  <td><strong>${u.name}</strong></td>
                  <td>${u.email}</td>
                  <td><span class="chip chip-${u.role}">${u.role}</span></td>
                  <td>${formatUserClassDiv(u)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('btn-goto-create-user')?.addEventListener('click', () => {
      document.querySelector('[data-view="users"]')?.click();
    });
    document.getElementById('btn-goto-create-class')?.addEventListener('click', () => {
      document.querySelector('[data-view="classes"]')?.click();
    });
  }

  
  function renderUsers() {
    contentEl.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Add New User</h2>
        </div>
        <form id="create-user-form">
          <div class="form-grid">
            <div class="form-group">
              <label>Full Name</label>
              <input type="text" id="user-name" placeholder="e.g. Diya Sharma" required>
            </div>
            <div class="form-group">
              <label>Email Address</label>
              <input type="email" id="user-email" placeholder="e.g. diya@college.edu" required>
            </div>
            <div class="form-group">
              <label>Password</label>
              <input type="password" id="user-password" placeholder="Temporary password" required>
            </div>
            <div class="form-group">
              <label>Role</label>
              <select id="user-role" required>
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          <!-- Student Assignment Field -->
          <div id="student-assignment-box" class="form-grid">
            <div class="form-group">
              <label>Assign Class & Division</label>
              <select id="student-class-div">
                <option value="">Select Class & Division...</option>
                ${cachedClasses.map(c => `
                  <option value="${c._id}">${c.className} · ${c.division}</option>
                `).join('')}
              </select>
            </div>
          </div>

          <!-- Teacher Assignment Field -->
          <div id="teacher-assignment-box" class="form-grid" style="display:none;">
            <div class="form-group" style="grid-column: 1 / -1;">
              <label>Assign Divisions (Hold Ctrl / Cmd to select multiple)</label>
              <select id="teacher-divisions" multiple size="4">
                ${cachedClasses.map(c => `
                  <option value="${c._id}">${c.className} · Division ${c.division}</option>
                `).join('')}
              </select>
            </div>
          </div>

          <button type="submit" class="btn btn-primary" id="btn-submit-user">Create User Account</button>
        </form>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h2 class="panel-title">User Directory</h2>
          <div style="display:flex;gap:10px;">
            <select id="filter-role" class="btn btn-outline" style="height:36px;padding:0 10px;">
              <option value="">All Roles</option>
              <option value="student">Students Only</option>
              <option value="teacher">Teachers Only</option>
              <option value="admin">Admins Only</option>
            </select>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Assigned Class/Division</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody id="users-table-body">
              ${renderUserRows(cachedUsers)}
            </tbody>
          </table>
        </div>
      </div>
    `;

    
    const roleSelect = document.getElementById('user-role');
    const studentBox = document.getElementById('student-assignment-box');
    const teacherBox = document.getElementById('teacher-assignment-box');

    roleSelect.addEventListener('change', () => {
      if (roleSelect.value === 'student') {
        studentBox.style.display = 'grid';
        teacherBox.style.display = 'none';
      } else if (roleSelect.value === 'teacher') {
        studentBox.style.display = 'none';
        teacherBox.style.display = 'grid';
      } else {
        studentBox.style.display = 'none';
        teacherBox.style.display = 'none';
      }
    });

    
    const form = document.getElementById('create-user-form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const role = roleSelect.value;
      const name = document.getElementById('user-name').value.trim();
      const email = document.getElementById('user-email').value.trim();
      const password = document.getElementById('user-password').value;

      const payload = { name, email, password, role };

      if (role === 'student') {
        const selectedId = document.getElementById('student-class-div').value;
        if (!selectedId) {
          showAlert('Please select a class and division for the student.', 'danger');
          return;
        }
        payload.classId = selectedId;
        payload.divisionId = selectedId;
      } else if (role === 'teacher') {
        const selectedOptions = Array.from(document.getElementById('teacher-divisions').selectedOptions);
        const divisions = selectedOptions.map(opt => opt.value);
        if (divisions.length === 0) {
          showAlert('Please select at least one division for the teacher.', 'danger');
          return;
        }
        payload.divisions = divisions;
      }

      try {
        await EvalSyncAPI.post('/admin/users', payload);
        showAlert(`User ${name} created successfully!`);
        renderView();
      } catch (err) {
        showAlert(err.message || 'Failed to create user', 'danger');
      }
    });

    
    const filterRole = document.getElementById('filter-role');
    filterRole.addEventListener('change', async () => {
      const selected = filterRole.value;
      const url = selected ? `/admin/users?role=${selected}` : '/admin/users';
      try {
        const filtered = await EvalSyncAPI.get(url);
        document.getElementById('users-table-body').innerHTML = renderUserRows(filtered);
        attachUserActionHandlers();
      } catch (err) {
        showAlert('Failed to filter users', 'danger');
      }
    });

    attachUserActionHandlers();
  }

  function renderUserRows(users) {
    if (!users || users.length === 0) {
      return `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:24px;">No users found.</td></tr>`;
    }
    return users.map(u => `
      <tr data-user-id="${u._id}">
        <td><strong>${u.name}</strong></td>
        <td>${u.email}</td>
        <td><span class="chip chip-${u.role}">${u.role}</span></td>
        <td>${formatUserClassDiv(u)}</td>
        <td>
          <button class="btn btn-outline btn-sm btn-edit-user" data-id="${u._id}" data-name="${u.name}" data-email="${u.email}">Edit</button>
          <button class="btn btn-danger btn-sm btn-delete-user" data-id="${u._id}" data-name="${u.name}">Delete</button>
        </td>
      </tr>
    `).join('');
  }

  function attachUserActionHandlers() {
    
    document.querySelectorAll('.btn-delete-user').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        if (!confirm(`Are you sure you want to delete user "${name}"?`)) return;

        try {
          await EvalSyncAPI.delete(`/admin/users/${id}`);
          showAlert(`User "${name}" has been deleted.`);
          renderView();
        } catch (err) {
          showAlert(err.message || 'Error deleting user', 'danger');
        }
      });
    });

    
    document.querySelectorAll('.btn-edit-user').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const currentName = btn.dataset.name;
        const currentEmail = btn.dataset.email;
        showEditModal(id, currentName, currentEmail);
      });
    });
  }

  function showEditModal(id, name, email) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box">
        <div class="modal-header">
          <h3>Edit User</h3>
          <button class="close-btn" id="close-modal">&times;</button>
        </div>
        <form id="edit-user-form">
          <div class="form-group" style="margin-bottom:14px;">
            <label>Full Name</label>
            <input type="text" id="edit-name" value="${name}" required>
          </div>
          <div class="form-group" style="margin-bottom:20px;">
            <label>Email Address</label>
            <input type="email" id="edit-email" value="${email}" required>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:10px;">
            <button type="button" class="btn btn-outline" id="cancel-edit">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Changes</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#close-modal').addEventListener('click', close);
    overlay.querySelector('#cancel-edit').addEventListener('click', close);

    overlay.querySelector('#edit-user-form').addEventListener('submit', async e => {
      e.preventDefault();
      const updatedName = overlay.querySelector('#edit-name').value.trim();
      const updatedEmail = overlay.querySelector('#edit-email').value.trim();

      try {
        await EvalSyncAPI.patch(`/admin/users/${id}`, {
          name: updatedName,
          email: updatedEmail
        });
        close();
        showAlert('User details updated successfully!');
        renderView();
      } catch (err) {
        alert(err.message || 'Failed to update user');
      }
    });
  }

  
  function renderClasses() {
    contentEl.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Create Class & Division</h2>
        </div>
        <form id="create-class-form">
          <div class="form-grid">
            <div class="form-group">
              <label>Class Name (e.g. FY, SY, TY)</label>
              <input type="text" id="class-name" placeholder="e.g. TY" required>
            </div>
            <div class="form-group">
              <label>Division (e.g. A, B, C)</label>
              <input type="text" id="class-division" placeholder="e.g. A" required>
            </div>
          </div>
          <button type="submit" class="btn btn-primary">Create Class-Division</button>
        </form>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Registered Class-Division Pairs</h2>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Class</th>
                <th>Division</th>
                <th>ID</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              ${cachedClasses.map(c => `
                <tr>
                  <td><strong>${c.className}</strong></td>
                  <td>Division ${c.division}</td>
                  <td><code>${c._id}</code></td>
                  <td>${new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('create-class-form').addEventListener('submit', async e => {
      e.preventDefault();
      const className = document.getElementById('class-name').value.trim();
      const division = document.getElementById('class-division').value.trim();

      try {
        await EvalSyncAPI.post('/admin/classes', { className, division });
        showAlert(`Class ${className}-${division} created successfully!`);
        renderView();
      } catch (err) {
        showAlert(err.message || 'Error creating class', 'danger');
      }
    });
  }

  function formatUserClassDiv(u) {
    if (u.role === 'student') {
      if (u.classId && typeof u.classId === 'object') {
        return `${u.classId.className} · ${u.classId.division}`;
      }
      return '-';
    }
    if (u.role === 'teacher') {
      if (Array.isArray(u.divisions) && u.divisions.length > 0) {
        return u.divisions.map(d => typeof d === 'object' ? `${d.className} · ${d.division}` : d).join(', ');
      }
      return '-';
    }
    return '-';
  }

  
  renderView();
});
