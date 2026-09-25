import { supabase } from '../../supabaseClient.js'

export async function renderDashboardTab() {
  const content = document.getElementById('tab-content')
  content.innerHTML = `<div class="dashboard"><p>Loading...</p></div>`

  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('is_external', false)
    .order('name')

  const { data: allTx } = await supabase
    .from('transactions')
    .select('date, amount, from_account_id, to_account_id, from:accounts!transactions_from_account_id_fkey(name, is_external), to:accounts!transactions_to_account_id_fkey(name, is_external)')

  // --- Account balances (all-time) ---
  const balances = accounts.map(acc => {
    const inflow = allTx
      .filter(t => t.to_account_id === acc.id)
      .reduce((sum, t) => sum + Number(t.amount), 0)
    const outflow = allTx
      .filter(t => t.from_account_id === acc.id)
      .reduce((sum, t) => sum + Number(t.amount), 0)
    return { name: acc.name, balance: inflow - outflow }
  })

  const totalBalance = balances.reduce((sum, b) => sum + b.balance, 0)

  // --- This month's income / expenses ---
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`

  const thisMonthTx = allTx.filter(t => t.date >= monthStart && t.date < monthEnd)

  const income = thisMonthTx
    .filter(t => t.from && t.from.is_external)
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const expenses = thisMonthTx
    .filter(t => t.to && t.to.is_external)
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const savings = income - expenses

  // --- Loans summary ---
  const { data: loans } = await supabase.from('loans').select('*')
  const { data: loanTx } = await supabase
    .from('transactions')
    .select('loan_code, amount, categories(name)')
    .not('loan_code', 'is', null)

  let totalOwedToMe = 0
  let totalIOwe = 0
  loans.forEach(loan => {
    const related = loanTx.filter(t => t.loan_code === loan.loan_code)
    const settled = related
      .filter(t => t.categories && (t.categories.name === 'Loan Repaid' || t.categories.name === 'Loan Paid'))
      .reduce((sum, t) => sum + Number(t.amount), 0)
    const balance = Number(loan.amount) - settled
    if (balance <= 0) return
    if (loan.type === 'Given') totalOwedToMe += balance
    else totalIOwe += balance
  })

  // --- Render ---
  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' })

  content.innerHTML = `
    <div class="dashboard">
      <div class="dash-card">
        <h2>Account Balances</h2>
        ${balances.map(b => `
          <div class="dash-row">
            <span>${b.name}</span>
            <span>${b.balance.toFixed(2)}</span>
          </div>
        `).join('')}
        <div class="dash-row dash-total">
          <span>Total</span>
          <span>${totalBalance.toFixed(2)}</span>
        </div>
      </div>

      <div class="dash-card">
        <h2>${monthLabel}</h2>
        <div class="dash-row"><span>Income</span><span class="pos">${income.toFixed(2)}</span></div>
        <div class="dash-row"><span>Expenses</span><span class="neg">${expenses.toFixed(2)}</span></div>
        <div class="dash-row dash-total">
          <span>Savings</span>
          <span class="${savings >= 0 ? 'pos' : 'neg'}">${savings.toFixed(2)}</span>
        </div>
      </div>

      <div class="dash-card">
        <h2>Loans</h2>
        <div class="dash-row"><span>Owed to me</span><span class="pos">${totalOwedToMe.toFixed(2)}</span></div>
        <div class="dash-row"><span>I owe</span><span class="neg">${totalIOwe.toFixed(2)}</span></div>
        <div class="dash-row dash-total">
          <span>Net</span>
          <span class="${(totalOwedToMe - totalIOwe) >= 0 ? 'pos' : 'neg'}">${(totalOwedToMe - totalIOwe).toFixed(2)}</span>
        </div>
      </div>
    </div>
  `
}
