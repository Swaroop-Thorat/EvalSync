document.addEventListener('DOMContentLoaded', async () => {
  const session = EvalSyncAuth.requireRole('student');
  if (!session) return;

  const contentEl = document.getElementById('app-content');
  const pageTitleEl = document.getElementById('page-title');
  const navButtons = document.querySelectorAll('.sidebar .nav');

  if (session.user) {
    document.getElementById('student-name').textContent = session.user.name || 'Student';
    const sAvatar = document.getElementById('student-avatar');
    if (sAvatar && sAvatar.tagName !== 'IMG') {
      sAvatar.textContent = (session.user.name || 'S')[0].toUpperCase();
    }
  }

  document.getElementById('logout')?.addEventListener('click', () => EvalSyncAuth.signOut());

  function renderRealtimeDate() {
    const todayEl = document.querySelector('.today');
    if (todayEl) {
      const now = new Date();
      const options = { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' };
      todayEl.textContent = now.toLocaleDateString('en-US', options).toUpperCase();
    }
  }
  renderRealtimeDate();

  let currentView = 'assignments';
  let assignments = [];
  let mySubmissions = [];
  let studentHistory = null;

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
      const [assigns, historyData] = await Promise.all([
        EvalSyncAPI.get('/student/assignments'),
        EvalSyncAPI.get('/student/history')
      ]);
      assignments = assigns;
      studentHistory = historyData;
      mySubmissions = historyData?.submissions || [];
      renderView();
    } catch (err) {
      console.error('Error loading student data:', err);
    }
  }

  function showAlert(msg, type = 'success') {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.innerHTML = `<span>${msg}</span><button onclick="this.parentElement.remove()" style="background:none;border:0;cursor:pointer;"></button>`;
    contentEl.prepend(alert);
    setTimeout(() => alert.remove(), 4000);
  }

  function renderView() {
    if (currentView === 'assignments') {
      pageTitleEl.textContent = 'Assigned Coursework';
      renderAssignments();
    } else if (currentView === 'history' || currentView === 'submissions') {
      pageTitleEl.textContent = 'Academic Submission History';
      renderHistory();
    }
  }

  function renderAssignments() {
    const submittedAssignIds = mySubmissions.map(s => s.assignmentId?._id || s.assignmentId);

    contentEl.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Current Assignments (${assignments.length})</h2>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Subject & Topic</th>
                <th>Instructor</th>
                <th>Deadline</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${assignments.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">No active assignments for your division.</td></tr>' :
                assignments.map(a => {
                  const isSubmitted = submittedAssignIds.includes(a._id);
                  return `
                    <tr>
                      <td><strong>${a.title}</strong></td>
                      <td>${a.subject} · <span style="color:var(--text-muted)">${a.topic}</span></td>
                      <td>${a.teacherId?.name || 'Faculty'}</td>
                      <td>${new Date(a.deadline).toLocaleDateString()}</td>
                      <td>
                        <span class="chip ${isSubmitted ? 'chip-student' : 'chip-admin'}">
                          ${isSubmitted ? 'Submitted' : 'Pending'}
                        </span>
                      </td>
                      <td>
                        <div style="display:flex;gap:8px;">
                          <button class="btn btn-outline btn-sm btn-view-pdf" data-url="${a.fileUrl}" data-title="${a.title}">View Assignment</button>
                          ${!isSubmitted ? `
                            <button class="btn btn-primary btn-sm btn-open-submit" data-id="${a._id}" data-title="${a.title}">Upload Submission</button>
                          ` : `
                            <span style="font-size:12px;color:var(--accent);font-weight:600;display:inline-flex;align-items:center;">Completed</span>
                          `}
                        </div>
                      </td>
                    </tr>
                  `;
                }).join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.querySelectorAll('.btn-view-pdf').forEach(btn => {
      btn.addEventListener('click', () => {
        window.openPDF(btn.dataset.url, btn.dataset.title);
      });
    });

    document.querySelectorAll('.btn-open-submit').forEach(btn => {
      btn.addEventListener('click', () => {
        showSubmitModal(btn.dataset.id, btn.dataset.title);
      });
    });
  }

  function renderHistory() {
    const totalAssigned = studentHistory?.totalAssigned || assignments.length;
    const totalSubmitted = studentHistory?.totalSubmitted || mySubmissions.length;
    const totalPending = studentHistory?.totalPending || (totalAssigned - totalSubmitted);
    const turnInRate = totalAssigned > 0 ? Math.round((totalSubmitted / totalAssigned) * 100) : 100;
    const pendingList = studentHistory?.pendingAssignments || [];

    contentEl.innerHTML = `
      <div class="stats-grid" style="margin-bottom:24px;">
        <div class="stat-card">
          <div class="label">Coursework Assigned</div>
          <div class="val">${totalAssigned}</div>
        </div>
        <div class="stat-card">
          <div class="label">Completed Submissions</div>
          <div class="val" style="color:var(--accent)">${totalSubmitted}</div>
        </div>
        <div class="stat-card">
          <div class="label">Pending Submissions</div>
          <div class="val" style="color:${totalPending > 0 ? 'var(--danger)' : 'var(--accent)'}">${totalPending}</div>
        </div>
        <div class="stat-card">
          <div class="label">Turn-In Rate</div>
          <div class="val" style="color:var(--accent)">${turnInRate}%</div>
        </div>
      </div>

      <div class="panel" style="margin-bottom:24px;">
        <div class="panel-header">
          <h2 class="panel-title">Completed Submission History (${mySubmissions.length})</h2>
          <span class="chip chip-student">${totalSubmitted} of ${totalAssigned} completed</span>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Assignment Title</th>
                <th>Subject & Topic</th>
                <th>Instructor</th>
                <th>Submitted Date</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${mySubmissions.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">You have not submitted any assignments yet.</td></tr>' :
                mySubmissions.map(s => `
                  <tr>
                    <td><strong>${s.assignmentId?.title || 'Assignment'}</strong></td>
                    <td>${s.assignmentId?.subject || '-'} · <span style="color:var(--text-muted)">${s.assignmentId?.topic || '-'}</span></td>
                    <td>${s.assignmentId?.teacherId?.name || 'Instructor'}</td>
                    <td>${new Date(s.submittedAt).toLocaleString()}</td>
                    <td>
                      <span class="chip ${s.status === 'flagged' ? 'chip-flagged' : 'chip-submitted'}">
                        ${s.status === 'flagged' ? 'Flagged' : 'Submitted'}
                      </span>
                    </td>
                    <td>
                      <button class="btn btn-outline btn-sm btn-view-pdf" data-url="${s.fileUrl}" data-title="${s.assignmentId?.title || 'My Submission'}">
                        View PDF
                      </button>
                    </td>
                  </tr>
                `).join('')
              }
            </tbody>
          </table>
        </div>
      </div>

      ${pendingList.length > 0 ? `
        <div class="panel">
          <div class="panel-header">
            <h3 class="panel-title" style="color:var(--danger);">Pending Coursework Action Items (${pendingList.length})</h3>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Assignment Title</th>
                  <th>Subject & Topic</th>
                  <th>Deadline</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${pendingList.map(p => `
                  <tr>
                    <td><strong>${p.title}</strong></td>
                    <td>${p.subject} · <span style="color:var(--text-muted)">${p.topic}</span></td>
                    <td>${new Date(p.deadline).toLocaleDateString()}</td>
                    <td>
                      <div style="display:flex;gap:8px;">
                        <button class="btn btn-outline btn-sm btn-view-pdf" data-url="${p.fileUrl}" data-title="${p.title}">View Assignment</button>
                        <button class="btn btn-primary btn-sm btn-open-submit" data-id="${p._id}" data-title="${p.title}">Upload Submission</button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : ''}
    `;

    contentEl.querySelectorAll('.btn-view-pdf').forEach(btn => {
      btn.addEventListener('click', () => {
        window.openPDF(btn.dataset.url, btn.dataset.title);
      });
    });

    contentEl.querySelectorAll('.btn-open-submit').forEach(btn => {
      btn.addEventListener('click', () => {
        showSubmitModal(btn.dataset.id, btn.dataset.title);
      });
    });
  }

  function showSubmitModal(assignmentId, title) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-box">
        <div class="modal-header">
          <h3>Submit Assignment</h3>
          <button class="close-btn" id="close-sub-modal">&times;</button>
        </div>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px;">
          Uploading response for: <strong>${title}</strong>
        </p>
        <form id="submission-form">
          <div class="form-group" style="margin-bottom:20px;">
            <label>Upload PDF Document (PDF only)</label>
            <input type="file" id="submission-file" accept="application/pdf" required style="padding:8px;">
          </div>
          <div style="display:flex;justify-content:flex-end;gap:10px;">
            <button type="button" class="btn btn-outline" id="cancel-sub">Cancel</button>
            <button type="submit" class="btn btn-primary" id="btn-submit-file">Upload & Submit</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#close-sub-modal').addEventListener('click', close);
    overlay.querySelector('#cancel-sub').addEventListener('click', close);

    overlay.querySelector('#submission-form').addEventListener('submit', async e => {
      e.preventDefault();
      const fileInput = overlay.querySelector('#submission-file');
      if (!fileInput.files || !fileInput.files[0]) {
        alert('Please choose a PDF file.');
        return;
      }

      const submitBtn = overlay.querySelector('#btn-submit-file');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Processing PDF & Vectorizing...';

      const formData = new FormData();
      formData.append('assignmentId', assignmentId);
      formData.append('file', fileInput.files[0]);

      try {
        await EvalSyncAPI.post('/submissions', formData);
        close();
        showAlert('Your assignment submission was successfully uploaded and processed!');
        await loadData();
      } catch (err) {
        alert(err.message || 'Error uploading submission');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload & Submit';
      }
    });
  }

  loadData();
});
