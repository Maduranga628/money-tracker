import { supabase } from '../../supabaseClient.js'
import { confirmDialog, showAlert, setPageTitle, todayLocal } from '../ui.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const svg = (paths, cls = 'icon') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`

const ICON_CHEVRON = svg('<path d="m9 18 6-6-6-6"/>', 'icon chevron')
const ICON_BACK = svg('<path d="m15 18-6-6 6-6"/>')
const ICON_TRASH = svg('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>')
const ICON_LOAN = svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', 'icon empty-icon')

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

const typeLabel = (type) => (type === 'Given' ? 'Lent' : 'Borrowed')
const SETTLE_CATEGORIES = ['Loan Repaid', 'Loan Paid']
const isSettlement = (t) => t.categories && SETTLE_CATEGORIES.includes(t.categories.name)

// Each screen draws into its own root element. If you switch tabs while data is
// still loading, the root is gone and the late result is quietly dropped.
let screenSeq = 0
function openScreen(title) {
  setPageTitle(title)
  window.scrollTo(0, 0)
  const id = `loans-screen-${++screenSeq}`
  document.getElementById('tab-content').innerHTML = `<div id="${id}"></div>`
  return () => document.getElementById(id)
}

const backLink = (label) =>
  `<button type="button" class="back-link" id="back-btn">${ICON_BACK}<span>${label}</span></button>`

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

async function fetchLoans() {
  const [loansRes, txRes] = await Promise.all([
    supabase.from('loans').select('*').order('date', { ascending: false }).order('loan_code', { ascending: false }),
    supabase
      .from('transactions')
      .select('id, date, description, amount, notes, loan_code, categories(name)')
      .not('loan_code', 'is', null)
      .order('date'),
  ])

  const error = loansRes.error || txRes.error
  if (error) return { error }

  const loans = loansRes.data.map(loan => {
    const repayments = txRes.data.filter(t => t.loan_code === loan.loan_code && isSettlement(t))
    const settled = repayments.reduce((sum, t) => sum + Number(t.amount), 0)
    const balance = Number(loan.amount) - settled
    let status = 'Outstanding'
    if (balance <= 0) status = 'Settled'
    else if (settled > 0) status = 'Partially Paid'
    return { ...loan, repayments, settled, balance, status }
  })

  return { loans }
}

// Accounts you can lend from / borrow into, the special "Loans" account,
// and a category-name -> id lookup.
async function fetchRefs() {
  const [accountsRes, categoriesRes] = await Promise.all([
    supabase.from('accounts').select('*').order('name'),
    supabase.from('categories').select('id, name'),
  ])
  const accounts = accountsRes.data || []
  const cats = categoriesRes.data || []
  const loansAccount = accounts.find(a => a.name === 'Loans')
  return {
    loansAccountId: loansAccount ? loansAccount.id : null,
    selectable: accounts.filter(a => !a.is_external && a.name !== 'Loans'),
    catId: (name) => cats.find(c => c.name === name)?.id,
  }
}

async function computeBalance(loanCode, loanAmount) {
  const { data: relatedTx } = await supabase
    .from('transactions')
    .select('amount, categories(name)')
    .eq('loan_code', loanCode)

  const settled = (relatedTx || [])
    .filter(isSettlement)
    .reduce((sum, t) => sum + Number(t.amount), 0)

  return Number(loanAmount) - settled
}

const accountOptions = (accounts, selected) =>
  '<option value="">Select</option>' +
  accounts.map(a => `<option value="${a.id}"${String(a.id) === String(selected) ? ' selected' : ''}>${esc(a.name)}</option>`).join('')

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

function loanRowHtml(l) {
  const settled = l.status === 'Settled'
  const pct = Math.min(100, Math.round((l.settled / Number(l.amount)) * 100))
  const tone = l.type === 'Given' ? 'pos' : 'neg'
  return `
    <button type="button" class="tx-row loan-row" data-code="${esc(l.loan_code)}">
      <div class="tx-main">
        <span class="tx-title">${esc(l.person)}</span>
        <span class="tx-sub">${typeLabel(l.type)} · ${esc(l.loan_code)} · ${formatDate(l.date)}</span>
        ${!settled && l.settled > 0 ? `<div class="progress" role="img" aria-label="${pct}% repaid"><span style="width:${pct}%"></span></div>` : ''}
      </div>
      <div class="loan-amount">
        <span class="loan-balance ${settled ? '' : tone}">${fmt(settled ? l.amount : l.balance)}</span>
        <span class="loan-caption">${settled ? 'Settled' : `of ${fmt(l.amount)}`}</span>
      </div>
      ${ICON_CHEVRON}
    </button>
  `
}

export async function renderLoansTab() {
  const getRoot = openScreen('Loans')
  getRoot().innerHTML = `
    <div class="action-row">
      <button type="button" class="pill-btn primary" id="new-loan-btn">New Loan</button>
      <button type="button" class="pill-btn gray" id="new-repay-btn">Log Repayment</button>
    </div>
    <div id="loans-body">
      <div class="group skeleton-card" style="height: 180px; margin-top: 24px"></div>
    </div>
  `

  document.getElementById('new-loan-btn').addEventListener('click', renderNewLoan)
  document.getElementById('new-repay-btn').addEventListener('click', () => renderRepayment(null, renderLoansTab))

  const { loans, error } = await fetchLoans()
  const body = document.getElementById('loans-body')
  if (!body || !getRoot()) return

  if (error) {
    body.innerHTML = `<p class="error">Unable to load loans: ${esc(error.message)}</p>`
    return
  }

  if (loans.length === 0) {
    body.innerHTML = `
      <div class="empty">
        ${ICON_LOAN}
        <h3>No Loans</h3>
        <p>Loans you lend or borrow will appear here.</p>
      </div>
    `
    return
  }

  const open = loans.filter(l => l.status !== 'Settled')
  const settled = loans.filter(l => l.status === 'Settled')

  body.innerHTML = `
    ${open.length ? `<h3 class="section-title">Outstanding</h3><div class="group">${open.map(loanRowHtml).join('')}</div>` : ''}
    ${settled.length ? `<h3 class="section-title">Settled</h3><div class="group">${settled.map(loanRowHtml).join('')}</div>` : ''}
  `

  body.addEventListener('click', (e) => {
    const row = e.target.closest('.loan-row')
    if (row) renderLoanDetail(row.dataset.code)
  })
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

async function renderLoanDetail(loanCode) {
  const getRoot = openScreen('Loan')
  getRoot().innerHTML = `${backLink('Loans')}<div class="group skeleton-card" style="height: 220px"></div>`
  document.getElementById('back-btn').addEventListener('click', renderLoansTab)

  const { loans, error } = await fetchLoans()
  const root = getRoot()
  if (!root) return

  if (error) {
    root.innerHTML = `${backLink('Loans')}<p class="error">Unable to load this loan: ${esc(error.message)}</p>`
    document.getElementById('back-btn').addEventListener('click', renderLoansTab)
    return
  }

  const loan = loans.find(l => l.loan_code === loanCode)
  if (!loan) { renderLoansTab(); return }

  setPageTitle(loan.person)
  const settled = loan.status === 'Settled'
  const pct = Math.min(100, Math.round((loan.settled / Number(loan.amount)) * 100))
  const tone = loan.type === 'Given' ? 'pos' : 'neg'

  const repaymentRows = loan.repayments.map(r => `
    <div class="row repay-row">
      <div class="tx-main">
        <span class="row-value">${fmt(r.amount)}</span>
        <span class="tx-sub">${formatDate(r.date)}${r.notes ? ' · ' + esc(r.notes) : ''}</span>
      </div>
      <button type="button" class="icon-btn danger repayment-delete-btn" data-id="${r.id}" aria-label="Delete repayment">${ICON_TRASH}</button>
    </div>
  `).join('')

  root.innerHTML = `
    ${backLink('Loans')}

    <section class="hero">
      <div class="hero-label">${settled ? 'Fully repaid' : loan.type === 'Given' ? 'Owed to you' : 'You owe'}</div>
      <div class="hero-amount ${settled ? '' : tone}">${fmt(settled ? loan.amount : loan.balance)}</div>
      <div class="hero-sub">of ${fmt(loan.amount)} · <span class="loan-status status-${loan.status.replace(/\s/g, '')}">${loan.status}</span></div>
      ${loan.settled > 0 ? `<div class="progress progress-large" role="img" aria-label="${pct}% repaid"><span style="width:${pct}%"></span></div>` : ''}
    </section>

    <h3 class="section-title">Details</h3>
    <div class="group">
      <div class="row"><span class="row-muted">Loan</span><span>${esc(loan.loan_code)}</span></div>
      <div class="row"><span class="row-muted">Type</span><span>${typeLabel(loan.type)}</span></div>
      <div class="row"><span class="row-muted">Date</span><span>${formatDate(loan.date)}</span></div>
      ${loan.description ? `<div class="row"><span class="row-muted">Description</span><span class="row-right">${esc(loan.description)}</span></div>` : ''}
      ${loan.notes ? `<div class="row"><span class="row-muted">Notes</span><span class="row-right">${esc(loan.notes)}</span></div>` : ''}
    </div>

    <h3 class="section-title">Repayments</h3>
    <div class="group">
      ${repaymentRows || '<div class="row"><span class="row-muted">No repayments yet</span></div>'}
    </div>

    <div class="detail-actions">
      ${settled ? '' : '<button type="button" class="pill-btn primary" id="detail-repay-btn">Log Repayment</button>'}
      <button type="button" class="pill-btn gray" id="detail-edit-btn">Edit Loan</button>
      <button type="button" class="pill-btn danger" id="detail-delete-btn">Delete Loan</button>
    </div>
  `

  document.getElementById('back-btn').addEventListener('click', renderLoansTab)
  const repayBtn = document.getElementById('detail-repay-btn')
  if (repayBtn) repayBtn.addEventListener('click', () => renderRepayment(loanCode, () => renderLoanDetail(loanCode)))
  document.getElementById('detail-edit-btn').addEventListener('click', () => renderEditLoan(loanCode))
  document.getElementById('detail-delete-btn').addEventListener('click', () => deleteLoan(loanCode))
  root.querySelectorAll('.repayment-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteRepayment(btn.dataset.id, () => renderLoanDetail(loanCode)))
  })
}

async function deleteRepayment(txId, onDone) {
  const confirmed = await confirmDialog({
    title: 'Delete Repayment?',
    message: 'The loan balance will increase back accordingly.',
    confirmLabel: 'Delete',
  })
  if (!confirmed) return

  const { error } = await supabase.from('transactions').delete().eq('id', txId)
  if (error) {
    await showAlert(error.message)
    return
  }
  onDone()
}

async function deleteLoan(loanCode) {
  const confirmed = await confirmDialog({
    title: `Delete Loan ${loanCode}?`,
    message: 'This also deletes its opening transaction and all of its repayments. This can’t be undone.',
    confirmLabel: 'Delete Loan',
  })
  if (!confirmed) return

  const { error: txDeleteError } = await supabase.from('transactions').delete().eq('loan_code', loanCode)
  if (txDeleteError) {
    await showAlert('Unable to delete the linked transactions: ' + txDeleteError.message)
    return
  }

  const { error: loanDeleteError } = await supabase.from('loans').delete().eq('loan_code', loanCode)
  if (loanDeleteError) {
    await showAlert('Unable to delete the loan: ' + loanDeleteError.message)
    return
  }

  renderLoansTab()
}

// ---------------------------------------------------------------------------
// New loan
// ---------------------------------------------------------------------------

const segmentedHtml = (selected) => `
  <div class="segmented" role="radiogroup" aria-label="Loan type">
    <label><input type="radio" name="loan-type" value="Given"${selected === 'Given' ? ' checked' : ''} /><span>I Lent</span></label>
    <label><input type="radio" name="loan-type" value="Borrowed"${selected === 'Borrowed' ? ' checked' : ''} /><span>I Borrowed</span></label>
  </div>
`

const accountLabel = (type) => (type === 'Given' ? 'Paid From' : 'Received In')

function wireTypeLabel(form, labelId) {
  form.querySelectorAll('input[name="loan-type"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.getElementById(labelId).textContent = accountLabel(radio.value)
    })
  })
}

async function renderNewLoan() {
  const getRoot = openScreen('New Loan')
  getRoot().innerHTML = `${backLink('Loans')}<div class="group skeleton-card" style="height: 220px"></div>`
  document.getElementById('back-btn').addEventListener('click', renderLoansTab)

  const { loansAccountId, selectable, catId } = await fetchRefs()
  const root = getRoot()
  if (!root) return

  if (!loansAccountId) {
    await showAlert('An account named “Loans” is needed before you can add a loan. Add it in Settings.', 'Missing Account')
    renderLoansTab()
    return
  }

  root.innerHTML = `
    ${backLink('Loans')}
    <form id="new-loan-form" class="entry">
      <div class="amount-card">
        <label for="loan-amount">Amount</label>
        <input type="number" id="loan-amount" step="0.01" inputmode="decimal" placeholder="0.00" required />
      </div>

      ${segmentedHtml('Given')}

      <div class="entry-group">
        <div class="field-row">
          <label for="loan-person">Person</label>
          <input type="text" id="loan-person" placeholder="Name" required />
        </div>
        <div class="field-row">
          <label for="loan-account" id="loan-account-label">${accountLabel('Given')}</label>
          <select id="loan-account" required>${accountOptions(selectable)}</select>
        </div>
        <div class="field-row">
          <label for="loan-date">Date</label>
          <input type="date" id="loan-date" required />
        </div>
      </div>

      <div class="entry-group">
        <div class="field-row">
          <label for="loan-description">Description</label>
          <input type="text" id="loan-description" placeholder="Optional" />
        </div>
        <div class="field-row">
          <label for="loan-notes">Notes</label>
          <input type="text" id="loan-notes" placeholder="Optional" />
        </div>
      </div>

      <button type="submit">Save Loan</button>
      <button type="button" id="cancel-loan-btn" class="secondary-btn">Cancel</button>
      <p id="loan-save-status"></p>
    </form>
  `

  document.getElementById('loan-date').value = todayLocal()
  document.getElementById('back-btn').addEventListener('click', renderLoansTab)
  document.getElementById('cancel-loan-btn').addEventListener('click', renderLoansTab)

  const form = document.getElementById('new-loan-form')
  wireTypeLabel(form, 'loan-account-label')

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const statusEl = document.getElementById('loan-save-status')
    const submitBtn = form.querySelector('button[type="submit"]')

    const date = document.getElementById('loan-date').value
    const person = document.getElementById('loan-person').value.trim()
    const type = form.querySelector('input[name="loan-type"]:checked').value
    const accountId = document.getElementById('loan-account').value
    const description = document.getElementById('loan-description').value || null
    const amount = document.getElementById('loan-amount').value
    const notes = document.getElementById('loan-notes').value || null

    submitBtn.disabled = true
    statusEl.textContent = ''

    const { data: existing } = await supabase
      .from('loans')
      .select('loan_code')
      .order('loan_code', { ascending: false })
      .limit(1)

    let nextNum = 1
    if (existing && existing.length > 0) {
      nextNum = parseInt(existing[0].loan_code.replace('L', ''), 10) + 1
    }
    const newCode = 'L' + String(nextNum).padStart(4, '0')

    const { error: loanError } = await supabase.from('loans').insert({
      loan_code: newCode, date, person, type, description, amount, notes
    })

    if (loanError) {
      statusEl.textContent = 'Error: ' + loanError.message
      statusEl.className = 'error'
      submitBtn.disabled = false
      return
    }

    const fromId = type === 'Given' ? accountId : loansAccountId
    const toId = type === 'Given' ? loansAccountId : accountId
    const category = type === 'Given' ? 'Loan Given' : 'Loan Received'

    const { error: txError } = await supabase.from('transactions').insert({
      date,
      description: `Loan ${type.toLowerCase()} - ${person}`,
      category_id: catId(category),
      from_account_id: fromId,
      to_account_id: toId,
      amount, notes,
      loan_code: newCode
    })

    if (txError) {
      statusEl.textContent = 'Loan saved, but transaction failed: ' + txError.message
      statusEl.className = 'error'
      return
    }

    renderLoansTab()
  })
}

// ---------------------------------------------------------------------------
// Repayment
// ---------------------------------------------------------------------------

async function renderRepayment(preselectCode, onDone) {
  const getRoot = openScreen('Log Repayment')
  getRoot().innerHTML = `${backLink('Back')}<div class="group skeleton-card" style="height: 220px"></div>`
  document.getElementById('back-btn').addEventListener('click', onDone)

  const [{ loans, error }, refs] = await Promise.all([fetchLoans(), fetchRefs()])
  const root = getRoot()
  if (!root) return

  if (error) {
    root.innerHTML = `${backLink('Back')}<p class="error">Unable to load loans: ${esc(error.message)}</p>`
    document.getElementById('back-btn').addEventListener('click', onDone)
    return
  }

  const open = loans.filter(l => l.balance > 0)
  if (open.length === 0) {
    await showAlert('Every loan is already settled.', 'No Open Loans')
    onDone()
    return
  }
  if (!refs.loansAccountId) {
    await showAlert('An account named “Loans” is needed to log a repayment. Add it in Settings.', 'Missing Account')
    onDone()
    return
  }

  const loanOptions =
    '<option value="">Select</option>' +
    open.map(l => `<option value="${esc(l.loan_code)}"${l.loan_code === preselectCode ? ' selected' : ''}>${esc(l.person)} · ${esc(l.loan_code)}</option>`).join('')

  root.innerHTML = `
    ${backLink('Back')}
    <form id="repay-form" class="entry">
      <div class="amount-card">
        <label for="repay-amount">Amount</label>
        <input type="number" id="repay-amount" step="0.01" inputmode="decimal" placeholder="0.00" required />
        <span class="amount-hint" id="repay-hint">Choose a loan to see what’s left</span>
      </div>

      <div class="entry-group">
        <div class="field-row">
          <label for="repay-loan">Loan</label>
          <select id="repay-loan" required>${loanOptions}</select>
        </div>
        <div class="field-row">
          <label for="repay-account" id="repay-account-label">Account</label>
          <select id="repay-account" required>${accountOptions(refs.selectable)}</select>
        </div>
        <div class="field-row">
          <label for="repay-date">Date</label>
          <input type="date" id="repay-date" required />
        </div>
      </div>

      <div class="entry-group">
        <div class="field-row">
          <label for="repay-notes">Notes</label>
          <input type="text" id="repay-notes" placeholder="Optional" />
        </div>
      </div>

      <button type="submit">Save Repayment</button>
      <button type="button" id="cancel-repay-btn" class="secondary-btn">Cancel</button>
      <p id="repay-save-status"></p>
    </form>
  `

  document.getElementById('repay-date').value = todayLocal()
  document.getElementById('back-btn').addEventListener('click', onDone)
  document.getElementById('cancel-repay-btn').addEventListener('click', onDone)

  const loanSelect = document.getElementById('repay-loan')
  const hintEl = document.getElementById('repay-hint')
  const accountLabelEl = document.getElementById('repay-account-label')

  const syncLoanInfo = () => {
    const loan = open.find(l => l.loan_code === loanSelect.value)
    if (!loan) {
      hintEl.textContent = 'Choose a loan to see what’s left'
      accountLabelEl.textContent = 'Account'
      return
    }
    hintEl.textContent = `${fmt(loan.balance)} remaining`
    accountLabelEl.textContent = loan.type === 'Given' ? 'Received In' : 'Paid From'
  }
  loanSelect.addEventListener('change', syncLoanInfo)
  syncLoanInfo()

  const form = document.getElementById('repay-form')
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const statusEl = document.getElementById('repay-save-status')
    const submitBtn = form.querySelector('button[type="submit"]')

    const date = document.getElementById('repay-date').value
    const loanCode = loanSelect.value
    const accountId = document.getElementById('repay-account').value
    const amount = Number(document.getElementById('repay-amount').value)
    const notes = document.getElementById('repay-notes').value || null

    if (!loanCode) {
      statusEl.textContent = 'Choose a loan first.'
      statusEl.className = 'error'
      return
    }

    submitBtn.disabled = true
    statusEl.textContent = ''

    const { data: loan } = await supabase.from('loans').select('*').eq('loan_code', loanCode).single()
    const balance = await computeBalance(loanCode, loan.amount)

    if (amount > balance) {
      statusEl.textContent = `Amount exceeds remaining balance (${fmt(balance)}).`
      statusEl.className = 'error'
      submitBtn.disabled = false
      return
    }

    const fromId = loan.type === 'Given' ? refs.loansAccountId : accountId
    const toId = loan.type === 'Given' ? accountId : refs.loansAccountId
    const category = loan.type === 'Given' ? 'Loan Repaid' : 'Loan Paid'

    const { error: txError } = await supabase.from('transactions').insert({
      date,
      description: `Loan repayment - ${loan.person}`,
      category_id: refs.catId(category),
      from_account_id: fromId,
      to_account_id: toId,
      amount, notes,
      loan_code: loanCode
    })

    if (txError) {
      statusEl.textContent = 'Error: ' + txError.message
      statusEl.className = 'error'
      submitBtn.disabled = false
      return
    }

    onDone()
  })
}

// ---------------------------------------------------------------------------
// Edit loan
// ---------------------------------------------------------------------------

async function renderEditLoan(loanCode) {
  const getRoot = openScreen('Edit Loan')
  getRoot().innerHTML = `${backLink('Back')}<div class="group skeleton-card" style="height: 220px"></div>`
  document.getElementById('back-btn').addEventListener('click', () => renderLoanDetail(loanCode))

  const [loanRes, openingRes, refs] = await Promise.all([
    supabase.from('loans').select('*').eq('loan_code', loanCode).single(),
    // Find the opening transaction (Loan Given / Loan Received) to recover which account was used
    supabase
      .from('transactions')
      .select('*, categories(name)')
      .eq('loan_code', loanCode)
      .in('categories.name', ['Loan Given', 'Loan Received']),
    fetchRefs(),
  ])
  const root = getRoot()
  if (!root) return

  if (loanRes.error) {
    await showAlert('Could not load this loan: ' + loanRes.error.message)
    renderLoansTab()
    return
  }

  const loan = loanRes.data
  const opening = (openingRes.data || []).find(t => t.categories && (t.categories.name === 'Loan Given' || t.categories.name === 'Loan Received'))

  if (!opening) {
    await showAlert('The opening transaction for this loan could not be found, so it can’t be edited safely. Edit it directly in Supabase.')
    renderLoanDetail(loanCode)
    return
  }

  const currentAccountId = loan.type === 'Given' ? opening.from_account_id : opening.to_account_id

  root.innerHTML = `
    ${backLink('Back')}
    <form id="edit-loan-form" class="entry">
      <div class="amount-card">
        <label for="edit-loan-amount">Amount</label>
        <input type="number" id="edit-loan-amount" step="0.01" inputmode="decimal" placeholder="0.00" required />
      </div>

      ${segmentedHtml(loan.type)}

      <div class="entry-group">
        <div class="field-row">
          <label for="edit-loan-person">Person</label>
          <input type="text" id="edit-loan-person" required />
        </div>
        <div class="field-row">
          <label for="edit-loan-account" id="edit-loan-account-label">${accountLabel(loan.type)}</label>
          <select id="edit-loan-account" required>${accountOptions(refs.selectable, currentAccountId)}</select>
        </div>
        <div class="field-row">
          <label for="edit-loan-date">Date</label>
          <input type="date" id="edit-loan-date" required />
        </div>
      </div>

      <div class="entry-group">
        <div class="field-row">
          <label for="edit-loan-description">Description</label>
          <input type="text" id="edit-loan-description" placeholder="Optional" />
        </div>
        <div class="field-row">
          <label for="edit-loan-notes">Notes</label>
          <input type="text" id="edit-loan-notes" placeholder="Optional" />
        </div>
      </div>

      <button type="submit">Update Loan</button>
      <button type="button" id="cancel-edit-loan-btn" class="secondary-btn">Cancel</button>
      <p id="edit-loan-status"></p>
    </form>
  `

  document.getElementById('edit-loan-date').value = loan.date
  document.getElementById('edit-loan-person').value = loan.person
  document.getElementById('edit-loan-description').value = loan.description || ''
  document.getElementById('edit-loan-amount').value = loan.amount
  document.getElementById('edit-loan-notes').value = loan.notes || ''

  const goBack = () => renderLoanDetail(loanCode)
  document.getElementById('back-btn').addEventListener('click', goBack)
  document.getElementById('cancel-edit-loan-btn').addEventListener('click', goBack)

  const form = document.getElementById('edit-loan-form')
  wireTypeLabel(form, 'edit-loan-account-label')

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const statusEl = document.getElementById('edit-loan-status')
    const submitBtn = form.querySelector('button[type="submit"]')

    const date = document.getElementById('edit-loan-date').value
    const person = document.getElementById('edit-loan-person').value.trim()
    const type = form.querySelector('input[name="loan-type"]:checked').value
    const accountId = document.getElementById('edit-loan-account').value
    const description = document.getElementById('edit-loan-description').value || null
    const amount = document.getElementById('edit-loan-amount').value
    const notes = document.getElementById('edit-loan-notes').value || null

    // Guard: don't let the amount drop below what's already been repaid
    const alreadySettledBalance = await computeBalance(loanCode, loan.amount)
    const alreadySettled = Number(loan.amount) - alreadySettledBalance
    if (Number(amount) < alreadySettled) {
      statusEl.textContent = `Amount can’t be less than what’s already settled (${fmt(alreadySettled)}).`
      statusEl.className = 'error'
      return
    }

    submitBtn.disabled = true
    statusEl.textContent = ''

    const { error: loanUpdateError } = await supabase.from('loans').update({
      date, person, type, description, amount, notes
    }).eq('loan_code', loanCode)

    if (loanUpdateError) {
      statusEl.textContent = 'Error: ' + loanUpdateError.message
      statusEl.className = 'error'
      submitBtn.disabled = false
      return
    }

    const fromId = type === 'Given' ? accountId : refs.loansAccountId
    const toId = type === 'Given' ? refs.loansAccountId : accountId
    const category = type === 'Given' ? 'Loan Given' : 'Loan Received'

    const { error: txUpdateError } = await supabase.from('transactions').update({
      date,
      description: `Loan ${type.toLowerCase()} - ${person}`,
      category_id: refs.catId(category),
      from_account_id: fromId,
      to_account_id: toId,
      amount,
      notes
    }).eq('id', opening.id)

    if (txUpdateError) {
      statusEl.textContent = 'Loan updated, but linked transaction failed: ' + txUpdateError.message
      statusEl.className = 'error'
      return
    }

    renderLoanDetail(loanCode)
  })
}
