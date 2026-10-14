'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useApp } from './Store'
import { f2, fd, pc, qty, theoMetres, metreVar, metreStats } from '@/lib/model'

const when = (t) => (t ? new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–')
const m2 = (n) => (+n || 0).toFixed(2)
const r2 = (n) => Math.round((+n || 0) * 100) / 100
const sgnM = (n) => (r2(n) > 0 ? '+' : '') + m2(r2(n) === 0 ? 0 : n)
const sgnP = (n) => (Math.round((+n || 0) * 1000) > 0 ? '+' : '') + pc(Math.round((+n || 0) * 1000) === 0 ? 0 : n)
const sgnF = (n) => (r2(n) > 0 ? '+' : r2(n) < 0 ? '−' : '') + f2(Math.abs(r2(n)))

const Kpi = ({ title, value, sub, n = 3 }) => (
  <section className={'pb-tile pb-kpi pb-c' + n}><h3>{title}</h3><div className="pb-sub">{sub || '\u00a0'}</div><div className="pb-big">{value}</div></section>
)

export function Variance() {
  const { S, dispatch, canEdit, role } = useApp()
  const [jc, setJc] = useState(''), [actual, setActual] = useState(''), [reason, setReason] = useState(''), [err, setErr] = useState('')
  const canRec = role === 'admin' || role === 'staff'
  const st = metreStats(S)
  const elig = S.orders.filter((o) => o.prod)
  const sel = jc || (elig.find((o) => !metreVar(S, o).rec) || elig[0] || {}).jc || ''
  const o = S.orders.find((x) => x.jc === sel)
  const theo = o ? theoMetres(S, o) : 0
  const cur = o ? metreVar(S, o) : null
  const has = actual !== '' && Number.isFinite(+actual) && +actual >= 0
  const pv = o && has ? metreVar(S, { ...o, metres: { theo: +theo.toFixed(3), act: +(+actual).toFixed(3) } }) : null
  const needReason = !!pv && pv.status !== 'Within tolerance'

  const save = () => {
    if (!o) return setErr('Choose a job card that is in production.')
    if (!has) return setErr('Enter the actual metres used, as a number of 0 or more.')
    if (!(theo > 0)) return setErr('This job has no theoretical metres. Check its sizes and quantities.')
    if (needReason && !reason.trim()) return setErr(`This job is ${pv.status === 'OVER tolerance' ? 'over' : 'under'} the ${S.tol}% tolerance. Enter the reason before saving.`)
    setErr('')
    dispatch({ type: 'metres', jc: o.jc, actual: +actual, reason })
    setActual(''); setReason('')
  }

  const rows = [...elig].reverse()
  const setNum = (k, min) => (e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= min && v !== S[k]) dispatch({ type: 'setting', k, v }) }

  return (
    <>
      <div className="top">
        <div><h1>Metre variance</h1>
          <div className="sub">Theoretical metres are pattern height × quantity. Enter the metres actually used once the job is cut. Variance % = actual ÷ theoretical − 1.</div></div>
        <label>Signed in as
          <select value={S.user} onChange={(e) => dispatch({ type: 'user', user: e.target.value })}><option>Staff 1</option><option>Staff 2</option></select>
        </label>
      </div>

      <div className="pb-tiles">
        <Kpi title="Jobs with actual metres" value={st.jobs} sub={`${elig.length} in production or done`} />
        <Kpi title="Overall variance" value={st.avg === null ? '–' : sgnP(st.avg)} sub={st.jobs ? `${m2(st.act)} m used vs ${m2(st.theo)} m` : 'No actuals yet'} />
        <Kpi title="Jobs over tolerance" value={st.over} sub={`Tolerance ±${S.tol}%${st.under ? ` · ${st.under} under` : ''}`} />
        <Kpi title="Cost vs costed metres" value={st.jobs ? sgnF(st.impact) : '–'} sub="Metres beyond what was costed × rates" />
      </div>

      <div className="grid">
        <div className="card"><h2>Record actual metres</h2>
          {!elig.length ? <div className="note w">No job card is in production yet. Move a paid job to production first.</div> : (
            <>
              <div className="fm">
                <label>Job card
                  <select value={sel} onChange={(e) => { setJc(e.target.value); setActual(''); setReason(''); setErr('') }}>
                    {elig.map((x) => <option key={x.jc} value={x.jc}>{x.jc} · {x.ent}{metreVar(S, x).rec ? ' (recorded)' : ''}</option>)}
                  </select></label>
                <label>Actual metres used
                  <input type="number" step="any" min="0" value={actual} disabled={!canRec} onChange={(e) => setActual(e.target.value)} /></label>
              </div>
              {o && (
                <>
                  <div className="tot"><span>Shirts on this job</span><span>{qty(o)}</span></div>
                  <div className="tot"><span>Theoretical metres</span><span>{m2(theo)} m</span></div>
                  <div className="tot"><span>Metres costed into the job ({+o.allow || 0}% tolerance)</span><span>{m2(theo * (1 + (+o.allow || 0) / 100))} m</span></div>
                  {pv && (
                    <>
                      <div className="tot"><span>Variance</span><span>{sgnM(pv.diff)} m ({pv.pct === null ? '–' : sgnP(pv.pct)})</span></div>
                      <div className="tot"><span>Cost vs costed metres</span><span>{sgnF(pv.impact)}</span></div>
                      <div className="tot big"><span>Status</span><span><span className={'tag ' + pv.tone}>{pv.status}</span></span></div>
                    </>
                  )}
                  {cur && cur.rec && (
                    <div className="note">Already recorded: {m2(cur.act)} m ({cur.pct === null ? '–' : sgnP(cur.pct)}) by {o.metres.by}, {when(o.metres.at)}. Saving again replaces it and keeps the old entry in the audit trail.</div>
                  )}
                  <label style={{ marginTop: 10 }}>Reason for variance{needReason ? ' (required)' : ''}
                    <input value={reason} disabled={!canRec} onChange={(e) => setReason(e.target.value)} placeholder="Misprint, fabric defect, layout, wrong cut…" /></label>
                </>
              )}
              {err && <div className="note w">{err}</div>}
              {!canRec && <div className="note w">Only admin and staff accounts can record metres.</div>}
              <p><button className="btn" disabled={!canRec || !o} onClick={save}>Save actual metres</button></p>
            </>
          )}
        </div>

        <div className="card"><h2>Tolerance</h2>
          <div className="fm">
            <label>Metre tolerance, ±% (also costed into new orders)<input type="number" step="any" min="0" disabled={!canEdit} defaultValue={S.tol} key={'t' + S.tol} onBlur={setNum('tol', 0)} /></label>
            <label>Jobs needed before suggesting<input type="number" step="1" min="1" disabled={!canEdit} defaultValue={S.minJobs} key={'m' + S.minJobs} onBlur={setNum('minJobs', 1)} /></label>
          </div>
          <div className="tot"><span>Average variance (all jobs)</span><span>{st.avg === null ? '–' : sgnP(st.avg)}</span></div>
          <div className="tot"><span>Worst job</span><span>{st.worst === null ? '–' : sgnP(st.worst)}</span></div>
          <div className="tot big"><span>Suggested tolerance</span><span>{st.suggested === null ? `Needs ${st.need}+ jobs` : st.suggested + '%'}</span></div>
          {st.suggested !== null && st.suggested !== S.tol && canEdit && (
            <p><button className="btn o" onClick={() => dispatch({ type: 'setting', k: 'tol', v: st.suggested })}>Use {st.suggested}% as the tolerance</button></p>
          )}
          <p className="sub">The starting tolerance of 10% is a default, not a measured figure. New orders are costed with this tolerance added to their metres, and orders already registered keep the cost they were saved with. Price on the average variance once enough jobs are recorded. Use the worst job to judge whether layout or cutting needs fixing. A job well under the pattern is flagged because it usually means a typing mistake.</p>
          {!canEdit && <p className="sub">Only an admin can change the tolerance.</p>}
        </div>
      </div>

      <div className="card"><h2>Job cards</h2>
        {rows.length ? (
          <div className="tw"><table>
            <thead><tr>{['Job card', 'Entity', 'Shirts', 'Theoretical m', 'Costed m', 'Actual m', 'Variance m', 'Variance %', 'Status', 'Cost vs costed', 'Recorded', 'Reason'].map((h, i) => <th key={h} className={(i >= 2 && i <= 7) || i === 9 ? 'r' : ''}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((x) => {
                const v = metreVar(S, x)
                return (
                  <tr key={x.jc}>
                    <td><Link href={'/orders/' + x.jc}>{x.jc}</Link></td><td>{x.ent}</td><td className="r">{qty(x)}</td>
                    <td className="r">{m2(v.theo)}</td>
                    <td className="r">{m2(v.planned)}</td>
                    <td className="r">{v.rec ? m2(v.act) : '–'}</td>
                    <td className="r">{v.rec ? sgnM(v.diff) : '–'}</td>
                    <td className="r">{v.rec && v.pct !== null ? sgnP(v.pct) : '–'}</td>
                    <td><span className={'tag ' + v.tone}>{v.status}</span></td>
                    <td className="r">{v.rec ? sgnF(v.impact) : '–'}</td>
                    <td>{v.rec ? `${x.metres.by}, ${fd(x.metres.at.slice(0, 10))}${x.metres.hist && x.metres.hist.length ? ` · corrected ${x.metres.hist.length}×` : ''}` : '–'}</td>
                    <td style={{ whiteSpace: 'normal', minWidth: 160 }}>{v.rec && x.metres.reason ? x.metres.reason : '–'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        ) : <p className="sub">Job cards appear here once they are moved to production.</p>}
        <p className="sub">The full history of every entry and correction is in the audit trail on each job card.</p>
      </div>
    </>
  )
}
