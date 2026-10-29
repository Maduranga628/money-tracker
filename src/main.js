import { supabase } from '../supabaseClient.js'
import './style.css'

import { renderAddTransactionTab } from './tabs/addTransaction.js'
import { renderLoansTab } from './tabs/loans.js'
import { renderDashboardTab } from './tabs/dashboard.js'
import { renderHistoryTab } from './tabs/history.js'
import { renderSettingsTab } from './tabs/settings.js'

const app = document.getElementById('app')

// One stroke family (Lucide-style), one weight, used everywhere.
const icon = (paths) =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`

const ICONS = {
  dashboard: icon('<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>'),
  add: icon('<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>'),
  loans: icon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  history: icon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
  settings: icon('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'),
}

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'add', label: 'Add' },
  { id: 'loans', label: 'Loans' },
  { id: 'history', label: 'History' },
]

const TITLES = {
  dashboard: 'Dashboard',
  add: 'Add Transaction',
  loans: 'Loans',
  history: 'History',
  settings: 'Settings',
}

const RENDERERS = {
  dashboard: renderDashboardTab,
  add: renderAddTransactionTab,
  loans: renderLoansTab,
  history: renderHistoryTab,
  settings: renderSettingsTab,
}

// Settings has the Log Out button; it asks us to sign out via this event.
document.addEventListener('app:logout', async () => {
  await supabase.auth.signOut()
  document.body.classList.remove('scrolled')
  renderLogin()
})

// The inline title and top fade appear once the large title scrolls away.
window.addEventListener('scroll', () => {
  document.body.classList.toggle('scrolled', window.scrollY > 48)
}, { passive: true })

async function init() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    renderApp(session)
  } else {
    renderLogin()
  }
}

function renderLogin() {
  app.innerHTML = `
    <div class="login-box">
      <h1>Money Tracker</h1>
      <form id="login-form">
        <input type="email" id="email" placeholder="Email" autocomplete="username" required />
        <input type="password" id="password" placeholder="Password" autocomplete="current-password" required />
        <button type="submit">Log In</button>
        <p id="login-error" class="error"></p>
      </form>
    </div>
  `

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = document.getElementById('email').value
    const password = document.getElementById('password').value
    const errorEl = document.getElementById('login-error')

    const { data, error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      errorEl.textContent = error.message
    } else {
      renderApp(data.session)
    }
  })
}

function showTab(name) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const isActive = btn.dataset.tab === name
    btn.classList.toggle('active', isActive)
    if (isActive) btn.setAttribute('aria-current', 'page')
    else btn.removeAttribute('aria-current')
  })

  document.getElementById('settings-btn').classList.toggle('active', name === 'settings')
  document.getElementById('large-title').textContent = TITLES[name]
  document.getElementById('navbar-title').textContent = TITLES[name]

  window.scrollTo(0, 0)
  RENDERERS[name]()
}

async function renderApp(session) {
  app.innerHTML = `
    <div class="scroll-edge scroll-edge-top"></div>
    <header class="navbar">
      <div class="navbar-inner">
        <span class="navbar-title" id="navbar-title"></span>
        <button id="settings-btn" class="glass-btn glass" aria-label="Settings">${ICONS.settings}</button>
      </div>
    </header>

    <main class="app-main">
      <h1 class="large-title" id="large-title"></h1>
      <div id="tab-content"></div>
    </main>

    <div class="scroll-edge scroll-edge-bottom"></div>
    <nav class="tabbar glass" aria-label="Sections">
      ${TABS.map(t => `
        <button class="tab-btn" data-tab="${t.id}">
          ${ICONS[t.id]}
          <span>${t.label}</span>
        </button>
      `).join('')}
    </nav>
  `

  document.getElementById('settings-btn').addEventListener('click', () => showTab('settings'))

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => showTab(btn.dataset.tab))
  })

  showTab('dashboard')
}

init()
