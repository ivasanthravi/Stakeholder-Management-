// Data & privacy: workspace export, personal export, scheduled workspace deletion, closing your account.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CalendarClock, Download, FileJson, Loader2, Lock, UserX } from 'lucide-react'
import { account, exportDownloadUrl, useCancelDeletion, useDataRequests, useRequestExport, useScheduleDeletion, type DataRequest } from '../../api/commercial'
import { ApiError, errorMessage } from '../../api/http'
import { wk } from '../../api/hooks'
import { Button, Pill, Skeleton } from '../../components/ui'
import { useSession, authClient } from '../../session/session'
import { useApp } from '../../shell/context'
import { LoadError } from '../Home'
import { absTime, longDate, Notice, PageTitle, relTime, SectionHead, TypedConfirmDialog } from './common'

export function DataTab() {
  const { can } = useSession()
  const admin = can('data.export')
  const q = useDataRequests(admin)
  return (
    <>
      <PageTitle title="Data management" sub="Take your data with you, or remove it. Nothing here happens without a confirmation." />
      {admin ? (
        q.isPending ? <div className="set-card set-skel" aria-busy="true"><div className="set-skel-row"><Skeleton w={110} h={11} /><Skeleton w="100%" h={30} r={6} /></div></div>
          : q.isError ? <LoadError error={q.error} onRetry={() => void q.refetch()} />
            : <WorkspaceExport requests={q.data.requests} ttl={q.data.exportTtlDays} />
      ) : null}
      <PersonalData />
      {admin && q.data && <WorkspaceDeletion requests={q.data.requests} coolingOff={q.data.coolingOffDays} />}
      <CloseAccount />
    </>
  )
}

function WorkspaceExport({ requests, ttl }: { requests: DataRequest[]; ttl: number }) {
  const req = useRequestExport()
  const qc = useQueryClient()
  const { toast } = useApp()
  const [err, setErr] = useState<string | null>(null)
  const exports = requests.filter(r => r.kind === 'workspace_export').slice(0, 5)
  const pending = exports.some(r => r.status === 'requested' || r.status === 'processing')
  const start = () => {
    setErr(null)
    req.mutate({}, {
      onSuccess: () => { toast('Export started — it’ll be ready here in a moment'); void qc.invalidateQueries({ queryKey: wk('data', 'requests') }) },
      onError: e => setErr(errorMessage(e)),
    })
  }
  return (
    <section className="set-section" aria-labelledby="data-export">
      <SectionHead title="Workspace export" id="data-export"
        sub={`A JSON file with every record, member and the audit log. Files are kept for ${ttl} days and can be downloaded by owners and administrators.`}
        aside={<Button size="sm" icon={<FileJson size={13} />} onClick={start} loading={req.isPending} disabled={pending}>{pending ? 'Preparing…' : 'Export workspace'}</Button>} />
      {err && <div className="form-error" role="alert"><AlertTriangle size={14} /><span>{err}</span></div>}
      {exports.length === 0 ? (
        <div className="set-card set-quiet t-small c3">No exports yet.</div>
      ) : (
        <ul className="set-card set-table" aria-label="Exports" aria-live="polite">
          {exports.map(r => {
            const busy = r.status === 'requested' || r.status === 'processing'
            const expired = !r.downloadable && r.status !== 'failed' && !busy
            return (
              <li key={r.id} className="inv-row">
                <span className="inv-ico" aria-hidden>{busy ? <Loader2 size={13} className="spin" /> : <FileJson size={13} />}</span>
                <div className="grow">
                  <p className="t-strong">Export requested <span title={absTime(r.createdAt)}>{relTime(r.createdAt).toLowerCase()}</span></p>
                  <p className="t-small c2">
                    {busy ? 'Preparing the file…'
                      : r.downloadable ? <>Ready · available until {longDate(r.fileExpiresAt)}</>
                        : r.status === 'failed' ? 'Couldn’t be prepared. Try again.'
                          : 'Expired — the file has been deleted.'}
                  </p>
                </div>
                {r.downloadable
                  ? <a className="btn btn-secondary btn-sm" href={exportDownloadUrl(r.id)} download><Download size={13} aria-hidden /><span className="btn-label">Download</span></a>
                  : busy ? <Pill tone="accent">Preparing</Pill> : expired ? <Pill tone="neutral">Expired</Pill> : <Pill tone="critical">Failed</Pill>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function PersonalData() {
  return (
    <section className="set-section" aria-labelledby="data-me">
      <SectionHead title="Your personal data" id="data-me" />
      <div className="set-card">
        <div className="set-danger-row">
          <div className="grow">
            <p className="t-strong">Download my data</p>
            <p className="t-small c2">Your profile, workspace memberships, sessions, preferences, notifications, assistant conversation titles and the emails we sent you. Workspace records belong to each workspace and are exported there.</p>
          </div>
          <a className="btn btn-secondary btn-sm" href={account.exportUrl} download><Download size={13} aria-hidden /><span className="btn-label">Download JSON</span></a>
        </div>
      </div>
    </section>
  )
}

function WorkspaceDeletion({ requests, coolingOff }: { requests: DataRequest[]; coolingOff: number }) {
  const { can, workspace } = useSession()
  const { toast } = useApp()
  const qc = useQueryClient()
  const schedule = useScheduleDeletion()
  const cancel = useCancelDeletion()
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const scheduled = requests.find(r => r.kind === 'workspace_deletion' && r.status === 'scheduled')
  const owner = can('workspace.deleteRequest')
  const name = workspace?.name ?? ''
  const when = new Date(Date.now() + coolingOff * 86_400_000).toISOString()
  const refresh = () => void qc.invalidateQueries({ queryKey: wk('data', 'requests') })
  const go = () => {
    setErr(null)
    schedule.mutate({ confirmName: name }, {
      onSuccess: r => { setOpen(false); refresh(); toast(`Deletion scheduled for ${longDate(r.scheduledFor)}`) },
      onError: e => setErr(e instanceof ApiError && e.fields.confirmName ? e.fields.confirmName : errorMessage(e)),
    })
  }
  return (
    <section className="set-section" aria-labelledby="data-del">
      <SectionHead title="Delete workspace" id="data-del" />
      {scheduled ? (
        <Notice tone="critical" icon={<CalendarClock size={15} />} title={`${name} will be deleted on ${longDate(scheduled.scheduledFor)}`}
          actions={owner ? <Button size="sm" variant="primary" loading={cancel.isPending} onClick={() => cancel.mutate({}, { onSuccess: () => { refresh(); toast('Deletion canceled — nothing will be deleted') }, onError: e => toast(errorMessage(e), undefined, 'error') })}>Cancel deletion</Button> : undefined}>
          Until then everything works as usual and the deletion can be canceled. After that date, all records, members and files in this workspace are permanently deleted and the subscription is stopped.
          {!owner && ' Only an owner can cancel it.'}
        </Notice>
      ) : (
        <div className="set-card set-danger">
          <div className="set-danger-row">
            <div className="grow">
              <p className="t-strong">Schedule deletion</p>
              <p className="t-small c2">
                {owner ? `Deletes every record and member after a ${coolingOff}-day cooling-off period, and stops billing. You can cancel any time before then. Export first if you need a copy.`
                  : <span className="row gap-1"><Lock size={12} aria-hidden />Only an owner can delete the workspace.</span>}
              </p>
            </div>
            {owner && <Button variant="danger" size="sm" onClick={() => { setErr(null); setOpen(true) }}>Delete workspace…</Button>}
          </div>
        </div>
      )}
      <TypedConfirmDialog open={open} busy={schedule.isPending} error={err} phrase={name} title={`Delete ${name}?`} confirmLabel="Schedule deletion"
        phraseLabel={<>Type <span className="t-strong">{name}</span> to confirm</>}
        body={(
          <>
            <p>The workspace will be permanently deleted on <span className="t-strong">{longDate(when)}</span>, after a {coolingOff}-day cooling-off period. All owners are notified by email.</p>
            <p className="set-mt">Until then, nothing changes and any owner can cancel. After that, records, members, exports and the audit log can’t be recovered.</p>
          </>
        )}
        onCancel={() => !schedule.isPending && setOpen(false)} onConfirm={go} />
    </section>
  )
}

function CloseAccount() {
  const { me } = useSession()
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [blocking, setBlocking] = useState<{ message: string; names: string[] } | null>(null)
  if (!me) return null
  const go = async () => {
    setBusy(true); setErr(null)
    try {
      await account.closeAccount(me.user.email)
      setOpen(false)
      await authClient.signOut().catch(() => {})
      qc.clear()
      window.location.assign('/')
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // The server lists the workspaces where you're the only owner.
        const listed = Array.isArray(e.details.workspaces) ? (e.details.workspaces as string[]) : null
        const names = listed ?? me.workspaces.filter(w => w.role === 'owner' && e.message.includes(w.name)).map(w => w.name)
        setBlocking({ message: e.message, names }); setOpen(false)
      } else setErr(e instanceof ApiError && e.fields.confirmEmail ? e.fields.confirmEmail : errorMessage(e))
    } finally { setBusy(false) }
  }
  return (
    <section className="set-section" aria-labelledby="data-close">
      <SectionHead title="Close your account" id="data-close" />
      {blocking && (
        <Notice tone="attention" role="alert" icon={<AlertTriangle size={15} />} title="Hand over ownership first">
          <p>{blocking.names.length ? 'You’re the only owner of:' : blocking.message}</p>
          {blocking.names.length > 0 && <ul className="data-block-list">{blocking.names.map(n => <li key={n} className="t-strong">{n}</li>)}</ul>}
          <p className="set-mt">In each one, make someone else an owner in <Link to="/settings/members" className="set-link">Settings › Members</Link>, or schedule the workspace for deletion above. Then close your account.</p>
        </Notice>
      )}
      <div className="set-card set-danger">
        <div className="set-danger-row">
          <div className="grow">
            <p className="t-strong">Close my account</p>
            <p className="t-small c2">Removes your sign-in, memberships, preferences and assistant history immediately. Records you created stay in their workspaces without your name.</p>
          </div>
          <Button variant="danger" size="sm" icon={<UserX size={13} />} onClick={() => { setErr(null); setOpen(true) }}>Close account…</Button>
        </div>
      </div>
      <TypedConfirmDialog open={open} busy={busy} error={err} phrase={me.user.email} caseInsensitive title="Close your account?" confirmLabel="Close account"
        phraseLabel={<>Type your email <span className="t-strong">{me.user.email}</span> to confirm</>}
        body={(
          <>
            <p>This can’t be undone. You’ll be signed out everywhere and lose access to every workspace.</p>
            <p className="set-mt">Consider <a href={account.exportUrl} download className="set-link">downloading your data</a> first.</p>
          </>
        )}
        onCancel={() => !busy && setOpen(false)} onConfirm={() => void go()} />
    </section>
  )
}
