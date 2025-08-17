'use strict';

// Enhanced navigation with better structure and performance
function renderNav(active) {
  const is = (key) => key === active ? 'item active' : 'item';
  return `
  <aside class="nav">
    <div class="nav-header">
      <div class="logo">WhatsApp AI</div>
      <button class="btn btn-ghost" id="toggleTheme" type="button" title="Toggle theme">
        <span class="theme-icon">🌙</span>
      </button>
    </div>
    <nav class="nav-menu">
      <a class="${is('dashboard')}" href="/" data-tooltip="Main dashboard">
        <span class="ico">🏠</span>
        <span>Dashboard</span>
      </a>
      <a class="${is('kb')}" href="/kb" data-tooltip="Knowledge Base">
        <span class="ico">📄</span>
        <span>Knowledge Base</span>
      </a>
      <a class="${is('settings')}" href="/settings" data-tooltip="Settings">
        <span class="ico">⚙️</span>
        <span>Settings</span>
      </a>
      <a class="${is('convos')}" href="/convos" data-tooltip="Conversations">
        <span class="ico">💬</span>
        <span>Conversations</span>
      </a>
      <a class="${is('auto')}" href="/auto" data-tooltip="Auto Replies">
        <span class="ico">⚡</span>
        <span>Auto Replies</span>
      </a>
      <a class="${is('contacts')}" href="/contacts" data-tooltip="Contacts">
        <span class="ico">📇</span>
        <span>Contacts</span>
      </a>
      <a class="${is('checker')}" href="/checker" data-tooltip="Number Checker">
        <span class="ico">✅</span>
        <span>Number Checker</span>
      </a>
      <a class="${is('bulk')}" href="/bulk" data-tooltip="Bulk Send">
        <span class="ico">📤</span>
        <span>Bulk Send</span>
      </a>
      <a class="${is('easy')}" href="/easy" data-tooltip="Easy Orders">
        <span class="ico">🧾</span>
        <span>Easy Orders</span>
      </a>
      <a class="${is('profiles')}" href="/profiles" data-tooltip="Profiles">
        <span class="ico">👥</span>
        <span>Profiles</span>
      </a>
      <a class="${is('deploy')}" href="/deploy" data-tooltip="Deploy">
        <span class="ico">🚀</span>
        <span>Deploy</span>
      </a>
    </nav>
  </aside>`;
}

// Enhanced toast notification system
function showToast(message, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  
  // Add icon based on type
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };
  
  toast.innerHTML = `${icons[type] || icons.info} ${message}`;
  
  document.body.appendChild(toast);
  
  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 10);
  
  // Auto remove
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 200);
  }, duration);
  
  return toast;
}

// Enhanced loading state management
function setLoading(element, isLoading = true) {
  if (isLoading) {
    element.classList.add('loading');
    if (element.tagName === 'BUTTON') {
      element.classList.add('loading');
      const originalText = element.textContent;
      element.setAttribute('data-original-text', originalText);
      element.textContent = 'Loading...';
    }
  } else {
    element.classList.remove('loading');
    if (element.tagName === 'BUTTON') {
      element.classList.remove('loading');
      const originalText = element.getAttribute('data-original-text');
      if (originalText) {
        element.textContent = originalText;
      }
    }
  }
}

// Enhanced form validation
function validateForm(form) {
  const inputs = form.querySelectorAll('input[required], select[required], textarea[required]');
  let isValid = true;
  
  inputs.forEach(input => {
    if (!input.value.trim()) {
      input.classList.add('error');
      isValid = false;
    } else {
      input.classList.remove('error');
    }
  });
  
  return isValid;
}

// Enhanced search functionality
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Enhanced table sorting
function sortTable(table, columnIndex, type = 'string') {
  const tbody = table.querySelector('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  
  rows.sort((a, b) => {
    const aValue = a.cells[columnIndex].textContent.trim();
    const bValue = b.cells[columnIndex].textContent.trim();
    
    if (type === 'number') {
      return parseFloat(aValue) - parseFloat(bValue);
    } else if (type === 'date') {
      return new Date(aValue) - new Date(bValue);
    } else {
      return aValue.localeCompare(bValue);
    }
  });
  
  // Clear and re-append sorted rows
  rows.forEach(row => tbody.appendChild(row));
}

// Enhanced modal system
function createModal(title, content, options = {}) {
  const modal = document.createElement('div');
  modal.className = 'modal';
  
  const modalContent = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="btn btn-ghost modal-close" onclick="this.closest('.modal').remove()">×</button>
      </div>
      <div class="modal-body">
        ${content}
      </div>
      ${options.footer ? `<div class="modal-footer">${options.footer}</div>` : ''}
    </div>
  `;
  
  modal.innerHTML = modalContent;
  document.body.appendChild(modal);
  
  // Show modal
  setTimeout(() => modal.classList.add('show'), 10);
  
  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 200);
    }
  });
  
  return modal;
}

// Enhanced progress bar
function createProgressBar(container, value = 0, max = 100) {
  const progress = document.createElement('div');
  progress.className = 'progress';
  
  const progressBar = document.createElement('div');
  progressBar.className = 'progress-bar';
  progressBar.style.width = `${(value / max) * 100}%`;
  
  progress.appendChild(progressBar);
  container.appendChild(progress);
  
  return {
    update: (newValue) => {
      progressBar.style.width = `${(newValue / max) * 100}%`;
    },
    remove: () => {
      if (progress.parentNode) {
        progress.parentNode.removeChild(progress);
      }
    }
  };
}

// Enhanced file upload with drag & drop
function createFileUpload(container, options = {}) {
  const uploadArea = document.createElement('div');
  uploadArea.className = 'file-upload-area';
  uploadArea.innerHTML = `
    <div class="file-upload-content">
      <span class="file-upload-icon">📁</span>
      <p>Drag & drop files here or <span class="file-upload-browse">browse</span></p>
      <input type="file" class="file-upload-input" ${options.multiple ? 'multiple' : ''} ${options.accept ? `accept="${options.accept}"` : ''} style="display: none;">
    </div>
  `;
  
  const fileInput = uploadArea.querySelector('.file-upload-input');
  
  // Drag & drop events
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });
  
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });
  
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (options.onFiles) {
      options.onFiles(files);
    }
  });
  
  // Click to browse
  uploadArea.querySelector('.file-upload-browse').addEventListener('click', () => {
    fileInput.click();
  });
  
  fileInput.addEventListener('change', (e) => {
    if (options.onFiles) {
      options.onFiles(e.target.files);
    }
  });
  
  container.appendChild(uploadArea);
  return uploadArea;
}

// Enhanced data table with search and pagination
function createDataTable(container, data, columns, options = {}) {
  const tableContainer = document.createElement('div');
  tableContainer.className = 'data-table-container';
  
  // Search bar
  const searchBar = document.createElement('div');
  searchBar.className = 'toolbar';
  searchBar.innerHTML = `
    <input type="text" placeholder="Search..." class="table-search">
    <div class="table-actions">
      ${options.actions || ''}
    </div>
  `;
  
  // Table
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');
  
  // Header
  const headerRow = document.createElement('tr');
  columns.forEach(column => {
    const th = document.createElement('th');
    th.textContent = column.title;
    if (column.sortable) {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        sortTable(table, columns.indexOf(column), column.type);
      });
    }
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);
  table.appendChild(tbody);
  
  // Render data
  function renderData(dataToRender) {
    tbody.innerHTML = '';
    dataToRender.forEach(row => {
      const tr = document.createElement('tr');
      columns.forEach(column => {
        const td = document.createElement('td');
        td.textContent = row[column.key] || '';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }
  
  // Search functionality
  const searchInput = searchBar.querySelector('.table-search');
  const debouncedSearch = debounce((query) => {
    const filtered = data.filter(row => 
      columns.some(column => 
        String(row[column.key]).toLowerCase().includes(query.toLowerCase())
      )
    );
    renderData(filtered);
  }, 300);
  
  searchInput.addEventListener('input', (e) => {
    debouncedSearch(e.target.value);
  });
  
  // Initial render
  renderData(data);
  
  tableContainer.appendChild(searchBar);
  tableContainer.appendChild(table);
  container.appendChild(tableContainer);
  
  return {
    updateData: (newData) => {
      data = newData;
      renderData(data);
    },
    search: (query) => {
      searchInput.value = query;
      debouncedSearch(query);
    }
  };
}

// Enhanced theme management
function initTheme() {
  const theme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', theme);
  
  const themeToggle = document.getElementById('toggleTheme');
  if (themeToggle) {
    const themeIcon = themeToggle.querySelector('.theme-icon');
    themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    
    themeToggle.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
      
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('theme', newTheme);
      themeIcon.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    });
  }
}

// Enhanced mobile menu
function initMobileMenu() {
  const menuFab = document.querySelector('.menu-fab');
  const nav = document.querySelector('.nav');
  
  if (menuFab && nav) {
    menuFab.addEventListener('click', () => {
      document.body.classList.toggle('sidebar-open');
    });
    
    // Close menu when clicking overlay
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('overlay')) {
        document.body.classList.remove('sidebar-open');
      }
    });
  }
}

// Enhanced keyboard shortcuts
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + K for search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const searchInput = document.querySelector('input[type="search"], .table-search');
      if (searchInput) {
        searchInput.focus();
      }
    }
    
    // Escape to close modals
    if (e.key === 'Escape') {
      const modals = document.querySelectorAll('.modal.show');
      modals.forEach(modal => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 200);
      });
    }
    
    // Ctrl/Cmd + / for theme toggle
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      const themeToggle = document.getElementById('toggleTheme');
      if (themeToggle) {
        themeToggle.click();
      }
    }
  });
}

// Enhanced performance monitoring
function initPerformanceMonitoring() {
  // Monitor page load performance
  window.addEventListener('load', () => {
    const perfData = performance.getEntriesByType('navigation')[0];
    if (perfData) {
      console.log('Page load time:', perfData.loadEventEnd - perfData.loadEventStart, 'ms');
    }
  });
  
  // Monitor long tasks
  if ('PerformanceObserver' in window) {
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.duration > 50) {
          console.warn('Long task detected:', entry.duration, 'ms');
        }
      });
    });
    observer.observe({ entryTypes: ['longtask'] });
  }
}

// Enhanced error handling
function initErrorHandling() {
  window.addEventListener('error', (e) => {
    console.error('JavaScript error:', e.error);
    showToast('An error occurred. Please try again.', 'error');
  });
  
  window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e.reason);
    showToast('An error occurred. Please try again.', 'error');
  });
}

// Initialize all UI enhancements
function initUI() {
  initTheme();
  initMobileMenu();
  initKeyboardShortcuts();
  initPerformanceMonitoring();
  initErrorHandling();
  
  // Add global CSS for enhanced components
  const style = document.createElement('style');
  style.textContent = `
    .file-upload-area {
      border: 2px dashed var(--border);
      border-radius: var(--radius-lg);
      padding: 40px;
      text-align: center;
      transition: var(--transition);
      cursor: pointer;
    }
    
    .file-upload-area:hover,
    .file-upload-area.dragover {
      border-color: var(--accent);
      background: rgba(37, 99, 235, 0.05);
    }
    
    .file-upload-icon {
      font-size: 48px;
      margin-bottom: 16px;
      display: block;
    }
    
    .file-upload-browse {
      color: var(--accent);
      text-decoration: underline;
      cursor: pointer;
    }
    
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }
    
    .modal-close {
      font-size: 24px;
      padding: 4px 8px;
      border-radius: 50%;
    }
    
    .modal-footer {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid var(--border);
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    
    .data-table-container {
      background: var(--card);
      border-radius: var(--radius-lg);
      padding: 20px;
      box-shadow: var(--shadow-sm);
    }
    
    .table-search {
      max-width: 300px;
    }
    
    .table-actions {
      display: flex;
      gap: 8px;
    }
    
    input.error {
      border-color: var(--error);
      box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
    }
  `;
  document.head.appendChild(style);
}

module.exports = { 
  renderNav, 
  showToast, 
  setLoading, 
  validateForm, 
  debounce, 
  sortTable, 
  createModal, 
  createProgressBar, 
  createFileUpload, 
  createDataTable, 
  initUI 
};


