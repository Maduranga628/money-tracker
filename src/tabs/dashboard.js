import { supabase } from '../../supabaseClient.js'
import { getMonthStartDay, periodAt } from '../periods.js'

const fmt = (n) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const ICON_PREV = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>'
const ICON_NEXT = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>'

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

  const [accountsRes, txRes, loansRes, loanTxRes, monthStartDay] = await Promise.all([
    supabase.from('accounts').select('*').eq('is_external', false).order('name'),
    supabase
      .from('transactions')
      .select('date, amount, from_account_id, to_account_id, from:accounts!transactions_from_account_id_fkey(name, is_external), to:accounts!transactions_to_account_id_fkey(name, is_external)'),
    supabase.from('loans').select('*'),
    supabase
      .from('transactions')
      .select('loan_code, amount, categories(name)')
      .not('loan_code', 'is', null),
    getMonthStartDay(),
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

  // --- Income / expenses per period ---
  // A "month" runs from your start day (e.g. salary day) to the day before it next month.
  // The arrows move between periods; Previous stops at your oldest transaction.
  const earliestDate = allTx.reduce((min, t) => (t.date < min ? t.date : min), '9999-12-31')
  let periodOffset = 0

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
  const tone = (n) => (n >= 0 ? 'pos' : 'neg')

  content.innerHTML = `
    <div class="dashboard">
      <section class="hero">
        <div class="hero-label">Total balance</div>
        <div class="hero-amount">${fmt(totalBalance)}</div>
      </section>

      <div id="period-block"></div>

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

  const drawPeriod = (focusId) => {
    const period = periodAt(monthStartDay, periodOffset)
    const periodTx = allTx.filter(t => t.date >= period.start && t.date < period.end)

    const income = periodTx
      .filter(t => t.from && t.from.is_external)
      .reduce((sum, t) => sum + Number(t.amount), 0)

    const expenses = periodTx
      .filter(t => t.to && t.to.is_external)
      .reduce((sum, t) => sum + Number(t.amount), 0)

    const savings = income - expenses
    const canGoBack = earliestDate < period.start
    const canGoForward = periodOffset < 0

    document.getElementById('period-block').innerHTML = `
      <div class="period-nav">
        <button type="button" class="icon-btn" id="period-prev" aria-label="Previous period"${canGoBack ? '' : ' disabled'}>${ICON_PREV}</button>
        <div class="period-label" aria-live="polite">${period.label}</div>
        <button type="button" class="icon-btn" id="period-next" aria-label="Next period"${canGoForward ? '' : ' disabled'}>${ICON_NEXT}</button>
      </div>

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
      <div class="stat stat-wide">
        <span class="stat-label">Saved</span>
        <span class="stat-value ${tone(savings)}">${signed(savings)}</span>
      </div>
    `

    document.getElementById('period-prev').addEventListener('click', () => { periodOffset -= 1; drawPeriod('period-prev') })
    document.getElementById('period-next').addEventListener('click', () => { periodOffset += 1; drawPeriod('period-next') })

    // The buttons are redrawn, so give keyboard focus back to the one that was used.
    if (focusId) {
      const target = document.getElementById(focusId)
      if (target && !target.disabled) target.focus()
    }
  }

  drawPeriod()
}
