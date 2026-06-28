/**
 * Patient Page Logic - PostOp Care
 * Decodes URL parameters and renders personalized post-op care instructions
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Only run on patient page
  if (!document.getElementById('patient-content')) return;

  const loadingEl = document.getElementById('loading-state');
  const errorEl = document.getElementById('error-state');
  const contentEl = document.getElementById('patient-content');

  // ─── DECODE URL ──────────────────────────────────────────────────
  const patientData = QRGenerator.getPatientDataFromUrl();

  if (!patientData) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) {
      errorEl.style.display = 'flex';
      errorEl.innerHTML = `
        <div class="error-content">
          <i data-lucide="alert-circle" class="error-icon"></i>
          <h2>Không thể tải thông tin</h2>
          <p>Mã QR không hợp lệ hoặc link đã hết hạn. Vui lòng liên hệ bác sĩ để được cấp mã QR mới.</p>
          <a href="tel:115" class="btn btn-danger">
            <i data-lucide="phone"></i> Gọi cấp cứu: 115
          </a>
        </div>
      `;
      App.initIcons();
    }
    return;
  }

  // ─── FETCH DATA ──────────────────────────────────────────────────
  try {
    const [procedure, instructions, medications, warnings] = await Promise.all([
      Database.getProcedure(patientData.p),
      Database.getInstructions(patientData.p),
      Database.getMedicationsByIds(patientData.m || []),
      Database.getWarnings(patientData.p),
    ]);

    // Initialize theme
    App.initTheme();

    // ─── BUILD PAGE ──────────────────────────────────────────────────
    let html = '';

    // ── HEADER ──
    html += renderHeader(patientData, procedure);

    // ── RECOVERY PROGRESS ──
    html += renderProgress(patientData, procedure);

    // ── WARNINGS (Critical first) ──
    if (warnings && warnings.length > 0) {
      html += renderWarnings(warnings);
    }

    // ── CARE TIMELINE ──
    if (instructions && instructions.phases) {
      html += renderTimeline(patientData, instructions);
    }

    // ── WOUND CARE ──
    if (instructions && instructions.wound_care) {
      html += renderWoundCare(patientData, instructions);
    }

    // ── MEDICATIONS ──
    if (medications && medications.length > 0) {
      html += renderMedications(medications);
    }

    // ── ACTIVITY ──
    if (instructions && instructions.activity) {
      html += renderActivity(patientData, instructions);
    }

    // ── DAILY CHECKLIST ──
    if (instructions && instructions.checklist) {
      html += renderChecklist(patientData, instructions);
    }

    // ── FOLLOW-UP ──
    html += renderFollowup(patientData);

    // ── DOCTOR NOTES ──
    if (patientData.note) {
      html += renderDoctorNotes(patientData);
    }

    // ── EMERGENCY BUTTON ──
    html += renderEmergencySection();

    // ── RENDER ──
    contentEl.innerHTML = html;

    if (loadingEl) loadingEl.style.display = 'none';
    contentEl.style.display = 'block';

    // Initialize interactive elements
    initChecklist(patientData);
    initEmergencyButton();
    App.initIcons();
    App.animateOnLoad('.card');
  } catch (error) {
    console.error('Error loading patient data:', error);
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl) {
      errorEl.style.display = 'flex';
      errorEl.innerHTML = `
        <div class="error-content">
          <i data-lucide="wifi-off" class="error-icon"></i>
          <h2>Lỗi tải dữ liệu</h2>
          <p>Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.</p>
          <button class="btn btn-primary" onclick="location.reload()">
            <i data-lucide="refresh-cw"></i> Thử lại
          </button>
        </div>
      `;
      App.initIcons();
    }
  }
});

// ═══════════════════════════════════════════════════════════════════
// RENDER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

/**
 * Render the patient header section
 */
function renderHeader(patientData, procedure) {
  const procedureName = procedure ? procedure.name : patientData.p;
  const categoryName = procedure ? procedure.category_name : '';

  return `
    <div class="card patient-header-card">
      <div class="card-body">
        <div class="patient-header-top">
          <div class="patient-avatar">
            <i data-lucide="user" class="avatar-icon"></i>
          </div>
          <div class="patient-info">
            <h1 class="patient-name">${App.escapeHtml(patientData.n || 'Bệnh nhân')}</h1>
            <div class="patient-meta">
              <span class="badge badge-primary">
                <i data-lucide="scissors"></i>
                ${App.escapeHtml(procedureName)}
              </span>
              ${categoryName ? `<span class="badge">${App.escapeHtml(categoryName)}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="patient-details-grid">
          <div class="patient-detail">
            <i data-lucide="calendar"></i>
            <div>
              <small>Ngày phẫu thuật</small>
              <strong>${App.formatDate(patientData.d)}</strong>
            </div>
          </div>
          <div class="patient-detail">
            <i data-lucide="stethoscope"></i>
            <div>
              <small>Bác sĩ phụ trách</small>
              <strong>${App.escapeHtml(patientData.dr || 'Không có thông tin')}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render recovery progress bar
 */
function renderProgress(patientData, procedure) {
  const daysSince = App.daysSinceSurgery(patientData.d);
  const totalDays = procedure ? procedure.recovery_days || 14 : 14;
  const progress = Math.min(Math.round((daysSince / totalDays) * 100), 100);

  let statusText, statusClass, statusIcon;
  if (progress >= 100) {
    statusText = 'Đã hoàn thành hồi phục! 🎉';
    statusClass = 'badge-success';
    statusIcon = 'check-circle-2';
  } else if (progress >= 70) {
    statusText = 'Giai đoạn cuối hồi phục';
    statusClass = 'badge-success';
    statusIcon = 'trending-up';
  } else if (progress >= 30) {
    statusText = 'Đang hồi phục tốt';
    statusClass = 'badge-warning';
    statusIcon = 'activity';
  } else {
    statusText = 'Giai đoạn đầu hồi phục';
    statusClass = 'badge-warning';
    statusIcon = 'heart-pulse';
  }

  return `
    <div class="card progress-card">
      <div class="card-header">
        <h2><i data-lucide="trending-up"></i> Tiến trình hồi phục</h2>
        <span class="badge ${statusClass}">
          <i data-lucide="${statusIcon}"></i>
          ${statusText}
        </span>
      </div>
      <div class="card-body">
        <div class="progress-info">
          <span class="progress-day">Ngày ${daysSince}</span>
          <span class="progress-total">/ ${totalDays} ngày hồi phục</span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progress}%">
            <span class="progress-percent">${progress}%</span>
          </div>
        </div>
        <div class="progress-milestones">
          <span class="milestone ${daysSince >= 1 ? 'reached' : ''}">Ngày 1</span>
          <span class="milestone ${daysSince >= Math.floor(totalDays / 4) ? 'reached' : ''}">Ngày ${Math.floor(totalDays / 4)}</span>
          <span class="milestone ${daysSince >= Math.floor(totalDays / 2) ? 'reached' : ''}">Ngày ${Math.floor(totalDays / 2)}</span>
          <span class="milestone ${daysSince >= totalDays ? 'reached' : ''}">Ngày ${totalDays}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render warnings section
 */
function renderWarnings(warnings) {
  const warningCards = warnings
    .map((w) => {
      const severity = w.severity || 'medium';
      let alertClass, iconName;

      switch (severity) {
        case 'critical':
          alertClass = 'alert-danger';
          iconName = 'alert-octagon';
          break;
        case 'high':
          alertClass = 'alert-danger';
          iconName = 'alert-triangle';
          break;
        case 'medium':
          alertClass = 'alert-warning';
          iconName = 'alert-circle';
          break;
        default:
          alertClass = 'alert-info';
          iconName = 'info';
      }

      return `
        <div class="alert ${alertClass}">
          <i data-lucide="${iconName}" class="alert-icon"></i>
          <div class="alert-content">
            <strong>${App.escapeHtml(w.title || w.message || 'Cảnh báo')}</strong>
            ${w.description ? `<p>${App.escapeHtml(w.description)}</p>` : ''}
            ${w.action ? `<p class="alert-action"><i data-lucide="arrow-right"></i> ${App.escapeHtml(w.action)}</p>` : ''}
          </div>
        </div>
      `;
    })
    .join('');

  return `
    <div class="card warnings-card">
      <div class="card-header">
        <h2><i data-lucide="shield-alert"></i> Dấu hiệu cần chú ý</h2>
      </div>
      <div class="card-body">
        ${warningCards}
      </div>
    </div>
  `;
}

/**
 * Render care timeline showing recovery phases
 */
function renderTimeline(patientData, instructions) {
  const daysSince = App.daysSinceSurgery(patientData.d);
  const phases = instructions.phases || [];

  if (phases.length === 0) return '';

  const timelineItems = phases
    .map((phase) => {
      const startDay = phase.start_day ?? 0;
      const endDay = phase.end_day ?? 999;
      const isActive = daysSince >= startDay && daysSince <= endDay;
      const isPast = daysSince > endDay;
      const isFuture = daysSince < startDay;

      let statusClass = '';
      if (isActive) statusClass = 'active';
      else if (isPast) statusClass = 'completed';
      else if (isFuture) statusClass = 'upcoming';

      return `
        <div class="timeline-item ${statusClass}">
          <div class="timeline-marker">
            ${isPast ? '<i data-lucide="check"></i>' : isActive ? '<i data-lucide="circle-dot"></i>' : '<i data-lucide="circle"></i>'}
          </div>
          <div class="timeline-content">
            <div class="timeline-header">
              <h4>${App.escapeHtml(phase.name || '')}</h4>
              <span class="badge ${isActive ? 'badge-success' : isPast ? 'badge-muted' : ''}">
                Ngày ${startDay}${endDay < 999 ? ` - ${endDay}` : '+'}
              </span>
            </div>
            <p>${App.escapeHtml(phase.description || '')}</p>
            ${
              phase.tasks && phase.tasks.length > 0
                ? `<ul class="timeline-tasks">
                    ${phase.tasks.map((t) => `<li>${App.escapeHtml(t)}</li>`).join('')}
                   </ul>`
                : ''
            }
          </div>
        </div>
      `;
    })
    .join('');

  return `
    <div class="card timeline-card">
      <div class="card-header">
        <h2><i data-lucide="git-branch"></i> Lộ trình hồi phục</h2>
      </div>
      <div class="card-body">
        <div class="timeline">
          ${timelineItems}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render wound care instructions
 */
function renderWoundCare(patientData, instructions) {
  const daysSince = App.daysSinceSurgery(patientData.d);
  const woundCare = instructions.wound_care || [];

  if (woundCare.length === 0) return '';

  const items = woundCare
    .map((item) => {
      const startDay = item.start_day ?? 0;
      const endDay = item.end_day ?? 999;
      const isActive = daysSince >= startDay && daysSince <= endDay;

      return `
        <div class="wound-care-item ${isActive ? 'active' : ''}">
          <div class="wound-care-header">
            <span class="wound-care-period">
              <i data-lucide="calendar-days"></i>
              Ngày ${startDay}${endDay < 999 ? ` - ${endDay}` : '+'}
            </span>
            ${isActive ? '<span class="badge badge-success">Hiện tại</span>' : ''}
          </div>
          <h4>${App.escapeHtml(item.title || '')}</h4>
          <p>${App.escapeHtml(item.description || '')}</p>
          ${
            item.steps && item.steps.length > 0
              ? `<ol class="wound-care-steps">
                  ${item.steps.map((s) => `<li>${App.escapeHtml(s)}</li>`).join('')}
                 </ol>`
              : ''
          }
          ${
            item.warning
              ? `<div class="alert alert-warning">
                  <i data-lucide="alert-triangle" class="alert-icon"></i>
                  <span>${App.escapeHtml(item.warning)}</span>
                 </div>`
              : ''
          }
        </div>
      `;
    })
    .join('');

  return `
    <div class="card wound-care-card">
      <div class="card-header">
        <h2><i data-lucide="bandage"></i> Chăm sóc vết mổ</h2>
      </div>
      <div class="card-body">
        ${items}
      </div>
    </div>
  `;
}

/**
 * Render medications section
 */
function renderMedications(medications) {
  const medCards = medications
    .map((med) => {
      const isUnknown = med._notFound;

      return `
        <div class="medication-card ${isUnknown ? 'medication-unknown' : ''}">
          <div class="medication-card-header">
            <div class="medication-name-row">
              <i data-lucide="pill" class="med-icon"></i>
              <div>
                <h4>${App.escapeHtml(med.name || med.id)}</h4>
                ${med.generic_name ? `<small class="text-muted">${App.escapeHtml(med.generic_name)}</small>` : ''}
              </div>
            </div>
            ${med.category_name ? `<span class="badge">${App.escapeHtml(med.category_name)}</span>` : ''}
          </div>
          <div class="medication-card-body">
            ${
              med.dosage
                ? `<div class="med-detail">
                    <i data-lucide="beaker"></i>
                    <div><small>Liều dùng</small><span>${App.escapeHtml(med.dosage)}</span></div>
                   </div>`
                : ''
            }
            ${
              med.frequency
                ? `<div class="med-detail">
                    <i data-lucide="clock"></i>
                    <div><small>Tần suất</small><span>${App.escapeHtml(med.frequency)}</span></div>
                   </div>`
                : ''
            }
            ${
              med.duration
                ? `<div class="med-detail">
                    <i data-lucide="calendar"></i>
                    <div><small>Thời gian</small><span>${App.escapeHtml(med.duration)}</span></div>
                   </div>`
                : ''
            }
            ${
              med.route
                ? `<div class="med-detail">
                    <i data-lucide="syringe"></i>
                    <div><small>Đường dùng</small><span>${App.escapeHtml(med.route)}</span></div>
                   </div>`
                : ''
            }
          </div>
          ${
            med.notes
              ? `<div class="medication-notes">
                  <i data-lucide="info"></i>
                  <span>${App.escapeHtml(med.notes)}</span>
                 </div>`
              : ''
          }
          ${
            med.warnings
              ? `<div class="medication-warning">
                  <i data-lucide="alert-triangle"></i>
                  <span>${App.escapeHtml(med.warnings)}</span>
                 </div>`
              : ''
          }
        </div>
      `;
    })
    .join('');

  return `
    <div class="card medications-card">
      <div class="card-header">
        <h2><i data-lucide="pill"></i> Thuốc điều trị</h2>
        <span class="badge">${medications.length} loại thuốc</span>
      </div>
      <div class="card-body">
        <div class="medication-grid">
          ${medCards}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render activity restrictions
 */
function renderActivity(patientData, instructions) {
  const daysSince = App.daysSinceSurgery(patientData.d);
  const activity = instructions.activity || [];

  if (activity.length === 0) return '';

  const items = activity
    .map((item) => {
      const startDay = item.start_day ?? 0;
      const endDay = item.end_day ?? 999;
      const isActive = daysSince >= startDay && daysSince <= endDay;
      const isPast = daysSince > endDay;

      const statusIcon = item.allowed
        ? 'check-circle-2'
        : item.limited
          ? 'minus-circle'
          : 'x-circle';
      const statusClass = item.allowed
        ? 'activity-allowed'
        : item.limited
          ? 'activity-limited'
          : 'activity-restricted';

      return `
        <div class="activity-item ${statusClass} ${isActive ? 'active' : ''} ${isPast ? 'past' : ''}">
          <div class="activity-icon">
            <i data-lucide="${item.icon || statusIcon}"></i>
          </div>
          <div class="activity-info">
            <h4>${App.escapeHtml(item.name || '')}</h4>
            <p>${App.escapeHtml(item.description || '')}</p>
            <span class="activity-period">
              Ngày ${startDay}${endDay < 999 ? ` - ${endDay}` : '+'}
              ${isActive ? ' (hiện tại)' : ''}
            </span>
          </div>
          <div class="activity-status">
            <i data-lucide="${statusIcon}"></i>
          </div>
        </div>
      `;
    })
    .join('');

  return `
    <div class="card activity-card">
      <div class="card-header">
        <h2><i data-lucide="activity"></i> Hoạt động & Vận động</h2>
      </div>
      <div class="card-body">
        <div class="activity-list">
          ${items}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render daily checklist
 */
function renderChecklist(patientData, instructions) {
  const checklist = instructions.checklist || [];
  if (checklist.length === 0) return '';

  const items = checklist
    .map(
      (item, index) => `
      <label class="checklist-item" data-index="${index}">
        <input type="checkbox" class="checklist-checkbox" data-index="${index}">
        <span class="checklist-custom"></span>
        <span class="checklist-text">
          ${App.escapeHtml(item.text || item)}
        </span>
        ${item.time ? `<span class="checklist-time"><i data-lucide="clock"></i> ${App.escapeHtml(item.time)}</span>` : ''}
      </label>
    `
    )
    .join('');

  return `
    <div class="card checklist-card">
      <div class="card-header">
        <h2><i data-lucide="check-square"></i> Checklist hàng ngày</h2>
        <span class="badge" id="checklist-progress">0/${checklist.length}</span>
      </div>
      <div class="card-body">
        <p class="checklist-date">
          <i data-lucide="calendar"></i>
          ${App.formatDate(App.today())}
        </p>
        <div class="checklist">
          ${items}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render follow-up section
 */
function renderFollowup(patientData) {
  if (!patientData.fu) {
    return `
      <div class="card followup-card">
        <div class="card-header">
          <h2><i data-lucide="calendar-check"></i> Lịch tái khám</h2>
        </div>
        <div class="card-body">
          <p class="followup-note">Chưa có lịch tái khám. Vui lòng liên hệ bác sĩ.</p>
        </div>
      </div>
    `;
  }

  const daysUntil = App.daysUntilFollowup(patientData.fu);
  let countdownText, countdownClass;

  if (daysUntil > 0) {
    countdownText = `Còn ${daysUntil} ngày đến lịch tái khám`;
    countdownClass = 'followup-upcoming';
  } else if (daysUntil === 0) {
    countdownText = 'Hôm nay là ngày tái khám!';
    countdownClass = 'followup-today';
  } else {
    countdownText = `Đã qua ${Math.abs(daysUntil)} ngày kể từ lịch tái khám`;
    countdownClass = 'followup-overdue';
  }

  return `
    <div class="card followup-card ${countdownClass}">
      <div class="card-header">
        <h2><i data-lucide="calendar-check"></i> Lịch tái khám</h2>
        ${daysUntil === 0 ? '<span class="badge badge-success pulse">Hôm nay!</span>' : ''}
        ${daysUntil < 0 ? '<span class="badge badge-danger">Quá hạn</span>' : ''}
      </div>
      <div class="card-body">
        <div class="followup-date-display">
          <i data-lucide="calendar" class="followup-icon"></i>
          <div>
            <strong class="followup-date-text">${App.formatDate(patientData.fu)}</strong>
            <p class="followup-countdown">${countdownText}</p>
          </div>
        </div>
        ${patientData.dr ? `<p class="followup-doctor"><i data-lucide="stethoscope"></i> Bác sĩ: <strong>${App.escapeHtml(patientData.dr)}</strong></p>` : ''}
      </div>
    </div>
  `;
}

/**
 * Render doctor notes section
 */
function renderDoctorNotes(patientData) {
  return `
    <div class="card doctor-notes-card">
      <div class="card-header">
        <h2><i data-lucide="file-text"></i> Ghi chú từ bác sĩ</h2>
      </div>
      <div class="card-body">
        <div class="doctor-note-content">
          <i data-lucide="quote" class="quote-icon"></i>
          <p>${App.escapeHtml(patientData.note)}</p>
          ${patientData.dr ? `<footer class="doctor-note-footer">— ${App.escapeHtml(patientData.dr)}</footer>` : ''}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render emergency section
 */
function renderEmergencySection() {
  return `
    <div class="card emergency-card">
      <div class="card-body">
        <div class="emergency-content">
          <i data-lucide="phone-call" class="emergency-icon"></i>
          <div>
            <h3>Cần hỗ trợ khẩn cấp?</h3>
            <p>Nếu bạn gặp triệu chứng nguy hiểm, hãy liên hệ ngay:</p>
          </div>
        </div>
        <div class="emergency-buttons">
          <a href="tel:115" class="btn btn-danger btn-lg" id="btn-emergency-call">
            <i data-lucide="phone"></i> Gọi cấp cứu: 115
          </a>
          <button class="btn btn-warning btn-lg" id="btn-emergency-info">
            <i data-lucide="info"></i> Thông tin cấp cứu
          </button>
        </div>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════
// INTERACTIVE FEATURES
// ═══════════════════════════════════════════════════════════════════

/**
 * Initialize checklist with localStorage persistence
 */
function initChecklist(patientData) {
  const checkboxes = document.querySelectorAll('.checklist-checkbox');
  if (checkboxes.length === 0) return;

  const today = App.today();
  const dataHash = App.simpleHash(JSON.stringify(patientData));
  const storageKey = `postop_checklist_${dataHash}_${today}`;

  // Load saved state
  let savedState = {};
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) savedState = JSON.parse(saved);
  } catch {
    savedState = {};
  }

  // Apply saved state
  checkboxes.forEach((cb) => {
    const index = cb.dataset.index;
    if (savedState[index]) {
      cb.checked = true;
      cb.closest('.checklist-item')?.classList.add('checked');
    }
  });

  updateChecklistProgress(checkboxes);

  // Handle changes
  checkboxes.forEach((cb) => {
    cb.addEventListener('change', () => {
      const index = cb.dataset.index;
      savedState[index] = cb.checked;

      const item = cb.closest('.checklist-item');
      if (cb.checked) {
        item?.classList.add('checked');
      } else {
        item?.classList.remove('checked');
      }

      try {
        localStorage.setItem(storageKey, JSON.stringify(savedState));
      } catch {
        // Silently fail on storage errors
      }

      updateChecklistProgress(checkboxes);
    });
  });

  // Clean up old checklist entries (keep only last 7 days)
  cleanupOldChecklists(dataHash);
}

/**
 * Update checklist progress badge
 */
function updateChecklistProgress(checkboxes) {
  const total = checkboxes.length;
  const checked = Array.from(checkboxes).filter((cb) => cb.checked).length;
  const progressEl = document.getElementById('checklist-progress');

  if (progressEl) {
    progressEl.textContent = `${checked}/${total}`;

    if (checked === total && total > 0) {
      progressEl.className = 'badge badge-success';
      progressEl.innerHTML = `<i data-lucide="check"></i> Hoàn thành!`;
      App.initIcons();
    } else {
      progressEl.className = 'badge';
    }
  }
}

/**
 * Clean up old checklist data from localStorage
 */
function cleanupOldChecklists(dataHash) {
  const prefix = `postop_checklist_${dataHash}_`;
  const today = new Date();

  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      const dateStr = key.replace(prefix, '');
      try {
        const entryDate = new Date(dateStr);
        const diffDays = Math.floor(
          (today - entryDate) / (1000 * 60 * 60 * 24)
        );
        if (diffDays > 7) {
          localStorage.removeItem(key);
        }
      } catch {
        // Skip invalid entries
      }
    }
  }
}

/**
 * Initialize emergency button interactions
 */
function initEmergencyButton() {
  const btnInfo = document.getElementById('btn-emergency-info');
  if (!btnInfo) return;

  btnInfo.addEventListener('click', () => {
    // Create emergency info modal
    let modal = document.getElementById('emergency-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'emergency-modal';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2><i data-lucide="phone-call"></i> Thông tin cấp cứu</h2>
          <button class="modal-close" id="close-emergency-modal">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="modal-body">
          <div class="emergency-info-list">
            <div class="emergency-info-item">
              <i data-lucide="ambulance"></i>
              <div>
                <strong>Cấp cứu</strong>
                <a href="tel:115">115</a>
              </div>
            </div>
            <div class="emergency-info-item">
              <i data-lucide="phone"></i>
              <div>
                <strong>Tổng đài tư vấn y tế</strong>
                <a href="tel:1900599920">1900 599 920</a>
              </div>
            </div>
            <div class="emergency-info-item">
              <i data-lucide="shield"></i>
              <div>
                <strong>Trung tâm chống độc</strong>
                <a href="tel:02838652640">028 3865 2640</a>
              </div>
            </div>
          </div>
          
          <div class="alert alert-danger" style="margin-top: 16px;">
            <i data-lucide="alert-octagon" class="alert-icon"></i>
            <div class="alert-content">
              <strong>Gọi 115 NGAY khi có các triệu chứng:</strong>
              <ul>
                <li>Chảy máu nhiều không cầm được</li>
                <li>Khó thở, tức ngực</li>
                <li>Sốt cao trên 39°C</li>
                <li>Đau dữ dội không giảm với thuốc giảm đau</li>
                <li>Mất ý thức, chóng mặt nặng</li>
              </ul>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" id="close-emergency-btn">Đóng</button>
          <a href="tel:115" class="btn btn-danger">
            <i data-lucide="phone"></i> Gọi 115
          </a>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
    modal.classList.add('active');

    App.initIcons();

    const closeModal = () => {
      modal.classList.remove('active');
      setTimeout(() => {
        modal.style.display = 'none';
      }, 300);
    };

    modal.querySelector('#close-emergency-modal')?.addEventListener('click', closeModal);
    modal.querySelector('#close-emergency-btn')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
  });
}
