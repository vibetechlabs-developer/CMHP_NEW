import AsyncSearchSelect from '../operations/AsyncSearchSelect'
import { listMaterials } from './storeService'

const materialLabel = (material) => [material.code, material.name].filter(Boolean).join(' — ')
const materialUnit = (material) => material.base_unit?.code || material.base_unit_code || ''

async function searchActiveMaterials(search) {
  const { results } = await listMaterials({ search, isActive: true, pageSize: 20 })
  return results
}

async function searchAllMaterials(search) {
  const { results } = await listMaterials({ search, pageSize: 20 })
  return results
}

export default function MaterialSearchSelect({ includeInactive = false, ...props }) {
  return (
    <AsyncSearchSelect
      placeholder="Search material code or name"
      fetchOptions={includeInactive ? searchAllMaterials : searchActiveMaterials}
      getOptionLabel={materialLabel}
      getOptionMeta={materialUnit}
      {...props}
    />
  )
}
