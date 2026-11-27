import api from '../../api/axios'

export const finishedGoodsService = {
  async listStock(companyId, page = 1) {
    const { data } = await api.get(`/v1/companies/${companyId}/finished-goods/`, { params: { page } })
    return data
  },
  async inwardBufferStock(companyId, batchNo) {
    const { data } = await api.post(`/v1/companies/${companyId}/finished-goods/`, { batchNo })
    return data
  },
  async updateWarehouseBay(companyId, stockId, warehouseStore) {
    await api.patch(`/v1/companies/${companyId}/finished-goods/${stockId}/bay/`, { warehouseStore })
  },
  async allocateToSalesOrder(companyId, stockId, allocation) {
    const { data } = await api.post(`/v1/companies/${companyId}/finished-goods/${stockId}/allocations/`, allocation)
    return data
  },
}
