import React from 'react'
import SpecimenUpload from './SpecimenUpload'

export function getOilPageRenderers({
  data,
  setData,
  updateHeader,
  updateFooter,
  updatePage,
  renderHeader,
  renderFooter,
  renderYesNo,
  BmrDateField,
}) {
  // Page 1: Product Data & Attachments Checklist
  const renderPage1 = () => (
    <div className="bmr-sheet bmr-oil-sheet" key="page-1">
      {renderHeader(1)}
      <div className="bmr-body bmr-p1-body">
        <div className="bmr-section-title" style={{ textDecoration: 'underline', marginBottom: '6pt' }}>
          Product Data
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '3pt', marginBottom: '10pt', fontSize: '9pt' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ width: 22 }}>1</span>
            <span style={{ width: 230 }}>Manufacturing Date</span>
            <span style={{ width: 14 }}>:</span>
            <div style={{ width: 150 }}>
              <BmrDateField
                value={data.page1?.mfg_date || ''}
                className="bmr-line-input"
                onChange={(e) => updatePage('page1', 'mfg_date', e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ width: 22 }}>2</span>
            <span style={{ width: 230 }}>Expiry Date / Best Use Before :</span>
            <span style={{ width: 14 }}>:</span>
            <div style={{ width: 150 }}>
              <input
                className="bmr-line-input"
                style={{ width: '100%' }}
                value={data.page1?.expiry_date !== undefined ? data.page1.expiry_date : '5 YEARS'}
                onChange={(e) => updatePage('page1', 'expiry_date', e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ width: 22 }}>3</span>
            <span style={{ width: 230 }}>Batch Size</span>
            <span style={{ width: 14 }}>:</span>
            <div style={{ width: 150 }}>
              <input
                className="bmr-line-input"
                style={{ width: '100%' }}
                value={data.page1?.batch_size || ''}
                onChange={(e) => updatePage('page1', 'batch_size', e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ width: 22 }}>4</span>
            <span style={{ width: 230 }}>Date of Manufacturing Started:</span>
            <span style={{ width: 14 }}>:</span>
            <div style={{ width: 150 }}>
              <BmrDateField
                value={data.page1?.mfg_started || ''}
                className="bmr-line-input"
                onChange={(e) => updatePage('page1', 'mfg_started', e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ width: 22 }}>5</span>
            <span style={{ width: 230 }}>Date of Manufacturing Completed</span>
            <span style={{ width: 14 }}>:</span>
            <div style={{ width: 150 }}>
              <BmrDateField
                value={data.page1?.mfg_completed || ''}
                className="bmr-line-input"
                onChange={(e) => updatePage('page1', 'mfg_completed', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4pt' }}>
          <div style={{ fontWeight: 'bold', fontSize: '9.5pt' }}>Check List of Attachments</div>
          <div style={{ fontWeight: 'bold', fontSize: '9.5pt', marginRight: '8pt' }}>Marks of Compliance</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #000' }}>
          {[
            { key: 'att1', num: '1', title: 'RM requisition slip (ATTACHMENT 1)' },
            { key: 'att2', num: '2', title: 'Test request slip of bulk product (ATTACHMENT 2)' },
            { key: 'att3', num: '3', title: 'Release note of bulk product (ATTACHMENT 3)' },
            { key: 'att4', num: '4', title: 'PM requisition slip (ATTACHMENT 4)' },
            { key: 'att5', num: '5', title: 'Specimen of mono carton and label' },
            { key: 'att6', num: '6', title: 'Test request slip of Finish product (after packing) (ATTACHMENT 5)' },
            { key: 'att7', num: '7', title: 'Test report (COA) of finish Product (after packing)' },
            { key: 'att8', num: '8', title: 'QA report on inspection and release of finish product' },
            { key: 'att9', num: '9', title: 'Finish product transfer slip (ATTACHMENT 6)' },
          ].map((item, idx) => (
            <div
              key={item.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: idx < 8 ? '1px solid #000' : 'none',
                height: '19pt',
                padding: '0 8pt',
                boxSizing: 'border-box',
                fontSize: '9pt',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ width: 28 }}>{item.num}</span>
                <span>{item.title}</span>
              </div>
              <div
                style={{
                  width: '15pt',
                  height: '15pt',
                  border: '1px solid #000',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  backgroundColor: data.page1?.attachments?.[item.key] ? '#f0fdf4' : '#ffffff',
                }}
                onClick={() => {
                  const currentVal = Boolean(data.page1?.attachments?.[item.key])
                  updatePage('page1', 'attachments', {
                    ...(data.page1?.attachments || {}),
                    [item.key]: !currentVal,
                  })
                }}
              >
                {data.page1?.attachments?.[item.key] && (
                  <span style={{ fontSize: '11pt', fontWeight: 'bold', lineHeight: 1 }}>✓</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {renderFooter(1)}
    </div>
  )

  // Page 2: Checked by/Verified by & RM Dispensing Area Line Clearance (1–7)
  const renderPage2 = () => (
    <div className="bmr-sheet bmr-oil-sheet" key="page-2">
      {renderHeader(2)}
      <div className="bmr-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4pt 0 10pt', fontSize: '9pt' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <strong>Checked by/Date</strong>
              <input
                className="bmr-line-input"
                style={{ width: 140 }}
                value={data.page2?.checked_by_date || ''}
                placeholder="Sign / Date"
                onChange={(e) => updatePage('page2', 'checked_by_date', e.target.value)}
              />
            </div>
            <div style={{ fontSize: '8.5pt', color: '#334155', marginTop: 2 }}>Liquid Department In-charge</div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <strong>Verified by/Date</strong>
              <input
                className="bmr-line-input"
                style={{ width: 140 }}
                value={data.page2?.verified_by_date || ''}
                placeholder="Sign / Date"
                onChange={(e) => updatePage('page2', 'verified_by_date', e.target.value)}
              />
            </div>
            <div style={{ fontSize: '8.5pt', color: '#334155', marginTop: 2, textAlign: 'right' }}>QA</div>
          </div>
        </div>

        <div className="bmr-section-title" style={{ margin: '6pt 0 4pt' }}>
          RAW MATERIAL DISPENSING AREA LINE CLEARANCE:
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4pt 0 8pt', fontSize: '9pt' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong>PREVIOUS PRODUCT</strong>
            <span>:</span>
            <input
              className="bmr-line-input"
              style={{ width: 180 }}
              value={data.page2?.previous_product || ''}
              onChange={(e) => updatePage('page2', 'previous_product', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong>Batch No.</strong>
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page2?.previous_batch_no || ''}
              onChange={(e) => updatePage('page2', 'previous_batch_no', e.target.value)}
            />
          </div>
        </div>

        <table className="bmr-table" style={{ marginTop: 2 }}>
          <colgroup>
            <col style={{ width: 50 }} />
            <col />
            <col style={{ width: 85 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center', fontWeight: 'bold' }}>Sr. No.</th>
              <th style={{ textAlign: 'center', fontWeight: 'bold' }}>Activity</th>
              <th style={{ textAlign: 'center', fontWeight: 'bold' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              { id: 'item1', sr: '1', text: 'Dispensing booth and equipments are cleaned and are dust free' },
              { id: 'item2', sr: '2', text: 'Relevant weighing balances are calibrated.' },
              { id: 'item3', sr: '3', text: 'All types of wastages are removed from dispensing area.' },
              { id: 'item4', sr: '4', text: 'All raw materials of previous products are removed from dispensing area' },
              {
                id: 'item5',
                sr: '5',
                text: 'Containers and other equipments used for weighing and transferring the materials\nare cleaned and dried',
              },
              { id: 'item6', sr: '6', text: 'All approved labels are checked' },
              { id: 'item7', sr: '7', text: 'RM requisition sheet is filled and duly signed till this stage' },
            ].map((row) => (
              <tr key={row.id}>
                <td style={{ textAlign: 'center' }}>{row.sr}</td>
                <td style={{ whiteSpace: 'pre-line' }}>{row.text}</td>
                <td style={{ textAlign: 'center' }}>
                  {renderYesNo(data.page2?.line_clearance_p2?.[row.id] || 'Yes', (val) => {
                    updatePage('page2', 'line_clearance_p2', {
                      ...(data.page2?.line_clearance_p2 || {}),
                      [row.id]: val,
                    })
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {renderFooter(2)}
    </div>
  )

  // Page 3: RM Line Clearance (8–10) & Manufacturing Area Line Clearance (1–4)
  const renderPage3 = () => (
    <div className="bmr-sheet bmr-oil-sheet" key="page-3">
      {renderHeader(3)}
      <div className="bmr-body">
        <table className="bmr-table" style={{ marginTop: 2, marginBottom: '6pt' }}>
          <colgroup>
            <col style={{ width: 50 }} />
            <col />
            <col style={{ width: 85 }} />
          </colgroup>
          <tbody>
            <tr>
              <td style={{ textAlign: 'center' }}>8</td>
              <td>BMR is properly filled and duly signed till this stage.</td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page3?.line_clearance_p3?.item8 || 'Yes', (val) => {
                  updatePage('page3', 'line_clearance_p3', {
                    ...(data.page3?.line_clearance_p3 || {}),
                    item8: val,
                  })
                })}
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>9</td>
              <td>Status labeling of dispensing area is proper.</td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page3?.line_clearance_p3?.item9 || 'Yes', (val) => {
                  updatePage('page3', 'line_clearance_p3', {
                    ...(data.page3?.line_clearance_p3 || {}),
                    item9: val,
                  })
                })}
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>10</td>
              <td>
                Ensure temperature of dispensing area is within limit.
                <br />
                (Limit 27℃ ± 2℃ )
              </td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page3?.line_clearance_p3?.item10 || 'Yes', (val) => {
                  updatePage('page3', 'line_clearance_p3', {
                    ...(data.page3?.line_clearance_p3 || {}),
                    item10: val,
                  })
                })}
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ margin: '6pt 0 10pt', fontSize: '9pt' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span>Checked By / Date (Warehouse) :</span>
            <input
              className="bmr-line-input"
              style={{ width: 180 }}
              value={data.page3?.warehouse_checked_by_date || ''}
              onChange={(e) => updatePage('page3', 'warehouse_checked_by_date', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Verified By/Date ( QA) :</span>
            <input
              className="bmr-line-input"
              style={{ width: 180 }}
              value={data.page3?.qa_verified_by_date || ''}
              onChange={(e) => updatePage('page3', 'qa_verified_by_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title" style={{ margin: '8pt 0 4pt' }}>
          MANUFACTURING AREA LINE CLEARANCE:
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4pt 0 6pt', fontSize: '9pt' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong>Previous Product:</strong>
            <input
              className="bmr-line-input"
              style={{ width: 180 }}
              value={data.page3?.mfg_previous_product || ''}
              onChange={(e) => updatePage('page3', 'mfg_previous_product', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong>Batch No:</strong>
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page3?.mfg_previous_batch_no || ''}
              onChange={(e) => updatePage('page3', 'mfg_previous_batch_no', e.target.value)}
            />
          </div>
        </div>

        <table className="bmr-table" style={{ marginTop: 2 }}>
          <colgroup>
            <col style={{ width: 50 }} />
            <col />
            <col style={{ width: 85 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center', fontWeight: 'bold' }}>Sr. No.</th>
              <th style={{ textAlign: 'center', fontWeight: 'bold' }}>Activity</th>
              <th style={{ textAlign: 'center', fontWeight: 'bold' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              { id: 'item1', sr: '1', text: 'Previous Product left over is removed from area.' },
              { id: 'item2', sr: '2', text: 'All equipments/ machineries are properly cleaned and dried.' },
              { id: 'item3', sr: '3', text: 'All equipments / machineries are in perfect working order.' },
              { id: 'item4', sr: '4', text: 'Manufacturing area is cleaned and all types of wastage are removed from this area.' },
            ].map((row) => (
              <tr key={row.id}>
                <td style={{ textAlign: 'center' }}>{row.sr}</td>
                <td>{row.text}</td>
                <td style={{ textAlign: 'center' }}>
                  {renderYesNo(data.page3?.mfg_area_clearance_p3?.[row.id] || 'Yes', (val) => {
                    updatePage('page3', 'mfg_area_clearance_p3', {
                      ...(data.page3?.mfg_area_clearance_p3 || {}),
                      [row.id]: val,
                    })
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {renderFooter(3)}
    </div>
  )

  // Page 4: Manufacturing Line Clearance (5–6) & Oil Manufacturing Equipment
  const renderPage4 = () => (
    <div className="bmr-sheet bmr-oil-sheet" key="page-4">
      {renderHeader(4)}
      <div className="bmr-body">
        <table className="bmr-table" style={{ marginTop: 2, marginBottom: '6pt' }}>
          <colgroup>
            <col style={{ width: 50 }} />
            <col />
            <col style={{ width: 85 }} />
          </colgroup>
          <tbody>
            <tr>
              <td style={{ textAlign: 'center' }}>5</td>
              <td>BMR is properly filled and duly signed till this stage.</td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page4?.mfg_area_clearance_p4?.item5 || 'Yes', (val) => {
                  updatePage('page4', 'mfg_area_clearance_p4', {
                    ...(data.page4?.mfg_area_clearance_p4 || {}),
                    item5: val,
                  })
                })}
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>6</td>
              <td>Status labeling of manufacturing area is proper.</td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page4?.mfg_area_clearance_p4?.item6 || 'Yes', (val) => {
                  updatePage('page4', 'mfg_area_clearance_p4', {
                    ...(data.page4?.mfg_area_clearance_p4 || {}),
                    item6: val,
                  })
                })}
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4pt 0 10pt', fontSize: '9pt' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Checked By / Date (Production) :</span>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page4?.mfg_checked_by_prod_date || ''}
              onChange={(e) => updatePage('page4', 'mfg_checked_by_prod_date', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Verified by/Date (QA) :</span>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page4?.mfg_verified_by_qa_date || ''}
              onChange={(e) => updatePage('page4', 'mfg_verified_by_qa_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title" style={{ margin: '6pt 0 4pt' }}>
          OIL MANUFACTURING:
        </div>

        <table className="bmr-table" style={{ marginTop: 2 }}>
          <colgroup>
            <col style={{ width: 40 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 95 }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Sr.<br />No.</th>
              <th style={{ textAlign: 'center' }}>Equipment</th>
              <th style={{ textAlign: 'center' }}>Equipment ID</th>
              <th style={{ textAlign: 'center' }}>Date of last<br />cleaning</th>
              <th style={{ textAlign: 'center' }}>Previous product/Batch no.</th>
            </tr>
          </thead>
          <tbody>
            {(data.page4?.oil_mfg_equipments || []).map((row, idx) => (
              <tr key={idx} style={{ height: 22 }}>
                <td style={{ textAlign: 'center' }}>{row.sr || ''}</td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.name || ''}
                    onChange={(e) => {
                      const updated = [...(data.page4?.oil_mfg_equipments || [])]
                      updated[idx].name = e.target.value
                      updatePage('page4', 'oil_mfg_equipments', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.id || ''}
                    onChange={(e) => {
                      const updated = [...(data.page4?.oil_mfg_equipments || [])]
                      updated[idx].id = e.target.value
                      updatePage('page4', 'oil_mfg_equipments', updated)
                    }}
                  />
                </td>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date_cleaned || ''}
                    onChange={(e) => {
                      const updated = [...(data.page4?.oil_mfg_equipments || [])]
                      updated[idx].date_cleaned = e.target.value
                      updatePage('page4', 'oil_mfg_equipments', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.prev_batch || ''}
                    onChange={(e) => {
                      const updated = [...(data.page4?.oil_mfg_equipments || [])]
                      updated[idx].prev_batch = e.target.value
                      updatePage('page4', 'oil_mfg_equipments', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ margin: '8pt 0', fontSize: '9pt' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span>Cleaned by/ Date (Production) :</span>
            <input
              className="bmr-line-input"
              style={{ width: 180 }}
              value={data.page4?.cleaned_by_prod_date || ''}
              onChange={(e) => updatePage('page4', 'cleaned_by_prod_date', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Checked by/ Date (Production) :</span>
              <input
                className="bmr-line-input"
                style={{ width: 140 }}
                value={data.page4?.checked_by_prod_date || ''}
                onChange={(e) => updatePage('page4', 'checked_by_prod_date', e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Verified by /Date (QA) :</span>
              <input
                className="bmr-line-input"
                style={{ width: 140 }}
                value={data.page4?.verified_by_qa_date || ''}
                onChange={(e) => updatePage('page4', 'verified_by_qa_date', e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
      {renderFooter(4)}
    </div>
  )

  // Page 5: Manufacturing Process of Bulk & Release Slips
  const renderPage5 = () => (
    <div className="bmr-sheet bmr-oil-sheet" key="page-5">
      {renderHeader(5)}
      <div className="bmr-body">
        <div className="bmr-section-title" style={{ margin: '4pt 0' }}>
          MANUFACTURING PROCESS OF BULK:
        </div>

        <table className="bmr-table" style={{ marginTop: 2, marginBottom: '6pt' }}>
          <colgroup>
            <col style={{ width: 45 }} />
            <col style={{ width: 165 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 75 }} />
            <col style={{ width: 68 }} />
            <col style={{ width: 48 }} />
            <col style={{ width: 48 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Sr. No</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Process</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Equip. used</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Eq. ID</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time ( Hrs.)</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center', fontSize: '7.5pt' }}>From</th>
              <th style={{ textAlign: 'center', fontSize: '7.5pt' }}>To</th>
            </tr>
          </thead>
          <tbody>
            {(data.page5?.bulk_processes || []).map((row, idx) => (
              <tr key={idx} style={{ height: 26 }}>
                <td style={{ textAlign: 'center' }}>{row.sr}</td>
                <td style={{ whiteSpace: 'pre-line', fontSize: '8pt', lineHeight: 1.15 }}>{row.process}</td>
                <td style={{ whiteSpace: 'pre-line', fontSize: '8pt' }}>{row.equip}</td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.eq_id || ''}
                    onChange={(e) => {
                      const updated = [...(data.page5?.bulk_processes || [])]
                      updated[idx].eq_id = e.target.value
                      updatePage('page5', 'bulk_processes', updated)
                    }}
                  />
                </td>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page5?.bulk_processes || [])]
                      updated[idx].date = e.target.value
                      updatePage('page5', 'bulk_processes', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.from_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page5?.bulk_processes || [])]
                      updated[idx].from_time = e.target.value
                      updatePage('page5', 'bulk_processes', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.to_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page5?.bulk_processes || [])]
                      updated[idx].to_time = e.target.value
                      updatePage('page5', 'bulk_processes', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ fontSize: '8.5pt', lineHeight: 1.45, marginTop: '4pt' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span>Done by/Date (Production) :</span>
            <input
              className="bmr-line-input"
              style={{ width: 180 }}
              value={data.page5?.done_by_prod_date || ''}
              onChange={(e) => updatePage('page5', 'done_by_prod_date', e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Checked by/Date(Production) :</span>
              <input
                className="bmr-line-input"
                style={{ width: 140 }}
                value={data.page5?.checked_by_prod_date || ''}
                onChange={(e) => updatePage('page5', 'checked_by_prod_date', e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Verified by/Date (QA)</span>
              <input
                className="bmr-line-input"
                style={{ width: 140 }}
                value={data.page5?.verified_by_qa_date || ''}
                onChange={(e) => updatePage('page5', 'verified_by_qa_date', e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', marginBottom: 2 }}>
            <span>PROD: Test request sent to QA department on date&nbsp;</span>
            <input
              className="bmr-line-input"
              style={{ width: 85 }}
              value={data.page5?.prod_test_req_date || ''}
              onChange={(e) => updatePage('page5', 'prod_test_req_date', e.target.value)}
            />
            <span>&nbsp;for bulk sampling. Sign/Date:&nbsp;</span>
            <input
              className="bmr-line-input"
              style={{ width: 95 }}
              value={data.page5?.prod_test_req_sign || ''}
              onChange={(e) => updatePage('page5', 'prod_test_req_sign', e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', marginBottom: 2 }}>
            <span>QA: Test request sent to QC department on date&nbsp;</span>
            <input
              className="bmr-line-input"
              style={{ width: 85 }}
              value={data.page5?.qa_test_req_date || ''}
              onChange={(e) => updatePage('page5', 'qa_test_req_date', e.target.value)}
            />
            <span>&nbsp;for bulk analysis. Sign/Date:&nbsp;</span>
            <input
              className="bmr-line-input"
              style={{ width: 95 }}
              value={data.page5?.qa_test_req_sign || ''}
              onChange={(e) => updatePage('page5', 'qa_test_req_sign', e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', marginBottom: 2 }}>
            <span>QC: Bulk Release slip sent to QA on date&nbsp;</span>
            <input
              className="bmr-line-input"
              style={{ width: 85 }}
              value={data.page5?.qc_bulk_release_date || ''}
              onChange={(e) => updatePage('page5', 'qc_bulk_release_date', e.target.value)}
            />
            <span>&nbsp;Sign/Date:&nbsp;</span>
            <input
              className="bmr-line-input"
              style={{ width: 95 }}
              value={data.page5?.qc_bulk_release_sign || ''}
              onChange={(e) => updatePage('page5', 'qc_bulk_release_sign', e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
            <span>QA: Bulk Release slip sent to Production on date&nbsp;</span>
            <input
              className="bmr-line-input"
              style={{ width: 85 }}
              value={data.page5?.qa_bulk_release_date || ''}
              onChange={(e) => updatePage('page5', 'qa_bulk_release_date', e.target.value)}
            />
            <span>&nbsp;for filling. Sign/Date:&nbsp;</span>
            <input
              className="bmr-line-input"
              style={{ width: 95 }}
              value={data.page5?.qa_bulk_release_sign || ''}
              onChange={(e) => updatePage('page5', 'qa_bulk_release_sign', e.target.value)}
            />
          </div>
        </div>
      </div>
      {renderFooter(5)}
    </div>
  )

  // Page 6: Oil Filling Area Line Clearance & Liquid Oral Filling Equipment clearance header
  const renderPage6 = () => (
    <div className="bmr-sheet bmr-oil-sheet" key="page-6">
      {renderHeader(6)}
      <div className="bmr-body">
        <div className="bmr-section-title" style={{ margin: '4pt 0' }}>
          OIL FILLING AREA LINE CLEARANCE :
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3pt 0 6pt', fontSize: '9pt' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong>Previous Product :</strong>
            <input
              className="bmr-line-input"
              style={{ width: 180 }}
              value={data.page6?.filling_prev_product || ''}
              onChange={(e) => updatePage('page6', 'filling_prev_product', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong>Batch No.</strong>
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page6?.filling_prev_batch_no || ''}
              onChange={(e) => updatePage('page6', 'filling_prev_batch_no', e.target.value)}
            />
          </div>
        </div>

        <table className="bmr-table" style={{ marginTop: 2, marginBottom: '6pt' }}>
          <colgroup>
            <col style={{ width: 50 }} />
            <col />
            <col style={{ width: 85 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center', fontWeight: 'bold' }}>Sr. No.</th>
              <th style={{ textAlign: 'center', fontWeight: 'bold' }}>Activity</th>
              <th style={{ textAlign: 'center', fontWeight: 'bold' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ textAlign: 'center' }}>1</td>
              <td>Area is Cleaned.</td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page6?.filling_area_clearance?.item1 || 'Yes', (val) => {
                  updatePage('page6', 'filling_area_clearance', {
                    ...(data.page6?.filling_area_clearance || {}),
                    item1: val,
                  })
                })}
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>2</td>
              <td>Area is properly labeled.</td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page6?.filling_area_clearance?.item2 || 'Yes', (val) => {
                  updatePage('page6', 'filling_area_clearance', {
                    ...(data.page6?.filling_area_clearance || {}),
                    item2: val,
                  })
                })}
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>3</td>
              <td>Left Over of previous product removed from area.</td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page6?.filling_area_clearance?.item3 || 'Yes', (val) => {
                  updatePage('page6', 'filling_area_clearance', {
                    ...(data.page6?.filling_area_clearance || {}),
                    item3: val,
                  })
                })}
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>4</td>
              <td>BMR is properly filled and duly signed till this stage.</td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page6?.filling_area_clearance?.item4 || 'Yes', (val) => {
                  updatePage('page6', 'filling_area_clearance', {
                    ...(data.page6?.filling_area_clearance || {}),
                    item4: val,
                  })
                })}
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>5</td>
              <td>Cleaning record is filled of liquid filling line.</td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page6?.filling_area_clearance?.item5 || 'Yes', (val) => {
                  updatePage('page6', 'filling_area_clearance', {
                    ...(data.page6?.filling_area_clearance || {}),
                    item5: val,
                  })
                })}
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>6</td>
              <td>
                Temperature, % RH & Differential pressure is within limit Limits:
                <br />
                Temperature : 27℃ ± 2℃ %
                <br />
                RH 55% ± 2%
                <br />
                Differential Pressure Limit NLT&nbsp;
                <input
                  className="bmr-line-input"
                  style={{ width: 50, textAlign: 'center' }}
                  value={data.page6?.diff_pressure_limit || ''}
                  onChange={(e) => updatePage('page6', 'diff_pressure_limit', e.target.value)}
                />
                &nbsp;Pascal
              </td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page6?.filling_area_clearance?.item6 || 'Yes', (val) => {
                  updatePage('page6', 'filling_area_clearance', {
                    ...(data.page6?.filling_area_clearance || {}),
                    item6: val,
                  })
                })}
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4pt 0 10pt', fontSize: '9pt' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Checked By/Date (Production) :</span>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page6?.checked_by_prod_date || ''}
              onChange={(e) => updatePage('page6', 'checked_by_prod_date', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Verified by/Date (QA) :</span>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page6?.verified_by_qa_date || ''}
              onChange={(e) => updatePage('page6', 'verified_by_qa_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title" style={{ margin: '6pt 0 2pt' }}>
          LIQUID ORAL FILLING:
        </div>
        <div style={{ fontWeight: 'bold', fontSize: '9pt', marginBottom: '4pt' }}>Equipment clearance</div>

        <table className="bmr-table" style={{ marginTop: 2 }}>
          <colgroup>
            <col style={{ width: 45 }} />
            <col style={{ width: 165 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 80 }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Sr.<br />No.</th>
              <th style={{ textAlign: 'center' }}>Equipment</th>
              <th style={{ textAlign: 'center' }}>Equipment ID</th>
              <th style={{ textAlign: 'center' }}>Date of last<br />cleaning</th>
              <th style={{ textAlign: 'center' }}>Previous Product /Batch No.</th>
            </tr>
          </thead>
        </table>
      </div>
      {renderFooter(6)}
    </div>
  )

  // Page 7: Filling Equipment clearance rows (1–4), Bottle Cleaning, Volume Setting & Filling Record (1–3)
  const renderPage7 = () => (
    <div className="bmr-sheet bmr-oil-sheet" key="page-7">
      {renderHeader(7)}
      <div className="bmr-body">
        <table className="bmr-table" style={{ marginTop: 2, marginBottom: '6pt' }}>
          <colgroup>
            <col style={{ width: 45 }} />
            <col style={{ width: 165 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 80 }} />
            <col />
          </colgroup>
          <tbody>
            {(data.page7?.filling_equipments || []).map((row, idx) => (
              <tr key={idx} style={{ height: 21 }}>
                <td style={{ textAlign: 'center' }}>{row.sr}</td>
                <td>{row.name}</td>
                <td style={{ backgroundColor: row.is_shaded ? '#d9d9d9' : 'transparent', textAlign: 'center' }}>
                  {!row.is_shaded ? (
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.id || ''}
                      onChange={(e) => {
                        const updated = [...(data.page7?.filling_equipments || [])]
                        updated[idx].id = e.target.value
                        updatePage('page7', 'filling_equipments', updated)
                      }}
                    />
                  ) : null}
                </td>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date_cleaned || ''}
                    onChange={(e) => {
                      const updated = [...(data.page7?.filling_equipments || [])]
                      updated[idx].date_cleaned = e.target.value
                      updatePage('page7', 'filling_equipments', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.prev_batch || ''}
                    onChange={(e) => {
                      const updated = [...(data.page7?.filling_equipments || [])]
                      updated[idx].prev_batch = e.target.value
                      updatePage('page7', 'filling_equipments', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ margin: '4pt 0 6pt', fontSize: '9pt' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span>Checked by/Date (Production) :</span>
            <input
              className="bmr-line-input"
              style={{ width: 180 }}
              value={data.page7?.checked_by_prod_date || ''}
              onChange={(e) => updatePage('page7', 'checked_by_prod_date', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Verified by/Date (QA) :</span>
            <input
              className="bmr-line-input"
              style={{ width: 180 }}
              value={data.page7?.verified_by_qa_date || ''}
              onChange={(e) => updatePage('page7', 'verified_by_qa_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title" style={{ margin: '4pt 0 1pt' }}>
          BOTTLE CLEANING BY AIR:
        </div>
        <p style={{ margin: '1pt 0 5pt', fontSize: '8.5pt' }}>
          Clean the bottle as per the procedure given in SOP and maintain cleanliness.
        </p>

        <div className="bmr-section-title" style={{ margin: '4pt 0 1pt' }}>
          VOLUME SETTING:
        </div>
        <p style={{ margin: '1pt 0 4pt', fontSize: '8.5pt' }}>
          Set the required volume in each pump by adjusting in online display monitor.
        </p>

        <table className="bmr-table" style={{ marginTop: 2, marginBottom: '6pt' }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 55 }} />
            <col style={{ width: 55 }} />
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time (Hrs)</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Done by (Production)</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Checked by<br />(Production)</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Checked by<br />(QA)</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center', fontSize: '7.5pt' }}>From</th>
              <th style={{ textAlign: 'center', fontSize: '7.5pt' }}>To</th>
            </tr>
          </thead>
          <tbody>
            {(data.page7?.volume_setting || []).map((row, idx) => (
              <tr key={idx} style={{ height: 21 }}>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page7?.volume_setting || [])]
                      updated[idx].date = e.target.value
                      updatePage('page7', 'volume_setting', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.from_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page7?.volume_setting || [])]
                      updated[idx].from_time = e.target.value
                      updatePage('page7', 'volume_setting', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.to_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page7?.volume_setting || [])]
                      updated[idx].to_time = e.target.value
                      updatePage('page7', 'volume_setting', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page7?.volume_setting || [])]
                      updated[idx].done_by = e.target.value
                      updatePage('page7', 'volume_setting', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_prod || ''}
                    onChange={(e) => {
                      const updated = [...(data.page7?.volume_setting || [])]
                      updated[idx].checked_by_prod = e.target.value
                      updatePage('page7', 'volume_setting', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page7?.volume_setting || [])]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page7', 'volume_setting', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-section-title" style={{ margin: '4pt 0 1pt' }}>
          FILLING RECORD AND UNIFORMITY OF VOLUME CHECK:
        </div>
        <p style={{ margin: '1pt 0', fontSize: '8.5pt' }}>Frequency 30 minutes.</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2pt 0 4pt', fontSize: '9pt' }}>
          <span>Date of Filling:</span>
          <BmrDateField
            className="bmr-line-input"
            style={{ width: 130 }}
            value={data.page7?.filling_record_date || ''}
            onChange={(e) => updatePage('page7', 'filling_record_date', e.target.value)}
          />
        </div>

        <table className="bmr-table" style={{ marginTop: 2 }}>
          <colgroup>
            <col style={{ width: 65 }} />
            <col style={{ width: 95 }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Sr. No.</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Time<br />(Hrs)</th>
              <th style={{ textAlign: 'center' }}>Filled volume (ml)</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center', fontSize: '8pt' }}>Pump-1</th>
            </tr>
          </thead>
          <tbody>
            {(data.page7?.filling_records_p7 || []).map((row, idx) => (
              <tr key={idx} style={{ height: 21 }}>
                <td style={{ textAlign: 'center' }}>{row.sr}</td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page7?.filling_records_p7 || [])]
                      updated[idx].time = e.target.value
                      updatePage('page7', 'filling_records_p7', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.pump1 || ''}
                    onChange={(e) => {
                      const updated = [...(data.page7?.filling_records_p7 || [])]
                      updated[idx].pump1 = e.target.value
                      updatePage('page7', 'filling_records_p7', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {renderFooter(7)}
    </div>
  )

  // Page 8: Filling Record (4–8), Capping, Sealing & VISUAL INSPECTION FOR OIL
  const renderPage8 = () => (
    <div className="bmr-sheet bmr-oil-sheet" key="page-8">
      {renderHeader(8)}
      <div className="bmr-body">
        <table className="bmr-table" style={{ marginTop: 2, marginBottom: '6pt' }}>
          <colgroup>
            <col style={{ width: 65 }} />
            <col style={{ width: 95 }} />
            <col />
          </colgroup>
          <tbody>
            {(data.page8?.filling_records_p8 || []).map((row, idx) => (
              <tr key={idx} style={{ height: 21 }}>
                <td style={{ textAlign: 'center' }}>{row.sr}</td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page8?.filling_records_p8 || [])]
                      updated[idx].time = e.target.value
                      updatePage('page8', 'filling_records_p8', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.pump1 || ''}
                    onChange={(e) => {
                      const updated = [...(data.page8?.filling_records_p8 || [])]
                      updated[idx].pump1 = e.target.value
                      updatePage('page8', 'filling_records_p8', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ margin: '4pt 0 8pt', fontSize: '9pt' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Filled by</span>
              <input
                className="bmr-line-input"
                style={{ width: 140 }}
                value={data.page8?.filled_by || ''}
                onChange={(e) => updatePage('page8', 'filled_by', e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Checked by/Date (production):</span>
              <input
                className="bmr-line-input"
                style={{ width: 140 }}
                value={data.page8?.checked_by_prod_date || ''}
                onChange={(e) => updatePage('page8', 'checked_by_prod_date', e.target.value)}
              />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Checked by/Date (QA):</span>
            <input
              className="bmr-line-input"
              style={{ width: 180 }}
              value={data.page8?.checked_by_qa_date || ''}
              onChange={(e) => updatePage('page8', 'checked_by_qa_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title" style={{ margin: '6pt 0 1pt' }}>
          CAPPING:
        </div>
        <p style={{ margin: '1pt 0 5pt', fontSize: '8.5pt' }}>
          Load required quantity of cleaned dual seal cap.
        </p>

        <div className="bmr-section-title" style={{ margin: '4pt 0 1pt' }}>
          SEALING:
        </div>
        <p style={{ margin: '1pt 0 4pt', fontSize: '8.5pt' }}>
          Sealing is done online by machine after capping activity and check for the leak/seal test
        </p>

        <table className="bmr-table" style={{ marginTop: 2, marginBottom: '10pt' }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 55 }} />
            <col style={{ width: 55 }} />
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time ( Hrs)</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Done by<br />(Production)</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Checked by<br />(Production)</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Checked by<br />(QA)</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center', fontSize: '7.5pt' }}>From</th>
              <th style={{ textAlign: 'center', fontSize: '7.5pt' }}>To</th>
            </tr>
          </thead>
          <tbody>
            {(data.page8?.capping_sealing || []).map((row, idx) => (
              <tr key={idx} style={{ height: 22 }}>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page8?.capping_sealing || [])]
                      updated[idx].date = e.target.value
                      updatePage('page8', 'capping_sealing', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.from_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page8?.capping_sealing || [])]
                      updated[idx].from_time = e.target.value
                      updatePage('page8', 'capping_sealing', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.to_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page8?.capping_sealing || [])]
                      updated[idx].to_time = e.target.value
                      updatePage('page8', 'capping_sealing', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page8?.capping_sealing || [])]
                      updated[idx].done_by = e.target.value
                      updatePage('page8', 'capping_sealing', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_prod || ''}
                    onChange={(e) => {
                      const updated = [...(data.page8?.capping_sealing || [])]
                      updated[idx].checked_by_prod = e.target.value
                      updatePage('page8', 'capping_sealing', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page8?.capping_sealing || [])]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page8', 'capping_sealing', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-section-title" style={{ marginTop: 'auto', marginBottom: '2pt' }}>
          VISUAL INSPECTION FOR OIL :
        </div>
      </div>
      {renderFooter(8)}
    </div>
  )

  // Page 9: Visual Inspection text & tables & Packing Material Dispensing Area Line Clearance
  const renderPage9 = () => (
    <div className="bmr-sheet bmr-oil-sheet" key="page-9">
      {renderHeader(9)}
      <div className="bmr-body">
        <p style={{ margin: '1pt 0 2pt', fontSize: '8.5pt' }}>
          For Drops: Check the bottle for any particulate matter and foreign matter against white and black background on inspection table.
        </p>
        <p style={{ margin: '1pt 0 5pt', fontSize: '8.5pt' }}>
          For Syrup: Check the bottle for cleanliness and batch details on the product label.
        </p>

        <table className="bmr-table" style={{ marginTop: 2, marginBottom: '4pt' }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 55 }} />
            <col style={{ width: 55 }} />
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time (Hrs)</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Done By<br />Production</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Checked By<br />Production</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Checked By<br />QA</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center', fontSize: '7.5pt' }}>From</th>
              <th style={{ textAlign: 'center', fontSize: '7.5pt' }}>To</th>
            </tr>
          </thead>
          <tbody>
            {(data.page9?.visual_inspection_table1 || []).map((row, idx) => (
              <tr key={idx} style={{ height: 21 }}>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page9?.visual_inspection_table1 || [])]
                      updated[idx].date = e.target.value
                      updatePage('page9', 'visual_inspection_table1', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.from_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page9?.visual_inspection_table1 || [])]
                      updated[idx].from_time = e.target.value
                      updatePage('page9', 'visual_inspection_table1', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.to_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page9?.visual_inspection_table1 || [])]
                      updated[idx].to_time = e.target.value
                      updatePage('page9', 'visual_inspection_table1', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page9?.visual_inspection_table1 || [])]
                      updated[idx].done_by = e.target.value
                      updatePage('page9', 'visual_inspection_table1', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_prod || ''}
                    onChange={(e) => {
                      const updated = [...(data.page9?.visual_inspection_table1 || [])]
                      updated[idx].checked_by_prod = e.target.value
                      updatePage('page9', 'visual_inspection_table1', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page9?.visual_inspection_table1 || [])]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page9', 'visual_inspection_table1', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '3pt 0 4pt', fontSize: '9pt' }}>
          <span>Total Nos. of Inspected Bottles:</span>
          <input
            className="bmr-line-input"
            style={{ width: 100 }}
            value={data.page9?.total_inspected_bottles || ''}
            onChange={(e) => updatePage('page9', 'total_inspected_bottles', e.target.value)}
          />
          <span>Nos.</span>
        </div>

        <table className="bmr-table" style={{ marginTop: 2, marginBottom: '6pt' }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 55 }} />
            <col style={{ width: 55 }} />
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time (Hrs)</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Done By<br />Production</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Checked By<br />Production</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Checked By<br />QA</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center', fontSize: '7.5pt' }}>From</th>
              <th style={{ textAlign: 'center', fontSize: '7.5pt' }}>To</th>
            </tr>
          </thead>
          <tbody>
            {(data.page9?.visual_inspection_table2 || []).map((row, idx) => (
              <tr key={idx} style={{ height: 21 }}>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page9?.visual_inspection_table2 || [])]
                      updated[idx].date = e.target.value
                      updatePage('page9', 'visual_inspection_table2', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.from_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page9?.visual_inspection_table2 || [])]
                      updated[idx].from_time = e.target.value
                      updatePage('page9', 'visual_inspection_table2', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.to_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page9?.visual_inspection_table2 || [])]
                      updated[idx].to_time = e.target.value
                      updatePage('page9', 'visual_inspection_table2', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page9?.visual_inspection_table2 || [])]
                      updated[idx].done_by = e.target.value
                      updatePage('page9', 'visual_inspection_table2', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_prod || ''}
                    onChange={(e) => {
                      const updated = [...(data.page9?.visual_inspection_table2 || [])]
                      updated[idx].checked_by_prod = e.target.value
                      updatePage('page9', 'visual_inspection_table2', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page9?.visual_inspection_table2 || [])]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page9', 'visual_inspection_table2', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3pt 0 8pt', fontSize: '9pt' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Checked by/Date (Production) :</span>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page9?.checked_by_prod_date || ''}
              onChange={(e) => updatePage('page9', 'checked_by_prod_date', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Verified by/ Date (QA) :</span>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page9?.verified_by_qa_date || ''}
              onChange={(e) => updatePage('page9', 'verified_by_qa_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title" style={{ margin: '4pt 0 2pt' }}>
          PACKING MATERIAL DISPENSING AREA LINE CLEARANCE:
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2pt 0 5pt', fontSize: '9pt' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong>Previous Product:</strong>
            <input
              className="bmr-line-input"
              style={{ width: 180 }}
              value={data.page9?.pm_disp_prev_product || ''}
              onChange={(e) => updatePage('page9', 'pm_disp_prev_product', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong>Batch No.</strong>
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page9?.pm_disp_prev_batch || ''}
              onChange={(e) => updatePage('page9', 'pm_disp_prev_batch', e.target.value)}
            />
          </div>
        </div>

        <table className="bmr-table" style={{ marginTop: 2 }}>
          <colgroup>
            <col style={{ width: 50 }} />
            <col />
            <col style={{ width: 85 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center', fontWeight: 'bold' }}>Sr. No.</th>
              <th style={{ textAlign: 'center', fontWeight: 'bold' }}>Activity</th>
              <th style={{ textAlign: 'center', fontWeight: 'bold' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              { id: 'item1', sr: '1', text: 'Previous product / batch materials are removed' },
              { id: 'item2', sr: '2', text: 'Previous product / batch labels are removed' },
              { id: 'item3', sr: '3', text: 'Floor walls, and ceiling are cleaned properly' },
              { id: 'item4', sr: '4', text: 'Balance is cleaned and calibrated' },
              { id: 'item5', sr: '5', text: 'Status labels are affixed' },
            ].map((row) => (
              <tr key={row.id}>
                <td style={{ textAlign: 'center' }}>{row.sr}</td>
                <td>{row.text}</td>
                <td style={{ textAlign: 'center' }}>
                  {renderYesNo(data.page9?.pm_disp_clearance?.[row.id] || 'Yes', (val) => {
                    updatePage('page9', 'pm_disp_clearance', {
                      ...(data.page9?.pm_disp_clearance || {}),
                      [row.id]: val,
                    })
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {renderFooter(9)}
    </div>
  )

  // Page 10: Environmental Control & Equipment Clearance for Carton and Label Coding
  const renderPage10 = () => (
    <div className="bmr-sheet bmr-oil-sheet" key="page-10">
      {renderHeader(10)}
      <div className="bmr-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2pt 0 8pt', fontSize: '9pt' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Checked By/Date (Packing)</span>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page10?.checked_by_packing_date || ''}
              onChange={(e) => updatePage('page10', 'checked_by_packing_date', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Verified by/Date ( QA)</span>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page10?.verified_by_qa_date || ''}
              onChange={(e) => updatePage('page10', 'verified_by_qa_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title" style={{ margin: '4pt 0 1pt' }}>
          ENVIRONMENTAL CONTROL: ( Packing Area)
        </div>
        <p style={{ margin: '1pt 0', fontSize: '8.5pt' }}>
          Check and record temperature and relative humidity twice a day.
        </p>
        <p style={{ margin: '1pt 0 4pt', fontSize: '8.5pt' }}>
          Limit: Temperature: 27°C ± 2° C % RH 55% ± 2%
        </p>

        <table className="bmr-table" style={{ marginTop: 2, marginBottom: '8pt' }}>
          <colgroup>
            <col style={{ width: 90 }} />
            <col style={{ width: 80 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Date</th>
              <th style={{ textAlign: 'center' }}>Time Hrs.</th>
              <th style={{ textAlign: 'center' }}>Temp °C</th>
              <th style={{ textAlign: 'center' }}>% RH</th>
              <th style={{ textAlign: 'center' }}>Checked By<br />(Packaging)</th>
              <th style={{ textAlign: 'center' }}>Checked By<br />(QA)</th>
            </tr>
          </thead>
          <tbody>
            {(data.page10?.environmental_control || []).map((row, idx) => (
              <tr key={idx} style={{ height: 21 }}>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page10?.environmental_control || [])]
                      updated[idx].date = e.target.value
                      updatePage('page10', 'environmental_control', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.time_hrs || ''}
                    onChange={(e) => {
                      const updated = [...(data.page10?.environmental_control || [])]
                      updated[idx].time_hrs = e.target.value
                      updatePage('page10', 'environmental_control', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.temp || ''}
                    onChange={(e) => {
                      const updated = [...(data.page10?.environmental_control || [])]
                      updated[idx].temp = e.target.value
                      updatePage('page10', 'environmental_control', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.rh || ''}
                    onChange={(e) => {
                      const updated = [...(data.page10?.environmental_control || [])]
                      updated[idx].rh = e.target.value
                      updatePage('page10', 'environmental_control', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_pkg || ''}
                    onChange={(e) => {
                      const updated = [...(data.page10?.environmental_control || [])]
                      updated[idx].checked_by_pkg = e.target.value
                      updatePage('page10', 'environmental_control', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page10?.environmental_control || [])]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page10', 'environmental_control', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-section-title" style={{ margin: '4pt 0 3pt' }}>
          EQUIPMENT CLEARANCE FOR CARTON AND LABEL CODING:
        </div>

        <table className="bmr-table" style={{ marginTop: 2, marginBottom: '6pt' }}>
          <colgroup>
            <col style={{ width: 140 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 110 }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Equipment</th>
              <th style={{ textAlign: 'center' }}>Equipment ID</th>
              <th style={{ textAlign: 'center' }}>Date of Last<br />Cleaning</th>
              <th style={{ textAlign: 'center' }}>Previous Product/<br />Batch No.</th>
              <th style={{ textAlign: 'center' }}>Cleaned By<br />(Packaging)</th>
            </tr>
          </thead>
          <tbody>
            {(data.page10?.equipment_clearance || []).map((row, idx) => (
              <tr key={idx} style={{ height: 21 }}>
                <td>{row.equip}</td>
                <td style={{ textAlign: 'center' }}>{row.id}</td>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date_cleaned || ''}
                    onChange={(e) => {
                      const updated = [...(data.page10?.equipment_clearance || [])]
                      updated[idx].date_cleaned = e.target.value
                      updatePage('page10', 'equipment_clearance', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.prev_batch || ''}
                    onChange={(e) => {
                      const updated = [...(data.page10?.equipment_clearance || [])]
                      updated[idx].prev_batch = e.target.value
                      updatePage('page10', 'equipment_clearance', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.cleaned_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page10?.equipment_clearance || [])]
                      updated[idx].cleaned_by = e.target.value
                      updatePage('page10', 'equipment_clearance', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4pt 0', fontSize: '9pt' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Checked By/Date (Packing) :</span>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page10?.equip_checked_by_pkg_date || ''}
              onChange={(e) => updatePage('page10', 'equip_checked_by_pkg_date', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Verified By/Date (QA):</span>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page10?.equip_verified_by_qa_date || ''}
              onChange={(e) => updatePage('page10', 'equip_verified_by_qa_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title" style={{ marginTop: 'auto', marginBottom: '2pt' }}>
          PACKING DETAILS:
        </div>
      </div>
      {renderFooter(10)}
    </div>
  )

  // Page 11: Packing Type, Stereo Details & Label / Carton Coding
  const renderPage11 = () => (
    <div className="bmr-sheet bmr-oil-sheet" key="page-11">
      {renderHeader(11)}
      <div className="bmr-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2pt 0 6pt', fontSize: '9pt' }}>
          <span>Packing Type: Pet Bottle /Glass Bottle:</span>
          <input
            className="bmr-line-input"
            style={{ width: 180 }}
            value={data.page11?.packing_type || ''}
            onChange={(e) => updatePage('page11', 'packing_type', e.target.value)}
          />
        </div>

        <div className="bmr-section-title" style={{ margin: '4pt 0 2pt' }}>
          STEREO DETAILS FOR LABEL AND CARTONS:
        </div>

        <table className="bmr-table" style={{ marginTop: 2, marginBottom: '6pt' }}>
          <colgroup>
            <col style={{ width: 75 }} />
            <col style={{ width: 75 }} />
            <col style={{ width: 75 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Batch No.</th>
              <th style={{ textAlign: 'center' }}>Mfg. Date</th>
              <th style={{ textAlign: 'center' }}>Exp. Date/<br />Best Before</th>
              <th style={{ textAlign: 'center' }}>MRP Rs. Incl. of<br />taxes</th>
              <th style={{ textAlign: 'center' }}>Checked By<br />Packing Sup.</th>
              <th style={{ textAlign: 'center' }}>Checked by QA</th>
            </tr>
          </thead>
          <tbody>
            {(data.page11?.stereo_details || []).map((row, idx) => (
              <tr key={idx} style={{ height: 21 }}>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.batch_no || ''}
                    onChange={(e) => {
                      const updated = [...(data.page11?.stereo_details || [])]
                      updated[idx].batch_no = e.target.value
                      updatePage('page11', 'stereo_details', updated)
                    }}
                  />
                </td>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.mfg_date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page11?.stereo_details || [])]
                      updated[idx].mfg_date = e.target.value
                      updatePage('page11', 'stereo_details', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.exp_date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page11?.stereo_details || [])]
                      updated[idx].exp_date = e.target.value
                      updatePage('page11', 'stereo_details', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.mrp || ''}
                    onChange={(e) => {
                      const updated = [...(data.page11?.stereo_details || [])]
                      updated[idx].mrp = e.target.value
                      updatePage('page11', 'stereo_details', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_pkg || ''}
                    onChange={(e) => {
                      const updated = [...(data.page11?.stereo_details || [])]
                      updated[idx].checked_by_pkg = e.target.value
                      updatePage('page11', 'stereo_details', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page11?.stereo_details || [])]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page11', 'stereo_details', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-section-title" style={{ margin: '4pt 0 1pt' }}>
          LABEL / CARTON CODING:
        </div>
        <p style={{ margin: '1pt 0 4pt', fontSize: '8.5pt' }}>
          Send the labels/cartons for coding as per the requirements and record the details in below given format.
        </p>

        <table className="bmr-table" style={{ marginTop: 2, marginBottom: '6pt' }}>
          <colgroup>
            <col style={{ width: 45 }} />
            <col />
            <col style={{ width: 140 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 120 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Sr. No.</th>
              <th style={{ textAlign: 'center' }}>Packing Material</th>
              <th style={{ textAlign: 'center' }}>Qty. given for coding Nos.</th>
              <th style={{ textAlign: 'center' }}>Qty. Rej. Nos.</th>
              <th style={{ textAlign: 'center' }}>Qty. Rec. for Pkg.<br />Nos.</th>
            </tr>
          </thead>
          <tbody>
            {(data.page11?.coding_records || []).map((row, idx) => (
              <tr key={idx} style={{ height: 21 }}>
                <td style={{ textAlign: 'center' }}>{row.sr}</td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.material || ''}
                    onChange={(e) => {
                      const updated = [...(data.page11?.coding_records || [])]
                      updated[idx].material = e.target.value
                      updatePage('page11', 'coding_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.qty_given || ''}
                    onChange={(e) => {
                      const updated = [...(data.page11?.coding_records || [])]
                      updated[idx].qty_given = e.target.value
                      updatePage('page11', 'coding_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.qty_rej || ''}
                    onChange={(e) => {
                      const updated = [...(data.page11?.coding_records || [])]
                      updated[idx].qty_rej = e.target.value
                      updatePage('page11', 'coding_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.qty_rec || ''}
                    onChange={(e) => {
                      const updated = [...(data.page11?.coding_records || [])]
                      updated[idx].qty_rec = e.target.value
                      updatePage('page11', 'coding_records', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="bmr-table" style={{ marginTop: 2 }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 55 }} />
            <col style={{ width: 55 }} />
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time(Hrs)</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Done By Pkg</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Checked By Pkg</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Checked By<br />QA</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center', fontSize: '7.5pt' }}>From</th>
              <th style={{ textAlign: 'center', fontSize: '7.5pt' }}>To</th>
            </tr>
          </thead>
          <tbody>
            {(data.page11?.coding_time_records_p11 || []).map((row, idx) => (
              <tr key={idx} style={{ height: 22 }}>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page11?.coding_time_records_p11 || [])]
                      updated[idx].date = e.target.value
                      updatePage('page11', 'coding_time_records_p11', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.from_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page11?.coding_time_records_p11 || [])]
                      updated[idx].from_time = e.target.value
                      updatePage('page11', 'coding_time_records_p11', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.to_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page11?.coding_time_records_p11 || [])]
                      updated[idx].to_time = e.target.value
                      updatePage('page11', 'coding_time_records_p11', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page11?.coding_time_records_p11 || [])]
                      updated[idx].done_by = e.target.value
                      updatePage('page11', 'coding_time_records_p11', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_pkg || ''}
                    onChange={(e) => {
                      const updated = [...(data.page11?.coding_time_records_p11 || [])]
                      updated[idx].checked_by_pkg = e.target.value
                      updatePage('page11', 'coding_time_records_p11', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page11?.coding_time_records_p11 || [])]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page11', 'coding_time_records_p11', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {renderFooter(11)}
    </div>
  )

  // Page 12: Coding Records continuation (2 rows), Packing Area Line Clearance & Sticker Label Pasting
  const renderPage12 = () => (
    <div className="bmr-sheet bmr-oil-sheet" key="page-12">
      {renderHeader(12)}
      <div className="bmr-body">
        <table className="bmr-table" style={{ marginTop: 2, marginBottom: '6pt' }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 55 }} />
            <col style={{ width: 55 }} />
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <tbody>
            {(data.page12?.coding_time_records_p12 || []).map((row, idx) => (
              <tr key={idx} style={{ height: 21 }}>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page12?.coding_time_records_p12 || [])]
                      updated[idx].date = e.target.value
                      updatePage('page12', 'coding_time_records_p12', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.from_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page12?.coding_time_records_p12 || [])]
                      updated[idx].from_time = e.target.value
                      updatePage('page12', 'coding_time_records_p12', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.to_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page12?.coding_time_records_p12 || [])]
                      updated[idx].to_time = e.target.value
                      updatePage('page12', 'coding_time_records_p12', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page12?.coding_time_records_p12 || [])]
                      updated[idx].done_by = e.target.value
                      updatePage('page12', 'coding_time_records_p12', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_pkg || ''}
                    onChange={(e) => {
                      const updated = [...(data.page12?.coding_time_records_p12 || [])]
                      updated[idx].checked_by_pkg = e.target.value
                      updatePage('page12', 'coding_time_records_p12', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page12?.coding_time_records_p12 || [])]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page12', 'coding_time_records_p12', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-section-title" style={{ margin: '4pt 0 2pt' }}>
          PACKING AREA LINE CLEARANCE:
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2pt 0 4pt', fontSize: '9pt' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong>Previous Product:</strong>
            <input
              className="bmr-line-input"
              style={{ width: 180 }}
              value={data.page12?.pkg_area_prev_product || ''}
              onChange={(e) => updatePage('page12', 'pkg_area_prev_product', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong>Batch No.</strong>
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page12?.pkg_area_prev_batch || ''}
              onChange={(e) => updatePage('page12', 'pkg_area_prev_batch', e.target.value)}
            />
          </div>
        </div>

        <table className="bmr-table" style={{ marginTop: 2, marginBottom: '4pt' }}>
          <colgroup>
            <col style={{ width: 45 }} />
            <col />
            <col style={{ width: 85 }} />
            <col style={{ width: 155 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Sr.<br />No.</th>
              <th style={{ textAlign: 'center' }}>Activity</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th style={{ textAlign: 'center' }}>Checked By / sign Date</th>
            </tr>
          </thead>
          <tbody>
            {(data.page12?.pkg_area_clearance || []).map((row, idx) => (
              <tr key={idx}>
                <td style={{ textAlign: 'center' }}>{row.sr}</td>
                <td>{row.activity}</td>
                <td style={{ textAlign: 'center' }}>
                  {renderYesNo(row.status || 'Yes', (val) => {
                    const updated = [...(data.page12?.pkg_area_clearance || [])]
                    updated[idx].status = val
                    updatePage('page12', 'pkg_area_clearance', updated)
                  })}
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_sign_date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page12?.pkg_area_clearance || [])]
                      updated[idx].checked_by_sign_date = e.target.value
                      updatePage('page12', 'pkg_area_clearance', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2pt 0 6pt', fontSize: '9pt' }}>
          <span>Verified by/Date (QA)</span>
          <input
            className="bmr-line-input"
            style={{ width: 180 }}
            value={data.page12?.pkg_verified_by_qa_date || ''}
            onChange={(e) => updatePage('page12', 'pkg_verified_by_qa_date', e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '4pt 0 2pt' }}>
          <span className="bmr-section-title" style={{ margin: 0 }}>
            STICKER LABEL PASTING:
          </span>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '9pt', cursor: 'pointer' }}>
            <input
              type="radio"
              name="sticker_pasting_app"
              checked={data.page12?.sticker_pasting_applicable === 'Applicable'}
              onChange={() => updatePage('page12', 'sticker_pasting_applicable', 'Applicable')}
            />
            Applicable
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '9pt', cursor: 'pointer' }}>
            <input
              type="radio"
              name="sticker_pasting_app"
              checked={data.page12?.sticker_pasting_applicable === 'Not Applicable'}
              onChange={() => updatePage('page12', 'sticker_pasting_applicable', 'Not Applicable')}
            />
            / Not Applicable
          </label>
        </div>

        <p style={{ margin: '1pt 0 4pt', fontSize: '8.5pt' }}>
          Clean the bottle if required. Affix the sticker label on bottle manually with proper alignment.
        </p>

        <table className="bmr-table" style={{ marginTop: 2, marginBottom: '6pt' }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 55 }} />
            <col style={{ width: 55 }} />
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Done By Pkg</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Checked By<br />Pkg</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Checked By QA</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center', fontSize: '7.5pt' }}>From</th>
              <th style={{ textAlign: 'center', fontSize: '7.5pt' }}>To</th>
            </tr>
          </thead>
          <tbody>
            {(data.page12?.sticker_pasting_time || []).map((row, idx) => (
              <tr key={idx} style={{ height: 21 }}>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page12?.sticker_pasting_time || [])]
                      updated[idx].date = e.target.value
                      updatePage('page12', 'sticker_pasting_time', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.from_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page12?.sticker_pasting_time || [])]
                      updated[idx].from_time = e.target.value
                      updatePage('page12', 'sticker_pasting_time', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.to_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page12?.sticker_pasting_time || [])]
                      updated[idx].to_time = e.target.value
                      updatePage('page12', 'sticker_pasting_time', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page12?.sticker_pasting_time || [])]
                      updated[idx].done_by = e.target.value
                      updatePage('page12', 'sticker_pasting_time', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_pkg || ''}
                    onChange={(e) => {
                      const updated = [...(data.page12?.sticker_pasting_time || [])]
                      updated[idx].checked_by_pkg = e.target.value
                      updatePage('page12', 'sticker_pasting_time', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page12?.sticker_pasting_time || [])]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page12', 'sticker_pasting_time', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-section-title" style={{ marginTop: 'auto', marginBottom: '2pt' }}>
          CARTONING:
        </div>
      </div>
      {renderFooter(12)}
    </div>
  )

  // Page 13: Cartoning, Outer Packing & Bonded Slip
  const renderPage13 = () => (
    <div className="bmr-sheet bmr-oil-sheet" key="page-13">
      {renderHeader(13)}
      <div className="bmr-body">
        <p style={{ margin: '1pt 0', fontSize: '8.5pt' }}>
          Keep the bottle in individual duplex carton.
        </p>
        <p style={{ margin: '1pt 0', fontSize: '8.5pt' }}>
          Ensure that the bottles are not wet.
        </p>
        <p style={{ margin: '1pt 0 4pt', fontSize: '8.5pt' }}>
          Affix a cello tape on the carton if required
        </p>

        <table className="bmr-table" style={{ marginTop: 2, marginBottom: '6pt' }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 55 }} />
            <col style={{ width: 55 }} />
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time Hrs.</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Done By Pkg</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Checked By<br />Pkg</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Checked By QA</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center', fontSize: '7.5pt' }}>From</th>
              <th style={{ textAlign: 'center', fontSize: '7.5pt' }}>To</th>
            </tr>
          </thead>
          <tbody>
            {(data.page13?.cartoning_time || []).map((row, idx) => (
              <tr key={idx} style={{ height: 21 }}>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.cartoning_time || [])]
                      updated[idx].date = e.target.value
                      updatePage('page13', 'cartoning_time', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.from_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.cartoning_time || [])]
                      updated[idx].from_time = e.target.value
                      updatePage('page13', 'cartoning_time', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.to_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.cartoning_time || [])]
                      updated[idx].to_time = e.target.value
                      updatePage('page13', 'cartoning_time', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.cartoning_time || [])]
                      updated[idx].done_by = e.target.value
                      updatePage('page13', 'cartoning_time', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_pkg || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.cartoning_time || [])]
                      updated[idx].checked_by_pkg = e.target.value
                      updatePage('page13', 'cartoning_time', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.cartoning_time || [])]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page13', 'cartoning_time', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-section-title" style={{ margin: '4pt 0 1pt' }}>
          OUTER PACKING:
        </div>
        <p style={{ margin: '1pt 0 4pt', fontSize: '8.5pt' }}>
          Keep bottles / packed carton in inner outer corrugated box as per specified box size and close the box using BOPP gum tape. Affix a shipper label on it. Strap the outer corrugated box.Keep it on a palate.
        </p>

        <table className="bmr-table" style={{ marginTop: 2, marginBottom: '8pt' }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 55 }} />
            <col style={{ width: 55 }} />
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time Hrs.</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Done By Pkg</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Checked By Pkg</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Checked By QA</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center', fontSize: '7.5pt' }}>From</th>
              <th style={{ textAlign: 'center', fontSize: '7.5pt' }}>To</th>
            </tr>
          </thead>
          <tbody>
            {(data.page13?.outer_packing_time || []).map((row, idx) => (
              <tr key={idx} style={{ height: 21 }}>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.outer_packing_time || [])]
                      updated[idx].date = e.target.value
                      updatePage('page13', 'outer_packing_time', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.from_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.outer_packing_time || [])]
                      updated[idx].from_time = e.target.value
                      updatePage('page13', 'outer_packing_time', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.to_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.outer_packing_time || [])]
                      updated[idx].to_time = e.target.value
                      updatePage('page13', 'outer_packing_time', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.outer_packing_time || [])]
                      updated[idx].done_by = e.target.value
                      updatePage('page13', 'outer_packing_time', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_pkg || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.outer_packing_time || [])]
                      updated[idx].checked_by_pkg = e.target.value
                      updatePage('page13', 'outer_packing_time', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.outer_packing_time || [])]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page13', 'outer_packing_time', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ fontSize: '9pt', lineHeight: 1.6, marginTop: '4pt' }}>
          <p style={{ margin: '2pt 0 4pt', fontWeight: 'bold' }}>
            Prepare bonded slip and transfer the batch to FP store
          </p>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 3 }}>
            <span style={{ width: 60 }}>Finish</span>
            <input
              className="bmr-line-input"
              style={{ width: 130 }}
              value={data.page13?.bonded_slip?.finish_bottles || ''}
              onChange={(e) =>
                updatePage('page13', 'bonded_slip', {
                  ...(data.page13?.bonded_slip || {}),
                  finish_bottles: e.target.value,
                })
              }
            />
            <span style={{ margin: '0 8px' }}>Bottles =</span>
            <input
              className="bmr-line-input"
              style={{ width: 130 }}
              value={data.page13?.bonded_slip?.finish_litres || ''}
              onChange={(e) =>
                updatePage('page13', 'bonded_slip', {
                  ...(data.page13?.bonded_slip || {}),
                  finish_litres: e.target.value,
                })
              }
            />
            <span style={{ marginLeft: 6 }}>Litres</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 3 }}>
            <span style={{ width: 60 }}>Retain</span>
            <input
              className="bmr-line-input"
              style={{ width: 130 }}
              value={data.page13?.bonded_slip?.retain_bottles || ''}
              onChange={(e) =>
                updatePage('page13', 'bonded_slip', {
                  ...(data.page13?.bonded_slip || {}),
                  retain_bottles: e.target.value,
                })
              }
            />
            <span style={{ margin: '0 8px' }}>Bottles =</span>
            <input
              className="bmr-line-input"
              style={{ width: 130 }}
              value={data.page13?.bonded_slip?.retain_litres || ''}
              onChange={(e) =>
                updatePage('page13', 'bonded_slip', {
                  ...(data.page13?.bonded_slip || {}),
                  retain_litres: e.target.value,
                })
              }
            />
            <span style={{ marginLeft: 6 }}>Litres</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 3 }}>
            <span style={{ width: 60 }}>Analysis</span>
            <input
              className="bmr-line-input"
              style={{ width: 130 }}
              value={data.page13?.bonded_slip?.analysis_bottles || ''}
              onChange={(e) =>
                updatePage('page13', 'bonded_slip', {
                  ...(data.page13?.bonded_slip || {}),
                  analysis_bottles: e.target.value,
                })
              }
            />
            <span style={{ margin: '0 8px' }}>Bottles =</span>
            <input
              className="bmr-line-input"
              style={{ width: 130 }}
              value={data.page13?.bonded_slip?.analysis_litres || ''}
              onChange={(e) =>
                updatePage('page13', 'bonded_slip', {
                  ...(data.page13?.bonded_slip || {}),
                  analysis_litres: e.target.value,
                })
              }
            />
            <span style={{ marginLeft: 6 }}>Litres</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ width: 130 }}>Total quantity packed</span>
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page13?.bonded_slip?.total_bottles || ''}
              onChange={(e) =>
                updatePage('page13', 'bonded_slip', {
                  ...(data.page13?.bonded_slip || {}),
                  total_bottles: e.target.value,
                })
              }
            />
            <span style={{ margin: '0 8px' }}>Bottles</span>
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page13?.bonded_slip?.total_litres || ''}
              onChange={(e) =>
                updatePage('page13', 'bonded_slip', {
                  ...(data.page13?.bonded_slip || {}),
                  total_litres: e.target.value,
                })
              }
            />
            <span style={{ marginLeft: 6 }}>Litres</span>
          </div>
        </div>
      </div>
      {renderFooter(13)}
    </div>
  )

  // Page 14: Packing Material Reconciliation & QA Final Inspection (Outer box, Inner box, Carton)
  const renderPage14 = () => (
    <div className="bmr-sheet bmr-oil-sheet" key="page-14">
      {renderHeader(14)}
      <div className="bmr-body">
        <div className="bmr-section-title" style={{ margin: '3pt 0 1pt' }}>
          PACKING MATERIAL RECONCILLATION:
        </div>
        <p style={{ margin: '1pt 0 4pt', fontSize: '8.5pt' }}>
          After completion of the packing operation, check and record the details of the PM in below given table.
        </p>

        <table className="bmr-table" style={{ marginTop: 2, marginBottom: '8pt' }}>
          <colgroup>
            <col style={{ width: 30 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 55 }} />
            <col style={{ width: 48 }} />
            <col style={{ width: 42 }} />
            <col style={{ width: 42 }} />
            <col style={{ width: 42 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 52 }} />
            <col style={{ width: 52 }} />
            <col style={{ width: 48 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'center', fontSize: '7.5pt' }}>Sr.<br />No.</th>
              <th rowSpan={2} style={{ textAlign: 'center', fontSize: '7.5pt' }}>Packing<br />Material</th>
              <th rowSpan={2} style={{ textAlign: 'center', fontSize: '7.5pt' }}>AR<br />No.</th>
              <th rowSpan={2} style={{ textAlign: 'center', fontSize: '7.5pt' }}>Qty.<br />Issued<br />Nos.</th>
              <th colSpan={4} style={{ textAlign: 'center', fontSize: '7.5pt' }}>Quantity Rejected</th>
              <th rowSpan={2} style={{ textAlign: 'center', fontSize: '7.5pt' }}>Qty.<br />Used<br />No.</th>
              <th rowSpan={2} style={{ textAlign: 'center', fontSize: '7.5pt' }}>Qty.<br />Returned<br />Nos.</th>
              <th rowSpan={2} style={{ textAlign: 'center', fontSize: '7.5pt' }}>Checked<br />By (Pkg)</th>
              <th rowSpan={2} style={{ textAlign: 'center', fontSize: '7.5pt' }}>Checked<br />By<br />(QA)</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center', fontSize: '7pt' }}>Coding<br />Rejection</th>
              <th style={{ textAlign: 'center', fontSize: '7pt' }}>Online</th>
              <th style={{ textAlign: 'center', fontSize: '7pt' }}>Excess</th>
              <th style={{ textAlign: 'center', fontSize: '7pt' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {(data.page14?.pm_reconciliation || []).map((row, idx) => (
              <tr key={idx} style={{ height: 22 }}>
                <td style={{ textAlign: 'center' }}>{row.sr}</td>
                <td style={{ whiteSpace: 'pre-line', fontSize: '8pt' }}>{row.material}</td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.ar_no || ''}
                    onChange={(e) => {
                      const updated = [...(data.page14?.pm_reconciliation || [])]
                      updated[idx].ar_no = e.target.value
                      updatePage('page14', 'pm_reconciliation', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.qty_issued || ''}
                    onChange={(e) => {
                      const updated = [...(data.page14?.pm_reconciliation || [])]
                      updated[idx].qty_issued = e.target.value
                      updatePage('page14', 'pm_reconciliation', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.rej_coding || ''}
                    onChange={(e) => {
                      const updated = [...(data.page14?.pm_reconciliation || [])]
                      updated[idx].rej_coding = e.target.value
                      updatePage('page14', 'pm_reconciliation', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.rej_online || ''}
                    onChange={(e) => {
                      const updated = [...(data.page14?.pm_reconciliation || [])]
                      updated[idx].rej_online = e.target.value
                      updatePage('page14', 'pm_reconciliation', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.rej_excess || ''}
                    onChange={(e) => {
                      const updated = [...(data.page14?.pm_reconciliation || [])]
                      updated[idx].rej_excess = e.target.value
                      updatePage('page14', 'pm_reconciliation', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.rej_total || ''}
                    onChange={(e) => {
                      const updated = [...(data.page14?.pm_reconciliation || [])]
                      updated[idx].rej_total = e.target.value
                      updatePage('page14', 'pm_reconciliation', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.qty_used || ''}
                    onChange={(e) => {
                      const updated = [...(data.page14?.pm_reconciliation || [])]
                      updated[idx].qty_used = e.target.value
                      updatePage('page14', 'pm_reconciliation', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.qty_returned || ''}
                    onChange={(e) => {
                      const updated = [...(data.page14?.pm_reconciliation || [])]
                      updated[idx].qty_returned = e.target.value
                      updatePage('page14', 'pm_reconciliation', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_pkg || ''}
                    onChange={(e) => {
                      const updated = [...(data.page14?.pm_reconciliation || [])]
                      updated[idx].checked_by_pkg = e.target.value
                      updatePage('page14', 'pm_reconciliation', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page14?.pm_reconciliation || [])]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page14', 'pm_reconciliation', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-section-title" style={{ margin: '4pt 0 2pt' }}>
          QA FINAL INSPECTION REPORT:
        </div>

        <table className="bmr-table" style={{ marginTop: 2 }}>
          <colgroup>
            <col style={{ width: 110 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 110 }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Unit</th>
              <th style={{ textAlign: 'center' }}>Checking</th>
              <th style={{ textAlign: 'center' }}>No. of unit</th>
              <th style={{ textAlign: 'center' }}>Checked by/Date</th>
              <th style={{ textAlign: 'center' }}>Checked by/Date<br />(QA)</th>
            </tr>
          </thead>
          <tbody>
            {(data.page14?.qa_final_inspection_p14 || []).map((row, idx) => (
              <tr key={idx} style={{ height: 22 }}>
                <td>{row.unit}</td>
                <td>{row.checking}</td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.no_of_unit || ''}
                    onChange={(e) => {
                      const updated = [...(data.page14?.qa_final_inspection_p14 || [])]
                      updated[idx].no_of_unit = e.target.value
                      updatePage('page14', 'qa_final_inspection_p14', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page14?.qa_final_inspection_p14 || [])]
                      updated[idx].checked_by_date = e.target.value
                      updatePage('page14', 'qa_final_inspection_p14', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_date_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page14?.qa_final_inspection_p14 || [])]
                      updated[idx].checked_by_date_qa = e.target.value
                      updatePage('page14', 'qa_final_inspection_p14', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {renderFooter(14)}
    </div>
  )

  // Page 15: QA Final Inspection (Bottle), Finish Product Transfer & Final Yield / Accountability
  const renderPage15 = () => (
    <div className="bmr-sheet bmr-oil-sheet" key="page-15">
      {renderHeader(15)}
      <div className="bmr-body">
        <table className="bmr-table" style={{ marginTop: 2, marginBottom: '6pt' }}>
          <colgroup>
            <col style={{ width: 110 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 110 }} />
            <col />
          </colgroup>
          <tbody>
            {(data.page15?.qa_final_inspection_p15 || []).map((row, idx) => (
              <tr key={idx} style={{ height: 22 }}>
                <td>{row.unit}</td>
                <td>{row.checking}</td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.no_of_unit || ''}
                    onChange={(e) => {
                      const updated = [...(data.page15?.qa_final_inspection_p15 || [])]
                      updated[idx].no_of_unit = e.target.value
                      updatePage('page15', 'qa_final_inspection_p15', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page15?.qa_final_inspection_p15 || [])]
                      updated[idx].checked_by_date = e.target.value
                      updatePage('page15', 'qa_final_inspection_p15', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_date_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page15?.qa_final_inspection_p15 || [])]
                      updated[idx].checked_by_date_qa = e.target.value
                      updatePage('page15', 'qa_final_inspection_p15', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ margin: '6pt 0 10pt', fontSize: '9pt', lineHeight: 1.6 }}>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
            <span>Release by QA for transfer to finished product store through Finish Product transfer slip no.&nbsp;</span>
            <input
              className="bmr-line-input"
              style={{ width: 100 }}
              value={data.page15?.fp_transfer_slip_no || ''}
              onChange={(e) => updatePage('page15', 'fp_transfer_slip_no', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', marginTop: 3 }}>
            <span>on time and date&nbsp;</span>
            <input
              className="bmr-line-input"
              style={{ width: 200 }}
              value={data.page15?.fp_transfer_time_date || ''}
              onChange={(e) => updatePage('page15', 'fp_transfer_time_date', e.target.value)}
            />
            <span>.</span>
          </div>
        </div>

        <div style={{ fontWeight: 'bold', fontSize: '9.5pt', margin: '4pt 0 2pt' }}>
          Yield and accountability
        </div>

        <div style={{ fontSize: '9pt', lineHeight: 1.6, marginBottom: '8pt' }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 3 }}>
            <span style={{ width: 260 }}>a)&nbsp; Quantity released/transferred to BSR by QA</span>
            <input
              className="bmr-line-input"
              style={{ width: 90 }}
              value={data.page15?.yield_a_nos || ''}
              onChange={(e) => updatePage('page15', 'yield_a_nos', e.target.value)}
            />
            <span style={{ margin: '0 6px' }}>nos</span>
            <input
              className="bmr-line-input"
              style={{ width: 90 }}
              value={data.page15?.yield_a_ltr || ''}
              onChange={(e) => updatePage('page15', 'yield_a_ltr', e.target.value)}
            />
            <span style={{ marginLeft: 6 }}>Ltr</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 3 }}>
            <span style={{ width: 260 }}>b)&nbsp; QC sample/retained sample</span>
            <input
              className="bmr-line-input"
              style={{ width: 90 }}
              value={data.page15?.yield_b_nos || ''}
              onChange={(e) => updatePage('page15', 'yield_b_nos', e.target.value)}
            />
            <span style={{ margin: '0 6px' }}>nos</span>
            <input
              className="bmr-line-input"
              style={{ width: 90 }}
              value={data.page15?.yield_b_ltr || ''}
              onChange={(e) => updatePage('page15', 'yield_b_ltr', e.target.value)}
            />
            <span style={{ marginLeft: 6 }}>Ltr</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 3 }}>
            <span style={{ width: 260 }}>c)&nbsp; Recoverable rejection</span>
            <input
              className="bmr-line-input"
              style={{ width: 90 }}
              value={data.page15?.yield_c_nos || ''}
              onChange={(e) => updatePage('page15', 'yield_c_nos', e.target.value)}
            />
            <span style={{ margin: '0 6px' }}>nos</span>
            <input
              className="bmr-line-input"
              style={{ width: 90 }}
              value={data.page15?.yield_c_ltr || ''}
              onChange={(e) => updatePage('page15', 'yield_c_ltr', e.target.value)}
            />
            <span style={{ marginLeft: 6 }}>Ltr</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span style={{ width: 260 }}>d)&nbsp; Non recoverable rejection</span>
            <input
              className="bmr-line-input"
              style={{ width: 90 }}
              value={data.page15?.yield_d_nos || ''}
              onChange={(e) => updatePage('page15', 'yield_d_nos', e.target.value)}
            />
            <span style={{ margin: '0 6px' }}>nos</span>
            <input
              className="bmr-line-input"
              style={{ width: 90 }}
              value={data.page15?.yield_d_ltr || ''}
              onChange={(e) => updatePage('page15', 'yield_d_ltr', e.target.value)}
            />
            <span style={{ marginLeft: 6 }}>Ltr</span>
          </div>
        </div>

        <div className="bmr-section-title" style={{ margin: '6pt 0 2pt' }}>
          FINAL YIELD:
        </div>
        <div style={{ display: 'flex', alignItems: 'center', margin: '4pt 0 10pt', fontSize: '9pt' }}>
          <span>Formula</span>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', margin: '0 8px' }}>
            <span style={{ borderBottom: '1px solid #000', paddingBottom: 1 }}>a + b x 100</span>
            <span style={{ paddingTop: 1 }}>Batch size</span>
          </div>
          <span>=&nbsp;</span>
          <input
            className="bmr-line-input"
            style={{ width: 170 }}
            value={data.page15?.final_yield_calc || ''}
            onChange={(e) => updatePage('page15', 'final_yield_calc', e.target.value)}
          />
          <span>&nbsp;=&nbsp;</span>
          <input
            className="bmr-line-input"
            style={{ width: 50, textAlign: 'center' }}
            value={data.page15?.final_yield_val || ''}
            onChange={(e) => updatePage('page15', 'final_yield_val', e.target.value)}
          />
          <span>&nbsp;%&nbsp;(&nbsp;Limit NLT 97%&nbsp;)</span>
        </div>

        <div style={{ fontWeight: 'bold', fontSize: '9.5pt', margin: '6pt 0 2pt' }}>
          Accountability
        </div>
        <div style={{ display: 'flex', alignItems: 'center', margin: '4pt 0', fontSize: '9pt' }}>
          <span>Formula</span>
          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', margin: '0 8px' }}>
            <span style={{ borderBottom: '1px solid #000', paddingBottom: 1 }}>a + b + c + d x 100</span>
            <span style={{ paddingTop: 1 }}>Batch size</span>
          </div>
          <span>=&nbsp;</span>
          <input
            className="bmr-line-input"
            style={{ width: 170 }}
            value={data.page15?.accountability_calc || ''}
            onChange={(e) => updatePage('page15', 'accountability_calc', e.target.value)}
          />
          <span>&nbsp;=&nbsp;</span>
          <input
            className="bmr-line-input"
            style={{ width: 50, textAlign: 'center' }}
            value={data.page15?.accountability_val || ''}
            onChange={(e) => updatePage('page15', 'accountability_val', e.target.value)}
          />
          <span>&nbsp;%&nbsp;(&nbsp;Limit NLT 98%&nbsp;)</span>
        </div>
      </div>
      {renderFooter(15)}
    </div>
  )

  // Page 16: Attach the approved specimen of each carton/ label in below given space
  const renderPage16 = () => (
    <div className="bmr-sheet bmr-oil-sheet" key="page-16">
      {renderHeader(16)}
      <div className="bmr-body">
        <SpecimenUpload
          images={data.page16?.specimens || data.page16?.specimen_images || (data.page16?.specimen_image ? [data.page16.specimen_image] : [])}
          onChange={(imgs) => updatePage('page16', 'specimens', imgs)}
          maxHeight={460}
        />
      </div>
      {renderFooter(16)}
    </div>
  )

  // Page 17: Header and sign-off only (blank body)
  const renderPage17 = () => (
    <div className="bmr-sheet bmr-oil-sheet" key="page-17">
      {renderHeader(17)}
      <div className="bmr-body" style={{ flex: 1 }}>
        {/* Blank body as in PDF Page 17 */}
      </div>
      {renderFooter(17)}
    </div>
  )

  // Page 18: DEVIATION: A) Yield Deviation & B) Procedural Deviation
  const renderPage18 = () => (
    <div className="bmr-sheet bmr-oil-sheet" key="page-18">
      {renderHeader(18)}
      <div className="bmr-body">
        <div className="bmr-section-title" style={{ margin: '4pt 0 2pt' }}>
          DEVIATION :
        </div>

        <div style={{ fontWeight: 'bold', fontSize: '9pt', margin: '4pt 0 6pt' }}>
          A) YIELD DEVIATION: If yield is out of limit to justify the reason as below:
        </div>

        <div style={{ margin: '4pt 0 8pt', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[0, 1, 2, 3].map((idx) => (
            <div key={idx} style={{ width: '100%' }}>
              <input
                className="bmr-line-input"
                style={{ width: '100%', borderBottom: '1px dotted #000' }}
                value={data.page18?.yield_deviation_lines?.[idx] || ''}
                placeholder="…………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………"
                onChange={(e) => {
                  const updated = [...(data.page18?.yield_deviation_lines || ['', '', '', ''])]
                  updated[idx] = e.target.value
                  updatePage('page18', 'yield_deviation_lines', updated)
                }}
              />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4pt 0 10pt', fontSize: '9pt' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <strong>Prepared by/ Date</strong>
              <input
                className="bmr-line-input"
                style={{ width: 140 }}
                value={data.page18?.yield_dev_prod_sign || ''}
                placeholder="Sign / Date"
                onChange={(e) => updatePage('page18', 'yield_dev_prod_sign', e.target.value)}
              />
            </div>
            <div style={{ fontSize: '8.5pt', color: '#334155', marginTop: 2 }}>Production</div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <strong>Approved by/ Date</strong>
              <input
                className="bmr-line-input"
                style={{ width: 140 }}
                value={data.page18?.yield_dev_qa_sign || ''}
                placeholder="Sign / Date"
                onChange={(e) => updatePage('page18', 'yield_dev_qa_sign', e.target.value)}
              />
            </div>
            <div style={{ fontSize: '8.5pt', color: '#334155', marginTop: 2, textAlign: 'right' }}>QA</div>
          </div>
        </div>

        <div style={{ fontWeight: 'bold', fontSize: '9pt', margin: '4pt 0 2pt' }}>
          B)&nbsp; PROCEDURAL DEVIATION:
        </div>

        <table className="bmr-table" style={{ marginTop: 2 }}>
          <colgroup>
            <col style={{ width: 45 }} />
            <col style={{ width: 165 }} />
            <col style={{ width: 165 }} />
            <col style={{ width: 85 }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Sr.<br />No.</th>
              <th style={{ textAlign: 'center' }}>Details of Deviation</th>
              <th style={{ textAlign: 'center' }}>Corrective action</th>
              <th style={{ textAlign: 'center' }}>Raise by</th>
              <th style={{ textAlign: 'center' }}>Approved By(QA)</th>
            </tr>
          </thead>
          <tbody>
            {(data.page18?.procedural_deviations_p18 || []).map((row, idx) => (
              <tr key={idx} style={{ height: 24 }}>
                <td style={{ textAlign: 'center' }}>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.sr || ''}
                    onChange={(e) => {
                      const updated = [...(data.page18?.procedural_deviations_p18 || [])]
                      updated[idx].sr = e.target.value
                      updatePage('page18', 'procedural_deviations_p18', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.details || ''}
                    onChange={(e) => {
                      const updated = [...(data.page18?.procedural_deviations_p18 || [])]
                      updated[idx].details = e.target.value
                      updatePage('page18', 'procedural_deviations_p18', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.action || ''}
                    onChange={(e) => {
                      const updated = [...(data.page18?.procedural_deviations_p18 || [])]
                      updated[idx].action = e.target.value
                      updatePage('page18', 'procedural_deviations_p18', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.raise_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page18?.procedural_deviations_p18 || [])]
                      updated[idx].raise_by = e.target.value
                      updatePage('page18', 'procedural_deviations_p18', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.approved_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page18?.procedural_deviations_p18 || [])]
                      updated[idx].approved_qa = e.target.value
                      updatePage('page18', 'procedural_deviations_p18', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {renderFooter(18)}
    </div>
  )

  // Page 19: Procedural Deviation continuation (2 rows) & Prepared by / Approved by sign-off
  const renderPage19 = () => (
    <div className="bmr-sheet bmr-oil-sheet" key="page-19">
      {renderHeader(19)}
      <div className="bmr-body">
        <table className="bmr-table" style={{ marginTop: 2, marginBottom: '8pt' }}>
          <colgroup>
            <col style={{ width: 45 }} />
            <col style={{ width: 165 }} />
            <col style={{ width: 165 }} />
            <col style={{ width: 85 }} />
            <col />
          </colgroup>
          <tbody>
            {(data.page19?.procedural_deviations_p19 || []).map((row, idx) => (
              <tr key={idx} style={{ height: 24 }}>
                <td style={{ textAlign: 'center' }}>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.sr || ''}
                    onChange={(e) => {
                      const updated = [...(data.page19?.procedural_deviations_p19 || [])]
                      updated[idx].sr = e.target.value
                      updatePage('page19', 'procedural_deviations_p19', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.details || ''}
                    onChange={(e) => {
                      const updated = [...(data.page19?.procedural_deviations_p19 || [])]
                      updated[idx].details = e.target.value
                      updatePage('page19', 'procedural_deviations_p19', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.action || ''}
                    onChange={(e) => {
                      const updated = [...(data.page19?.procedural_deviations_p19 || [])]
                      updated[idx].action = e.target.value
                      updatePage('page19', 'procedural_deviations_p19', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.raise_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page19?.procedural_deviations_p19 || [])]
                      updated[idx].raise_by = e.target.value
                      updatePage('page19', 'procedural_deviations_p19', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.approved_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page19?.procedural_deviations_p19 || [])]
                      updated[idx].approved_qa = e.target.value
                      updatePage('page19', 'procedural_deviations_p19', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4pt 0 10pt', fontSize: '9pt' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <strong>Prepared by/ Date</strong>
              <input
                className="bmr-line-input"
                style={{ width: 140 }}
                value={data.page19?.proc_dev_prod_sign || ''}
                placeholder="Sign / Date"
                onChange={(e) => updatePage('page19', 'proc_dev_prod_sign', e.target.value)}
              />
            </div>
            <div style={{ fontSize: '8.5pt', color: '#334155', marginTop: 2 }}>Production</div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <strong>Approved by/ Date</strong>
              <input
                className="bmr-line-input"
                style={{ width: 140 }}
                value={data.page19?.proc_dev_qa_sign || ''}
                placeholder="Sign / Date"
                onChange={(e) => updatePage('page19', 'proc_dev_qa_sign', e.target.value)}
              />
            </div>
            <div style={{ fontSize: '8.5pt', color: '#334155', marginTop: 2, textAlign: 'right' }}>QA</div>
          </div>
        </div>
      </div>
      {renderFooter(19)}
    </div>
  )

  return [
    renderPage1,
    renderPage2,
    renderPage3,
    renderPage4,
    renderPage5,
    renderPage6,
    renderPage7,
    renderPage8,
    renderPage9,
    renderPage10,
    renderPage11,
    renderPage12,
    renderPage13,
    renderPage14,
    renderPage15,
    renderPage16,
    renderPage17,
    renderPage18,
    renderPage19,
  ]
}
