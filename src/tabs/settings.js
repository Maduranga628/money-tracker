import { supabase } from '../../supabaseClient.js'

export async function renderSettingsTab() {
  const content = document.getElementById('tab-content')
  content.innerHTML = `
    <div class="settings">
      <div class="form-box">
        <h2>Accounts</h2>
        <div id="accounts-list"></div>
        <form id="add-account-form" class="inline-add-form">
          <input type="text" id="new-account-name" placeholder="New account name" required />
          <label class="checkbox-label">
            <input type="checkbox" id="new-account-external" /> External (money source/sink, not a real account you hold)
          </label>
          <button type="submit">Add Account</button>
        </form>
        <p id="account-status"></p>
      </div>

      <div class="form-box">
        <h2>Categories</h2>
        <div id="categories-list"></div>
        <form id="add-category-form" class="inline-add-form">
          <input type="text" id="new-category-name" placeholder="New category name" required />
          <button type="submit">Add Category</button>
        </form>
        <p id="category-status"></p>
      </div>
    </div>
  `

  await loadAccountsList()
  await loadCategoriesList()

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

    const { error } = await supabase.from('categories').insert({ name })

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
    listEl.innerHTML = `<p class="error">Error: ${error.message}</p>`
    return
  }

  listEl.innerHTML = accounts.map(a => `
    <div class="settings-row" data-id="${a.id}" data-type="account">
      <input type="text" class="rename-input" value="${a.name.replace(/"/g, '&quot;')}" />
      ${a.is_external ? '<span class="tag">external</span>' : ''}
      <button class="rename-btn">Save</button>
    </div>
  `).join('')

  listEl.querySelectorAll('.rename-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.settings-row')
      const id = row.dataset.id
      const newName = row.querySelector('.rename-input').value.trim()

      const { error } = await supabase.from('accounts').update({ name: newName }).eq('id', id)
      if (error) {
        alert('Error renaming: ' + error.message)
      } else {
        btn.textContent = 'Saved ✓'
        setTimeout(() => { btn.textContent = 'Save' }, 1500)
      }
    })
  })
}

async function loadCategoriesList() {
  const listEl = document.getElementById('categories-list')
  const { data: categories, error } = await supabase.from('categories').select('*').order('name')

  if (error) {
    listEl.innerHTML = `<p class="error">Error: ${error.message}</p>`
    return
  }

  listEl.innerHTML = categories.map(c => `
    <div class="settings-row" data-id="${c.id}" data-type="category">
      <input type="text" class="rename-input" value="${c.name.replace(/"/g, '&quot;')}" />
      <button class="rename-btn">Save</button>
    </div>
  `).join('')

  listEl.querySelectorAll('.rename-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.settings-row')
      const id = row.dataset.id
      const newName = row.querySelector('.rename-input').value.trim()

      const { error } = await supabase.from('categories').update({ name: newName }).eq('id', id)
      if (error) {
        alert('Error renaming: ' + error.message)
      } else {
        btn.textContent = 'Saved ✓'
        setTimeout(() => { btn.textContent = 'Save' }, 1500)
      }
    })
  })
}