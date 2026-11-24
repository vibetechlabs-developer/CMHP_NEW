import React from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../components/Button'
import './BmrForm.css'

export default function NoBmrScreen({ productType = 'this Product Type' }) {
  const navigate = useNavigate()

  return (
    <div className="bmr-no-bmr-screen" style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '70vh',
      padding: '24px',
      boxSizing: 'border-box',
    }}>
      <div className="bmr-no-bmr-card" style={{
        maxWidth: 520,
        width: '100%',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        padding: '40px 32px',
        textAlign: 'center',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
      }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          background: '#fef3c7',
          color: '#d97706',
          fontSize: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          ⚠️
        </div>
        <h2 style={{
          fontSize: 22,
          fontWeight: 800,
          color: '#0f172a',
          margin: '0 0 12px',
        }}>
          No BMR Available
        </h2>
        <p style={{
          fontSize: 15,
          color: '#64748b',
          lineHeight: 1.6,
          margin: '0 0 28px',
        }}>
          No BMR is available for {productType}. Please contact your System Admin.
        </p>
        <div style={{
          display: 'flex',
          gap: 12,
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}>
          <Button
            variant="primary"
            onClick={() => navigate('/production')}
            style={{ padding: '10px 24px', fontWeight: 700 }}
          >
            Back to Production
          </Button>
          <Button
            variant="secondary"
            onClick={() => navigate('/bmr-records')}
            style={{ padding: '10px 20px', fontWeight: 600 }}
          >
            Back to BMR List
          </Button>
        </div>
      </div>
    </div>
  )
}
