// Workspace vocabulary (set by the industry template or in Settings): the words used for initiatives, stakeholders and
// organizations. Labels only — routes, APIs and data stay the same for every industry.
import { useWorkspace } from '../api/hooks'

export interface Vocabulary { initiative: string; stakeholder: string; organization: string }
export const DEFAULT_VOCABULARY: Vocabulary = { initiative: 'Initiative', stakeholder: 'Stakeholder', organization: 'Organization' }

const plural = (w: string) => (/(s|x|ch|sh)$/i.test(w) ? `${w}es` : /[^aeiou]y$/i.test(w) ? `${w.slice(0, -1)}ies` : `${w}s`)

export function useVocabulary() {
  const w = useWorkspace()
  const v = { ...DEFAULT_VOCABULARY, ...((w.data?.settings as { vocabulary?: Partial<Vocabulary> } | undefined)?.vocabulary ?? {}) }
  return {
    ...v,
    initiatives: plural(v.initiative), stakeholders: plural(v.stakeholder), organizations: plural(v.organization),
    lower: (k: keyof Vocabulary, many = false) => (many ? plural(v[k]) : v[k]).toLowerCase(),
  }
}
