// Plain, readable transactional emails (matches supabase/templates/*.html).

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

export interface EmailContent {
  heading: string
  /** Paragraphs of plain text (escaped here). */
  paragraphs: string[]
  action?: { label: string; url: string }
  footer?: string
}

export function emailHtml({ heading, paragraphs, action, footer }: EmailContent): string {
  const p = paragraphs
    .map((t) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#0f172a;white-space:pre-wrap">${escapeHtml(t)}</p>`)
    .join('')
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:#0021a5;color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 22px;border-radius:12px">${escapeHtml(action.label)}</a></p>`
    : ''
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px;border:1px solid #e2e8f0">
<h1 style="margin:0 0 16px;font-size:22px;color:#0f172a">${escapeHtml(heading)}</h1>${p}${button}
<p style="margin:24px 0 0;font-size:13px;color:#475569">${escapeHtml(footer ?? 'Sent by your chapter calendar.')}</p>
</div></body></html>`
}

export function emailText({ heading, paragraphs, action, footer }: EmailContent): string {
  return [heading, '', ...paragraphs, ...(action ? ['', `${action.label}: ${action.url}`] : []), '', footer ?? 'Sent by your chapter calendar.'].join('\n')
}
