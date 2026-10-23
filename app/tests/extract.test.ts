// Local rules engine: regressions for defects found by the evaluation runs and visual QA.
import { describe, expect, test } from 'vitest'
import { localExtract, parseDeadline } from '../server/ai/local/extract'

const run = (notes: string, extra: Partial<Parameters<typeof localExtract>[0]> = {}) =>
  localExtract({ notes, meetingDate: '2026-10-21', participants: [], members: [], knownPeople: [], ...extra })

describe('local extraction', () => {
  test('first names never match people outside the meeting', () => {
    const r = run('Bea Ellwood confirmed the council will not oppose the alignment. Later Bea agreed that the eastern option is withdrawn.', {
      participants: [{ name: 'Bea Ellwood' }], knownPeople: [{ name: 'Bea Lowe' }, { name: 'Bea Varga' }],
    })
    expect(r.people_mentioned).toEqual(['Bea Ellwood'])
    expect(r.decisions.flatMap(d => d.people)).not.toContain('Bea Lowe')
  })
  test("transcript speakers own their first-person promises, including I'll", () => {
    const r = run('Daniel Ross: Yes, I\'ll send you a letter confirming the delivery windows by Monday.', { members: [{ name: 'Daniel Ross' }] })
    expect(r.commitments).toHaveLength(1)
    expect(r.commitments[0]).toMatchObject({ owner_name: 'Daniel Ross', owner_side: 'ours', due_date: '2026-10-26' })
  })
  test('refusals and inability are not obligations', () => {
    const r = run('Daniel Ross: Those still need to be verified, so I can\'t promise a date yet.')
    expect([...r.commitments, ...r.actions]).toHaveLength(0)
  })
  test('"agreed that the X will be …" is a decision, not a promise', () => {
    const r = run('It was agreed that the fund will be administered by the community council.')
    expect(r.decisions).toHaveLength(1)
    expect(r.commitments).toHaveLength(0)
  })
  test('group subjects are captured with the speaker as contact', () => {
    const r = run('Ifan said the landowners will confirm access arrangements next week.')
    expect(r.commitments[0]).toMatchObject({ owner_name: 'Ifan', due_date: null })
  })
  test('cancellations are decisions; hedges are not commitments', () => {
    expect(run('The site visit planned for April has been cancelled.').decisions).toHaveLength(1)
    expect(run('We might consider extending the fund to neighbouring villages.').commitments).toHaveLength(0)
  })
  test('deadlines: weekday resolves, dd/mm stays ambiguous', () => {
    expect(parseDeadline('by Friday', '2026-10-21')).toMatchObject({ date: '2026-10-23', ambiguous: false })
    expect(parseDeadline('by 03/07', '2026-10-21')).toMatchObject({ date: null, ambiguous: true })
  })
})
