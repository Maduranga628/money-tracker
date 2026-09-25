import { supabase } from '../../supabaseClient.js'

export async function renderLoansTab() {
  const content = document.getElementById('tab-content')
  content.innerHTML = `
    <div class="form-box">
      <h2>Lend / Borrow Money</h2>
      <form id="loan-form">
        <label>Date</label>
        <input type="date" id="loan-date" required />

        <label>Person</label>
        <input type="text" id="loan-person" required />

        <label>Type</label>
        <select id="loan-type" required>
          <option value="Given">Given (I lend money)</option>
          <option value="Borrowed">Borrowed (I take a loan)</option>
        </select>

        <label>Account</label>
        <select id="loan-account" required></select>

        <label>Description</label>
        <input type="text" id="loan-description" />

        <label>Amount</label>
        <input type="number" id="loan-amount" step="0.01" required />

        <label>Notes</label>
        <input type="text" id="loan-notes" />

        <button type="submit">Save Loan</button>
        <p id="loan-save-status"></p>
      </form>
    </div>

    <div class="form-box">
      <h2>Log Repayment</h2>
      <form id="repay-form">
        <label>Date</label>
        <input type="date" id="repay-date" required />

        <label>Loan</label>
        <select id="repay-loan" required></select>

        <label>Account</label>
        <select id="repay-account" required></select>

        <label>Amount</label>
        <input type="number" id="repay-amount" step="0.01" required />

        <label>Notes</label>
        <input type="text" id="repay-notes" />

        <button type="submit">Save Repayment</button>
        <p id="repay-save-status"></p>
      </form>
    </div>

    <div class="loans-list" id="loans-list">
      <h2>Existing Loans</h2>
      <p>Loading...</p>
    </div>
  `

  const today = new Date().toISOString().split('T')[0]
  document.getElementById('loan-date').value = today
  document.getElementById('repay-date').value = today

  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('is_external', false)
    .neq('name', 'Loans')
    .order('name')

  const loanAccountSelect = document.getElementById('loan-account')
  const repayAccountSelect = document.getElementById('repay-account')
  accounts.forEach(a => {
    loanAccountSelect.innerHTML += `<option value="${a.id}">${a.name}</option>`
    repayAccountSelect.innerHTML += `<option value="${a.id}">${a.name}</option>`
  })

  const { data: loansAccountRow } = await supabase.from('accounts').select('id').eq('name', 'Loans').single()
  const loansAccountId = loansAccountRow.id

  const { data: cats } = await supabase.from('categories').select('id, name')
  const catId = name => cats.find(c => c.name === name)?.id

  document.getElementById('loan-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const statusEl = document.getElementById('loan-save-status')

    const date = document.getElementById('loan-date').value
    const person = document.getElementById('loan-person').value
    const type = document.getElementById('loan-type').value
    const accountId = document.getElementById('loan-account').value
    const description = document.getElementById('loan-description').value || null
    const amount = document.getElementById('loan-amount').value
    const notes = document.getElementById('loan-notes').value || null

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

    statusEl.textContent = `Saved ✓ (${newCode})`
    statusEl.className = 'success'
    document.getElementById('loan-form').reset()
    document.getElementById('loan-date').value = today
    setTimeout(() => { statusEl.textContent = '' }, 2000)
    loadLoansList()
    populateRepayLoanDropdown()
  })

  await populateRepayLoanDropdown()

  document.getElementById('repay-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const statusEl = document.getElementById('repay-save-status')

    const date = document.getElementById('repay-date').value
    const loanCode = document.getElementById('repay-loan').value
    const accountId = document.getElementById('repay-account').value
    const amount = Number(document.getElementById('repay-amount').value)
    const notes = document.getElementById('repay-notes').value || null

    if (!loanCode) {
      statusEl.textContent = 'Pick a loan first.'
      statusEl.className = 'error'
      return
    }

    const { data: loan } = await supabase.from('loans').select('*').eq('loan_code', loanCode).single()
    const balance = await computeBalance(loanCode, loan.amount)

    if (amount > balance) {
      statusEl.textContent = `Amount exceeds remaining balance (${balance.toFixed(2)}).`
      statusEl.className = 'error'
      return
    }

    const fromId = loan.type === 'Given' ? loansAccountId : accountId
    const toId = loan.type === 'Given' ? accountId : loansAccountId
    const category = loan.type === 'Given' ? 'Loan Repaid' : 'Loan Paid'

    const { error: txError } = await supabase.from('transactions').insert({
      date,
      description: `Loan repayment - ${loan.person}`,
      category_id: catId(category),
      from_account_id: fromId,
      to_account_id: toId,
      amount, notes,
      loan_code: loanCode
    })

    if (txError) {
      statusEl.textContent = 'Error: ' + txError.message
      statusEl.className = 'error'
      return
    }

    statusEl.textContent = 'Saved ✓'
    statusEl.className = 'success'
    document.getElementById('repay-form').reset()
    document.getElementById('repay-date').value = today
    setTimeout(() => { statusEl.textContent = '' }, 2000)
    loadLoansList()
    populateRepayLoanDropdown()
  })

  loadLoansList()
}

async function computeBalance(loanCode, loanAmount) {
  const { data: relatedTx } = await supabase
    .from('transactions')
    .select('amount, categories(name)')
    .eq('loan_code', loanCode)

  const settled = relatedTx
    .filter(t => t.categories && (t.categories.name === 'Loan Repaid' || t.categories.name === 'Loan Paid'))
    .reduce((sum, t) => sum + Number(t.amount), 0)

  return Number(loanAmount) - settled
}

async function populateRepayLoanDropdown() {
  const select = document.getElementById('repay-loan')
  if (!select) return

  const { data: loans } = await supabase.from('loans').select('*').order('loan_code', { ascending: false })
  const { data: txs } = await supabase
    .from('transactions')
    .select('loan_code, amount, categories(name)')
    .not('loan_code', 'is', null)

  select.innerHTML = '<option value="">-- select loan --</option>'
  loans.forEach(loan => {
    const relatedTx = txs.filter(t => t.loan_code === loan.loan_code)
    const settled = relatedTx
      .filter(t => t.categories && (t.categories.name === 'Loan Repaid' || t.categories.name === 'Loan Paid'))
      .reduce((sum, t) => sum + Number(t.amount), 0)
    const balance = Number(loan.amount) - settled
    if (balance > 0) {
      select.innerHTML += `<option value="${loan.loan_code}">${loan.loan_code} - ${loan.person} (balance: ${balance.toFixed(2)})</option>`
    }
  })
}

async function loadLoansList() {
  const listEl = document.getElementById('loans-list')

  const { data: loans, error: loansError } = await supabase
    .from('loans')
    .select('*')
    .order('date', { ascending: false })

  if (loansError) {
    listEl.innerHTML = `<h2>Existing Loans</h2><p class="error">Error: ${loansError.message}</p>`
    return
  }

  const { data: txs, error: txError } = await supabase
    .from('transactions')
    .select('id, date, description, amount, notes, loan_code, categories(name)')
    .not('loan_code', 'is', null)
    .order('date')

  if (txError) {
    listEl.innerHTML = `<h2>Existing Loans</h2><p class="error">Error: ${txError.message}</p>`
    return
  }

  const rows = loans.map(loan => {
    const relatedTx = txs.filter(t => t.loan_code === loan.loan_code)
    const repayments = relatedTx.filter(t => t.categories && (t.categories.name === 'Loan Repaid' || t.categories.name === 'Loan Paid'))
    const settled = repayments.reduce((sum, t) => sum + Number(t.amount), 0)
    const balance = Number(loan.amount) - settled
    let status = 'Outstanding'
    if (balance <= 0) status = 'Settled'
    else if (settled > 0) status = 'Partially Paid'

    const repaymentRows = repayments.map(r => `
      <div class="repayment-row" data-id="${r.id}">
        <span>${r.date} · ${Number(r.amount).toFixed(2)}${r.notes ? ' · ' + r.notes : ''}</span>
        <button class="repayment-delete-btn" data-id="${r.id}">✕</button>
      </div>
    `).join('')

    return `
      <div class="loan-card" data-loan-code="${loan.loan_code}">
        <div class="loan-card-header">
          <strong>${loan.loan_code}</strong> — ${loan.person}
          <span class="loan-status status-${status.replace(/\s/g, '')}">${status}</span>
        </div>
        <div>${loan.type} · ${loan.date} · ${loan.description || ''}</div>
        <div>Amount: ${Number(loan.amount).toFixed(2)} | Settled: ${settled.toFixed(2)} | Balance: ${balance.toFixed(2)}</div>
        ${loan.notes ? `<div class="loan-notes">${loan.notes}</div>` : ''}
        ${repaymentRows ? `<div class="repayments-list">${repaymentRows}</div>` : ''}
        <div class="loan-card-actions">
          <button class="loan-edit-btn" data-loan-code="${loan.loan_code}">Edit</button>
          <button class="loan-delete-btn" data-loan-code="${loan.loan_code}">Delete</button>
        </div>
      </div>
    `
  }).join('')

  listEl.innerHTML = `<h2>Existing Loans</h2>${rows || '<p>No loans yet.</p>'}`

  listEl.querySelectorAll('.loan-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => renderEditLoan(btn.dataset.loanCode))
  })

  listEl.querySelectorAll('.loan-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteLoan(btn.dataset.loanCode))
  })

  listEl.querySelectorAll('.repayment-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteRepayment(btn.dataset.id))
  })
}

async function deleteRepayment(txId) {
  const confirmed = confirm('Delete this repayment? The loan balance will increase back accordingly.')
  if (!confirmed) return

  const { error } = await supabase.from('transactions').delete().eq('id', txId)
  if (error) {
    alert('Error: ' + error.message)
    return
  }
  loadLoansList()
  populateRepayLoanDropdown()
}

async function deleteLoan(loanCode) {
  const confirmed = confirm(
    `Delete loan ${loanCode}? This will also delete its opening transaction and ALL repayment transactions linked to it. This cannot be undone.`
  )
  if (!confirmed) return

  const { error: txDeleteError } = await supabase.from('transactions').delete().eq('loan_code', loanCode)
  if (txDeleteError) {
    alert('Error deleting linked transactions: ' + txDeleteError.message)
    return
  }

  const { error: loanDeleteError } = await supabase.from('loans').delete().eq('loan_code', loanCode)
  if (loanDeleteError) {
    alert('Error deleting loan: ' + loanDeleteError.message)
    return
  }

  loadLoansList()
  populateRepayLoanDropdown()
}

async function renderEditLoan(loanCode) {
  const content = document.getElementById('tab-content')

  const { data: loan, error: loanError } = await supabase.from('loans').select('*').eq('loan_code', loanCode).single()
  if (loanError) {
    alert('Could not load loan: ' + loanError.message)
    return
  }

  // Find the opening transaction (Loan Given / Loan Received) to recover which account was used
  const { data: openingTx, error: txError } = await supabase
    .from('transactions')
    .select('*, categories(name)')
    .eq('loan_code', loanCode)
    .in('categories.name', ['Loan Given', 'Loan Received'])

  const opening = (openingTx || []).find(t => t.categories && (t.categories.name === 'Loan Given' || t.categories.name === 'Loan Received'))

  if (!opening) {
    alert('Could not find the opening transaction for this loan — cannot safely edit. Please contact support or edit directly in Supabase.')
    return
  }

  const currentAccountId = loan.type === 'Given' ? opening.from_account_id : opening.to_account_id

  content.innerHTML = `
    <div class="form-box">
      <h2>Edit Loan ${loan.loan_code}</h2>
      <form id="edit-loan-form">
        <label>Date</label>
        <input type="date" id="edit-loan-date" required />

        <label>Person</label>
        <input type="text" id="edit-loan-person" required />

        <label>Type</label>
        <select id="edit-loan-type" required>
          <option value="Given">Given (I lend money)</option>
          <option value="Borrowed">Borrowed (I take a loan)</option>
        </select>

        <label>Account</label>
        <select id="edit-loan-account" required></select>

        <label>Description</label>
        <input type="text" id="edit-loan-description" />

        <label>Amount</label>
        <input type="number" id="edit-loan-amount" step="0.01" required />

        <label>Notes</label>
        <input type="text" id="edit-loan-notes" />

        <button type="submit">Update Loan</button>
        <button type="button" id="cancel-edit-loan-btn" class="secondary-btn">Cancel</button>
        <p id="edit-loan-status"></p>
      </form>
    </div>
  `

  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('is_external', false)
    .neq('name', 'Loans')
    .order('name')

  const accountSelect = document.getElementById('edit-loan-account')
  accounts.forEach(a => {
    accountSelect.innerHTML += `<option value="${a.id}">${a.name}</option>`
  })

  document.getElementById('edit-loan-date').value = loan.date
  document.getElementById('edit-loan-person').value = loan.person
  document.getElementById('edit-loan-type').value = loan.type
  document.getElementById('edit-loan-account').value = currentAccountId
  document.getElementById('edit-loan-description').value = loan.description || ''
  document.getElementById('edit-loan-amount').value = loan.amount
  document.getElementById('edit-loan-notes').value = loan.notes || ''

  document.getElementById('cancel-edit-loan-btn').addEventListener('click', () => {
    renderLoansTab()
  })

  document.getElementById('edit-loan-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const statusEl = document.getElementById('edit-loan-status')

    const date = document.getElementById('edit-loan-date').value
    const person = document.getElementById('edit-loan-person').value
    const type = document.getElementById('edit-loan-type').value
    const accountId = document.getElementById('edit-loan-account').value
    const description = document.getElementById('edit-loan-description').value || null
    const amount = document.getElementById('edit-loan-amount').value
    const notes = document.getElementById('edit-loan-notes').value || null

    // Guard: don't let the amount drop below what's already been repaid
    const alreadySettledBalance = await computeBalance(loanCode, loan.amount)
    const alreadySettled = Number(loan.amount) - alreadySettledBalance
    if (Number(amount) < alreadySettled) {
      statusEl.textContent = `Amount can't be less than what's already settled (${alreadySettled.toFixed(2)}).`
      statusEl.className = 'error'
      return
    }

    const { error: loanUpdateError } = await supabase.from('loans').update({
      date, person, type, description, amount, notes
    }).eq('loan_code', loanCode)

    if (loanUpdateError) {
      statusEl.textContent = 'Error: ' + loanUpdateError.message
      statusEl.className = 'error'
      return
    }

    const { data: loansAccountRow } = await supabase.from('accounts').select('id').eq('name', 'Loans').single()
    const loansAccountId = loansAccountRow.id
    const { data: cats } = await supabase.from('categories').select('id, name')
    const catId = name => cats.find(c => c.name === name)?.id

    const fromId = type === 'Given' ? accountId : loansAccountId
    const toId = type === 'Given' ? loansAccountId : accountId
    const category = type === 'Given' ? 'Loan Given' : 'Loan Received'

    const { error: txUpdateError } = await supabase.from('transactions').update({
      date,
      description: `Loan ${type.toLowerCase()} - ${person}`,
      category_id: catId(category),
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

    renderLoansTab()
  })
}