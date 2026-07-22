export type ToastType = 'info' | 'success' | 'warning' | 'error'

export function showToast(message: string, type: ToastType = 'info', durationMs: number = 4000) {
  if (typeof window === 'undefined') return

  let container = document.getElementById('tc-toast-container')
  if (!container) {
    container = document.createElement('div')
    container.id = 'tc-toast-container'
    document.body.appendChild(container)
  }

  const toast = document.createElement('div')
  toast.className = `tc-toast tc-toast--${type}`

  // SVG Icons
  let iconSvg = ''
  if (type === 'success') {
    iconSvg = `<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
  } else if (type === 'error') {
    iconSvg = `<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
  } else if (type === 'warning') {
    iconSvg = `<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`
  } else {
    iconSvg = `<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
  }

  toast.innerHTML = `${iconSvg} <span>${message}</span>`

  container.appendChild(toast)

  setTimeout(() => {
    toast.classList.add('hiding')
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast)
    }, 350) // CSS transition duration
  }, durationMs)
}
