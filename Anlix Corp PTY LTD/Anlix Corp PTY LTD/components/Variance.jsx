'use client'
// components/Variance.jsx
// Metre variance: theoretical metres (pattern height x quantity) against the metres actually used on a job.
//
// Who can do what (checked with the same permission system as the rest of the app):
//   Super admin ............... record metres on any open job card, correct or clear recorded metres, change the tolerance.
//   "Create / edit orders" .... record metres the first time on a job that is in production.
//   "Change prices & settings"  change the tolerance (super admins always can).
//   Everyone else ............. view only.
// Closed jobs are locked for everyone. Every entry and correction goes to the audit log.
import { useRef, useState } from 'react'
import Link from 'next/link'
import { useApp } from './Store'
import { useAuth } from './AuthProvider'
import { f2, fd, qty, theoMetres, metreVar, metreStats, tolPct } from '@/lib/model'

const when = (t) => (t ? new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–')
const m2 = (n) => (+n || 0).toFixed(2)
const sgnM = (n) => ((+n || 0) > 0.005 ? '+' : '') + m2(Math.abs(+n || 0) < 0.005 ? 0 : n)
const sgnP = (n) => ((+n || 0) > 0.05 ? '+' : '') + (Math.abs(+n || 0) < 0.05 ? 0 : +n || 0).toFixed(1) + '%'

// Status of one order's metres against the tolerance. pct is a percentage (7.5 = 7.5%).
const status = (v) => {
  if (v.act === null) return ['Not recorded', 'b']
  if (!v.within) return ['Over tolerance', 'a']
  if (v.pct < -v.tol) return ['Well under', 'a']
  return ['Within tolerance', 'g']
}

const Kpi = ({ title, value, sub, n = 3 }) => (
  <section className={'pb-tile pb-kpi pb-c' + n}><h3>{title}</h3><div className="pb-sub">{sub || '\u00a0'}</div><div className="pb-big">{value}</div></section>
)
const Perm = ({ on, label, hint }) => (
  <span className={'tag ' + (on ? 'g' : 'a')} title={hint} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>{on ? '✓' : '✕'} {label}</span>
)

export function Variance() {
  const { S, dispatch, cloud } = useApp()
  const auth = useAuth()
  const can = (auth && auth.can) || (() => false)
  const isSuper = !!auth && auth.role === 'super_admin'
  const canRec = can('orders.edit')       // record metres the first time
  const canFix = isSuper                  // correct or clear metres that are already recorded
  const canTol = can('settings.edit')     // change the tolerance (super admins pass every check)
  const roleLabel = isSuper ? 'Super admin' : canRec ? 'Can record metres' : 'View only'

  const [jc, setJc] = useState(''), [actual, setActual] = useState(''), [reason, setReason] = useState(''), [err, setErr] = useState(''), [done, setDone] = useState('')
  const actRef = useRef(null)
  const tol = tolPct(S)
  const orders = S.orders || []
  const st = metreStats(S)
  // Super admins can record on any open job card. Everyone else only on jobs that are in production.
  const elig = orders.filter((o) => !o.closed && (o.prod || isSuper))
  const rows = [...orders.filter((o) => o.prod || o.closed || isSuper)].reverse()
  const firstFree = elig.find((o) => o.prod && metreVar(S, o).act === null) || elig.find((o) => metreVar(S, o).act === null) || elig[0]
  const sel = elig.some((x) => x.jc === jc) ? jc : (firstFree || {}).jc || ''
  const o = orders.find((x) => x.jc === sel)
  const theo = o ? theoMetres(S, o) : 0
  const cur = o ? metreVar(S, o) : null
  const recorded = !!cur && cur.act !== null
  const mayWrite = !!o && !o.closed && (recorded ? canFix : canRec)
  const has = actual !== '' && Number.isFinite(+actual) && +actual > 0
  const pctNew = has && theo > 0 ? ((+actual - theo) / theo) * 100 : null
  const outside = pctNew !== null && (pctNew > tol || pctNew < -tol)

  const save = () => {
    setDone('')
    if (!o) return setErr('Choose a job card.')
    if (!mayWrite) return setErr(recorded ? 'Only a super admin can correct metres that are already recorded.' : 'You do not have permission to record metres. Ask a super admin for the "Create / edit orders" permission.')
    if (!has) return setErr('Enter the actual metres used, as a number above 0.')
    if (!(theo > 0)) return setErr('This job has no theoretical metres. Check its sizes and quantities.')
    if (outside && !reason.trim()) return setErr(`This job is ${pctNew > 0 ? 'over' : 'under'} the ${tol}% tolerance. Enter the reason before saving.`)
    if (recorded && !reason.trim()) return setErr('Enter a reason for the correction. It is kept in the audit log.')
    setErr('')
    dispatch({ type: 'metres', jc: o.jc, m: +actual, note: reason })
    setDone(`${m2(+actual)} m saved for ${o.jc}.`)
    setActual(''); setReason('')
  }
  const clear = () => {
    if (!o || !canFix) return
    if (!window.confirm(`Clear the recorded metres on ${o.jc}? The old figure stays in the audit log.`)) return
    dispatch({ type: 'metres', jc: o.jc, m: '' }); setActual(''); setReason(''); setDone(`Recorded metres cleared on ${o.jc}.`)
  }
  const setTol = (e) => { if (!canTol) return; const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 0 && v !== S.tol) dispatch({ type: 'setting', k: 'tol', v }) }
  // From the table: pick the job in the form above and jump to the metres box.
  const recordFor = (id) => {
    setJc(id); setActual(''); setReason(''); setErr(''); setDone('')
    setTimeout(() => { if (actRef.current) { actRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }); actRef.current.focus() } }, 60)
  }

  return (
    <>
      <div className="top">
        <div><h1>Metre variance</h1>
          <div className="sub">Theoretical metres are pattern height × quantity. Enter the metres actually used once the job is cut. Variance % = (actual − theoretical) ÷ theoretical.</div></div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <span className={'tag ' + (isSuper ? 'b' : canRec ? 'g' : 'a')} style={{ fontWeight: 600 }}>{roleLabel}</span>
          {cloud
            ? <label>Signed in as <b>{S.user}</b></label>
            : <label>Signed in as
                <select value={S.user} onChange={(e) => dispatch({ type: 'user', user: e.target.value })}><option>Staff 1</option><option>Staff 2</option></select>
              </label>}
        </div>
      </div>

      <div className="pb-tiles">
        <Kpi title="Jobs with actual metres" value={st.n} sub={`${rows.length} in production or done`} />
        <Kpi title="Overall variance" value={st.n ? sgnP(st.pct) : '–'} sub={st.n ? `${m2(st.act)} m used vs ${m2(st.theo)} m` : 'No actuals yet'} />
        <Kpi title="Jobs over tolerance" value={st.outside} sub={`Tolerance ${tol}%`} />
        <Kpi title="Cost vs theoretical" value={st.n ? (st.cost > 0.005 ? '+' : st.cost < -0.005 ? '−' : '') + f2(Math.abs(st.cost)) : '–'} sub="Extra metres × material rates" />
      </div>

      <div className="card" style={{ padding: '12px 16px' }}>
        <div className="chips" style={{ alignItems: 'center' }}>
          <b style={{ fontSize: 13 }}>Your access:</b>
          <Perm on={canRec} label="Record actual metres" hint={'Needs the "Create / edit orders" permission, or a super admin'} />
          <Perm on={canFix} label="Correct or clear recorded metres" hint="Super admin only" />
          <Perm on={canTol} label="Change tolerance" hint={'Needs the "Change prices & settings" permission, or a super admin'} />
        </div>
      </div>

      <div className="grid">
        <div className="card"><h2>Record actual metres</h2>
          {!elig.length ? <div className="note w">{isSuper ? 'There are no open job cards yet.' : 'No open job card is in production yet. Move a paid job to production first.'}</div> : (
            <>
              <div className="fm">
                <label>Job card
                  <select value={sel} onChange={(e) => { setJc(e.target.value); setActual(''); setReason(''); setErr(''); setDone('') }}>
                    {elig.map((x) => <option key={x.jc} value={x.jc}>{x.jc} · {x.ent}{metreVar(S, x).act !== null ? ' (recorded)' : ''}{x.prod ? '' : ' (not in production)'}</option>)}
                  </select></label>
                <label>Actual metres used
                  <input ref={actRef} type="number" step="any" min="0" value={actual} disabled={!mayWrite} placeholder={mayWrite ? 'e.g. 42.5' : ''} onChange={(e) => setActual(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') save() }} /></label>
              </div>
              {o && (
                <>
                  <div className="tot"><span>Shirts on this job</span><span>{qty(o)}</span></div>
                  <div className="tot"><span>Theoretical metres</span><span>{m2(theo)} m</span></div>
                  <div className="tot"><span>Allowed with {tol}% tolerance</span><span>{m2(theo * (1 + tol / 100))} m</span></div>
                  {pctNew !== null && (
                    <>
                      <div className="tot"><span>Variance</span><span>{sgnM(+actual - theo)} m ({sgnP(pctNew)})</span></div>
                      <div className="tot big"><span>Status</span><span><span className={'tag ' + (outside ? 'a' : 'g')}>{pctNew > tol ? 'Over tolerance' : pctNew < -tol ? 'Well under' : 'Within tolerance'}</span></span></div>
                    </>
                  )}
                  {recorded && (
                    <div className="note">Already recorded: {m2(cur.act)} m ({sgnP(cur.pct)}) by {o.actualBy || '–'}, {when(o.actualAt)}.{canFix ? ' Saving again replaces it and the old entry stays in the audit log.' : ' Only a super admin can correct it.'}</div>
                  )}
                  {!o.prod && <div className="note w">This job card is not in production yet. You can record metres on it because you are a super admin.</div>}
                  <label style={{ marginTop: 10 }}>Reason for variance{outside || recorded ? ' (required)' : ''}
                    <input value={reason} disabled={!mayWrite} onChange={(e) => setReason(e.target.value)} placeholder={recorded ? 'Why is the figure being corrected?' : 'Misprint, fabric defect, layout, test print…'} /></label>
                </>
              )}
              {err && <div className="note w" role="alert">{err}</div>}
              {done && <div className="note" role="status">{done}</div>}
              {!mayWrite && o && !o.closed && (
                <div className="note w">{recorded ? 'This job already has metres recorded. Only a super admin can correct or clear them.' : 'You can look at the figures, but you do not have permission to record metres. Ask a super admin for the "Create / edit orders" permission.'}</div>
              )}
              {o && o.closed && <div className="note w">This job is closed, so its metres are locked.</div>}
              <p>
                <button className="btn" disabled={!mayWrite} onClick={save}>{recorded ? 'Save correction' : 'Save actual metres'}</button>{' '}
                {recorded && canFix && !o.closed && <button className="btn o" onClick={clear}>Clear recorded metres</button>}
              </p>
            </>
          )}
        </div>

        <div className="card"><h2>Tolerance</h2>
          <div className="fm">
            <label>Metre tolerance, % <input type="number" step="any" min="0" disabled={!canTol} defaultValue={S.tol} key={'t' + S.tol} onBlur={setTol} /></label>
          </div>
          <div className="tot"><span>Average variance (recorded jobs)</span><span>{st.n ? sgnP(st.avg) : '–'}</span></div>
          <div className="tot"><span>Highest job</span><span>{st.n ? sgnP(st.max) : '–'}</span></div>
          <div className="tot"><span>Lowest job</span><span>{st.n ? sgnP(st.min) : '–'}</span></div>
          <div className="tot big"><span>Suggested tolerance</span><span>{st.n ? st.suggested + '%' : 'Needs recorded jobs'}</span></div>
          {st.n > 0 && st.suggested !== S.tol && canTol && (
            <p><button className="btn o" onClick={() => dispatch({ type: 'setting', k: 'tol', v: st.suggested })}>Use {st.suggested}% as the tolerance</button></p>
          )}
          <p className="sub">The suggested figure is the tolerance that would have covered 80% of recorded jobs. Treat it with care until you have several jobs. A job well under the pattern is flagged because it is usually a typing mistake.</p>
          {!canTol && <p className="sub">Only a super admin, or someone with the "Change prices &amp; settings" permission, can change the tolerance.</p>}
        </div>
      </div>

      <div className="card"><h2>Job cards</h2>
        {rows.length ? (
          <div className="tw"><table>
            <thead><tr>{['Job card', 'Entity', 'Shirts', 'Theoretical m', 'Allowed m', 'Actual m', 'Variance m', 'Variance %', 'Status', 'Cost vs theoretical', 'Recorded', 'Reason', 'Action'].map((h, i) => <th key={h} className={(i >= 2 && i <= 7) || i === 9 ? 'r' : ''}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((x) => {
                const v = metreVar(S, x), rec = v.act !== null, [label, tone] = status(v)
                const allowedHere = !x.closed && (rec ? canFix : canRec && (x.prod || isSuper))
                return (
                  <tr key={x.jc}>
                    <td><Link href={'/orders/' + x.jc}>{x.jc}</Link></td><td>{x.ent}</td><td className="r">{qty(x)}</td>
                    <td className="r">{m2(v.theo)}</td>
                    <td className="r">{m2(v.allowed)}</td>
                    <td className="r">{rec ? m2(v.act) : '–'}</td>
                    <td className="r">{rec ? sgnM(v.diff) : '–'}</td>
                    <td className="r">{rec ? sgnP(v.pct) : '–'}</td>
                    <td><span className={'tag ' + tone}>{label}</span></td>
                    <td className="r">{rec ? (v.cost > 0.005 ? '+' : v.cost < -0.005 ? '−' : '') + f2(Math.abs(v.cost)) : '–'}</td>
                    <td>{rec ? `${x.actualBy || '–'}, ${x.actualAt ? fd(x.actualAt.slice(0, 10)) : '–'}` : '–'}</td>
                    <td style={{ whiteSpace: 'normal', minWidth: 160 }}>{rec && x.actualNote ? x.actualNote : '–'}</td>
                    <td>{x.closed ? <span className="sub">Closed</span>
                      : allowedHere ? <button className="btn o smallbtn" onClick={() => recordFor(x.jc)}>{rec ? 'Correct' : 'Add metres'}</button>
                      : <span className="sub">{rec ? 'Super admin only' : !x.prod ? 'Not in production' : 'No permission'}</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        ) : <p className="sub">Job cards appear here once they are moved to production.</p>}
        <p className="sub">Every entry and correction is in the audit log. Recording actual metres on a job also updates its production cost, and closed jobs are locked.</p>
      </div>
    </>
  )
}
