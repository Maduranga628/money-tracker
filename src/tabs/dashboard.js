import { supabase } from '../../supabaseClient.js'

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const signed = (n) => (n >= 0 ? '+' : '−') + fmt(Math.abs(n))

function renderSkeleton(content) {
  content.innerHTML = `
    <div class="dashboard" aria-busy="true">
      <div class="hero">
        <div class="skeleton" style="width: 110px; height: 14px"></div>
        <div class="skeleton" style="width: 220px; height: 40px; margin-top: 12px"></div>
        <div class="skeleton" style="width: 150px; height: 14px; margin-top: 14px"></div>
      </div>
      <div class="stat-row">
        <div class="stat skeleton-card"><div class="skeleton" style="width: 60px; height: 12px"></div><div class="skeleton" style="width: 100px; height: 22px; margin-top: 10px"></div></div>
        <div class="stat skeleton-card"><div class="skeleton" style="width: 60px; height: 12px"></div><div class="skeleton" style="width: 100px; height: 22px; margin-top: 10px"></div></div>
      </div>
      <div class="group skeleton-card" style="height: 150px"></div>
    </div>
  `
}

export async function renderDashboardTab() {
  const content = document.getElementById('tab-content')
  renderSkeleton(content)

  const [accountsRes, txRes, loansRes, loanTxRes] = await Promise.all([
    supabase.from('accounts').select('*').eq('is_external', false).order('name'),
    supabase
      .from('transactions')
      .select('date, amount, from_account_id, to_account_id, from:accounts!transactions_from_account_id_fkey(name, is_external), to:accounts!transactions_to_account_id_fkey(name, is_external)'),
    supabase.from('loans').select('*'),
    supabase
      .from('transactions')
      .select('loan_code, amount, categories(name)')
      .not('loan_code', 'is', null),
  ])

  const failed = [accountsRes, txRes, loansRes, loanTxRes].find(r => r.error)
  if (failed) {
    content.innerHTML = `<p class="error">Unable to load the dashboard: ${esc(failed.error.message)}</p>`
    return
  }

  const accounts = accountsRes.data
  const allTx = txRes.data
  const loans = loansRes.data
  const loanTx = loanTxRes.data

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
  const loanNet = totalOwedToMe - totalIOwe

  // --- Render ---
  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' })
  const tone = (n) => (n >= 0 ? 'pos' : 'neg')

  content.innerHTML = `
    <div class="dashboard">
      <section class="hero">
        <div class="hero-label">Total balance</div>
        <div class="hero-amount">${fmt(totalBalance)}</div>
        <div class="hero-sub"><span class="${tone(savings)}">${signed(savings)}</span> saved in ${monthLabel}</div>
      </section>

      <h3 class="section-title">${monthLabel}</h3>
      <div class="stat-row">
        <div class="stat">
          <span class="stat-label">Income</span>
          <span class="stat-value pos">${fmt(income)}</span>
        </div>
        <div class="stat">
          <span class="stat-label">Expenses</span>
          <span class="stat-value neg">${fmt(expenses)}</span>
        </div>
      </div>

      <h3 class="section-title">Accounts</h3>
      <div class="group">
        ${balances.length
          ? balances.map(b => `
            <div class="row">
              <span>${esc(b.name)}</span>
              <span class="row-value ${b.balance < 0 ? 'neg' : ''}">${fmt(b.balance)}</span>
            </div>`).join('')
          : '<div class="row"><span class="row-muted">No accounts yet</span></div>'}
      </div>

      <h3 class="section-title">Loans</h3>
      <div class="group">
        <div class="row"><span>Owed to me</span><span class="row-value pos">${fmt(totalOwedToMe)}</span></div>
        <div class="row"><span>I owe</span><span class="row-value neg">${fmt(totalIOwe)}</span></div>
        <div class="row row-strong"><span>Net</span><span class="row-value ${tone(loanNet)}">${signed(loanNet)}</span></div>
      </div>
    </div>
  `
}
