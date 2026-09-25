import { supabase } from '../../supabaseClient.js'

const PAGE_SIZE = 25
let historyOffset = 0
let currentFilters = { accountId: '', categoryId: '', dateFrom: '', dateTo: '' }

export async function renderHistoryTab() {
  historyOffset = 0
  currentFilters = { accountId: '', categoryId: '', dateFrom: '', dateTo: '' }

  const content = document.getElementById('tab-content')
  content.innerHTML = `
    <div class="history">
      <div class="form-box filter-box">
        <h2>Filters</h2>
        <label>Account</label>
        <select id="filter-account"><option value="">All accounts</option></select>

        <label>Category</label>
        <select id="filter-category"><option value="">All categories</option></select>

        <label>From date</label>
        <input type="date" id="filter-date-from" />

        <label>To date</label>
        <input type="date" id="filter-date-to" />

        <button id="apply-filters-btn">Apply Filters</button>
        <button id="clear-filters-btn" class="secondary-btn">Clear Filters</button>
      </div>

      <h2>Transaction History</h2>
      <div id="history-list"></div>
      <button id="load-more-btn" class="load-more-btn">Load More</button>
      <p id="history-status"></p>
    </div>
  `

  const { data: accounts } = await supabase.from('accounts').select('*').order('name')
  const { data: categories } = await supabase.from('categories').select('*').order('name')

  const accountSelect = document.getElementById('filter-account')
  accounts.forEach(a => {
    accountSelect.innerHTML += `<option value="${a.id}">${a.name}</option>`
  })

  const categorySelect = document.getElementById('filter-category')
  categories.forEach(c => {
    categorySelect.innerHTML += `<option value="${c.id}">${c.name}</option>`
  })

  document.getElementById('apply-filters-btn').addEventListener('click', () => {
    currentFilters = {
      accountId: document.getElementById('filter-account').value,
      categoryId: document.getElementById('filter-category').value,
      dateFrom: document.getElementById('filter-date-from').value,
      dateTo: document.getElementById('filter-date-to').value
    }
    resetAndLoad()
  })

  document.getElementById('clear-filters-btn').addEventListener('click', () => {
    document.getElementById('filter-account').value = ''
    document.getElementById('filter-category').value = ''
    document.getElementById('filter-date-from').value = ''
    document.getElementById('filter-date-to').value = ''
    currentFilters = { accountId: '', categoryId: '', dateFrom: '', dateTo: '' }
    resetAndLoad()
  })

  document.getElementById('load-more-btn').addEventListener('click', loadMoreHistory)

  await loadMoreHistory()
}

function resetAndLoad() {
  historyOffset = 0
  document.getElementById('history-list').innerHTML = ''
  document.getElementById('load-more-btn').style.display = 'block'
  loadMoreHistory()
}

async function loadMoreHistory() {
  const listEl = document.getElementById('history-list')
  const statusEl = document.getElementById('history-status')
  const btn = document.getElementById('load-more-btn')
  statusEl.textContent = ''

  let query = supabase
    .from('transactions')
    .select('id, date, description, amount, notes, category_id, categories(name), from_account_id, to_account_id, loan_code, from:accounts!transactions_from_account_id_fkey(name), to:accounts!transactions_to_account_id_fkey(name)')
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

  if (error) {
    statusEl.textContent = 'Error: ' + error.message
    statusEl.className = 'error'
    return
  }

  rows.forEach(t => {
    const locked = !!t.loan_code
    listEl.innerHTML += `
      <div class="history-row ${locked ? 'locked' : ''}" data-id="${t.id}">
        <div class="history-row-top">
          <strong>${t.description}</strong>
          <span>${Number(t.amount).toFixed(2)}</span>
        </div>
        <div class="history-row-bottom">
          ${t.date} · ${t.categories ? t.categories.name : ''} · ${t.from ? t.from.name : ''} → ${t.to ? t.to.name : ''}
        </div>
        ${t.notes ? `<div class="history-notes">${t.notes}</div>` : ''}
        ${locked ? `<div class="loan-lock-note">🔒 Linked to loan ${t.loan_code} — edit from the Loans tab</div>` : ''}
      </div>
    `
  })

  historyOffset += rows.length

  document.querySelectorAll('.history-row:not(.locked)').forEach(row => {
    row.addEventListener('click', () => renderEditTransaction(row.dataset.id))
  })

  if (rows.length < PAGE_SIZE) {
    btn.style.display = 'none'
    if (historyOffset === 0) {
      listEl.innerHTML = '<p>No transactions match these filters.</p>'
    }
  }
}

async function renderEditTransaction(id) {
  const content = document.getElementById('tab-content')

  const { data: t, error: loadError } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', id)
    .single()

  if (loadError) {
    alert('Could not load transaction: ' + loadError.message)
    return
  }

  content.innerHTML = `
    <div class="form-box">
      <h2>Edit Transaction</h2>
      <form id="edit-tx-form">
        <label>Date</label>
        <input type="date" id="edit-date" required />

        <label>Description</label>
        <input type="text" id="edit-description" required />

        <label>Category</label>
        <select id="edit-category" required></select>

        <label>From Account</label>
        <select id="edit-from_account" required></select>

        <label>To Account</label>
        <select id="edit-to_account" required></select>

        <label>Amount</label>
        <input type="number" id="edit-amount" step="0.01" required />

        <label>Notes</label>
        <input type="text" id="edit-notes" />

        <button type="submit">Update</button>
        <button type="button" id="delete-tx-btn" class="danger-btn">Delete</button>
        <button type="button" id="cancel-edit-btn" class="secondary-btn">Cancel</button>
        <p id="edit-status"></p>
      </form>
    </div>
  `

  const { data: categories } = await supabase.from('categories').select('*').order('name')
  const { data: accounts } = await supabase.from('accounts').select('*').order('name')

  const categorySelect = document.getElementById('edit-category')
  categories.forEach(c => {
    categorySelect.innerHTML += `<option value="${c.id}">${c.name}</option>`
  })

  const fromSelect = document.getElementById('edit-from_account')
  const toSelect = document.getElementById('edit-to_account')
  accounts.forEach(a => {
    fromSelect.innerHTML += `<option value="${a.id}">${a.name}</option>`
    toSelect.innerHTML += `<option value="${a.id}">${a.name}</option>`
  })

  // Pre-fill with existing values
  document.getElementById('edit-date').value = t.date
  document.getElementById('edit-description').value = t.description
  document.getElementById('edit-category').value = t.category_id
  document.getElementById('edit-from_account').value = t.from_account_id
  document.getElementById('edit-to_account').value = t.to_account_id
  document.getElementById('edit-amount').value = t.amount
  document.getElementById('edit-notes').value = t.notes || ''

  document.getElementById('cancel-edit-btn').addEventListener('click', () => {
    renderHistoryTab()
  })

  document.getElementById('delete-tx-btn').addEventListener('click', async () => {
    const confirmed = confirm('Delete this transaction? This cannot be undone.')
    if (!confirmed) return

    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (error) {
      document.getElementById('edit-status').textContent = 'Error: ' + error.message
      document.getElementById('edit-status').className = 'error'
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