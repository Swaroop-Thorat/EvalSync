document.addEventListener('DOMContentLoaded', async () => {
  const session = EvalSyncAuth.requireRole('teacher');
  if (!session) return;

  const contentEl = document.getElementById('app-content');
  const pageTitleEl = document.getElementById('page-title');
  const navButtons = document.querySelectorAll('.sidebar .nav');
  const divisionSelector = document.getElementById('division-selector');

  if (session.user) {
    document.getElementById('teacher-name').textContent = session.user.name || 'Faculty Member';
    const tAvatar = document.getElementById('teacher-avatar');
    if (tAvatar && tAvatar.tagName !== 'IMG') {
      tAvatar.textContent = (session.user.name || 'T')[0].toUpperCase();
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
  let teacherDivisions = [];
  let assignments = [];
  let selectedAssignment = null;
  let activeTab = 'submissions'; 

  
  const diffModal = document.getElementById('diff-modal');
  const diffCloseBtn = document.getElementById('diff-close');
  diffCloseBtn?.addEventListener('click', () => diffModal.close());

  
  const aiQuestionsModal = document.getElementById('ai-questions-modal');
  const aiQCloseBtn = document.getElementById('ai-q-close');
  aiQCloseBtn?.addEventListener('click', () => aiQuestionsModal?.close());

  const aiRelevanceModal = document.getElementById('ai-relevance-modal');
  const aiRelCloseBtn = document.getElementById('ai-rel-close');
  aiRelCloseBtn?.addEventListener('click', () => aiRelevanceModal?.close());

  const aiDetectModal = document.getElementById('ai-detect-modal');
  const aiDetCloseBtn = document.getElementById('ai-det-close');
  aiDetCloseBtn?.addEventListener('click', () => aiDetectModal?.close());

  [diffModal, aiQuestionsModal, aiRelevanceModal, aiDetectModal].forEach(d => {
    d?.addEventListener('click', e => {
      if (e.target === d) d.close();
    });
  });

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      navButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.dataset.view;
      if (currentView !== 'details') {
        selectedAssignment = null;
      }
      renderView();
    });
  });

  divisionSelector.addEventListener('change', () => {
    loadAssignments();
  });

  async function loadInitialData() {
    try {
      teacherDivisions = await EvalSyncAPI.get('/teacher/divisions');
      divisionSelector.innerHTML = '<option value="">All Assigned Divisions</option>' +
        teacherDivisions.map(d => `<option value="${d._id}">${d.className} · Division ${d.division}</option>`).join('');
      await loadAssignments();
    } catch (err) {
      console.error('Error loading teacher data:', err);
    }
  }

  async function loadAssignments() {
    try {
      const selectedDiv = divisionSelector.value;
      const url = selectedDiv ? `/assignments?divisionId=${selectedDiv}` : '/assignments';
      assignments = await EvalSyncAPI.get(url);
      renderView();
    } catch (err) {
      console.error('Error loading assignments:', err);
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
      pageTitleEl.textContent = 'Coursework & Assignments';
      renderAssignmentsView();
    } else if (currentView === 'upload') {
      pageTitleEl.textContent = 'Upload New Assignment';
      renderUploadView();
    } else if (currentView === 'details' && selectedAssignment) {
      pageTitleEl.textContent = `${selectedAssignment.title} · Overview`;
      renderAssignmentDetailsView();
    }
  }

  function renderAssignmentsView() {
    contentEl.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Active Assignments (${assignments.length})</h2>
          <button class="btn btn-primary" id="btn-quick-upload">Upload New Coursework</button>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Subject & Topic</th>
                <th>Target Divisions</th>
                <th>Deadline</th>
                <th>Threshold</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${assignments.length === 0 ? '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-muted);">No assignments found for this division.</td></tr>' :
                assignments.map(a => `
                  <tr>
                    <td>
                      <a href="#" class="btn-open-details" data-id="${a._id}" style="color:var(--primary);font-weight:700;text-decoration:none;">
                        ${a.title}
                      </a>
                    </td>
                    <td>${a.subject} · <span style="color:var(--text-muted)">${a.topic}</span></td>
                    <td>${(a.targetDivisions || []).map(d => `${d.className} · ${d.division}`).join(', ') || '-'}</td>
                    <td>${new Date(a.deadline).toLocaleDateString()}</td>
                    <td><span class="chip chip-student">${a.plagiarismThreshold}%</span></td>
                    <td>
                      <div style="display:flex;gap:6px;align-items:center;">
                        <button class="btn btn-primary btn-sm btn-open-details" data-id="${a._id}">View Submissions</button>
                        <button class="btn btn-outline btn-sm btn-view-pdf" data-url="${a.fileUrl}" data-title="${a.title}">PDF</button>
                      </div>
                    </td>
                  </tr>
                `).join('')
              }
            </tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('btn-quick-upload')?.addEventListener('click', () => {
      document.querySelector('[data-view="upload"]')?.click();
    });

    document.querySelectorAll('.btn-view-pdf').forEach(btn => {
      btn.addEventListener('click', () => {
        window.openPDF(btn.dataset.url, btn.dataset.title);
      });
    });

    document.querySelectorAll('.btn-open-details').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = btn.dataset.id;
        selectedAssignment = assignments.find(a => a._id === id);
        if (selectedAssignment) {
          currentView = 'details';
          activeTab = 'submissions';
          renderView();
        }
      });
    });
  }

  async function renderAssignmentDetailsView() {
    contentEl.innerHTML = `
      <div style="margin-bottom:16px;">
        <button class="btn btn-outline btn-sm" id="btn-back-assignments">Back to Assignments</button>
      </div>

      <div class="assignment-detail-header">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
          <div>
            <h2 style="margin:0 0 6px;font-family:var(--font-display);font-size:24px;font-weight:800;letter-spacing:1px;color:var(--text-primary);text-transform:uppercase;">${selectedAssignment.title}</h2>
            <p style="margin:0;color:var(--text-muted);font-size:13px;">
              ${selectedAssignment.subject} · ${selectedAssignment.topic} · 
              Target: ${(selectedAssignment.targetDivisions || []).map(d => `${d.className}-${d.division}`).join(', ')} · 
              Deadline: ${new Date(selectedAssignment.deadline).toLocaleDateString()} · 
              Plagiarism Threshold: <strong>${selectedAssignment.plagiarismThreshold}%</strong>
            </p>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-outline btn-sm" id="btn-view-assign-pdf">View Assignment PDF</button>
            <button class="btn btn-outline btn-sm" id="btn-suggest-questions-global">AI Viva Questions</button>
            <button class="btn btn-primary btn-sm" id="btn-run-plagiarism-top">Run Plagiarism Check</button>
          </div>
        </div>
      </div>

      <div class="tab-nav">
        <button class="tab-btn ${activeTab === 'submissions' ? 'active' : ''}" data-tab="submissions">Submissions</button>
        <button class="tab-btn ${activeTab === 'plagiarism' ? 'active' : ''}" data-tab="plagiarism">Plagiarism Reports</button>
        <button class="tab-btn ${activeTab === 'nonsubmitters' ? 'active' : ''}" data-tab="nonsubmitters">Non-Submitters</button>
      </div>

      <div id="tab-content">
        <div style="text-align:center;padding:40px;color:var(--text-muted);">Loading tab data...</div>
      </div>
    `;

    document.getElementById('btn-back-assignments')?.addEventListener('click', () => {
      currentView = 'assignments';
      renderView();
    });

    document.getElementById('btn-view-assign-pdf')?.addEventListener('click', () => {
      window.openPDF(selectedAssignment.fileUrl, selectedAssignment.title);
    });

    document.getElementById('btn-suggest-questions-global')?.addEventListener('click', () => {
      openAIQuestionsModal();
    });

    document.getElementById('btn-run-plagiarism-top')?.addEventListener('click', () => {
      triggerPlagiarismCheck();
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderActiveTab();
      });
    });

    await renderActiveTab();
  }

  async function renderActiveTab() {
    const tabContainer = document.getElementById('tab-content');
    if (!tabContainer || !selectedAssignment) return;

    if (activeTab === 'submissions') {
      await loadAndRenderSubmissions(tabContainer);
    } else if (activeTab === 'plagiarism') {
      await loadAndRenderPlagiarism(tabContainer);
    } else if (activeTab === 'nonsubmitters') {
      await loadAndRenderNonSubmitters(tabContainer);
    }
  }

  async function loadAndRenderSubmissions(container) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">Loading submissions...</div>';
    try {
      const submissions = await EvalSyncAPI.get(`/assignments/${selectedAssignment._id}/submissions`);
      const flaggedCount = submissions.filter(s => s.status === 'flagged').length;

      container.innerHTML = `
        <div class="stats-grid" style="margin-bottom:20px;">
          <div class="stat-card">
            <div class="label">Total Submissions</div>
            <div class="val">${submissions.length}</div>
          </div>
          <div class="stat-card">
            <div class="label">Flagged Submissions</div>
            <div class="val" style="color:${flaggedCount > 0 ? 'var(--danger)' : 'inherit'}">${flaggedCount}</div>
          </div>
          <div class="stat-card">
            <div class="label">Status</div>
            <div class="val" style="font-size:20px;display:flex;align-items:center;height:38px;">
              ${submissions.length >= 2 ? '<span style="color:var(--accent)">Ready for Plagiarism Check</span>' : '<span style="color:var(--text-muted)">Need >=2 submissions</span>'}
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header">
            <h3 class="panel-title">Student Submissions (${submissions.length})</h3>
            <button class="btn btn-primary" id="btn-run-plagiarism-tab" ${submissions.length < 2 ? 'disabled' : ''}>
              Run Plagiarism Check
            </button>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>Email</th>
                  <th>Submitted At</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${submissions.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-muted);">No submissions yet for this coursework.</td></tr>' :
                  submissions.map(s => `
                    <tr>
                      <td><strong>${s.studentId?.name || 'Unknown Student'}</strong></td>
                      <td>${s.studentId?.email || '-'}</td>
                      <td>${new Date(s.submittedAt).toLocaleString()}</td>
                      <td>
                        <span class="chip ${s.status === 'flagged' ? 'chip-flagged' : 'chip-submitted'}">
                          ${s.status === 'flagged' ? 'Flagged' : 'Submitted'}
                        </span>
                      </td>
                      <td>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;">
                          <button class="btn btn-outline btn-sm btn-view-sub-pdf" data-url="${s.fileUrl}" data-title="${s.studentId?.name || 'Submission'}">
                            PDF
                          </button>
                          <button class="btn btn-outline btn-sm btn-ai-questions" data-subid="${s._id}" data-name="${s.studentId?.name || 'Student'}">
                            Viva
                          </button>
                          <button class="btn btn-outline btn-sm btn-ai-relevance" data-subid="${s._id}" data-name="${s.studentId?.name || 'Student'}">
                            Relevance
                          </button>
                          <button class="btn btn-outline btn-sm btn-ai-detect" data-subid="${s._id}" data-name="${s.studentId?.name || 'Student'}">
                            Detect AI
                          </button>
                        </div>
                      </td>
                    </tr>
                  `).join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      `;

      document.getElementById('btn-run-plagiarism-tab')?.addEventListener('click', triggerPlagiarismCheck);

      container.querySelectorAll('.btn-view-sub-pdf').forEach(btn => {
        btn.addEventListener('click', () => {
          window.openPDF(btn.dataset.url, btn.dataset.title);
        });
      });

      container.querySelectorAll('.btn-ai-questions').forEach(btn => {
        btn.addEventListener('click', () => {
          openAIQuestionsModal(btn.dataset.subid, btn.dataset.name);
        });
      });

      container.querySelectorAll('.btn-ai-relevance').forEach(btn => {
        btn.addEventListener('click', () => {
          openAIRelevanceModal(btn.dataset.subid, btn.dataset.name);
        });
      });

      container.querySelectorAll('.btn-ai-detect').forEach(btn => {
        btn.addEventListener('click', () => {
          openAIDetectModal(btn.dataset.subid, btn.dataset.name);
        });
      });

    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger">${err.message || 'Error loading submissions'}</div>`;
    }
  }

  async function triggerPlagiarismCheck() {
    if (!selectedAssignment) return;
    try {
      showAlert('Running semantic plagiarism check with embeddings...', 'success');
      const result = await EvalSyncAPI.post(`/assignments/${selectedAssignment._id}/check-plagiarism`, {});
      showAlert(`Plagiarism check completed! ${result.flaggedPairs} flagged pairs detected.`, result.flaggedPairs > 0 ? 'danger' : 'success');
      
      activeTab = 'plagiarism';
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === 'plagiarism');
      });
      renderActiveTab();
    } catch (err) {
      showAlert(err.message || 'Failed to run plagiarism check', 'danger');
    }
  }

  async function loadAndRenderPlagiarism(container) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">Loading plagiarism reports...</div>';
    try {
      const reports = await EvalSyncAPI.get(`/assignments/${selectedAssignment._id}/plagiarism-reports`);

      if (reports.length === 0) {
        container.innerHTML = `
          <div class="panel" style="text-align:center;padding:48px 20px;">
            <div style="font-size:36px;margin-bottom:12px;"></div>
            <h3 style="margin:0 0 8px;font-family:var(--font-display);font-size:20px;font-weight:800;letter-spacing:1px;color:var(--text-primary);text-transform:uppercase;">No Plagiarism Check Has Been Run Yet</h3>
            <p style="color:var(--text-muted);font-size:14px;max-width:440px;margin:0 auto 20px;">
              Run a plagiarism check across all student submissions for this assignment to compute pairwise semantic cosine similarities.
            </p>
            <button class="btn btn-primary" id="btn-run-first-check">Run Plagiarism Check Now</button>
          </div>
        `;
        document.getElementById('btn-run-first-check')?.addEventListener('click', triggerPlagiarismCheck);
        return;
      }

      const latestReport = reports[0];
      const flaggedPairs = latestReport.pairs.filter(p => p.flagged);

      
      const submissions = await EvalSyncAPI.get(`/assignments/${selectedAssignment._id}/submissions`);
      const studentToSubMap = {};
      submissions.forEach(s => {
        if (s.studentId && s.studentId._id) {
          studentToSubMap[s.studentId._id] = s._id;
        }
      });

      container.innerHTML = `
        <div class="panel" style="margin-bottom:24px;">
          <div class="panel-header">
            <div>
              <h3 class="panel-title">Latest Plagiarism Report</h3>
              <p style="margin:4px 0 0;font-size:12px;color:var(--text-muted);">
                Generated: ${new Date(latestReport.generatedAt).toLocaleString()} · 
                Total Pairs Analyzed: ${latestReport.pairs.length} · 
                Flagged Pairs: <strong>${flaggedPairs.length}</strong> (Threshold >= ${selectedAssignment.plagiarismThreshold}%)
              </p>
            </div>
            <button class="btn btn-primary" id="btn-rerun-check">Re-Run Check</button>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student A</th>
                  <th>Student B</th>
                  <th>Similarity Score</th>
                  <th>Verdict</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${latestReport.pairs.map(p => {
                  const subAId = studentToSubMap[p.studentA?._id];
                  const subBId = studentToSubMap[p.studentB?._id];
                  return `
                    <tr style="${p.flagged ? 'background:var(--danger-bg);' : ''}">
                      <td><strong>${p.studentA?.name || 'Student A'}</strong><br><small style="color:var(--text-muted);">${p.studentA?.email || ''}</small></td>
                      <td><strong>${p.studentB?.name || 'Student B'}</strong><br><small style="color:var(--text-muted);">${p.studentB?.email || ''}</small></td>
                      <td>
                        <span class="score-badge ${p.flagged ? 'score-flagged' : 'score-clean'}">
                          ${p.score}%
                        </span>
                      </td>
                      <td>
                        ${p.flagged ? '<span class="chip chip-flagged">Above Threshold</span>' : '<span class="chip chip-submitted">Normal</span>'}
                      </td>
                      <td>
                        ${p.studentA?._id && p.studentB?._id ? `
                          <button class="btn btn-outline btn-sm btn-open-diff" data-studenta="${p.studentA._id}" data-studentb="${p.studentB._id}" data-score="${p.score}">
                            Side-by-Side Diff
                          </button>
                        ` : '-'}
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        ${reports.length > 1 ? `
          <div class="panel">
            <h4 class="panel-title" style="font-size:15px;margin-bottom:12px;">Prior Check History (${reports.length - 1})</h4>
            <ul style="margin:0;padding-left:18px;font-size:13px;color:var(--text-muted);">
              ${reports.slice(1).map(r => `
                <li style="margin-bottom:6px;">
                  Ran on ${new Date(r.generatedAt).toLocaleString()} - ${r.pairs.filter(p => p.flagged).length} flagged pairs out of ${r.pairs.length} total pairs
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
      `;

      document.getElementById('btn-rerun-check')?.addEventListener('click', triggerPlagiarismCheck);

      container.querySelectorAll('.btn-open-diff').forEach(btn => {
        btn.addEventListener('click', () => {
          openDiffViewer(btn.dataset.studenta, btn.dataset.studentb, btn.dataset.score);
        });
      });

    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger">${err.message || 'Error loading plagiarism reports'}</div>`;
    }
  }

  async function openDiffViewer(studentAId, studentBId, score) {
    try {
      const data = await EvalSyncAPI.get(`/assignments/${selectedAssignment._id}/diff?studentA=${studentAId}&studentB=${studentBId}`);
      
      document.getElementById('diff-title').textContent = `${data.assignment.title} · Side-by-Side Comparison`;
      document.getElementById('diff-subtitle').textContent = `Similarity Score: ${score}% · Threshold: ${selectedAssignment.plagiarismThreshold}%`;

      document.getElementById('diff-student-a-name').textContent = data.submissionA.student?.name || 'Student A';
      document.getElementById('diff-student-a-chip').textContent = `${data.submissionA.extractedText.length} characters`;

      document.getElementById('diff-student-b-name').textContent = data.submissionB.student?.name || 'Student B';
      document.getElementById('diff-student-b-chip').textContent = `${data.submissionB.extractedText.length} characters`;

      
      const { htmlA, htmlB } = computeJSDiff(data.submissionA.extractedText, data.submissionB.extractedText);

      document.getElementById('diff-text-a').innerHTML = htmlA;
      document.getElementById('diff-text-b').innerHTML = htmlB;

      diffModal.showModal();
    } catch (err) {
      showAlert(err.message || 'Error loading submission diff', 'danger');
    }
  }

  
  function computeJSDiff(textA, textB) {
    if (typeof Diff !== 'undefined' && Diff.diffWords) {
      const diff = Diff.diffWords(textA, textB);
      let htmlA = '';
      let htmlB = '';

      diff.forEach(part => {
        const val = escapeHtml(part.value);
        if (part.added) {
          htmlB += `<span class="diff-added">${val}</span>`;
        } else if (part.removed) {
          htmlA += `<span class="diff-removed">${val}</span>`;
        } else {
          
          htmlA += `<mark class="diff-highlight">${val}</mark>`;
          htmlB += `<mark class="diff-highlight">${val}</mark>`;
        }
      });
      return { htmlA, htmlB };
    }

    
    return { htmlA: escapeHtml(textA), htmlB: escapeHtml(textB) };
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  
  async function openAIQuestionsModal(submissionId = null, studentName = null) {
    if (!selectedAssignment) return;
    const titleEl = document.getElementById('ai-q-title');
    const subtitleEl = document.getElementById('ai-q-subtitle');
    const loadingEl = document.getElementById('ai-q-loading');
    const listEl = document.getElementById('ai-q-list');

    titleEl.textContent = `AI Viva Questions · ${studentName ? studentName : selectedAssignment.title}`;
    subtitleEl.textContent = `Topic: "${selectedAssignment.topic}" · Powered by Google Gemini`;

    loadingEl.hidden = false;
    listEl.innerHTML = '';
    aiQuestionsModal.showModal();

    try {
      const payload = { assignmentId: selectedAssignment._id };
      if (submissionId) payload.submissionId = submissionId;

      const res = await EvalSyncAPI.post('/ai/suggest-questions', payload);
      loadingEl.hidden = true;

      const questions = res.questions || [];
      if (!questions.length) {
        listEl.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">No questions generated.</div>';
        return;
      }

      listEl.innerHTML = questions.map((q, idx) => `
        <div class="ai-q-card">
          <span class="ai-q-num">Question ${idx + 1}</span>
          <p class="ai-q-text">${escapeHtml(q.question)}</p>
          <p class="ai-q-rationale">Probe Intent: ${escapeHtml(q.rationale)}</p>
        </div>
      `).join('');
    } catch (err) {
      loadingEl.hidden = true;
      listEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message || 'Error generating questions')}</div>`;
    }
  }

  async function openAIRelevanceModal(submissionId, studentName) {
    if (!selectedAssignment || !submissionId) return;
    const titleEl = document.getElementById('ai-rel-title');
    const subtitleEl = document.getElementById('ai-rel-subtitle');
    const loadingEl = document.getElementById('ai-rel-loading');
    const contentEl = document.getElementById('ai-rel-content');

    titleEl.textContent = `Topic Relevance Check · ${studentName || 'Student'}`;
    subtitleEl.textContent = `Expected Topic: "${selectedAssignment.topic}" · Powered by Gemini`;

    loadingEl.hidden = false;
    contentEl.innerHTML = '';
    aiRelevanceModal.showModal();

    try {
      const res = await EvalSyncAPI.post('/ai/check-relevance', {
        assignmentId: selectedAssignment._id,
        submissionId
      });
      loadingEl.hidden = true;

      const rel = res.relevance || {};
      const isRel = rel.isRelevant !== false;

      contentEl.innerHTML = `
        <div class="ai-verdict-header">
          <div>
            <span class="ai-verdict-badge ${isRel ? 'ai-verdict-relevant' : 'ai-verdict-irrelevant'}">
              ${isRel ? 'On-Topic & Relevant' : 'Off-Topic / Irrelevant'}
            </span>
          </div>
          <span style="font-size:13px;font-weight:700;color:var(--text-primary);">
            ${rel.confidence || 0}% Confidence
          </span>
        </div>

        <div class="ai-stat-row">
          <div class="ai-stat-item">
            <small>Assignment Topic</small>
            <strong style="font-size:14px;">${escapeHtml(res.assignment?.topic || selectedAssignment.topic)}</strong>
          </div>
          <div class="ai-stat-item">
            <small>Student</small>
            <strong style="font-size:14px;">${escapeHtml(res.student?.name || studentName)}</strong>
          </div>
        </div>

        <div style="background:var(--bg-deep);border:1px solid var(--border-dark);padding:14px;margin-top:12px;">
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">Evaluator Justification</div>
          <p style="margin:0;font-size:13px;line-height:1.5;color:var(--text-secondary);">${escapeHtml(rel.explanation || 'Submission addresses the required coursework.')}</p>
        </div>
      `;
    } catch (err) {
      loadingEl.hidden = true;
      contentEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message || 'Error checking topic relevance')}</div>`;
    }
  }

  async function openAIDetectModal(submissionId, studentName) {
    if (!submissionId) return;
    const titleEl = document.getElementById('ai-det-title');
    const subtitleEl = document.getElementById('ai-det-subtitle');
    const loadingEl = document.getElementById('ai-det-loading');
    const warningBanner = document.getElementById('ai-det-warning-banner');
    const warningText = document.getElementById('ai-det-warning-text');
    const contentEl = document.getElementById('ai-det-content');

    titleEl.textContent = `AI Content Detection · ${studentName || 'Student'}`;
    subtitleEl.textContent = `AI-Likelihood Estimation Analysis`;

    
    warningBanner.style.display = 'none';
    loadingEl.hidden = false;
    contentEl.innerHTML = '';
    aiDetectModal.showModal();

    try {
      const res = await EvalSyncAPI.post('/ai/detect-ai', { submissionId });
      loadingEl.hidden = true;

      const providerName = res.provider || 'Gemini AI Detector';
      subtitleEl.textContent = `${providerName} · AI-Likelihood Estimation`;

      
      if (res.limitReached) {
        warningBanner.style.display = 'block';
        const warningTitle = document.getElementById('ai-det-warning-title');
        if (warningTitle) warningTitle.textContent = `${providerName} Notice:`;
        let userMessage = res.warning || `${providerName} service limit reached. Please try again later.`;
        if (userMessage.includes('{') || userMessage.includes('(') || userMessage.includes('503') || userMessage.includes('error')) {
          userMessage = 'Gemini AI service limit reached or temporarily unavailable. Please try again later.';
        }
        warningText.textContent = userMessage;

        contentEl.innerHTML = `
          <div class="ai-verdict-header">
            <div>
              <span class="ai-verdict-badge score-flagged">
                ${escapeHtml(res.verdict || 'Service Unavailable')}
              </span>
            </div>
            <span style="font-size:13px;font-weight:700;color:var(--danger);">
              Detection Unavailable
            </span>
          </div>

          <div class="ai-stat-row">
            <div class="ai-stat-item">
              <small>Student</small>
              <strong style="font-size:14px;">${escapeHtml(res.student?.name || studentName)}</strong>
            </div>
            <div class="ai-stat-item">
              <small>Detection Provider</small>
              <strong style="font-size:14px;">${escapeHtml(providerName)}</strong>
            </div>
          </div>

          <div style="background:var(--bg-deep);border:1px solid var(--border-dark);padding:14px;margin-top:12px;">
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">Assessment Safeguard</div>
            <p style="margin:0;font-size:13px;line-height:1.5;color:var(--text-secondary);">
              ${escapeHtml(res.disclaimer || 'Detection unavailable due to API quota limits. No mock scores are displayed to preserve assessment integrity.')}
            </p>
          </div>
        `;
        return;
      }

      const prob = res.aiProbability;
      const isHighAi = prob > 50;

      contentEl.innerHTML = `
        <div class="ai-verdict-header">
          <div>
            <span class="ai-verdict-badge ${isHighAi ? 'ai-verdict-irrelevant' : 'ai-verdict-relevant'}">
              ${isHighAi ? 'Elevated AI Likelihood' : 'Low AI Likelihood'}
              ${res.cached ? ' <span style="font-size:10px;opacity:0.85;margin-left:4px;">(Cached)</span>' : ''}
            </span>
          </div>
          <span style="font-size:14px;font-weight:700;color:var(--accent);">
            ${prob}% AI Likelihood
          </span>
        </div>

        <div class="ai-stat-row">
          <div class="ai-stat-item">
            <small>Student</small>
            <strong style="font-size:14px;">${escapeHtml(res.student?.name || studentName)}</strong>
          </div>
          <div class="ai-stat-item">
            <small>Provider / Status</small>
            <strong style="font-size:14px;">${escapeHtml(providerName)} ${res.cached ? '' : ''}</strong>
          </div>
        </div>

        <div style="background:var(--bg-deep);border:1px solid var(--border-dark);padding:14px;margin-top:12px;">
          <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;margin-bottom:6px;">AI-Likelihood Estimate Note</div>
          <p style="margin:0;font-size:13px;line-height:1.5;color:var(--text-secondary);">
            ${escapeHtml(res.disclaimer || 'This score is a statistical AI-likelihood estimate and does NOT constitute definitive proof of AI authorship or academic misconduct.')}
          </p>
        </div>
      `;
    } catch (err) {
      loadingEl.hidden = true;
      contentEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(err.message || 'Error running AI detection')}</div>`;
    }
  }

  async function loadAndRenderNonSubmitters(container) {
    container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">Loading non-submitters...</div>';
    try {
      const data = await EvalSyncAPI.get(`/assignments/${selectedAssignment._id}/non-submitters`);

      container.innerHTML = `
        <div class="stats-grid" style="margin-bottom:20px;">
          <div class="stat-card">
            <div class="label">Total Students Enrolled</div>
            <div class="val">${data.total}</div>
          </div>
          <div class="stat-card">
            <div class="label">Submitted</div>
            <div class="val" style="color:var(--accent)">${data.submitted}</div>
          </div>
          <div class="stat-card">
            <div class="label">Missing Submissions</div>
            <div class="val" style="color:${data.nonSubmitters.length > 0 ? 'var(--danger)' : 'var(--accent)'}">${data.nonSubmitters.length}</div>
          </div>
        </div>

        <div class="panel">
          <div class="panel-header">
            <h3 class="panel-title">Students Yet to Submit (${data.nonSubmitters.length})</h3>
            <span class="chip ${data.nonSubmitters.length === 0 ? 'chip-submitted' : 'chip-missing'}">
              ${data.nonSubmitters.length === 0 ? '100% Turn-in Rate' : `${Math.round(((data.total - data.nonSubmitters.length) / (data.total || 1)) * 100)}% Turn-in Rate`}
            </span>
          </div>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student Name</th>
                  <th>Email</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${data.nonSubmitters.length === 0 ? '<tr><td colspan="3" style="text-align:center;padding:24px;color:var(--accent);font-weight:600;">All enrolled students have submitted their coursework! </td></tr>' :
                  data.nonSubmitters.map(s => `
                    <tr>
                      <td><strong>${s.name}</strong></td>
                      <td>${s.email}</td>
                      <td><span class="chip chip-missing">Pending Submission</span></td>
                    </tr>
                  `).join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div class="alert alert-danger">${err.message || 'Error loading non-submitters'}</div>`;
    }
  }

  function renderUploadView() {
    contentEl.innerHTML = `
      <div class="panel">
        <div class="panel-header">
          <h2 class="panel-title">Create & Upload Assignment PDF</h2>
        </div>
        <form id="upload-assignment-form">
          <div class="form-grid">
            <div class="form-group">
              <label>Assignment Title</label>
              <input type="text" id="assign-title" placeholder="e.g. Tree Traversal Lab" required>
            </div>
            <div class="form-group">
              <label>Subject</label>
              <input type="text" id="assign-subject" placeholder="e.g. Computer Science" required>
            </div>
            <div class="form-group">
              <label>Topic</label>
              <input type="text" id="assign-topic" placeholder="e.g. Binary Search Trees" required>
            </div>
            <div class="form-group">
              <label>Submission Deadline</label>
              <input type="date" id="assign-deadline" required>
            </div>
            <div class="form-group">
              <label>Plagiarism Threshold (%)</label>
              <input type="number" id="assign-threshold" value="70" min="1" max="100" required>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:16px;">
            <label>Target Divisions (Select one or more)</label>
            <select id="assign-divisions" multiple size="3" required>
              ${teacherDivisions.map(d => `
                <option value="${d._id}">${d.className} · Division ${d.division}</option>
              `).join('')}
            </select>
          </div>

          <div class="form-group" style="margin-bottom:24px;">
            <label>Assignment PDF File (PDF only)</label>
            <input type="file" id="assign-file" accept="application/pdf" required style="padding:8px;">
          </div>

          <button type="submit" class="btn btn-primary" id="btn-submit-assignment">Upload Coursework</button>
        </form>
      </div>
    `;

    const form = document.getElementById('upload-assignment-form');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const title = document.getElementById('assign-title').value.trim();
      const subject = document.getElementById('assign-subject').value.trim();
      const topic = document.getElementById('assign-topic').value.trim();
      const deadline = document.getElementById('assign-deadline').value;
      const threshold = document.getElementById('assign-threshold').value;

      const selectedOptions = Array.from(document.getElementById('assign-divisions').selectedOptions);
      const divisions = selectedOptions.map(opt => opt.value);
      if (divisions.length === 0) {
        showAlert('Please select at least one target division.', 'danger');
        return;
      }

      const fileInput = document.getElementById('assign-file');
      if (!fileInput.files || !fileInput.files[0]) {
        showAlert('Please select a PDF file to upload.', 'danger');
        return;
      }

      const submitBtn = document.getElementById('btn-submit-assignment');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Uploading to Cloudinary...';

      const formData = new FormData();
      formData.append('title', title);
      formData.append('subject', subject);
      formData.append('topic', topic);
      formData.append('deadline', deadline);
      formData.append('plagiarismThreshold', threshold);
      formData.append('targetDivisions', JSON.stringify(divisions));
      formData.append('file', fileInput.files[0]);

      try {
        await EvalSyncAPI.post('/assignments', formData);
        showAlert(`Assignment "${title}" uploaded successfully!`);
        document.querySelector('[data-view="assignments"]')?.click();
      } catch (err) {
        showAlert(err.message || 'Error uploading assignment', 'danger');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Upload Coursework';
      }
    });
  }

  loadInitialData();
});
