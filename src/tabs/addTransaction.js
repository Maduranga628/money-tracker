import { supabase } from '../../supabaseClient.js'

export async function renderAddTransactionTab() {
  const content = document.getElementById('tab-content')
  content.innerHTML = `
    <div class="form-box">
      <h2>Add Transaction</h2>
      <form id="tx-form">
        <label>Date</label>
        <input type="date" id="date" required />

        <label>Description</label>
        <input type="text" id="description" required />

        <label>Category</label>
        <select id="category" required></select>

        <label>From Account</label>
        <select id="from_account" required></select>

        <label>To Account</label>
        <select id="to_account" required></select>

        <label>Amount</label>
        <input type="number" id="amount" step="0.01" required />

        <label>Notes</label>
        <input type="text" id="notes" />

        <button type="submit">Save</button>
        <p id="save-status"></p>
      </form>
    </div>
  `

  const today = new Date().toISOString().split('T')[0]
  document.getElementById('date').value = today

  const { data: categories } = await supabase.from('categories').select('*').order('name')
  const { data: accounts } = await supabase.from('accounts').select('*').order('name')

  const categorySelect = document.getElementById('category')
  categories.forEach(c => {
    categorySelect.innerHTML += `<option value="${c.id}">${c.name}</option>`
  })

  const fromSelect = document.getElementById('from_account')
  const toSelect = document.getElementById('to_account')
  accounts.forEach(a => {
    fromSelect.innerHTML += `<option value="${a.id}">${a.name}</option>`
    toSelect.innerHTML += `<option value="${a.id}">${a.name}</option>`
  })

  document.getElementById('tx-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const statusEl = document.getElementById('save-status')

    const { error } = await supabase.from('transactions').insert({
      date: document.getElementById('date').value,
      description: document.getElementById('description').value,
      category_id: document.getElementById('category').value,
      from_account_id: document.getElementById('from_account').value,
      to_account_id: document.getElementById('to_account').value,
      amount: document.getElementById('amount').value,
      notes: document.getElementById('notes').value || null,
    })

    if (error) {
      statusEl.textContent = 'Error: ' + error.message
      statusEl.className = 'error'
    } else {
      statusEl.textContent = 'Saved ✓'
      statusEl.className = 'success'
      document.getElementById('tx-form').reset()
      document.getElementById('date').value = today
      setTimeout(() => { statusEl.textContent = '' }, 2000)
    }
  })
}