import { supabase } from '../../supabaseClient.js'
import { confirmDialog, showAlert } from '../ui.js'

const PAGE_SIZE = 25

const svg = (paths, cls = 'icon') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`

const ICON_FILTER = svg('<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>')
const ICON_CHEVRON = svg('<path d="m9 18 6-6-6-6"/>', 'icon chevron')
const ICON_LOCK = svg('<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>', 'icon inline-icon')
const ICON_LIST = svg('<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>', 'icon empty-icon')

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function dayLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((today - date) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  const opts = { weekday: 'short', day: 'numeric', month: 'short' }
  if (date.getFullYear() !== today.getFullYear()) opts.year = 'numeric'
  return date.toLocaleDateString(undefined, opts)
}

let historyOffset = 0
let currentFilters = { accountId: '', categoryId: '', dateFrom: '', dateTo: '' }
let generation = 0        // bumped on every reset so late responses are ignored
let lastDate = null       // date of the section currently being filled
let currentGroup = null   // the .group element for that date

export async function renderHistoryTab() {
  historyOffset = 0
  currentFilters = { accountId: '', categoryId: '', dateFrom: '', dateTo: '' }
  generation++
  lastDate = null
  currentGroup = null

  const content = document.getElementById('tab-content')
  content.innerHTML = `
    <div class="history">
      <div class="filter-bar">
        <button type="button" id="filter-toggle" class="chip" aria-expanded="false" aria-controls="filter-panel">
          ${ICON_FILTER}<span>Filters</span><span id="filter-count" class="chip-badge" hidden></span>
        </button>
        <button type="button" id="clear-filters-btn" class="chip-plain" hidden>Clear</button>
      </div>

      <div id="filter-panel" class="entry-group filter-panel" hidden>
        <div class="field-row">
          <label for="filter-account">Account</label>
          <select id="filter-account"><option value="">All</option></select>
        </div>
        <div class="field-row">
          <label for="filter-category">Category</label>
          <select id="filter-category"><option value="">All</option></select>
        </div>
        <div class="field-row">
          <label for="filter-date-from">From</label>
          <input type="date" id="filter-date-from" />
        </div>
        <div class="field-row">
          <label for="filter-date-to">To</label>
          <input type="date" id="filter-date-to" />
        </div>
      </div>

      <div id="history-list"></div>
      <button type="button" id="load-more-btn" class="load-more-btn" hidden>Show More</button>
      <p id="history-status" class="history-status"></p>
    </div>
  `

  const [accountsRes, categoriesRes] = await Promise.all([
    supabase.from('accounts').select('*').order('name'),
    supabase.from('categories').select('*').order('name'),
  ])

  const accountSelect = document.getElementById('filter-account')
  ;(accountsRes.data || []).forEach(a => {
    accountSelect.insertAdjacentHTML('beforeend', `<option value="${a.id}">${esc(a.name)}</option>`)
  })

  const categorySelect = document.getElementById('filter-category')
  ;(categoriesRes.data || []).forEach(c => {
    categorySelect.insertAdjacentHTML('beforeend', `<option value="${c.id}">${esc(c.name)}</option>`)
  })

  const toggle = document.getElementById('filter-toggle')
  const panel = document.getElementById('filter-panel')
  toggle.addEventListener('click', () => {
    const open = panel.hidden
    panel.hidden = !open
    toggle.setAttribute('aria-expanded', String(open))
  })

  // Filters apply as soon as you change them — no Apply button needed.
  panel.addEventListener('change', () => {
    currentFilters = {
      accountId: accountSelect.value,
      categoryId: categorySelect.value,
      dateFrom: document.getElementById('filter-date-from').value,
      dateTo: document.getElementById('filter-date-to').value,
    }
    updateFilterUi()
    resetAndLoad()
  })

  document.getElementById('clear-filters-btn').addEventListener('click', () => {
    accountSelect.value = ''
    categorySelect.value = ''
    document.getElementById('filter-date-from').value = ''
    document.getElementById('filter-date-to').value = ''
    currentFilters = { accountId: '', categoryId: '', dateFrom: '', dateTo: '' }
    updateFilterUi()
    resetAndLoad()
  })

  document.getElementById('load-more-btn').addEventListener('click', loadMoreHistory)

  document.getElementById('history-list').addEventListener('click', (e) => {
    const row = e.target.closest('button.tx-row')
    if (row) renderEditTransaction(row.dataset.id)
  })

  await loadMoreHistory()
}

function activeFilterCount() {
  return Object.values(currentFilters).filter(Boolean).length
}

function updateFilterUi() {
  const count = activeFilterCount()
  const badge = document.getElementById('filter-count')
  badge.hidden = count === 0
  badge.textContent = count
  document.getElementById('clear-filters-btn').hidden = count === 0
}

function resetAndLoad() {
  historyOffset = 0
  generation++
  lastDate = null
  currentGroup = null
  document.getElementById('history-list').innerHTML = ''
  document.getElementById('load-more-btn').hidden = true
  loadMoreHistory()
}

function signedAmount(t) {
  const fromExternal = t.from && t.from.is_external
  const toExternal = t.to && t.to.is_external
  if (toExternal && !fromExternal) return { text: '−' + fmt(t.amount), cls: '' }
  if (fromExternal && !toExternal) return { text: '+' + fmt(t.amount), cls: 'pos' }
  return { text: fmt(t.amount), cls: '' }
}

function rowHtml(t) {
  const locked = !!t.loan_code
  const { text, cls } = signedAmount(t)
  const route = [t.from ? esc(t.from.name) : '', t.to ? esc(t.to.name) : ''].filter(Boolean).join(' → ')
  const sub = [t.categories ? esc(t.categories.name) : '', route].filter(Boolean).join(' · ')

  const inner = `
    <div class="tx-main">
      <span class="tx-title">${esc(t.description)}</span>
      <span class="tx-sub">${sub}</span>
      ${t.notes ? `<span class="tx-note">${esc(t.notes)}</span>` : ''}
      ${locked ? `<span class="tx-lock">${ICON_LOCK}Loan ${esc(t.loan_code)} · edit in Loans</span>` : ''}
    </div>
    <span class="tx-amount ${cls}">${text}</span>
    ${locked ? '' : ICON_CHEVRON}
  `

  return locked
    ? `<div class="tx-row locked">${inner}</div>`
    : `<button type="button" class="tx-row" data-id="${t.id}">${inner}</button>`
}

function appendRows(rows) {
  const listEl = document.getElementById('history-list')
  rows.forEach(t => {
    if (t.date !== lastDate) {
      listEl.insertAdjacentHTML('beforeend', `<h3 class="section-title">${dayLabel(t.date)}</h3><div class="group"></div>`)
      currentGroup = listEl.lastElementChild
      lastDate = t.date
    }
    currentGroup.insertAdjacentHTML('beforeend', rowHtml(t))
  })
}

async function loadMoreHistory() {
  const listEl = document.getElementById('history-list')
  const statusEl = document.getElementById('history-status')
  const btn = document.getElementById('load-more-btn')
  const myGeneration = generation
  statusEl.textContent = ''
  btn.disabled = true

  let query = supabase
    .from('transactions')
    .select('id, date, description, amount, notes, category_id, categories(name), from_account_id, to_account_id, loan_code, from:accounts!transactions_from_account_id_fkey(name, is_external), to:accounts!transactions_to_account_id_fkey(name, is_external)')
    .order('date', { ascending: false })
    .order('id', { ascending: false })
    .range(historyOffset, historyOffset + PAGE_SIZE - 1)

  if (currentFilters.categoryId) {
    query = query.eq('category_id', currentFilters.categoryId)
  }
  if (currentFilters.accountId) {
    query = query.or(`from_account_id.eq.${currentFilters.accountId},to_account_id.eq.${currentFilters.accountId}`)
  }
  if (currentFilters.dateFrom) {
    query = query.gte('date', currentFilters.dateFrom)
  }
  if (currentFilters.dateTo) {
    query = query.lte('date', currentFilters.dateTo)
  }

  const { data: rows, error } = await query

  if (myGeneration !== generation) return   // filters changed while loading
  btn.disabled = false

  if (error) {
    statusEl.textContent = 'Unable to load transactions: ' + error.message
    statusEl.className = 'history-status error'
    return
  }

  if (historyOffset === 0 && rows.length === 0) {
    const filtered = activeFilterCount() > 0
    listEl.innerHTML = `
      <div class="empty">
        ${ICON_LIST}
        <h3>No Transactions</h3>
        <p>${filtered ? 'Nothing matches these filters.' : 'Transactions you add will appear here.'}</p>
      </div>
    `
    btn.hidden = true
    return
  }

  appendRows(rows)
  historyOffset += rows.length
  btn.hidden = rows.length < PAGE_SIZE
}

async function renderEditTransaction(id) {
  const content = document.getElementById('tab-content')

  const [txRes, categoriesRes, accountsRes] = await Promise.all([
    supabase.from('transactions').select('*').eq('id', id).single(),
    supabase.from('categories').select('*').order('name'),
    supabase.from('accounts').select('*').order('name'),
  ])

  if (txRes.error) {
    await showAlert('Could not load this transaction: ' + txRes.error.message)
    return
  }

  const t = txRes.data
  const categories = categoriesRes.data || []
  const accounts = accountsRes.data || []

  const options = (items, selected) =>
    '<option value="">Select</option>' +
    items.map(i => `<option value="${i.id}"${String(i.id) === String(selected) ? ' selected' : ''}>${esc(i.name)}</option>`).join('')

  window.scrollTo(0, 0)
  content.innerHTML = `
    <form id="edit-tx-form" class="entry">
      <div class="amount-card">
        <label for="edit-amount">Amount</label>
        <input type="number" id="edit-amount" step="0.01" inputmode="decimal" placeholder="0.00" required />
      </div>

      <div class="entry-group">
        <div class="field-row">
          <label for="edit-description">Description</label>
          <input type="text" id="edit-description" required />
        </div>
        <div class="field-row">
          <label for="edit-category">Category</label>
          <select id="edit-category" required>${options(categories, t.category_id)}</select>
        </div>
        <div class="field-row">
          <label for="edit-date">Date</label>
          <input type="date" id="edit-date" required />
        </div>
      </div>

      <div class="entry-group">
        <div class="field-row">
          <label for="edit-from_account">From</label>
          <select id="edit-from_account" required>${options(accounts, t.from_account_id)}</select>
        </div>
        <div class="field-row">
          <label for="edit-to_account">To</label>
          <select id="edit-to_account" required>${options(accounts, t.to_account_id)}</select>
        </div>
      </div>

      <div class="entry-group">
        <div class="field-row">
          <label for="edit-notes">Notes</label>
          <input type="text" id="edit-notes" placeholder="Optional" />
        </div>
      </div>

      <button type="submit">Update</button>
      <button type="button" id="delete-tx-btn" class="danger-btn">Delete</button>
      <button type="button" id="cancel-edit-btn" class="secondary-btn">Cancel</button>
      <p id="edit-status"></p>
    </form>
  `

  // Pre-fill with existing values
  document.getElementById('edit-date').value = t.date
  document.getElementById('edit-description').value = t.description
  document.getElementById('edit-amount').value = t.amount
  document.getElementById('edit-notes').value = t.notes || ''

  document.getElementById('cancel-edit-btn').addEventListener('click', () => {
    renderHistoryTab()
  })

  document.getElementById('delete-tx-btn').addEventListener('click', async () => {
    const confirmed = await confirmDialog({
      title: 'Delete Transaction?',
      message: 'This can’t be undone.',
      confirmLabel: 'Delete',
    })
    if (!confirmed) return

    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (error) {
      const statusEl = document.getElementById('edit-status')
      statusEl.textContent = 'Error: ' + error.message
      statusEl.className = 'error'
    } else {
      renderHistoryTab()
    }
  })

  document.getElementById('edit-tx-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const statusEl = document.getElementById('edit-status')

    const { error } = await supabase.from('transactions').update({
      date: document.getElementById('edit-date').value,
      description: document.getElementById('edit-description').value,
      category_id: document.getElementById('edit-category').value,
      from_account_id: document.getElementById('edit-from_account').value,
      to_account_id: document.getElementById('edit-to_account').value,
      amount: document.getElementById('edit-amount').value,
      notes: document.getElementById('edit-notes').value || null
    }).eq('id', id)

    if (error) {
      statusEl.textContent = 'Error: ' + error.message
      statusEl.className = 'error'
    } else {
      renderHistoryTab()
    }
  })
}
