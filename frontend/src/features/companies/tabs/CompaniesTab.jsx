import { useEffect, useState } from 'react'

import { companyService } from '../companyService'


export default function CompaniesTab() {

  const [
    companies,
    setCompanies,
  ] = useState([])


  const [
    loading,
    setLoading,
  ] = useState(true)


  const [
    error,
    setError,
  ] = useState('')


  const load = async () => {

    try {

      setLoading(true)

      const response =
        await companyService.getCompanies()

      setCompanies(
        response.data || []
      )

      setError('')

    } catch (err) {

      setError(
        err?.message ||
        'Unable to load companies.'
      )

    } finally {

      setLoading(false)

    }
  }


  useEffect(() => {
    load()
  }, [])


  return (
    <section className="company-panel">

      <div
        style={{
          padding: '22px 24px',
          borderBottom:
            '1px solid #e5edf1',
        }}
      >

        <h2
          style={{
            margin: 0,
            color: '#193d5a',
            fontSize: '17px',
          }}
        >
          Company Master
        </h2>

        <p
          style={{
            margin: '6px 0 0',
            color: '#8194a2',
            fontSize: '11px',
          }}
        >
          The ERP is configured with two fixed
          legal entities: Company A and Company B.
        </p>

      </div>


      {error && (
        <div
          style={{
            margin: '16px 20px',
            padding: '11px 14px',
            color: '#a52d2d',
            background: '#fff1f1',
            border:
              '1px solid #f1d0d0',
            borderRadius: '8px',
            fontSize: '11px',
          }}
        >
          {error}
        </div>
      )}


      <div
        style={{
          padding: '20px',
          display: 'grid',
          gridTemplateColumns:
            'repeat(2, minmax(0, 1fr))',
          gap: '16px',
        }}
      >

        {loading ? (

          <div
            style={{
              color: '#8396a4',
              fontSize: '12px',
            }}
          >
            Loading companies...
          </div>

        ) : companies.length === 0 ? (

          <div
            style={{
              color: '#8396a4',
              fontSize: '12px',
            }}
          >
            No companies found.
          </div>

        ) : (

          companies.map(
            (company) => (

              <div
                key={company.id}
                style={{
                  padding: '20px',
                  border:
                    '1px solid #dce7ee',
                  borderRadius: '13px',
                  background:
                    'linear-gradient(145deg,#ffffff,#f8fbfd)',
                }}
              >

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent:
                      'space-between',
                    gap: '10px',
                  }}
                >

                  <div>

                    <div
                      style={{
                        color: '#183b55',
                        fontSize: '15px',
                        fontWeight: 800,
                      }}
                    >
                      {company.name}
                    </div>

                    <div
                      style={{
                        marginTop: '6px',
                        color: '#6d8291',
                        fontSize: '10px',
                      }}
                    >
                      Code: {company.code}
                    </div>

                  </div>


                  <span
                    style={{
                      padding:
                        '5px 9px',
                      borderRadius:
                        '999px',
                      color:
                        '#147154',
                      background:
                        '#ecfaf4',
                      border:
                        '1px solid #cfeee1',
                      fontSize:
                        '9px',
                      fontWeight:
                        800,
                    }}
                  >
                    ACTIVE
                  </span>

                </div>


                <div
                  style={{
                    marginTop: '16px',
                    paddingTop: '14px',
                    borderTop:
                      '1px solid #e8eef2',
                    color: '#8799a6',
                    fontSize: '10px',
                  }}
                >
                  This company is a fixed ERP
                  master and cannot be deleted.
                </div>

              </div>

            )
          )

        )}

      </div>

    </section>
  )
}