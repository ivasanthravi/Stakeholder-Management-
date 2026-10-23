// Transactional email templates. Table-based HTML with inline styles (renders in Outlook, Gmail, Apple Mail),
// a hidden preheader, a plain-text alternative, and one clear action. Subjects and previews never name stakeholders
// or quote record content; bodies list only items the recipient can already see in the app.

export type Category = 'account' | 'billing' | 'notification'
export interface Rendered { subject: string; preheader: string; html: string; text: string; category: Category }
type Data = Record<string, unknown>

const C = { ink: '#151A20', body: '#4D5562', muted: '#5E6774', line: '#E4E7EB', bg: '#F8F9FA', accent: '#0E6B65', accentInk: '#FFFFFF', soft: '#EEF8F7' }
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, Roboto, Helvetica, Arial, sans-serif"
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const fmtDate = (iso: unknown) => (iso ? new Date(String(iso)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '')

interface Block { heading: string; lines: string[]; cta?: { label: string; url: string }; list?: { label: string; meta?: string }[]; note?: string }

function layout(preheader: string, b: Block, footer: string) {
  const list = b.list?.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;border-top:1px solid ${C.line}">${b.list.map(i => `
      <tr><td style="padding:10px 0;border-bottom:1px solid ${C.line};font:15px/22px ${FONT};color:${C.ink}">${esc(i.label)}${i.meta ? `<br><span style="font-size:13px;color:${C.muted}">${esc(i.meta)}</span>` : ''}</td></tr>`).join('')}</table>` : ''
  const cta = b.cta ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="border-radius:8px;background:${C.accent}">
        <a href="${esc(b.cta.url)}" style="display:inline-block;padding:12px 20px;font:600 15px/20px ${FONT};color:${C.accentInk};text-decoration:none;border-radius:8px">${esc(b.cta.label)}</a>
      </td></tr></table>` : ''
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(b.heading)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
      <tr><td style="padding:0 4px 16px;font:600 15px/20px ${FONT};color:${C.ink}">
        <span style="display:inline-block;width:18px;height:18px;border-radius:5px;background:${C.accent};vertical-align:-4px;margin-right:8px"></span>Meridian
      </td></tr>
      <tr><td style="background:#FFFFFF;border:1px solid ${C.line};border-radius:12px;padding:32px 32px 12px">
        <h1 style="margin:0 0 12px;font:600 22px/30px ${FONT};color:${C.ink}">${esc(b.heading)}</h1>
        ${b.lines.map(l => `<p style="margin:0 0 16px;font:15px/24px ${FONT};color:${C.body}">${l}</p>`).join('')}
        ${list}${cta}
        ${b.note ? `<p style="margin:0 0 20px;padding:12px 14px;background:${C.soft};border-radius:8px;font:13px/20px ${FONT};color:${C.body}">${b.note}</p>` : ''}
      </td></tr>
      <tr><td style="padding:16px 4px;font:12px/18px ${FONT};color:${C.muted}">${footer}</td></tr>
    </table>
  </td></tr></table>
</body></html>`
}

function textOf(b: Block, footer: string) {
  // Links keep their URL in the text version ("label (https://…)"), so text-only clients can still act on them.
  const strip = (s: string) => s.replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/g, '$2 ($1)').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  return [b.heading, '', ...b.lines.map(strip), ...(b.list ?? []).map(i => `- ${i.label}${i.meta ? ` (${i.meta})` : ''}`), ...(b.cta ? ['', `${b.cta.label}: ${b.cta.url}`] : []), ...(b.note ? ['', strip(b.note)] : []), '', '—', strip(footer)].join('\n')
}

const ACCOUNT_FOOTER = 'You’re receiving this because of activity on your Meridian account. If it wasn’t you, you can ignore this email.'
const billingFooter = (d: Data) => `Sent to owners of ${esc(d.workspaceName)}. Billing emails can’t be turned off while you’re an owner.`
const notifFooter = (d: Data) => `You can choose which notifications you get in <a href="${esc(d.preferencesUrl)}" style="color:${C.muted}">notification settings</a>, or <a href="${esc(d.unsubscribeUrl)}" style="color:${C.muted}">unsubscribe from all notification emails</a>.`

type Def = (d: Data) => { category: Category; subject: string; preheader: string; block: Block; footer: string }

const T: Record<string, Def> = {
  verify: d => ({ category: 'account', subject: 'Confirm your email for Meridian', preheader: 'One click to finish setting up your account.', footer: ACCOUNT_FOOTER,
    block: { heading: 'Confirm your email', lines: ['Confirm this address to finish creating your Meridian account.'], cta: { label: 'Confirm email', url: String(d.url) }, note: 'This link expires in 24 hours.' } }),
  reset: d => ({ category: 'account', subject: 'Reset your Meridian password', preheader: 'Use this link to choose a new password.', footer: ACCOUNT_FOOTER,
    block: { heading: 'Reset your password', lines: ['Someone asked to reset the password for this account. If that was you, choose a new password below.'], cta: { label: 'Choose a new password', url: String(d.url) }, note: 'This link expires in 1 hour and can be used once. Your other sessions will be signed out.' } }),
  invite: d => ({ category: 'account', subject: `You’re invited to join ${d.workspaceName} on Meridian`, preheader: `${d.inviterName} invited you as ${d.roleLabel}.`, footer: 'If you weren’t expecting this invitation, you can ignore it — nothing happens unless you accept.',
    block: { heading: `Join ${esc(d.workspaceName)}`, lines: [`${esc(d.inviterName)} invited you to <strong>${esc(d.workspaceName)}</strong> as <strong>${esc(d.roleLabel)}</strong>.`, 'Meridian keeps your team’s stakeholders, engagements, decisions and commitments in one place.'], cta: { label: 'Accept invitation', url: String(d.url) }, note: `The link expires on ${fmtDate(d.expiresAt)} and works only for ${esc(d.email)}.` } }),
  invitation_accepted: d => ({ category: 'notification', subject: `${d.memberName} joined ${d.workspaceName}`, preheader: 'Your invitation was accepted.', footer: notifFooter(d),
    block: { heading: `${esc(d.memberName)} joined your workspace`, lines: [`${esc(d.memberName)} accepted your invitation to <strong>${esc(d.workspaceName)}</strong> as ${esc(d.roleLabel)}.`], cta: { label: 'View members', url: String(d.url) } } }),
  subscription_activated: d => ({ category: 'billing', subject: `Your ${d.planName} subscription is active`, preheader: 'Thanks — your workspace has full access.', footer: billingFooter(d),
    block: { heading: 'Subscription confirmed', lines: [`<strong>${esc(d.workspaceName)}</strong> is now on the <strong>${esc(d.planName)}</strong> plan. Receipts and invoices are in Settings › Billing.`], cta: { label: 'View billing', url: String(d.url) } } }),
  payment_failed: d => ({ category: 'billing', subject: 'Action needed: payment for your Meridian subscription failed', preheader: 'Update your payment method to keep full access.', footer: billingFooter(d),
    block: { heading: 'We couldn’t take your payment', lines: [`The latest payment for <strong>${esc(d.workspaceName)}</strong> didn’t go through. The payment provider will retry automatically.`, `Your team keeps full access until <strong>${fmtDate(d.until)}</strong>. After that the workspace becomes read-only — nothing is deleted.`], cta: { label: 'Update payment method', url: String(d.url) } } }),
  payment_recovered: d => ({ category: 'billing', subject: 'Payment received — thank you', preheader: 'Your subscription is back in good standing.', footer: billingFooter(d),
    block: { heading: 'Payment received', lines: [`The overdue payment for <strong>${esc(d.workspaceName)}</strong> has been received. No further action is needed.`], cta: { label: 'View billing', url: String(d.url) } } }),
  cancel_scheduled: d => ({ category: 'billing', subject: 'Your Meridian subscription will end', preheader: 'You keep full access until the end of the billing period.', footer: billingFooter(d),
    block: { heading: 'Cancellation scheduled', lines: [`The <strong>${esc(d.planName)}</strong> subscription for <strong>${esc(d.workspaceName)}</strong> will end on <strong>${fmtDate(d.until)}</strong>. Until then nothing changes.`, 'Afterwards the workspace stays available read-only for 90 days so you can export your data. You can resume the subscription any time before it ends.'], cta: { label: 'Manage subscription', url: String(d.url) } } }),
  subscription_canceled: d => ({ category: 'billing', subject: 'Your Meridian subscription has ended', preheader: 'Your data is kept and can be exported.', footer: billingFooter(d),
    block: { heading: 'Subscription ended', lines: [`The subscription for <strong>${esc(d.workspaceName)}</strong> has ended. The workspace is now read-only for 90 days: everyone can still view records and owners can export everything.`], cta: { label: 'Restart or export', url: String(d.url) } } }),
  plan_changed: d => ({ category: 'billing', subject: 'Your Meridian plan was updated', preheader: 'The change is reflected on your next invoice.', footer: billingFooter(d),
    block: { heading: 'Plan updated', lines: [`<strong>${esc(d.workspaceName)}</strong> is now on <strong>${esc(d.planName)}</strong>. Any proration appears on the next invoice.`], cta: { label: 'View billing', url: String(d.url) } } }),
  trial_ending: d => ({ category: 'billing', subject: 'Your Meridian trial ends soon', preheader: 'Choose a plan to keep full access.', footer: billingFooter(d),
    block: { heading: 'Your trial ends soon', lines: [`The trial for <strong>${esc(d.workspaceName)}</strong> ends on <strong>${fmtDate(d.until)}</strong>. Choose a plan to keep adding records and using AI features.`, 'If you don’t, the workspace becomes read-only — nothing is deleted.'], cta: { label: 'Choose a plan', url: String(d.url) } } }),
  trial_ended: d => ({ category: 'billing', subject: 'Your Meridian trial has ended', preheader: 'Your data is safe. Choose a plan to continue.', footer: billingFooter(d),
    block: { heading: 'Your trial has ended', lines: [`<strong>${esc(d.workspaceName)}</strong> is now read-only. Everything you added is kept for 90 days and can be exported.`], cta: { label: 'Choose a plan', url: String(d.url) } } }),
  commitments_digest: d => {
    const due = (d.due as { label: string; meta: string }[]) ?? [], overdue = (d.overdue as { label: string; meta: string }[]) ?? []
    const n = due.length + overdue.length
    return { category: 'notification', subject: `${n} commitment${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} your attention`, preheader: overdue.length ? `${overdue.length} overdue, ${due.length} due soon.` : `${due.length} due soon.`, footer: notifFooter(d),
      block: { heading: 'Your commitments', lines: [`In <strong>${esc(d.workspaceName)}</strong>${overdue.length ? `, ${overdue.length} ${overdue.length === 1 ? 'is' : 'are'} overdue` : ''}${due.length ? `${overdue.length ? ' and' : ','} ${due.length} ${due.length === 1 ? 'is' : 'are'} due in the next week` : ''}.`],
        list: [...overdue, ...due], cta: { label: 'Open commitments', url: String(d.url) } } }
  },
  decision_assigned: d => ({ category: 'notification', subject: 'A decision was assigned to you', preheader: 'Open Meridian to see the details.', footer: notifFooter(d),
    block: { heading: 'You own a decision', lines: [`${esc(d.actorName)} made you the owner of <strong>${esc(d.decisionKey)}</strong> in ${esc(d.workspaceName)}.`], cta: { label: 'Open decision', url: String(d.url) } } }),
  workspace_deletion_scheduled: d => ({ category: 'account', subject: 'A workspace is scheduled for deletion', preheader: 'You can cancel this until the scheduled date.', footer: ACCOUNT_FOOTER,
    block: { heading: 'Workspace deletion scheduled', lines: [`${esc(d.actorName)} scheduled <strong>${esc(d.workspaceName)}</strong> for permanent deletion on <strong>${fmtDate(d.when)}</strong>.`, 'Any owner can cancel before then. After that date the workspace and its records are deleted and can’t be recovered.'], cta: { label: 'Review or cancel', url: String(d.url) } } }),
  data_export_ready: d => ({ category: 'account', subject: 'Your Meridian export is ready', preheader: 'Download it within 7 days.', footer: ACCOUNT_FOOTER,
    block: { heading: 'Your export is ready', lines: ['The export you requested is ready to download. You’ll need to be signed in.'], cta: { label: 'Download export', url: String(d.url) }, note: `The file is deleted on ${fmtDate(d.expiresAt)}.` } }),
  contact_request: d => ({ category: 'account', subject: `New ${d.topic} enquiry from the website`, preheader: `${d.company || 'A visitor'} asked to be contacted.`, footer: 'Sent by the contact form on the Meridian website.',
    block: { heading: `New ${esc(d.topic)} enquiry`, lines: [`<strong>${esc(d.name)}</strong> (${esc(d.email)})${d.company ? ` at ${esc(d.company)}` : ''}${d.teamSize ? `, team of ${esc(d.teamSize)}` : ''}.`, esc(d.message).replace(/\n/g, '<br>')] } }),
  contact_received: d => ({ category: 'account', subject: 'We received your message', preheader: 'Someone from Meridian will reply soon.', footer: 'You’re receiving this because you used the contact form on the Meridian website.',
    block: { heading: `Thanks, ${esc(d.name)}`, lines: ['We’ve received your message and will reply by email, usually within two working days.'] } }),
  account_closed: () => ({ category: 'account', subject: 'Your Meridian account was closed', preheader: 'Your sign-in and personal data have been removed.', footer: ACCOUNT_FOOTER,
    block: { heading: 'Account closed', lines: ['Your Meridian account has been closed and your personal profile removed. Records you created in shared workspaces belong to those workspaces and remain there, attributed to a former member.'] } }),
}

export type TemplateName = keyof typeof T
export const TEMPLATES = Object.keys(T) as TemplateName[]

export function render(name: TemplateName, data: Data): Rendered {
  const def = T[name]
  if (!def) throw new Error(`Unknown email template ${name}`)
  const r = def(data)
  return { subject: r.subject, preheader: r.preheader, category: r.category, html: layout(r.preheader, r.block, r.footer), text: textOf(r.block, r.footer) }
}
