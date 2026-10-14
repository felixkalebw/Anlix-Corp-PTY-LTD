'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useApp } from './Store'
import { f2, fd, pc, calc, progress, isDone, overdue, phase, phaseTag, mkStages, STAGES, RESP_TYPES, reworksOf, reworkCost, stageBlocked, sum, sz, FAULTS, REMAKE_FAULTS, rwAvail, rwDefault } from '@/lib/model'

const when = (t) => (t ? new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–')
const span = (a, b) => {
  if (!a || !b) return ''
  const m = Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000))
  return m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} d ${Math.floor((m % 1440) / 60)} h`
}

const GUIDE = {
  [STAGES[0]]: ['Customer has approved the artwork', 'Sample or mock-up signed off', 'Colours, size and placement confirmed'],
  [STAGES[1]]: ['Fabric metres checked against the order', 'Material reserved for this job'],
  [STAGES[2]]: ['Print registration and colour checked', 'Pressing time and temperature to specification'],
  [STAGES[3]]: ['Cut sizes match the order lines', 'Seams, hems and labels checked'],
  [STAGES[4]]: ['Sizes and quantities verified', 'Print quality acceptable', 'Stitching and finish acceptable'],
  [STAGES[5]]: ['Counted and packed by size', 'Packs labelled with job card number', 'Handed over or delivered'],
  [STAGES[6]]: ['Balance cleared in full', 'Receipt issued to the customer'],
}
const DESC = {
  [STAGES[0]]: 'Confirm the design and sample with the customer before anything is printed.',
  [STAGES[1]]: 'Reserve fabric and consumables for this job.',
  [STAGES[2]]: 'Print the artwork and press it onto the fabric.',
  [STAGES[3]]: 'Cut the printed fabric to pattern and sew the shirts.',
  [STAGES[4]]: 'Inspect every size for print and stitching quality. A fail raises rework.',
  [STAGES[5]]: 'Pack by size, label and release to the customer.',
  [STAGES[6]]: 'Clear the balance and issue the receipt to close the order.',
}
const LABEL = { pending: 'Not started', active: 'In progress', done: 'Approved', skipped: 'Skipped' }
const TAG = { pending: '', active: 'b', done: 'g', skipped: '' }

function Field({ label, children, wide }) { return <label className={'ps-f' + (wide ? ' wide' : '')}>{label}{children}</label> }

function ApproveForm({ s, pass, onSubmit, blocked }) {
  const { S } = useApp()
  const guide = s.rw ? ['Defect corrected', 'Re-checked against the specification'] : GUIDE[s.k] || []
  const [ticks, setTicks] = useState([]), [by, setBy] = useState(S.user), [note, setNote] = useState(''), [actual, setActual] = useState(s.rw ? s.rw.est : '')
  const ready = guide.every((_, i) => ticks[i]) && by.trim() && (!s.rw || (actual !== '' && +actual >= 0))
  return (
    <div className="ps-form">
      <div className="ps-form-h">{s.rw ? 'Complete and approve rework' : pass ? 'Approve inspection' : 'Approve this stage'}</div>
      <div className="ps-checks">
        {guide.map((g, i) => <label key={g} className="ps-check"><input type="checkbox" checked={!!ticks[i]} onChange={(e) => setTicks(guide.map((_, j) => (j === i ? e.target.checked : !!ticks[j])))} /><span>{g}</span></label>)}
      </div>
      <div className="ps-row">
        <Field label="Approved by"><input value={by} onChange={(e) => setBy(e.target.value)} /></Field>
        {s.rw && <Field label={`Actual rework cost, P (estimate ${f2(s.rw.est)})`}><input type="number" min="0" step="any" value={actual} onChange={(e) => setActual(e.target.value)} /></Field>}
      </div>
      <Field label={s.rw ? 'What was done to fix it (optional)' : 'Notes (optional)'} wide><textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {blocked && <div className="note w">{blocked}</div>}
      <button className="btn ps-ok" disabled={!ready || !!blocked} onClick={() => onSubmit({ approver: by, note, actual })}>{s.rw ? 'Complete rework' : pass ? 'Pass inspection' : 'Approve stage'}</button>
      {!ready && !blocked && <span className="sub"> Tick every check to approve.</span>}
    </div>
  )
}

const chk = { width: 20, height: 20, minHeight: 0, margin: 0, flex: '0 0 auto' }

function ReworkForm({ s, fail, o, base, net, onSubmit }) {
  const { S } = useApp()
  const [f, setF] = useState({ what: '', happened: '', whoType: RESP_TYPES[0], who: '', qty: '', mat: '', lab: '', oth: '', fault: FAULTS[0] })
  const [pick, setPick] = useState({}), [remake, setRemake] = useState(true), [sel, setSel] = useState(null)
  // rework stages follow the normal production order; the defaults depend on the fault and where it was found
  const avail = rwAvail(STAGES.indexOf(s.k), !!fail), defOn = rwDefault(f.fault, avail)
  const isOn = (k) => (sel ? !!sel[k] : defOn.includes(k))
  const toggleStep = (k) => setSel({ ...Object.fromEntries(avail.map((x) => [x, isOn(x)])), [k]: !isOn(k) })
  const chosen = avail.filter(isOn)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const setFault = (e) => { setF({ ...f, fault: e.target.value }); setRemake(REMAKE_FAULTS.includes(e.target.value)) }
  const r2 = (n) => +(+n || 0).toFixed(2)
  // the shirts chosen from this order, one row per order line (a pasted named list has one line per person)
  const picked = (o.lines || []).map((l, i) => ({ l, i, q: Math.min(l.q, Math.max(0, parseInt(pick[i]) || 0)) })).filter((x) => x.q > 0)
  const nPicked = sum(picked, (x) => x.q)
  // a remade shirt costs fabric + printing + pressing by its size, plus sewing: the same rates the order was costed with
  const autoMat = remake ? r2(sum(picked, (x) => x.q * (sz(S, x.l.s).h / 1000) * (S.R.fabric + S.R.print + S.R.press))) : 0
  const autoLab = remake ? r2(sum(picked, (x) => x.q * S.R.sew)) : 0
  const mat = f.mat === '' ? autoMat : +f.mat || 0, lab = f.lab === '' ? autoLab : +f.lab || 0, oth = +f.oth || 0
  const est = r2(mat + lab + oth)
  const lbl = (l) => [l.s, l.colour, l.desc || 'T-shirt'].filter(Boolean).join(' · ')
  const autoWhat = picked.length ? picked.map((x) => `${x.q} × ${lbl(x.l)}`).join('; ') + ` (${f.fault.toLowerCase()})` : ''
  const what = f.what.trim() || autoWhat
  const ok = what && f.happened.trim() && f.who.trim() && (!avail.length || chosen.length > 0)
  const missing = [!what && 'what is being reworked (tick a shirt or type it)', !f.happened.trim() && '"What happened"', !f.who.trim() && 'the name of who is responsible', avail.length > 0 && !chosen.length && 'at least one rework stage'].filter(Boolean)
  const after = base - est
  const togglePick = (i, l) => setPick((p) => ({ ...p, [i]: p[i] ? 0 : 1 }))
  return (
    <div className="ps-form ps-form-w">
      <div className="ps-form-h">{fail ? 'Fail inspection and raise rework' : 'Report rework needed'}</div>
      <div className="sub" style={{ marginBottom: 10 }}>Found at: <b>{s.k}</b>. Every field is required so the cost and the cause are on record.</div>
      <div className="ps-row">
        <Field label="What went wrong"><select value={f.fault} onChange={setFault}>{FAULTS.map((x) => <option key={x}>{x}</option>)}</select></Field>
      </div>
      <div style={{ margin: '10px 0' }}>
        <div className="sub" style={{ marginBottom: 6 }}>Tick the shirts affected (size, colour and name come from the order){nPicked ? ` · ${nPicked} selected` : ''}</div>
        <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--line, #e5e7eb)', borderRadius: 8 }}>
          {(o.lines || []).map((l, i) => { const on = !!(+pick[i] > 0); return (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderBottom: '1px solid var(--line, #eee)', cursor: 'pointer' }}>
              <input type="checkbox" checked={on} onChange={() => togglePick(i, l)} style={chk} />
              <span style={{ flex: 1 }}>{lbl(l)}</span>
              {l.q > 1 && <span className="sub" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Qty <input type="number" min="0" max={l.q} value={on ? pick[i] : 0} disabled={!on} style={{ width: 64, minHeight: 34, margin: 0 }} onChange={(e) => setPick({ ...pick, [i]: Math.min(l.q, Math.max(0, parseInt(e.target.value) || 0)) })} /> of {l.q}</span>}
            </label>) })}
        </div>
      </div>
      {avail.length > 0 && (
        <div style={{ margin: '10px 0' }}>
          <div className="sub" style={{ marginBottom: 6 }}>Rework stages: same order as production, each one is approved separately. Untick any stage this rework does not need.</div>
          <div className="rw-pick">{avail.map((k) => <label key={k} className="rw-pick-i"><input type="checkbox" checked={isOn(k)} onChange={() => toggleStep(k)} style={chk} /><span>{k}</span></label>)}</div>
        </div>
      )}
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '6px 0 10px' }}><input type="checkbox" checked={remake} onChange={(e) => setRemake(e.target.checked)} style={chk} /> Remake the shirt(s) from scratch: cost them at full production cost</label>
      <div className="ps-row">
        <Field label="What is being reworked" wide><input value={f.what} onChange={set('what')} placeholder={autoWhat || 'e.g. 12 size L shirts with crooked front print'} /></Field>
        {!picked.length && <Field label="Shirts affected"><input type="number" min="0" value={f.qty} onChange={set('qty')} /></Field>}
      </div>
      <Field label="What happened" wide><textarea value={f.happened} onChange={set('happened')} placeholder="Describe the defect and how it came about" /></Field>
      <div className="ps-row">
        <Field label="Responsibility lies with"><select value={f.whoType} onChange={set('whoType')}>{RESP_TYPES.map((r) => <option key={r}>{r}</option>)}</select></Field>
        <Field label="Name of person or party responsible"><input value={f.who} onChange={set('who')} placeholder="e.g. Thabo, Press operator" /></Field>
      </div>
      <div className="ps-row ps-cost">
        <Field label="Extra material, P"><input type="number" min="0" step="any" value={f.mat !== '' ? f.mat : autoMat ? autoMat.toFixed(2) : ''} onChange={set('mat')} /></Field>
        <Field label="Extra labour, P"><input type="number" min="0" step="any" value={f.lab !== '' ? f.lab : autoLab ? autoLab.toFixed(2) : ''} onChange={set('lab')} /></Field>
        <Field label="Other costs, P"><input type="number" min="0" step="any" value={f.oth} onChange={set('oth')} /></Field>
        <div className="ps-est"><span className="sub">Rework cost to the company</span><b>{f2(est)}</b></div>
      </div>
      {remake && picked.length > 0 && <div className="sub" style={{ margin: '6px 0' }}>Material and labour are filled in from the order's rates (fabric, printing, pressing and sewing by size). You can type over them.</div>}
      <div className={'note' + (after < 0 ? ' w' : '')}>
        Profit on this order moves from <b>{f2(base)}</b> to <b>{f2(after)}</b>{net > 0 ? ` (margin ${pc(base / net)} to ${pc(after / net)})` : ''}.
      </div>
      {!ok && <div className="note w">Still needed before you can raise this: {missing.join(', ')}.</div>}
      <button className="btn ps-warn" disabled={!ok} onClick={() => onSubmit({ ...f, what, qty: nPicked || f.qty, mat, lab, oth, remake, steps: chosen, items: picked.map((x) => ({ s: x.l.s, colour: x.l.colour || '', desc: x.l.desc || '', q: x.q })), fail })}>{fail ? 'Fail inspection and raise rework' : 'Raise rework'}</button>
    </div>
  )
}

function SkipForm({ onSubmit }) {
  const [note, setNote] = useState('')
  return (
    <div className="ps-form">
      <div className="ps-form-h">Skip this stage</div>
      <Field label="Reason for skipping (required)" wide><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Customer supplied pre-printed fabric" /></Field>
      <button className="btn o" disabled={!note.trim()} onClick={() => onSubmit(note)}>Skip stage</button>
    </div>
  )
}

function ReopenForm({ s, blockedBy, onSubmit }) {
  const [why, setWhy] = useState('')
  return (
    <div className="ps-form">
      <div className="ps-form-h">Change this approved stage</div>
      {blockedBy ? <div className="note w">{blockedBy}</div> : (
        <>
          <div className="sub">Reopens <b>{s.k}</b> so it can be corrected and approved again. The earlier approval stays in the activity log.</div>
          <Field label="Reason for reopening (required)" wide><input value={why} onChange={(e) => setWhy(e.target.value)} placeholder="e.g. Count was wrong, one shirt was missing" /></Field>
          <button className="btn ps-warn" disabled={!why.trim()} onClick={() => onSubmit(why)}>Reopen stage</button>
        </>
      )}
    </div>
  )
}

function Step({ s, i, n, last, o, c, open, setOpen, base, act }) {
  const { S } = useApp()
  const [mode, setMode] = useState(null)
  const qc = s.k === STAGES[4], fin = s.k === STAGES[6], locked = s.st === 'pending' && stageBlocked(o, i)
  const hasOpenRework = (o.stages || []).some((x) => x.rw && x.rw.from === s.k && !isDone(x))
  const cls = s.rw ? 'rework' : s.st
  const defMode = s.st === 'active' ? 'approve' : null
  const m = mode || defMode
  const badge = s.st === 'done' ? '✓' : s.st === 'skipped' ? '–' : s.rw ? '!' : n
  const blocked = fin && c.bal > 0.005 ? `The balance of ${f2(c.bal)} must be received before this stage can be approved.` : hasOpenRework ? 'Finish and approve the open rework on this stage first.' : ''
  return (
    <div className={'ps-step ' + cls + (open ? ' open' : '')}>
      <div className="ps-rail"><div className="ps-badge">{badge}</div>{!last && <div className="ps-line" />}</div>
      <div className="ps-card">
        <button className="ps-head" aria-expanded={open} onClick={() => setOpen(open ? null : s.k)}>
          <span className="ps-title">
            <b>{s.k}</b>
            <span className="sub">{s.rw ? `Rework for: ${s.rw.what}` : DESC[s.k]}</span>
          </span>
          <span className="ps-tags">
            {s.fails ? <span className="tag a">Failed {s.fails}×</span> : null}
            {s.result === 'Pass' && <span className="tag g">Passed</span>}
            {s.rw?.steps?.length ? <span className="tag">{s.rw.steps.filter((x) => x.st === 'done').length}/{s.rw.steps.length} stages</span> : null}
            <span className={'tag ' + (s.rw && s.st === 'active' ? 'a' : TAG[s.st])}>{LABEL[s.st]}</span>
          </span>
        </button>
        <div className="ps-meta">
          <div><span>By</span>{s.by || '–'}</div>
          <div><span>Started</span>{when(s.start)}</div>
          <div><span>Finished</span>{when(s.end)}</div>
          <div><span>Duration</span>{span(s.start, s.end) || '–'}</div>
        </div>
        {s.appr && <div className="ps-appr"><b>{s.st === 'skipped' ? 'Skipped' : 'Approved'} by {s.appr.by}</b> · {when(s.appr.at)}{s.appr.note ? <div className="sub">{s.appr.note}</div> : null}</div>}
        {open && !o.closed && (
          <div className="ps-body">
            {s.st === 'pending' && (locked
              ? <div className="note">Locked until the previous stage is approved.</div>
              : <div className="chips"><button className="btn" disabled={qc && (o.stages || []).some((x) => x.rw && !isDone(x))} onClick={() => act(s.k, 'start')}>Start stage</button>
                {!qc && !fin && <button className="btn o" onClick={() => setMode(mode === 'skip' ? null : 'skip')}>Skip</button>}</div>)}
            {s.st === 'pending' && !locked && m === 'skip' && <SkipForm onSubmit={(note) => { act(s.k, 'skip', { note }); setMode(null) }} />}
            {s.st === 'active' && (
              <>
                {!s.rw && <div className="ps-tabs" role="tablist">
                  <button role="tab" aria-selected={m === 'approve'} className={m === 'approve' ? 'on' : ''} onClick={() => setMode('approve')}>{qc ? 'Pass inspection' : 'Approve'}</button>
                  <button role="tab" aria-selected={m === 'rework'} className={m === 'rework' ? 'on warn' : 'warn'} onClick={() => setMode('rework')}>{qc ? 'Fail and raise rework' : 'Report rework'}</button>
                </div>}
                {(m === 'approve' || s.rw) && !s.rw?.steps?.length && <ApproveForm key={s.k + 'a'} s={s} pass={qc} blocked={blocked} onSubmit={({ approver, note, actual }) => (s.rw ? act(s.k, 'reworkDone', { approver, note, actual }) : act(s.k, qc ? 'pass' : 'done', { approver, note }))} />}
                {m === 'rework' && !s.rw && <ReworkForm key={s.k + 'r'} s={s} fail={qc} o={o} base={base} net={c.net} onSubmit={(f) => { act(s.k, 'rework', f); setMode(null) }} />}
              </>
            )}
            {s.st === 'done' && !s.rw && (
              <div className="chips">
                {!qc && <button className="btn o" onClick={() => setMode(mode === 'rework' ? null : 'rework')}>Report rework on this stage</button>}
                <button className="btn o" onClick={() => setMode(mode === 'reopen' ? null : 'reopen')}>Change this approved stage</button>
              </div>
            )}
            {s.st === 'done' && !s.rw && !qc && m === 'rework' && <ReworkForm key={s.k + 'r2'} s={s} fail={false} o={o} base={base} net={c.net} onSubmit={(f) => { act(s.k, 'rework', f); setMode(null) }} />}
            {s.st === 'done' && !s.rw && m === 'reopen' && <ReopenForm key={s.k + 'o'} s={s} blockedBy={(o.stages || []).slice(i + 1).some((x) => x.st !== 'pending') ? 'A later stage has already started, so this stage cannot be reopened. Use Report rework on this stage instead.' : ''} onSubmit={(reason) => { act(s.k, 'reopen', { reason }); setMode(null) }} />}
            {s.rw && s.rw.steps?.length > 0 && <RwSteps s={s} act={act} />}
            {s.rw && s.st === 'active' && !s.rw.steps?.length && <div className="chips" style={{ marginTop: 10 }}><button className="btn o" onClick={() => act(s.k, 'rwPlan')}>Track this rework by stage</button></div>}
            {s.rw && <RwDetail rw={s.rw} />}
          </div>
        )}
      </div>
    </div>
  )
}

function RwStepForm({ p, s, last, spent, act }) {
  const { S } = useApp()
  const guide = GUIDE[p.k] || []
  const [ticks, setTicks] = useState([]), [by, setBy] = useState(S.user), [note, setNote] = useState(''), [cost, setCost] = useState(''), [actual, setActual] = useState(null)
  const own = cost === '' ? 0 : +cost || 0, total = +(spent + own).toFixed(2)
  const actualVal = actual === null ? (total > 0 ? total.toFixed(2) : String(s.rw.est)) : actual
  const costOk = cost === '' || (Number.isFinite(+cost) && +cost >= 0)
  const ready = guide.every((_, i) => ticks[i]) && by.trim() && costOk && (!last || (actualVal !== '' && +actualVal >= 0))
  return (
    <div className="ps-form">
      <div className="ps-form-h">{last ? 'Approve final stage and complete rework' : 'Approve this rework stage'}</div>
      <div className="ps-checks">
        {guide.map((g, i) => <label key={g} className="ps-check"><input type="checkbox" checked={!!ticks[i]} onChange={(e) => setTicks(guide.map((_, j) => (j === i ? e.target.checked : !!ticks[j])))} /><span>{g}</span></label>)}
      </div>
      <div className="ps-row">
        <Field label="Approved by"><input value={by} onChange={(e) => setBy(e.target.value)} /></Field>
        <Field label="Cost of this stage, P (optional)"><input type="number" min="0" step="any" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
        {last && <Field label={`Actual total rework cost, P (estimate ${f2(s.rw.est)})`}><input type="number" min="0" step="any" value={actualVal} onChange={(e) => setActual(e.target.value)} /></Field>}
      </div>
      <Field label="Notes (optional)" wide><textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <button className="btn ps-ok" disabled={!ready} onClick={() => act(s.k, 'rwStep', { sub: 'done', step: p.k, approver: by, note, cost, actual: actualVal })}>{last ? 'Approve and complete rework' : 'Approve stage'}</button>
      {!ready && <span className="sub"> Tick every check to approve.</span>}
    </div>
  )
}

function RwSteps({ s, act }) {
  const steps = s.rw.steps, doneN = steps.filter((x) => x.st === 'done').length
  return (
    <div className="rw-steps">
      <div className="rw-prog"><b>{doneN} of {steps.length} rework stages approved</b><div className="progress"><i style={{ width: (doneN / steps.length) * 100 + '%' }} /></div></div>
      {steps.map((p, i) => {
        const prevDone = steps.slice(0, i).every((x) => x.st === 'done'), last = i === steps.length - 1
        const spent = sum(steps.slice(0, i), (x) => +x.cost || 0)
        return (
          <div key={p.k} className={'rw-step ' + p.st}>
            <div className="rw-b">{p.st === 'done' ? '✓' : i + 1}</div>
            <div className="rw-main">
              <div className="rw-h"><b>{p.k}</b><span className={'tag ' + (p.st === 'done' ? 'g' : p.st === 'active' ? 'a' : '')}>{p.st === 'done' ? 'Approved' : p.st === 'active' ? 'In progress' : 'Not started'}</span></div>
              {p.start && <div className="sub">By {p.by || '–'} · Started {when(p.start)}{p.end ? ` · Finished ${when(p.end)} · ${span(p.start, p.end) || '< 1 min'}` : ''}</div>}
              {p.appr && <div className="sub"><b>Approved by {p.appr.by}</b>{p.cost !== undefined ? ` · cost ${f2(p.cost)}` : ''}{p.appr.note ? ` · ${p.appr.note}` : ''}</div>}
              {p.st === 'pending' && !prevDone && <div className="sub">Locked until the previous rework stage is approved.</div>}
              {p.st === 'pending' && prevDone && s.st === 'active' && <div className="chips" style={{ marginTop: 6 }}><button className="btn" onClick={() => act(s.k, 'rwStep', { sub: 'start', step: p.k })}>Start stage</button></div>}
              {p.st === 'active' && s.st === 'active' && <RwStepForm key={p.k} p={p} s={s} last={last} spent={spent} act={act} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RwDetail({ rw }) {
  return (
    <dl className="ps-dl">
      <div><dt>What is being reworked</dt><dd>{rw.fault ? <span className="tag a">{rw.fault}</span> : null} {rw.what}{rw.qty ? ` · ${rw.qty} shirt${rw.qty > 1 ? 's' : ''}` : ''}</dd></div>
      {rw.items?.length > 0 && <div><dt>Shirts</dt><dd>{rw.items.map((x, i) => <div key={i}>{x.q} × {[x.s, x.colour, x.desc || 'T-shirt'].filter(Boolean).join(' · ')}</div>)}</dd></div>}
      <div><dt>What happened</dt><dd>{rw.happened}</dd></div>
      <div><dt>Responsible</dt><dd>{rw.who} <span className="tag a">{rw.whoType}</span></dd></div>
      <div><dt>Cost</dt><dd>Material {f2(rw.mat)} · Labour {f2(rw.lab)} · Other {f2(rw.oth)} = <b>{f2(rw.est)}</b>{rw.act !== undefined && rw.act !== rw.est ? <> · actual <b>{f2(rw.act)}</b></> : null}</dd></div>
      <div><dt>Raised</dt><dd>{rw.raisedBy} · {when(rw.raisedAt)}</dd></div>
    </dl>
  )
}

export function ProductionStages() {
  const { jc } = useParams(), { S, dispatch } = useApp()
  const o = S.orders.find((x) => x.jc === decodeURIComponent(jc))
  const [openKey, setOpenKey] = useState(undefined)
  if (!o) return (<><h1>Job card not found</h1><Link href="/orders">Back to orders</Link></>)
  const c = calc(S, o), st = o.stages && o.stages.length ? o.stages : mkStages(), rws = reworksOf(o), rwCost = reworkCost(o)
  const extra = sum((S.finance || []).filter((x) => x.ref === o.jc), (x) => +x.amount || 0), other = extra - rwCost
  const planned = c.gp, projected = c.gp - extra
  const prog = progress({ stages: st }), approved = st.filter((s) => s.st === 'done' && !s.rw).length, total = st.filter((s) => !s.rw).length
  const p = phase(S, o), cur = st.find((s) => !isDone(s)), shown = openKey === undefined ? (cur && cur.k) : openKey
  const act = (k, op, x = {}) => { setOpenKey(undefined); dispatch({ type: ['rework', 'reworkDone', 'reopen', 'rwStep', 'rwPlan'].includes(op) ? op : 'stage', jc: o.jc, k, op, ...x, ...(op === 'reworkDone' ? { actual: x.actual } : {}) }) }
  const trail = S.audit.filter((a) => a.o === o.jc).slice(0, 8)
  const byType = RESP_TYPES.map((t) => [t, sum(rws.filter((s) => s.rw.whoType === t), (s) => +(s.rw.act ?? s.rw.est) || 0)]).filter(([, v]) => v > 0)
  const maxT = Math.max(...byType.map(([, v]) => v), 1)

  return (
    <>
      <div className="ps-crumb"><Link href="/orders">Orders</Link><span>/</span><Link href={'/orders/' + o.jc}>{o.jc}</Link><span>/</span><b>Production stages</b></div>
      <div className="ps-hero">
        <div>
          <h1>Production stages</h1>
          <div className="ps-sub">{o.ent} · {c.q} shirts · Due {o.dueDate ? fd(o.dueDate) : 'not set'}</div>
          <div className="chips" style={{ marginTop: 10 }}><span className="tag b">{o.jc}</span><span className={'tag ' + phaseTag(p)}>{p}</span>{overdue(o) && <span className="tag a">Overdue</span>}</div>
        </div>
        <div className="chips ps-actions">
          <label className="ps-user">Signed in as<select value={S.user} onChange={(e) => dispatch({ type: 'user', user: e.target.value })}><option>Staff 1</option><option>Staff 2</option></select></label>
          <Link className="btn o ps-lnk" href={'/orders/' + o.jc}>Job card</Link>
          <button className="btn o" onClick={() => window.print()}>Print</button>
        </div>
      </div>

      {!o.prod ? (
        <div className="card"><div className="note w">Stages unlock once the required payment is recorded and the order is moved to production.</div>
          <Link className="btn ps-lnk" href={'/orders/' + o.jc}>Go to job card</Link></div>
      ) : (
        <>
          <div className="ps-kpis">
            <div className="ps-kpi"><span>Progress</span><strong>{prog}%</strong><div className="progress"><i style={{ width: prog + '%' }} /></div></div>
            <div className="ps-kpi"><span>Stages approved</span><strong>{approved}<small> / {total}</small></strong></div>
            <div className="ps-kpi"><span>Rework incidents</span><strong className={rws.length ? 'danger' : ''}>{rws.length}</strong></div>
            <div className="ps-kpi"><span>Rework cost</span><strong className={rwCost ? 'danger' : ''}>{f2(rwCost)}</strong></div>
            <div className="ps-kpi"><span>Projected profit</span><strong className={projected < 0 ? 'danger' : 'good'}>{f2(projected)}</strong></div>
          </div>
          {o.closed && <div className="note">Order closed {when(o.closed.at)}. Revenue {f2(o.closed.revenue)}, total cost {f2(o.closed.cost)}, actual profit {f2(o.closed.profit)} ({o.closed.revenue ? pc(o.closed.profit / o.closed.revenue) : '–'}).</div>}
          <div className="ps-layout">
            <div className="ps-timeline">
              {st.map((s, i) => <Step key={s.k} s={s} i={i} n={st.slice(0, i + 1).filter((x) => !x.rw).length} last={i === st.length - 1} o={{ ...o, stages: st }} c={c} open={shown === s.k} setOpen={setOpenKey} base={projected} act={act} />)}
              {!o.closed && (
                <div className="ps-close card">
                  <div><b>Close order and calculate profit</b><div className="sub">{!st.every(isDone) ? 'Approve every stage first.' : c.bal > 0.005 ? `Balance of ${f2(c.bal)} still to be received.` : 'All stages approved and paid. Ready to close.'}</div></div>
                  <button className="btn" disabled={!st.every(isDone) || c.bal > 0.005} onClick={() => dispatch({ type: 'close', jc: o.jc })}>Close order</button>
                </div>
              )}
            </div>
            <aside className="ps-side">
              <section className="card">
                <h2>Cost impact</h2>
                <div className="tot"><span>Net order value</span><span>{f2(c.net)}</span></div>
                <div className="tot"><span>Planned production cost</span><span>{f2(c.cs)}</span></div>
                <div className="tot"><span>Planned profit</span><span>{f2(planned)}</span></div>
                <div className="tot"><span className="danger">Rework cost</span><span className="danger">−{f2(rwCost)}</span></div>
                {other > 0.005 && <div className="tot"><span>Other extra costs</span><span>−{f2(other)}</span></div>}
                <div className="tot big"><span>Projected profit</span><span className={projected < 0 ? 'danger' : ''}>{f2(projected)}</span></div>
                {c.net > 0 && <div className="sub">Margin {pc(planned / c.net)} planned, {pc(projected / c.net)} projected.</div>}
              </section>
              <section className="card">
                <h2>Rework register</h2>
                {!rws.length ? <div className="empty-state">No rework raised on this order.</div> : (
                  <div className="ps-rwl">
                    {rws.map((x) => { const rw = x.rw, rs = x.st; return (
                      <div key={rw.id} className="ps-rwi">
                        <div className="ps-rwh"><b>{rw.id}</b><span className={'tag ' + (rs === 'done' ? 'g' : 'a')}>{rs === 'done' ? 'Resolved' : 'Open'}</span></div>
                        <div>{rw.fault ? <b>{rw.fault}: </b> : null}{rw.what}</div>
                        <div className="sub">{rw.found}: {rw.happened}</div>
                        {rw.steps?.length ? <div className="sub">{rw.steps.filter((y) => y.st === 'done').length} of {rw.steps.length} rework stages approved</div> : null}
                        <div className="ps-rwf"><span>{rw.who} · {rw.whoType}</span><b>{f2(rw.act ?? rw.est)}</b></div>
                      </div>
                    ) })}
                    {byType.length > 0 && <div className="ps-by"><div className="sub">Rework cost by cause</div>{byType.map(([t, v]) => <div key={t} className="ps-bar"><span>{t}</span><i style={{ width: (v / maxT) * 100 + '%' }} /><b>{f2(v)}</b></div>)}</div>}
                  </div>
                )}
              </section>
              <section className="card">
                <h2>Activity</h2>
                <div className="log">{trail.map((a, i) => <div key={i}>{a.t}<span>{a.ts} · {a.u}</span></div>)}</div>
              </section>
            </aside>
          </div>
        </>
      )}
    </>
  )
}
