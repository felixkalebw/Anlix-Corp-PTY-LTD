'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useApp } from './Store'
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

export function Variance() {
  const { S, dispatch, canEdit, role } = useApp()
  const [jc, setJc] = useState(''), [actual, setActual] = useState(''), [reason, setReason] = useState(''), [err, setErr] = useState('')
  const canRec = role === 'admin' || role === 'staff'
  const tol = tolPct(S)
  const orders = S.orders || []
  const st = metreStats(S)
  const elig = orders.filter((o) => o.prod && !o.closed)
  const rows = [...orders.filter((o) => o.prod || o.closed)].reverse()
  const sel = jc || (elig.find((o) => metreVar(S, o).act === null) || elig[0] || {}).jc || ''
  const o = orders.find((x) => x.jc === sel)
  const theo = o ? theoMetres(S, o) : 0
  const cur = o ? metreVar(S, o) : null
  const has = actual !== '' && Number.isFinite(+actual) && +actual > 0
  const pctNew = has && theo > 0 ? ((+actual - theo) / theo) * 100 : null
  const outside = pctNew !== null && (pctNew > tol || pctNew < -tol)

  const save = () => {
    if (!o) return setErr('Choose a job card that is in production.')
    if (!has) return setErr('Enter the actual metres used, as a number above 0.')
    if (!(theo > 0)) return setErr('This job has no theoretical metres. Check its sizes and quantities.')
    if (outside && !reason.trim()) return setErr(`This job is ${pctNew > 0 ? 'over' : 'under'} the ${tol}% tolerance. Enter the reason before saving.`)
    setErr('')
    dispatch({ type: 'metres', jc: o.jc, m: +actual, note: reason })
    setActual(''); setReason('')
  }
  const clear = () => { if (o) { dispatch({ type: 'metres', jc: o.jc, m: '' }); setActual(''); setReason('') } }
  const setTol = (e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 0 && v !== S.tol) dispatch({ type: 'setting', k: 'tol', v }) }

  return (
    <>
      <div className="top">
        <div><h1>Metre variance</h1>
          <div className="sub">Theoretical metres are pattern height × quantity. Enter the metres actually used once the job is cut. Variance % = (actual − theoretical) ÷ theoretical.</div></div>
        <label>Signed in as
          <select value={S.user} onChange={(e) => dispatch({ type: 'user', user: e.target.value })}><option>Staff 1</option><option>Staff 2</option></select>
        </label>
      </div>

      <div className="pb-tiles">
        <Kpi title="Jobs with actual metres" value={st.n} sub={`${rows.length} in production or done`} />
        <Kpi title="Overall variance" value={st.n ? sgnP(st.pct) : '–'} sub={st.n ? `${m2(st.act)} m used vs ${m2(st.theo)} m` : 'No actuals yet'} />
        <Kpi title="Jobs over tolerance" value={st.outside} sub={`Tolerance ${tol}%`} />
        <Kpi title="Cost vs theoretical" value={st.n ? (st.cost > 0.005 ? '+' : st.cost < -0.005 ? '−' : '') + f2(Math.abs(st.cost)) : '–'} sub="Extra metres × material rates" />
      </div>

      <div className="grid">
        <div className="card"><h2>Record actual metres</h2>
          {!elig.length ? <div className="note w">No open job card is in production yet. Move a paid job to production first.</div> : (
            <>
              <div className="fm">
                <label>Job card
                  <select value={sel} onChange={(e) => { setJc(e.target.value); setActual(''); setReason(''); setErr('') }}>
                    {elig.map((x) => <option key={x.jc} value={x.jc}>{x.jc} · {x.ent}{metreVar(S, x).act !== null ? ' (recorded)' : ''}</option>)}
                  </select></label>
                <label>Actual metres used
                  <input type="number" step="any" min="0" value={actual} disabled={!canRec} onChange={(e) => setActual(e.target.value)} /></label>
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
                  {cur && cur.act !== null && (
                    <div className="note">Already recorded: {m2(cur.act)} m ({sgnP(cur.pct)}) by {o.actualBy || '–'}, {when(o.actualAt)}. Saving again replaces it and the old entry stays in the audit log.</div>
                  )}
                  <label style={{ marginTop: 10 }}>Reason for variance{outside ? ' (required)' : ''}
                    <input value={reason} disabled={!canRec} onChange={(e) => setReason(e.target.value)} placeholder="Misprint, fabric defect, layout, test print…" /></label>
                </>
              )}
              {err && <div className="note w">{err}</div>}
              {!canRec && <div className="note w">Only admin and staff accounts can record metres.</div>}
              <p>
                <button className="btn" disabled={!canRec || !o} onClick={save}>Save actual metres</button>{' '}
                {cur && cur.act !== null && canRec && <button className="btn o" onClick={clear}>Clear recorded metres</button>}
              </p>
            </>
          )}
        </div>

        <div className="card"><h2>Tolerance</h2>
          <div className="fm">
            <label>Metre tolerance, % <input type="number" step="any" min="0" disabled={!canEdit} defaultValue={S.tol} key={'t' + S.tol} onBlur={setTol} /></label>
          </div>
          <div className="tot"><span>Average variance (recorded jobs)</span><span>{st.n ? sgnP(st.avg) : '–'}</span></div>
          <div className="tot"><span>Highest job</span><span>{st.n ? sgnP(st.max) : '–'}</span></div>
          <div className="tot"><span>Lowest job</span><span>{st.n ? sgnP(st.min) : '–'}</span></div>
          <div className="tot big"><span>Suggested tolerance</span><span>{st.n ? st.suggested + '%' : 'Needs recorded jobs'}</span></div>
          {st.n > 0 && st.suggested !== S.tol && canEdit && (
            <p><button className="btn o" onClick={() => dispatch({ type: 'setting', k: 'tol', v: st.suggested })}>Use {st.suggested}% as the tolerance</button></p>
          )}
          <p className="sub">The suggested figure is the tolerance that would have covered 80% of recorded jobs. Treat it with care until you have several jobs. A job well under the pattern is flagged because it is usually a typing mistake.</p>
          {!canEdit && <p className="sub">Only an admin can change the tolerance.</p>}
        </div>
      </div>

      <div className="card"><h2>Job cards</h2>
        {rows.length ? (
          <div className="tw"><table>
            <thead><tr>{['Job card', 'Entity', 'Shirts', 'Theoretical m', 'Allowed m', 'Actual m', 'Variance m', 'Variance %', 'Status', 'Cost vs theoretical', 'Recorded', 'Reason'].map((h, i) => <th key={h} className={(i >= 2 && i <= 7) || i === 9 ? 'r' : ''}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((x) => {
                const v = metreVar(S, x), rec = v.act !== null, [label, tone] = status(v)
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
