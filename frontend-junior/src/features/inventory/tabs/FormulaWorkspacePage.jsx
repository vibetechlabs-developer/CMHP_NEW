import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'

import Alert from '../../../components/Alert'
import { LoadingState } from '../../../components/Spinner'
import { getErrorMessage } from '../../../utils/errors'
import FormulasPage from '../../formulas/FormulasPage'
import { getProduct } from '../../products/productsService'
import './CommonInventory.css'
import './StockLedger.css'

export default function FormulaWorkspacePage({ companyId: propCompanyId, productId: propProductId }) {
  const params = useParams()
  const location = useLocation()
  const companyId = Number(propCompanyId ?? params.companyId)
  const productId = Number(propProductId ?? params.productId)
  const backTo = location.pathname.startsWith('/inventory') ? '/inventory/products' : '/products'

  const [state, setState] = useState({ status: 'loading', product: null, error: '' })
  const requestRef = useRef(0)

  useEffect(() => {
    if (!companyId || !productId) return
    const requestId = ++requestRef.current
    setState({ status: 'loading', product: null, error: '' })
    getProduct(companyId, productId)
      .then((product) => {
        if (requestRef.current !== requestId) return
        setState({ status: 'ready', product, error: '' })
      })
      .catch((err) => {
        if (requestRef.current !== requestId) return
        const status = err?.response?.status
        setState({
          status: status === 404 ? 'not-found' : 'error',
          product: null,
          error: status === 404 ? 'This product does not exist, or is not visible to your account.' : getErrorMessage(err),
        })
      })
  }, [companyId, productId])

  return (
    <div className="ci-container">
      {state.status === 'loading' && <LoadingState label="Loading product…" compact />}
      {(state.status === 'error' || state.status === 'not-found') && <Alert type="error">{state.error}</Alert>}
      {state.status === 'ready' && (
        <FormulasPage
          companyId={companyId}
          productId={productId}
          product={state.product}
          backTo={backTo}
        />
      )}
    </div>
  )
}

