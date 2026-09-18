export const medFlowRedesignPreviewStates = [
  'default',
  'typing',
  'completed',
  'error',
  'submitting',
  'success',
  'server',
  'duplicate'
] as const

export type MedFlowRedesignPreviewState = (typeof medFlowRedesignPreviewStates)[number]

export const medFlowRedesignPreviewResults = ['success', 'server', 'duplicate'] as const

export type MedFlowRedesignPreviewResult = (typeof medFlowRedesignPreviewResults)[number]

const firstValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

export const resolveMedFlowRedesignState = (
  value: string | string[] | undefined
): MedFlowRedesignPreviewState => {
  const candidate = firstValue(value)
  return medFlowRedesignPreviewStates.includes(candidate as MedFlowRedesignPreviewState)
    ? (candidate as MedFlowRedesignPreviewState)
    : 'default'
}

export const resolveMedFlowRedesignResult = (
  value: string | string[] | undefined
): MedFlowRedesignPreviewResult => {
  const candidate = firstValue(value)
  return medFlowRedesignPreviewResults.includes(candidate as MedFlowRedesignPreviewResult)
    ? (candidate as MedFlowRedesignPreviewResult)
    : 'success'
}
