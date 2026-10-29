import { supabase } from '../../supabaseClient.js'

export async function renderAddTransactionTab() {
  const content = document.getElementById('tab-content')
  content.innerHTML = `
    <form id="tx-form" class="entry">
      <div class="amount-card">
        <label for="amount">Amount</label>
        <input type="number" id="amount" step="0.01" inputmode="decimal" placeholder="0.00" required />
      </div>

      <div class="entry-group">
        <div class="field-row">
          <label for="description">Description</label>
          <input type="text" id="description" placeholder="What was it for?" required />
        </div>
        <div class="field-row">
          <label for="category">Category</label>
          <select id="category" required>
            <option value="">Select</option>
          </select>
        </div>
        <div class="field-row">
          <label for="date">Date</label>
          <input type="date" id="date" required />
        </div>
      </div>

      <div class="entry-group">
        <div class="field-row">
          <label for="from_account">From</label>
          <select id="from_account" required>
            <option value="">Select</option>
          </select>
        </div>
        <div class="field-row">
          <label for="to_account">To</label>
          <select id="to_account" required>
            <option value="">Select</option>
          </select>
        </div>
      </div>

      <div class="entry-group">
        <div class="field-row">
          <label for="notes">Notes</label>
          <input type="text" id="notes" placeholder="Optional" />
        </div>
      </div>

      <button type="submit">Save Transaction</button>
      <p id="save-status" class="entry-status"></p>
    </form>
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

  // --- Category auto-fill ---
  // Expense category  -> To account = External (money leaves your accounts)
  // Income category   -> From account = External (money comes in)
  // Transfer / other  -> nothing is filled in; you pick both accounts.
  const externalAccount =
    accounts.find(a => a.name === 'External') || accounts.find(a => a.is_external)

  // Remember which side we filled in ourselves, so we only clear
  // values we set (never something you picked by hand).
  let autoFrom = false
  let autoTo = false

  fromSelect.addEventListener('change', () => { autoFrom = false })
  toSelect.addEventListener('change', () => { autoTo = false })

  categorySelect.addEventListener('change', () => {
    if (autoFrom) { fromSelect.value = ''; autoFrom = false }
    if (autoTo) { toSelect.value = ''; autoTo = false }

    const category = categories.find(c => String(c.id) === categorySelect.value)
    if (!category || !externalAccount) return

    if (category.kind === 'expense') {
      toSelect.value = String(externalAccount.id)
      autoTo = true
    } else if (category.kind === 'income') {
      fromSelect.value = String(externalAccount.id)
      autoFrom = true
    }
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
      autoFrom = false
      autoTo = false
      setTimeout(() => { statusEl.textContent = '' }, 2000)
    }
  })
}
