import { supabase } from '../supabaseClient.js'
import './style.css'

import { renderAddTransactionTab } from './tabs/addTransaction.js'
import { renderLoansTab } from './tabs/loans.js'
import { renderDashboardTab } from './tabs/dashboard.js'
import { renderHistoryTab } from './tabs/history.js'
import { renderSettingsTab } from './tabs/settings.js'

const app = document.getElementById('app')

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
        <input type="email" id="email" placeholder="Email" required />
        <input type="password" id="password" placeholder="Password" required />
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

async function renderApp(session) {
  app.innerHTML = `
    <div class="topbar">
      <span class="app-title">Money Tracker</span>
      <div class="topbar-actions">
        <button id="settings-btn" class="icon-btn" title="Settings">⚙️</button>
        <button id="logout-btn">Log Out</button>
      </div>
    </div>
    <div class="tabs">
      <button class="tab-btn active" data-tab="dashboard">Dashboard</button>
      <button class="tab-btn" data-tab="add">Add Transaction</button>
      <button class="tab-btn" data-tab="loans">Loans</button>
      <button class="tab-btn" data-tab="history">History</button>
    </div>
    <div id="tab-content"></div>
  `

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut()
    renderLogin()
  })

  document.getElementById('settings-btn').addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
    renderSettingsTab()
  })

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      if (btn.dataset.tab === 'add') renderAddTransactionTab()
      if (btn.dataset.tab === 'loans') renderLoansTab()
      if (btn.dataset.tab === 'dashboard') renderDashboardTab()
      if (btn.dataset.tab === 'history') renderHistoryTab()
    })
  })

  renderDashboardTab()
}

init()