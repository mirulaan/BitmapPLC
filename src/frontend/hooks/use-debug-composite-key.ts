import { useCallback, useMemo } from 'react'

import { useOpenPLCStore } from '../store'

/**
 * Hook that returns a memoized function to build composite keys for debug variable lookups.
 * Handles both program POUs (simple `pouName:variableName` format) and function block POUs
 * (resolved to `programName:fbVariableName.variableName` using the selected FB instance context).
 *
 * Uses targeted Zustand selectors so it only re-renders when the active editor,
 * the current POU's type, or the selected FB instance changes — not on every
 * unrelated project or workspace mutation.
 */
export const useDebugCompositeKey = () => {
  const editorName = useOpenPLCStore(useCallback((s) => s.editor.meta.name, []))
  const pouType = useOpenPLCStore(
    useCallback((s) => s.project.data.pous.find((p) => p.name === s.editor.meta.name)?.pouType, []),
  )
  const fbSelectedInstance = useOpenPLCStore(useCallback((s) => s.workspace.fbSelectedInstance, []))
  const fbDebugInstances = useOpenPLCStore(useCallback((s) => s.workspace.fbDebugInstances, []))

  const fbInstanceContext = useMemo(() => {
    if (pouType !== 'function-block') return null
    const fbTypeKey = editorName.toUpperCase()
    const selectedKey = fbSelectedInstance.get(fbTypeKey)
    if (!selectedKey) return null
    const instances = fbDebugInstances.get(fbTypeKey) || []
    return instances.find((inst) => inst.key === selectedKey) || null
  }, [pouType, editorName, fbSelectedInstance, fbDebugInstances])

  const pouVariables = useOpenPLCStore(
    useCallback((s) => s.project.data.pous.find((p) => p.name === s.editor.meta.name)?.interface?.variables, []),
  )
  const externalVarNames = useMemo(() => {
    const set = new Set<string>()
    for (const v of pouVariables ?? []) {
      if (v.class === 'external') set.add(v.name.toLowerCase())
    }
    return set
  }, [pouVariables])

  const getCompositeKey = useCallback(
    (variableName: string): string => {
      if (externalVarNames.has(variableName.toLowerCase())) {
        return `Config0:${variableName}`
      }
      if (fbInstanceContext) {
        return `${fbInstanceContext.programName}:${fbInstanceContext.fbVariableName}.${variableName}`
      }
      return `${editorName}:${variableName}`
    },
    [externalVarNames, fbInstanceContext, editorName],
  )

  return getCompositeKey
}
