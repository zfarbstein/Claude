import { describe, expect, it } from 'vitest'
import { emailHtml, emailText, escapeHtml } from './email-template'

describe('email template', () => {
  it('escapes what members typed', () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;')
    const html = emailHtml({ heading: 'New excuse', paragraphs: ['<b>Sick</b>'], action: { label: 'Review', url: 'https://app.example.com/admin/excuses?a=1&b=2' } })
    expect(html).toContain('&lt;b&gt;Sick&lt;/b&gt;')
    expect(html).toContain('href="https://app.example.com/admin/excuses?a=1&amp;b=2"')
  })
  it('has a plain-text version', () => {
    expect(emailText({ heading: 'Hi', paragraphs: ['One'], action: { label: 'Open', url: 'https://x.test' } })).toBe(
      'Hi\n\nOne\n\nOpen: https://x.test\n\nSent by your chapter calendar.',
    )
  })
})
