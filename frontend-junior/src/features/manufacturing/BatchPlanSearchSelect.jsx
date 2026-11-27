import { useCallback } from 'react'
import AsyncSearchSelect from '../operations/AsyncSearchSelect'
import { listBatchPlans } from './batchPlansService'

const planLabel = (plan) => plan.official_batch_number || `Plan #${plan.id}`
const planDetails = (plan) => [plan.product_name || plan.product_code, plan.source_order_reference].filter(Boolean).join(' · ')

export default function BatchPlanSearchSelect({ companyId, disabled, ...props }) {
  const fetchOptions = useCallback(async (term) => {
    if (!companyId) return []
    const { results } = await listBatchPlans(Number(companyId), { search: term.trim(), page_size: 20 })
    return results || []
  }, [companyId])

  return (
    <AsyncSearchSelect
      key={companyId}
      fetchOptions={fetchOptions}
      getOptionLabel={planLabel}
      getOptionMeta={planDetails}
      placeholder="Search batch number, product or order"
      disabled={disabled || !companyId}
      {...props}
    />
  )
}
