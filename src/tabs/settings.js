import { supabase } from '../../supabaseClient.js'
import { showAlert } from '../ui.js'

// Category kinds drive the auto-fill on the Add Transaction tab.
const CATEGORY_KINDS = [
  ['expense', 'Expense'],
  ['income', 'Income'],
  ['transfer', 'Transfer'],
  ['other', 'Other'],
]

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function kindOptions(selected) {
  return CATEGORY_KINDS
    .map(([value, label]) => `<option value="${value}"${value === selected ? ' selected' : ''}>${label}</option>`)
    .join('')
}

const CHECK = '<svg class="saved-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>'

function flashSaved(row) {
  row.classList.add('saved')
  setTimeout(() => row.classList.remove('saved'), 1400)
}

export async function renderSettingsTab() {
  const content = document.getElementById('tab-content')
  content.innerHTML = `
    <div class="settings">
      <h3 class="section-title">Accounts</h3>
      <div class="group" id="accounts-list"></div>
      <p class="section-footer">Changes save automatically. External stands for a source or destination of money, such as income or spending. It isn’t an account you hold.</p>

      <form id="add-account-form" class="add-form">
        <div class="entry-group">
          <div class="field-row">
            <label for="new-account-name">Name</label>
            <input type="text" id="new-account-name" placeholder="New account" required />
          </div>
          <div class="field-row">
            <label for="new-account-external">External</label>
            <span class="switch">
              <input type="checkbox" id="new-account-external" role="switch" />
              <span class="switch-track"></span>
            </span>
          </div>
        </div>
        <button type="submit">Add Account</button>
        <p id="account-status"></p>
      </form>

      <h3 class="section-title">Categories</h3>
      <div class="group" id="categories-list"></div>
      <p class="section-footer">Type decides what the Add Transaction form fills in for you: expenses go to External, income comes from it.</p>

      <form id="add-category-form" class="add-form">
        <div class="entry-group">
          <div class="field-row">
            <label for="new-category-name">Name</label>
            <input type="text" id="new-category-name" placeholder="New category" required />
          </div>
          <div class="field-row">
            <label for="new-category-kind">Type</label>
            <select id="new-category-kind">${kindOptions('expense')}</select>
          </div>
        </div>
        <button type="submit">Add Category</button>
        <p id="category-status"></p>
      </form>

      <h3 class="section-title">Session</h3>
      <div class="group">
        <button type="button" id="logout-btn" class="row row-button destructive">Log Out</button>
      </div>
    </div>
  `

  await Promise.all([loadAccountsList(), loadCategoriesList()])

  document.getElementById('logout-btn').addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('app:logout'))
  })

  document.getElementById('add-account-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const statusEl = document.getElementById('account-status')
    const name = document.getElementById('new-account-name').value.trim()
    const isExternal = document.getElementById('new-account-external').checked

    const { error } = await supabase.from('accounts').insert({ name, is_external: isExternal })

    if (error) {
      statusEl.textContent = 'Error: ' + error.message
      statusEl.className = 'error'
    } else {
      statusEl.textContent = 'Added ✓'
      statusEl.className = 'success'
      document.getElementById('add-account-form').reset()
      setTimeout(() => { statusEl.textContent = '' }, 2000)
      loadAccountsList()
    }
  })

  document.getElementById('add-category-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const statusEl = document.getElementById('category-status')
    const name = document.getElementById('new-category-name').value.trim()
    const kind = document.getElementById('new-category-kind').value

    const { error } = await supabase.from('categories').insert({ name, kind })

    if (error) {
      statusEl.textContent = 'Error: ' + error.message
      statusEl.className = 'error'
    } else {
      statusEl.textContent = 'Added ✓'
      statusEl.className = 'success'
      document.getElementById('add-category-form').reset()
      setTimeout(() => { statusEl.textContent = '' }, 2000)
      loadCategoriesList()
    }
  })
}

async function loadAccountsList() {
  const listEl = document.getElementById('accounts-list')
  const { data: accounts, error } = await supabase.from('accounts').select('*').order('name')

  if (error) {
    listEl.innerHTML = `<div class="row"><span class="error">Unable to load accounts: ${esc(error.message)}</span></div>`
    return
  }

  listEl.innerHTML = accounts.map(a => `
    <div class="field-row settings-row" data-id="${a.id}">
      <input type="text" class="name-input" value="${esc(a.name)}" aria-label="Account name" />
      ${a.is_external ? '<span class="tag">External</span>' : ''}
      ${CHECK}
    </div>
  `).join('')

  // Save when you leave the field (or press Return) — no Save button needed.
  listEl.querySelectorAll('.name-input').forEach(input => {
    input.addEventListener('change', async () => {
      const row = input.closest('.settings-row')
      const newName = input.value.trim()
      if (!newName) { loadAccountsList(); return }

      const { error } = await supabase.from('accounts').update({ name: newName }).eq('id', row.dataset.id)
      if (error) {
        await showAlert('Unable to rename the account: ' + error.message)
        loadAccountsList()
      } else {
        flashSaved(row)
      }
    })
  })
}

async function loadCategoriesList() {
  const listEl = document.getElementById('categories-list')
  const { data: categories, error } = await supabase.from('categories').select('*').order('name')

  if (error) {
    listEl.innerHTML = `<div class="row"><span class="error">Unable to load categories: ${esc(error.message)}</span></div>`
    return
  }

  listEl.innerHTML = categories.map(c => `
    <div class="field-row settings-row" data-id="${c.id}">
      <input type="text" class="name-input" value="${esc(c.name)}" aria-label="Category name" />
      <select class="kind-select" aria-label="Category type">${kindOptions(c.kind)}</select>
      ${CHECK}
    </div>
  `).join('')

  listEl.querySelectorAll('.settings-row').forEach(row => {
    const save = async () => {
      const newName = row.querySelector('.name-input').value.trim()
      const newKind = row.querySelector('.kind-select').value
      if (!newName) { loadCategoriesList(); return }

      const { error } = await supabase
        .from('categories')
        .update({ name: newName, kind: newKind })
        .eq('id', row.dataset.id)
      if (error) {
        await showAlert('Unable to update the category: ' + error.message)
        loadCategoriesList()
      } else {
        flashSaved(row)
      }
    }
    row.querySelector('.name-input').addEventListener('change', save)
    row.querySelector('.kind-select').addEventListener('change', save)
  })
}
