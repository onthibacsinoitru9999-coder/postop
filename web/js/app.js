/**
 * App - Core application utilities for PostOp Care
 * Provides shared functionality across admin and patient pages
 */
const App = {
  /**
   * Detect the base URL for QR code generation.
   * Supports GitHub Pages and localhost development.
   * @returns {string} Base URL without trailing slash
   */
  getBaseUrl() {
    const loc = window.location;

    // GitHub Pages: https://<user>.github.io/<repo>
    if (loc.hostname.endsWith('.github.io')) {
      // pathname includes the repo name, e.g. /postop-care/admin.html
      const pathParts = loc.pathname.split('/').filter(Boolean);
      // First part is the repo name
      const repo = pathParts.length > 0 ? `/${pathParts[0]}` : '';
      return `${loc.protocol}//${loc.hostname}${repo}`;
    }

    // Local development
    // If served from a subdirectory, preserve it
    const path = loc.pathname.substring(0, loc.pathname.lastIndexOf('/'));
    return `${loc.protocol}//${loc.host}${path}`;
  },

  /**
   * Show a toast notification
   * @param {string} message - Message to display
   * @param {'info'|'success'|'warning'|'error'} type - Toast type
   * @param {number} duration - Auto-dismiss time in ms
   */
  showToast(message, type = 'info', duration = 3000) {
    // Create toast container if it doesn't exist
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText =
        'position:fixed;top:24px;right:24px;z-index:10000;display:flex;flex-direction:column;gap:12px;pointer-events:none;';
      document.body.appendChild(container);
    }

    const iconMap = {
      info: 'info',
      success: 'check-circle-2',
      warning: 'alert-triangle',
      error: 'x-circle',
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.pointerEvents = 'auto';
    toast.innerHTML = `
      <i data-lucide="${iconMap[type] || 'info'}" class="toast-icon"></i>
      <span class="toast-message">${message}</span>
      <button class="toast-close" aria-label="Đóng">
        <i data-lucide="x"></i>
      </button>
    `;

    container.appendChild(toast);

    // Initialize icons inside the toast
    if (typeof lucide !== 'undefined') {
      lucide.createIcons({ nodes: [toast] });
    }

    // Trigger enter animation
    requestAnimationFrame(() => {
      toast.classList.add('toast-enter');
    });

    const dismiss = () => {
      toast.classList.add('toast-exit');
      toast.addEventListener('animationend', () => {
        toast.remove();
        // Remove container if empty
        if (container && container.children.length === 0) {
          container.remove();
        }
      });
    };

    // Close button
    toast.querySelector('.toast-close').addEventListener('click', dismiss);

    // Auto-dismiss
    if (duration > 0) {
      setTimeout(dismiss, duration);
    }
  },

  /**
   * Format a date string to Vietnamese format
   * @param {string} dateStr - ISO date string (YYYY-MM-DD)
   * @returns {string} Formatted date, e.g. "Ngày 25 tháng 06, 2026"
   */
  formatDate(dateStr) {
    if (!dateStr) return 'Không có thông tin';
    try {
      const parts = dateStr.split('-');
      if (parts.length !== 3) return dateStr;
      const [year, month, day] = parts;
      return `Ngày ${parseInt(day, 10).toString().padStart(2, '0')} tháng ${month}, ${year}`;
    } catch {
      return dateStr;
    }
  },

  /**
   * Format a date string to short Vietnamese format
   * @param {string} dateStr - ISO date string (YYYY-MM-DD)
   * @returns {string} Formatted date, e.g. "25/06/2026"
   */
  formatDateShort(dateStr) {
    if (!dateStr) return '--/--/----';
    try {
      const parts = dateStr.split('-');
      if (parts.length !== 3) return dateStr;
      const [year, month, day] = parts;
      return `${day}/${month}/${year}`;
    } catch {
      return dateStr;
    }
  },

  /**
   * Calculate the number of days since a surgery date
   * @param {string} surgeryDate - ISO date string (YYYY-MM-DD)
   * @returns {number} Number of days since surgery (0 on surgery day)
   */
  daysSinceSurgery(surgeryDate) {
    if (!surgeryDate) return 0;
    const surgery = new Date(surgeryDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffMs = today - surgery;
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  },

  /**
   * Calculate the number of days until a follow-up date
   * @param {string} followupDate - ISO date string (YYYY-MM-DD)
   * @returns {number} Days until follow-up (negative if past)
   */
  daysUntilFollowup(followupDate) {
    if (!followupDate) return 0;
    const followup = new Date(followupDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffMs = followup - today;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  },

  /**
   * Set the color theme
   * @param {'dark'|'light'} theme - The theme to apply
   */
  setTheme(theme) {
    document.body.classList.remove('theme-dark', 'theme-light');
    document.body.classList.add(`theme-${theme}`);
    localStorage.setItem('postop_theme', theme);

    // Update the theme toggle icon if it exists
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      const icon = toggleBtn.querySelector('[data-lucide]');
      if (icon) {
        icon.setAttribute('data-lucide', theme === 'dark' ? 'sun' : 'moon');
        this.initIcons();
      }
    }
  },

  /**
   * Get the current theme, defaulting to 'light'
   * @returns {'dark'|'light'}
   */
  getTheme() {
    return localStorage.getItem('postop_theme') || 'light';
  },

  /**
   * Initialize the theme on page load
   */
  initTheme() {
    const savedTheme = this.getTheme();
    this.setTheme(savedTheme);

    // Set up theme toggle button
    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const current = this.getTheme();
        this.setTheme(current === 'dark' ? 'light' : 'dark');
      });
    }
  },

  /**
   * Initialize Lucide icons. Call after DOM updates.
   */
  initIcons() {
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  },

  /**
   * Standard debounce utility
   * @param {Function} fn - Function to debounce
   * @param {number} delay - Delay in milliseconds
   * @returns {Function} Debounced function
   */
  debounce(fn, delay) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  },

  /**
   * Animate elements on load with staggered entrance
   * @param {string} selector - CSS selector for elements to animate
   * @param {number} staggerMs - Stagger delay between each element
   */
  animateOnLoad(selector, staggerMs = 80) {
    const elements = document.querySelectorAll(selector);
    elements.forEach((el, index) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      setTimeout(() => {
        el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
        el.classList.add('animate-in');
      }, index * staggerMs);
    });
  },

  /**
   * Get today's date as ISO string (YYYY-MM-DD)
   * @returns {string}
   */
  today() {
    const d = new Date();
    return d.toISOString().split('T')[0];
  },

  /**
   * Get a date offset from today
   * @param {number} days - Number of days to offset (positive = future)
   * @returns {string} ISO date string
   */
  dateOffset(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  },

  /**
   * Simple hash of a string (for localStorage keys)
   * @param {string} str
   * @returns {string}
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  },

  /**
   * Escape HTML to prevent XSS
   * @param {string} str
   * @returns {string}
   */
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};
