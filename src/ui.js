// In-app dialogs. Native confirm()/alert() are blocked by some mobile browsers
// (e.g. Brave on iOS), which made destructive actions silently do nothing.

function openDialog(build) {
  return new Promise((resolve) => {
    const previouslyFocused = document.activeElement
    const scrim = document.createElement('div')
    scrim.className = 'sheet-scrim'
    scrim.innerHTML = build.html
    document.body.appendChild(scrim)
    document.body.classList.add('modal-open')

    let closed = false
    const close = (result) => {
      if (closed) return
      closed = true
      document.removeEventListener('keydown', onKey)
      scrim.classList.remove('open')
      document.body.classList.remove('modal-open')
      setTimeout(() => scrim.remove(), 250)
      if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus()
      resolve(result)
    }

    const onKey = (e) => {
      if (e.key === 'Escape') close(build.cancelResult)
    }
    document.addEventListener('keydown', onKey)

    scrim.addEventListener('click', (e) => {
      if (e.target === scrim) close(build.cancelResult)
    })
    scrim.querySelectorAll('[data-result]').forEach(btn => {
      btn.addEventListener('click', () => close(btn.dataset.result === 'true'))
    })

    requestAnimationFrame(() => {
      scrim.classList.add('open')
      const first = scrim.querySelector('[data-autofocus]')
      if (first) first.focus()
    })
  })
}

const escapeHtml = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Bottom action sheet for a risky choice. Resolves true (confirmed) or false.
 * Cancel is focused by default, so a stray Return never destroys data.
 */
export function confirmDialog({ title, message = '', confirmLabel = 'Delete', destructive = true }) {
  return openDialog({
    cancelResult: false,
    html: `
      <div class="action-sheet" role="alertdialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="action-group">
          <div class="action-head">
            <div class="action-title">${escapeHtml(title)}</div>
            ${message ? `<div class="action-message">${escapeHtml(message)}</div>` : ''}
          </div>
          <button type="button" class="action-btn ${destructive ? 'destructive' : ''}" data-result="true">${escapeHtml(confirmLabel)}</button>
        </div>
        <button type="button" class="action-btn action-cancel" data-result="false" data-autofocus>Cancel</button>
      </div>
    `,
  })
}

/** Centered alert for an error or notice. Resolves when dismissed. */
export function showAlert(message, title = 'Something Went Wrong') {
  return openDialog({
    cancelResult: false,
    html: `
      <div class="alert-card" role="alertdialog" aria-modal="true" aria-label="${escapeHtml(title)}">
        <div class="alert-body">
          <div class="action-title">${escapeHtml(title)}</div>
          <div class="action-message">${escapeHtml(message)}</div>
        </div>
        <button type="button" class="alert-ok" data-result="false" data-autofocus>OK</button>
      </div>
    `,
  }).then(() => undefined)
}

/** Update the large title and the inline (scrolled) title together. */
export function setPageTitle(text) {
  const large = document.getElementById('large-title')
  const inline = document.getElementById('navbar-title')
  if (large) large.textContent = text
  if (inline) inline.textContent = text
}

/** Today as YYYY-MM-DD in the user's own time zone (toISOString would use UTC). */
export function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
