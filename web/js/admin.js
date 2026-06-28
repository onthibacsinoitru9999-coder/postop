/**
 * Admin Page Logic - PostOp Care
 * Handles login, patient form, QR generation, and history management
 */
document.addEventListener('DOMContentLoaded', () => {
  // Only run on admin page
  if (!document.getElementById('admin-form')) return;

  // ─── CONSTANTS ───────────────────────────────────────────────────
  const ADMIN_PASSWORD_HASH =
    'dce3a2c5aae54a2a88a6599425b29497330c7b4a1531078329c1ad929064eb95';
  const STORAGE_KEY = 'postop_patients';
  const LOGIN_KEY = 'postop_admin_logged';

  // ─── DOM REFERENCES ──────────────────────────────────────────────
  const loginOverlay = document.getElementById('login-overlay');
  const loginForm = document.getElementById('login-form');
  const loginPassword = document.getElementById('login-password');
  const loginError = document.getElementById('login-error');
  const adminContent = document.getElementById('admin-content');

  const adminForm = document.getElementById('admin-form');
  const procedureSelect = document.getElementById('procedure-select');
  const procedureInfo = document.getElementById('procedure-info');
  const medicationContainer = document.getElementById('medication-container');
  const patientName = document.getElementById('patient-name');
  const surgeryDate = document.getElementById('surgery-date');
  const followupDate = document.getElementById('followup-date');
  const doctorName = document.getElementById('doctor-name');
  const patientNotes = document.getElementById('patient-notes');

  const qrOutput = document.getElementById('qr-output');
  const qrCanvas = document.getElementById('qr-canvas');
  const qrUrl = document.getElementById('qr-url');
  const btnDownloadQR = document.getElementById('btn-download-qr');
  const btnCopyLink = document.getElementById('btn-copy-link');
  const btnPrint = document.getElementById('btn-print');
  const btnNewPatient = document.getElementById('btn-new-patient');

  const tabCreate = document.getElementById('tab-create');
  const tabHistory = document.getElementById('tab-history');
  const panelCreate = document.getElementById('panel-create');
  const panelHistory = document.getElementById('panel-history');
  const historyList = document.getElementById('history-list');
  const historySearch = document.getElementById('history-search');
  const btnExportHistory = document.getElementById('btn-export-history');
  const historyCount = document.getElementById('history-count');

  const previewModal = document.getElementById('preview-modal');

  // ─── SHA-256 HELPER ──────────────────────────────────────────────
  async function sha256(str) {
    const buf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(str)
    );
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // ─── LOGIN SYSTEM ────────────────────────────────────────────────
  function checkLogin() {
    if (sessionStorage.getItem(LOGIN_KEY) === 'true') {
      showAdminContent();
      return true;
    }
    showLoginOverlay();
    return false;
  }

  function showLoginOverlay() {
    if (loginOverlay) {
      loginOverlay.style.display = 'flex';
      loginOverlay.classList.add('active');
    }
    if (adminContent) adminContent.style.display = 'none';
  }

  function showAdminContent() {
    if (loginOverlay) {
      loginOverlay.style.display = 'none';
      loginOverlay.classList.remove('active');
    }
    if (adminContent) {
      adminContent.style.display = 'block';
      adminContent.classList.add('active');
    }
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = loginPassword ? loginPassword.value.trim() : '';

      if (!password) {
        showLoginError('Vui lòng nhập mật khẩu');
        return;
      }

      const hash = await sha256(password);

      if (hash === ADMIN_PASSWORD_HASH) {
        sessionStorage.setItem(LOGIN_KEY, 'true');
        showAdminContent();
        App.showToast('Đăng nhập thành công!', 'success');
        initializeForm();
      } else {
        showLoginError('Mật khẩu không đúng');
        if (loginPassword) {
          loginPassword.value = '';
          loginPassword.focus();
        }
      }
    });
  }

  function showLoginError(message) {
    if (loginError) {
      loginError.textContent = message;
      loginError.style.display = 'block';
      loginError.classList.add('shake');
      setTimeout(() => loginError.classList.remove('shake'), 600);
    }
  }

  // Logout button
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      sessionStorage.removeItem(LOGIN_KEY);
      showLoginOverlay();
      App.showToast('Đã đăng xuất', 'info');
    });
  }

  // ─── INITIALIZE FORM ────────────────────────────────────────────
  async function initializeForm() {
    try {
      await Promise.all([populateProcedures(), populateMedications()]);
      setDefaultDates();
      App.initIcons();
    } catch (error) {
      console.error('Error initializing form:', error);
      App.showToast('Lỗi khi tải dữ liệu. Vui lòng tải lại trang.', 'error');
    }
  }

  async function populateProcedures() {
    if (!procedureSelect) return;

    try {
      const categories = await Database.getProcedures();

      // Clear existing options
      procedureSelect.innerHTML =
        '<option value="">-- Chọn phẫu thuật --</option>';

      for (const category of categories) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = category.category_name || category.name || category.category || 'Khác';

        const procedures = category.procedures || [];
        for (const proc of procedures) {
          const option = document.createElement('option');
          option.value = proc.id;
          option.textContent = proc.name;
          option.dataset.followupDays = proc.followup_days || 7;
          option.dataset.recoveryDays = proc.recovery_days || 14;
          option.dataset.description = proc.description || '';
          optgroup.appendChild(option);
        }

        if (procedures.length > 0) {
          procedureSelect.appendChild(optgroup);
        }
      }
    } catch (error) {
      console.error('Error loading procedures:', error);
      App.showToast('Không thể tải danh sách phẫu thuật', 'error');
    }
  }

  async function populateMedications() {
    if (!medicationContainer) return;

    try {
      const medications = await Database.getMedications();
      const categories = await Database.getMedicationCategories();

      medicationContainer.innerHTML = '';

      // Group medications by category
      const grouped = new Map();
      for (const cat of categories) {
        grouped.set(cat.id, { name: cat.name, meds: [] });
      }

      for (const med of medications) {
        const catId = med.category || 'other';
        if (!grouped.has(catId)) {
          grouped.set(catId, { name: catId, meds: [] });
        }
        grouped.get(catId).meds.push(med);
      }

      for (const [catId, group] of grouped) {
        if (group.meds.length === 0) continue;

        const groupEl = document.createElement('div');
        groupEl.className = 'medication-group';
        groupEl.innerHTML = `
          <h4 class="medication-group-title">
            <i data-lucide="pill"></i>
            ${App.escapeHtml(group.name)}
          </h4>
          <div class="medication-checkboxes"></div>
        `;

        const checkboxesEl = groupEl.querySelector('.medication-checkboxes');

        for (const med of group.meds) {
          const label = document.createElement('label');
          label.className = 'medication-checkbox';
          label.innerHTML = `
            <input type="checkbox" name="medications" value="${App.escapeHtml(med.id)}">
            <span class="checkbox-custom"></span>
            <span class="medication-label">
              <strong>${App.escapeHtml(med.name)}</strong>
              ${med.dosage ? `<small>${App.escapeHtml(med.dosage)}</small>` : ''}
            </span>
          `;
          checkboxesEl.appendChild(label);
        }

        medicationContainer.appendChild(groupEl);
      }
    } catch (error) {
      console.error('Error loading medications:', error);
      App.showToast('Không thể tải danh sách thuốc', 'error');
    }
  }

  function setDefaultDates() {
    if (surgeryDate) {
      surgeryDate.value = App.today();
    }
    if (followupDate) {
      followupDate.value = App.dateOffset(7);
    }
  }

  // ─── PROCEDURE CHANGE ───────────────────────────────────────────
  if (procedureSelect) {
    procedureSelect.addEventListener('change', () => {
      const selected = procedureSelect.selectedOptions[0];

      if (!selected || !selected.value) {
        if (procedureInfo) {
          procedureInfo.style.display = 'none';
          procedureInfo.innerHTML = '';
        }
        return;
      }

      // Auto-suggest followup date
      const followupDays = parseInt(selected.dataset.followupDays || '7', 10);
      if (followupDate && surgeryDate && surgeryDate.value) {
        const surgery = new Date(surgeryDate.value);
        surgery.setDate(surgery.getDate() + followupDays);
        followupDate.value = surgery.toISOString().split('T')[0];
      }

      // Show procedure description
      const description = selected.dataset.description;
      if (procedureInfo && description) {
        procedureInfo.style.display = 'block';
        procedureInfo.innerHTML = `
          <div class="procedure-desc">
            <i data-lucide="info"></i>
            <div>
              <strong>${App.escapeHtml(selected.textContent)}</strong>
              <p>${App.escapeHtml(description)}</p>
              <small>Tái khám sau ${followupDays} ngày · Hồi phục ${selected.dataset.recoveryDays || '?'} ngày</small>
            </div>
          </div>
        `;
        App.initIcons();
      }
    });
  }

  // Update followup when surgery date changes
  if (surgeryDate) {
    surgeryDate.addEventListener('change', () => {
      const selected = procedureSelect?.selectedOptions[0];
      if (selected && selected.value) {
        const followupDays = parseInt(selected.dataset.followupDays || '7', 10);
        const surgery = new Date(surgeryDate.value);
        surgery.setDate(surgery.getDate() + followupDays);
        if (followupDate) {
          followupDate.value = surgery.toISOString().split('T')[0];
        }
      }
    });
  }

  // ─── FORM SUBMISSION ────────────────────────────────────────────
  if (adminForm) {
    adminForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleFormSubmit();
    });
  }

  function handleFormSubmit() {
    // Validate required fields
    const name = patientName ? patientName.value.trim() : '';
    const procedure = procedureSelect ? procedureSelect.value : '';
    const surgery = surgeryDate ? surgeryDate.value : '';
    const doctor = doctorName ? doctorName.value.trim() : '';
    const followup = followupDate ? followupDate.value : '';
    const notes = patientNotes ? patientNotes.value.trim() : '';

    if (!name) {
      App.showToast('Vui lòng nhập tên bệnh nhân', 'warning');
      patientName?.focus();
      return;
    }

    if (!procedure) {
      App.showToast('Vui lòng chọn loại phẫu thuật', 'warning');
      procedureSelect?.focus();
      return;
    }

    if (!surgery) {
      App.showToast('Vui lòng nhập ngày phẫu thuật', 'warning');
      surgeryDate?.focus();
      return;
    }

    if (!doctor) {
      App.showToast('Vui lòng nhập tên bác sĩ', 'warning');
      doctorName?.focus();
      return;
    }

    // Collect selected medications
    const selectedMeds = [];
    const checkboxes = medicationContainer
      ? medicationContainer.querySelectorAll(
          'input[name="medications"]:checked'
        )
      : [];
    checkboxes.forEach((cb) => selectedMeds.push(cb.value));

    // Build patient data object with compact keys
    const patientData = {
      n: name,
      p: procedure,
      d: surgery,
      m: selectedMeds,
      fu: followup || '',
      dr: doctor,
    };

    // Only include note if not empty
    if (notes) {
      patientData.note = notes;
    }

    try {
      // Generate QR
      const url = QRGenerator.generate('qr-canvas', patientData);

      // Show QR output section
      if (qrOutput) {
        qrOutput.style.display = 'block';
        qrOutput.classList.add('active');
        qrOutput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // Display URL
      if (qrUrl) {
        qrUrl.textContent = url;
        qrUrl.href = url;
      }

      // Save to history
      saveToHistory(patientData);

      App.showToast('Đã tạo mã QR thành công!', 'success');
      App.initIcons();
    } catch (error) {
      console.error('Error generating QR:', error);
      App.showToast(`Lỗi tạo QR: ${error.message}`, 'error');
    }
  }

  // ─── QR OUTPUT BUTTONS ───────────────────────────────────────────
  if (btnDownloadQR) {
    btnDownloadQR.addEventListener('click', () => {
      const name = patientName ? patientName.value.trim() : 'patient';
      const safeName = name.replace(/[^a-zA-Z0-9\u00C0-\u1EF9]/g, '_');
      QRGenerator.downloadPNG(`postop_${safeName}.png`);
    });
  }

  if (btnCopyLink) {
    btnCopyLink.addEventListener('click', () => {
      QRGenerator.copyUrl();
    });
  }

  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      window.print();
    });
  }

  if (btnNewPatient) {
    btnNewPatient.addEventListener('click', () => {
      resetForm();
    });
  }

  function resetForm() {
    if (adminForm) adminForm.reset();
    if (qrOutput) {
      qrOutput.style.display = 'none';
      qrOutput.classList.remove('active');
    }
    if (procedureInfo) {
      procedureInfo.style.display = 'none';
      procedureInfo.innerHTML = '';
    }
    if (qrCanvas) qrCanvas.innerHTML = '';
    setDefaultDates();
    App.showToast('Đã xóa form. Sẵn sàng tạo mới.', 'info');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ─── HISTORY MANAGEMENT ──────────────────────────────────────────
  function getHistory() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  function saveHistory(history) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (error) {
      console.error('Error saving history:', error);
      App.showToast('Lỗi lưu lịch sử', 'error');
    }
  }

  function saveToHistory(patientData) {
    const history = getHistory();
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      data: patientData,
      createdAt: new Date().toISOString(),
    };
    history.unshift(entry);

    // Keep max 200 entries
    if (history.length > 200) {
      history.length = 200;
    }

    saveHistory(history);
    updateHistoryCount();
  }

  function deleteFromHistory(entryId) {
    let history = getHistory();
    history = history.filter((h) => h.id !== entryId);
    saveHistory(history);
    renderHistory();
    App.showToast('Đã xóa khỏi lịch sử', 'info');
  }

  function updateHistoryCount() {
    const count = getHistory().length;
    if (historyCount) {
      historyCount.textContent = count;
    }
  }

  function renderHistory(filter = '') {
    if (!historyList) return;

    const history = getHistory();
    const filtered = filter
      ? history.filter((h) => {
          const name = (h.data.n || '').toLowerCase();
          const proc = (h.data.p || '').toLowerCase();
          const doctor = (h.data.dr || '').toLowerCase();
          const q = filter.toLowerCase();
          return name.includes(q) || proc.includes(q) || doctor.includes(q);
        })
      : history;

    if (filtered.length === 0) {
      historyList.innerHTML = `
        <div class="empty-state">
          <i data-lucide="inbox"></i>
          <h3>${filter ? 'Không tìm thấy kết quả' : 'Chưa có lịch sử'}</h3>
          <p>${filter ? 'Thử từ khóa khác' : 'Tạo mã QR cho bệnh nhân đầu tiên'}</p>
        </div>
      `;
      App.initIcons();
      return;
    }

    historyList.innerHTML = filtered
      .map(
        (entry) => `
      <div class="history-card card" data-id="${entry.id}">
        <div class="card-body">
          <div class="history-card-header">
            <div class="history-patient-info">
              <h4 class="history-name">
                <i data-lucide="user"></i>
                ${App.escapeHtml(entry.data.n || 'Không tên')}
              </h4>
              <div class="history-meta">
                <span class="badge">
                  <i data-lucide="scissors"></i>
                  ${App.escapeHtml(entry.data.p || '')}
                </span>
                <span class="history-date">
                  <i data-lucide="calendar"></i>
                  ${App.formatDateShort(entry.data.d)}
                </span>
                <span class="history-doctor">
                  <i data-lucide="stethoscope"></i>
                  ${App.escapeHtml(entry.data.dr || '')}
                </span>
              </div>
            </div>
            <div class="history-actions">
              <button class="btn btn-sm btn-primary" onclick="adminActions.regenerateQR('${entry.id}')" title="Tạo lại QR">
                <i data-lucide="qr-code"></i>
              </button>
              <button class="btn btn-sm btn-ghost" onclick="adminActions.previewPatient('${entry.id}')" title="Xem trước">
                <i data-lucide="eye"></i>
              </button>
              <button class="btn btn-sm btn-danger" onclick="adminActions.deleteEntry('${entry.id}')" title="Xóa">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
          </div>
          ${
            entry.data.note
              ? `<p class="history-note"><i data-lucide="file-text"></i> ${App.escapeHtml(entry.data.note)}</p>`
              : ''
          }
          <div class="history-footer">
            <small class="text-muted">
              <i data-lucide="clock"></i>
              Tạo lúc: ${new Date(entry.createdAt).toLocaleString('vi-VN')}
            </small>
            ${
              entry.data.m && entry.data.m.length > 0
                ? `<small class="text-muted"><i data-lucide="pill"></i> ${entry.data.m.length} thuốc</small>`
                : ''
            }
          </div>
        </div>
      </div>
    `
      )
      .join('');

    updateHistoryCount();
    App.initIcons();
    App.animateOnLoad('.history-card');
  }

  // Global actions for history (accessible from onclick handlers)
  window.adminActions = {
    regenerateQR(entryId) {
      const history = getHistory();
      const entry = history.find((h) => h.id === entryId);
      if (!entry) {
        App.showToast('Không tìm thấy bệnh nhân', 'error');
        return;
      }

      // Switch to create tab
      switchTab('create');

      // Fill form with entry data
      fillFormFromData(entry.data);

      // Generate QR
      try {
        const url = QRGenerator.generate('qr-canvas', entry.data);
        if (qrOutput) {
          qrOutput.style.display = 'block';
          qrOutput.classList.add('active');
          qrOutput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        if (qrUrl) {
          qrUrl.textContent = url;
          qrUrl.href = url;
        }
        App.showToast('Đã tạo lại mã QR!', 'success');
        App.initIcons();
      } catch (error) {
        App.showToast(`Lỗi: ${error.message}`, 'error');
      }
    },

    previewPatient(entryId) {
      const history = getHistory();
      const entry = history.find((h) => h.id === entryId);
      if (!entry) return;
      showPreviewModal(entry.data);
    },

    deleteEntry(entryId) {
      if (confirm('Bạn có chắc muốn xóa bệnh nhân này khỏi lịch sử?')) {
        deleteFromHistory(entryId);
      }
    },
  };

  function fillFormFromData(data) {
    if (patientName) patientName.value = data.n || '';
    if (procedureSelect) {
      procedureSelect.value = data.p || '';
      procedureSelect.dispatchEvent(new Event('change'));
    }
    if (surgeryDate) surgeryDate.value = data.d || '';
    if (followupDate) followupDate.value = data.fu || '';
    if (doctorName) doctorName.value = data.dr || '';
    if (patientNotes) patientNotes.value = data.note || '';

    // Check medications
    if (medicationContainer) {
      const checkboxes = medicationContainer.querySelectorAll(
        'input[name="medications"]'
      );
      const selectedMeds = data.m || [];
      checkboxes.forEach((cb) => {
        cb.checked = selectedMeds.includes(cb.value);
      });
    }
  }

  // ─── HISTORY SEARCH ──────────────────────────────────────────────
  if (historySearch) {
    historySearch.addEventListener(
      'input',
      App.debounce((e) => {
        renderHistory(e.target.value.trim());
      }, 300)
    );
  }

  // ─── EXPORT HISTORY ──────────────────────────────────────────────
  if (btnExportHistory) {
    btnExportHistory.addEventListener('click', () => {
      const history = getHistory();
      if (history.length === 0) {
        App.showToast('Không có dữ liệu để xuất', 'warning');
        return;
      }

      const exportData = {
        exportDate: new Date().toISOString(),
        totalPatients: history.length,
        patients: history,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `postop_history_${App.today()}.json`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      App.showToast(`Đã xuất ${history.length} bệnh nhân`, 'success');
    });
  }

  // ─── TAB SWITCHING ───────────────────────────────────────────────
  function switchTab(tabName) {
    const tabs = [tabCreate, tabHistory];
    const panels = [panelCreate, panelHistory];

    tabs.forEach((tab) => tab?.classList.remove('active'));
    panels.forEach((panel) => {
      if (panel) panel.style.display = 'none';
    });

    if (tabName === 'create') {
      tabCreate?.classList.add('active');
      if (panelCreate) panelCreate.style.display = 'block';
    } else if (tabName === 'history') {
      tabHistory?.classList.add('active');
      if (panelHistory) panelHistory.style.display = 'block';
      renderHistory();
    }
  }

  if (tabCreate) {
    tabCreate.addEventListener('click', () => switchTab('create'));
  }

  if (tabHistory) {
    tabHistory.addEventListener('click', () => switchTab('history'));
  }

  // ─── PREVIEW MODAL ──────────────────────────────────────────────
  async function showPreviewModal(patientData) {
    let modal = previewModal || document.getElementById('preview-modal');

    // Create modal if it doesn't exist
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'preview-modal';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
    }

    // Fetch procedure data for preview
    let procedureName = patientData.p || '';
    try {
      const proc = await Database.getProcedure(patientData.p);
      if (proc) procedureName = proc.name;
    } catch {
      // Use ID as fallback
    }

    const daysSince = App.daysSinceSurgery(patientData.d);
    const daysUntil = App.daysUntilFollowup(patientData.fu);

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2><i data-lucide="eye"></i> Xem trước trang bệnh nhân</h2>
          <button class="modal-close" id="close-preview">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="modal-body">
          <div class="preview-card card">
            <div class="card-header">
              <h3><i data-lucide="user"></i> ${App.escapeHtml(patientData.n || 'Không tên')}</h3>
            </div>
            <div class="card-body">
              <div class="preview-grid">
                <div class="preview-item">
                  <span class="preview-label"><i data-lucide="scissors"></i> Phẫu thuật</span>
                  <span class="preview-value">${App.escapeHtml(procedureName)}</span>
                </div>
                <div class="preview-item">
                  <span class="preview-label"><i data-lucide="calendar"></i> Ngày mổ</span>
                  <span class="preview-value">${App.formatDate(patientData.d)}</span>
                </div>
                <div class="preview-item">
                  <span class="preview-label"><i data-lucide="clock"></i> Sau mổ</span>
                  <span class="preview-value">${daysSince} ngày</span>
                </div>
                <div class="preview-item">
                  <span class="preview-label"><i data-lucide="calendar-check"></i> Tái khám</span>
                  <span class="preview-value">${App.formatDate(patientData.fu)}${daysUntil > 0 ? ` (còn ${daysUntil} ngày)` : daysUntil === 0 ? ' (hôm nay!)' : ` (đã qua ${Math.abs(daysUntil)} ngày)`}</span>
                </div>
                <div class="preview-item">
                  <span class="preview-label"><i data-lucide="stethoscope"></i> Bác sĩ</span>
                  <span class="preview-value">${App.escapeHtml(patientData.dr || '')}</span>
                </div>
                <div class="preview-item">
                  <span class="preview-label"><i data-lucide="pill"></i> Thuốc</span>
                  <span class="preview-value">${patientData.m && patientData.m.length > 0 ? patientData.m.map((m) => App.escapeHtml(m)).join(', ') : 'Không có'}</span>
                </div>
              </div>
              ${patientData.note ? `<div class="preview-note"><i data-lucide="file-text"></i> <strong>Ghi chú:</strong> ${App.escapeHtml(patientData.note)}</div>` : ''}
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="close-preview-btn">Đóng</button>
          <a class="btn btn-primary" href="${QRGenerator.getLastUrl() || '#'}" target="_blank" rel="noopener">
            <i data-lucide="external-link"></i> Mở trang bệnh nhân
          </a>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
    modal.classList.add('active');

    App.initIcons();

    // Close handlers
    const closeModal = () => {
      modal.classList.remove('active');
      setTimeout(() => {
        modal.style.display = 'none';
      }, 300);
    };

    modal.querySelector('#close-preview')?.addEventListener('click', closeModal);
    modal.querySelector('#close-preview-btn')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  }

  // ─── INITIALIZATION ──────────────────────────────────────────────
  App.initTheme();
  updateHistoryCount();

  if (checkLogin()) {
    initializeForm();
  }

  // Initialize default tab
  switchTab('create');
});
