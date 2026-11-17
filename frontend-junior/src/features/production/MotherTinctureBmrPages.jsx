import React, { useEffect } from 'react'

export function getMotherTincturePageRenderers({
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
  // -------------------------------------------------------------
  // Page 1: Product Details & Attachments Checklist
  // -------------------------------------------------------------
  const renderPage1 = () => (
    <div className="bmr-sheet bmr-mother-tincture-sheet" key="page-1">
      {renderHeader(1)}
      <div className="bmr-body bmr-mt-p1-body">
        <div className="bmr-mt-section-heading">
          Product Details
        </div>

        <div className="bmr-mt-p1-details">
          <div className="bmr-mt-p1-row">
            <span className="bmr-mt-row-num">1</span>
            <span className="bmr-mt-row-label">HERB NAME :</span>
            <div className="bmr-mt-row-field">
              <input
                className="bmr-line-input"
                value={data.page1?.herb_name || ''}
                onChange={(e) => updatePage('page1', 'herb_name', e.target.value)}
              />
            </div>
          </div>

          <div className="bmr-mt-p1-row">
            <span className="bmr-mt-row-num">2</span>
            <span className="bmr-mt-row-label">MOTHER TINCTURE PROCESS DATE :</span>
            <div className="bmr-mt-row-field">
              <BmrDateField
                value={data.page1?.process_date || ''}
                onChange={(e) => updatePage('page1', 'process_date', e.target.value)}
              />
            </div>
          </div>

          <div className="bmr-mt-p1-row">
            <span className="bmr-mt-row-num">3</span>
            <span className="bmr-mt-row-label">
              BEST USE BEFORE : 7 YEARS FROM THE DATE OF MANUFACTURING
            </span>
          </div>

          <div className="bmr-mt-p1-row">
            <span className="bmr-mt-row-num">4</span>
            <span className="bmr-mt-row-label">HERB QUANTITY :</span>
            <div className="bmr-mt-row-field">
              <input
                className="bmr-line-input"
                value={data.page1?.herb_quantity || ''}
                onChange={(e) => updatePage('page1', 'herb_quantity', e.target.value)}
              />
            </div>
          </div>

          <div className="bmr-mt-p1-row">
            <span className="bmr-mt-row-num">5</span>
            <span className="bmr-mt-row-label">ALCOHOL QUANTITY :</span>
            <div className="bmr-mt-row-field">
              <input
                className="bmr-line-input"
                value={data.page1?.alcohol_quantity || ''}
                onChange={(e) => updatePage('page1', 'alcohol_quantity', e.target.value)}
              />
            </div>
          </div>

          <div className="bmr-mt-p1-row">
            <span className="bmr-mt-row-num">6</span>
            <span className="bmr-mt-row-label">WATER QUANTITY :</span>
            <div className="bmr-mt-row-field">
              <input
                className="bmr-line-input"
                value={data.page1?.water_quantity || ''}
                onChange={(e) => updatePage('page1', 'water_quantity', e.target.value)}
              />
            </div>
          </div>

          <div className="bmr-mt-p1-row">
            <span className="bmr-mt-row-num">7</span>
            <span className="bmr-mt-row-label">TOTAL VOLUME :</span>
            <div className="bmr-mt-row-field">
              <input
                className="bmr-line-input"
                value={data.page1?.total_volume || ''}
                onChange={(e) => updatePage('page1', 'total_volume', e.target.value)}
              />
            </div>
          </div>

          <div className="bmr-mt-p1-row">
            <span className="bmr-mt-row-num">8</span>
            <span className="bmr-mt-row-label">ALCOHOL PERCENTAGE :</span>
            <div className="bmr-mt-row-field">
              <input
                className="bmr-line-input"
                value={data.page1?.alcohol_percentage || ''}
                onChange={(e) => updatePage('page1', 'alcohol_percentage', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="bmr-mt-p1-attachments-section">
          <div className="bmr-mt-p1-attach-header-row">
            <div className="bmr-mt-p1-attach-title">Check List of Attachments</div>
            <div className="bmr-mt-p1-compliance-title">Marks of Compliance</div>
          </div>

          <div className="bmr-mt-p1-attach-body">
            <div className="bmr-mt-p1-attach-list">
              <div className="bmr-mt-attach-item">
                <span className="bmr-mt-attach-num">1</span>
                <span className="bmr-mt-attach-text">RM requisition slip (ATTACHMENT 1)</span>
              </div>
              <div className="bmr-mt-attach-item">
                <span className="bmr-mt-attach-num">2</span>
                <span className="bmr-mt-attach-text">Test request for bulk before filter(ATTACHMENT 2)</span>
              </div>
              <div className="bmr-mt-attach-item">
                <span className="bmr-mt-attach-num">3</span>
                <span className="bmr-mt-attach-text">Release note after prefilled tincture (ATTACHMENT 3)</span>
              </div>
              <div className="bmr-mt-attach-item">
                <span className="bmr-mt-attach-num">4</span>
                <span className="bmr-mt-attach-text">Test request of bulk after filter(ATTACHMENT4 )</span>
              </div>
              <div className="bmr-mt-attach-item">
                <span className="bmr-mt-attach-num">5</span>
                <span className="bmr-mt-attach-text">COA of bulk (MT) (ATTACHMENT 5 )</span>
              </div>
            </div>

            <div className="bmr-mt-compliance-boxes">
              {[1, 2, 3, 4, 5].map((itemNum) => {
                const key = `item${itemNum}`
                const isChecked = Boolean(data.page1?.attachments?.[key])
                return (
                  <div
                    key={key}
                    className={`bmr-mt-compliance-box ${isChecked ? 'checked' : ''}`}
                    onClick={() => {
                      updatePage('page1', 'attachments', {
                        ...(data.page1?.attachments || {}),
                        [key]: !isChecked,
                      })
                    }}
                    title="Click to toggle compliance tick"
                  >
                    {isChecked ? '✓' : ''}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      {renderFooter(1)}
    </div>
  )

  // -------------------------------------------------------------
  // Page 2: RM Dispensing Area Line Clearance (Part 1)
  // -------------------------------------------------------------
  const renderPage2 = () => {
    const checklistItems = [
      { id: 'item1', num: 1, text: 'Dispensing booth and equipments are cleaned and are dust free' },
      { id: 'item2', num: 2, text: 'Relevant weighing balances are calibrated.' },
      { id: 'item3', num: 3, text: 'All types of wastages are removed from dispensing area.' },
      { id: 'item4', num: 4, text: 'All raw materials of previous products are removed from dispensing area' },
      { id: 'item5', num: 5, text: 'Containers and other equipments used for weighing and transferring the materials are cleaned and dried' },
      { id: 'item6', num: 6, text: 'All approved labels are checked' },
      { id: 'item7', num: 7, text: 'RM requisition sheet is filled and duly signed till this stage' },
    ]

    return (
      <div className="bmr-sheet bmr-mother-tincture-sheet" key="page-2">
        {renderHeader(2)}
        <div className="bmr-body bmr-mt-p2-body">
          {/* Large blank gap below header */}
          <div className="bmr-mt-p2-gap" />

          {/* Sign-offs row */}
          <div className="bmr-mt-sign-two-col">
            <div className="bmr-mt-sign-col">
              <div className="bmr-mt-sign-title">Checked by/Date</div>
              <div className="bmr-mt-sign-subtitle">(Liquid Department In-charge)</div>
              <input
                className="bmr-line-input"
                style={{ width: '80%', marginTop: '4pt' }}
                value={data.page2?.checked_by_date || ''}
                onChange={(e) => updatePage('page2', 'checked_by_date', e.target.value)}
              />
            </div>
            <div className="bmr-mt-sign-col" style={{ textAlign: 'right' }}>
              <div className="bmr-mt-sign-title">Verified by/Date</div>
              <div className="bmr-mt-sign-subtitle">(QA)</div>
              <input
                className="bmr-line-input"
                style={{ width: '80%', marginTop: '4pt', textAlign: 'right' }}
                value={data.page2?.verified_by_date || ''}
                onChange={(e) => updatePage('page2', 'verified_by_date', e.target.value)}
              />
            </div>
          </div>

          <div className="bmr-mt-clearance-heading">
            RAW MATERIAL DISPENSING AREA LINE CLEARANCE:
          </div>

          <div className="bmr-mt-prev-product-row">
            <div className="bmr-mt-prev-col">
              <span className="bmr-mt-bold-label">PREVIOUS PRODUCT :</span>
              <input
                className="bmr-line-input"
                style={{ flex: 1, marginLeft: 6 }}
                value={data.page2?.previous_product || ''}
                onChange={(e) => updatePage('page2', 'previous_product', e.target.value)}
              />
            </div>
            <div className="bmr-mt-prev-col" style={{ justifyContent: 'flex-end' }}>
              <span className="bmr-mt-bold-label">BATCH NO.</span>
              <input
                className="bmr-line-input"
                style={{ width: 140, marginLeft: 6 }}
                value={data.page2?.batch_no || ''}
                onChange={(e) => updatePage('page2', 'batch_no', e.target.value)}
              />
            </div>
          </div>

          <table className="bmr-table bmr-mt-table">
            <colgroup>
              <col style={{ width: '10%' }} />
              <col style={{ width: '74%' }} />
              <col style={{ width: '16%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: 'center' }}>Sr. No.</th>
                <th>Activity</th>
                <th style={{ textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {checklistItems.map((row) => (
                <tr key={row.id}>
                  <td style={{ textAlign: 'center' }}>{row.num}</td>
                  <td>{row.text}</td>
                  <td style={{ textAlign: 'center' }}>
                    {renderYesNo(data.page2?.checklist?.[row.id], (val) => {
                      updatePage('page2', 'checklist', {
                        ...(data.page2?.checklist || {}),
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
  }

  // -------------------------------------------------------------
  // Page 3: RM Clearance (Part 2) & Mfg Area Clearance
  // -------------------------------------------------------------
  const renderPage3 = () => {
    const mfgChecklistItems = [
      { id: 'item1', num: 1, text: 'Previous Product left over is removed from area.' },
      { id: 'item2', num: 2, text: 'All equipments/ machineries are properly cleaned and dried.' },
      { id: 'item3', num: 3, text: 'All equipments / machineries are in perfect working order.' },
      { id: 'item4', num: 4, text: 'Manufacturing area is cleaned and all types of wastage are removed from this area.' },
    ]

    return (
      <div className="bmr-sheet bmr-mother-tincture-sheet" key="page-3">
        {renderHeader(3)}
        <div className="bmr-body bmr-mt-p3-body">
          {/* Continuation table directly below header with blank first row */}
          <table className="bmr-table bmr-mt-table" style={{ marginTop: '2pt', marginBottom: '8pt' }}>
            <colgroup>
              <col style={{ width: '10%' }} />
              <col style={{ width: '74%' }} />
              <col style={{ width: '16%' }} />
            </colgroup>
            <tbody>
              {/* Blank first row as in PDF */}
              <tr style={{ height: '18pt' }}>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
              <tr>
                <td style={{ textAlign: 'center' }}>8</td>
                <td>BMR is properly filled and duly signed till this stage.</td>
                <td style={{ textAlign: 'center' }}>
                  {renderYesNo(data.page3?.checklist?.item8, (val) => {
                    updatePage('page3', 'checklist', {
                      ...(data.page3?.checklist || {}),
                      item8: val,
                    })
                  })}
                </td>
              </tr>
              <tr>
                <td style={{ textAlign: 'center' }}>9</td>
                <td>Status labelling of dispensing area is proper.</td>
                <td style={{ textAlign: 'center' }}>
                  {renderYesNo(data.page3?.checklist?.item9, (val) => {
                    updatePage('page3', 'checklist', {
                      ...(data.page3?.checklist || {}),
                      item9: val,
                    })
                  })}
                </td>
              </tr>
            </tbody>
          </table>

          <div className="bmr-mt-p3-sign-lines">
            <div className="bmr-mt-p3-sign-row">
              <span className="bmr-mt-bold-label">Checked By / Date (Warehouse) :</span>
              <input
                className="bmr-line-input"
                style={{ flex: 1, marginLeft: 8 }}
                value={data.page3?.checked_by_warehouse || ''}
                onChange={(e) => updatePage('page3', 'checked_by_warehouse', e.target.value)}
              />
            </div>
            <div className="bmr-mt-p3-sign-row" style={{ marginTop: '6pt' }}>
              <span className="bmr-mt-bold-label">Verified By/Date ( QA) :</span>
              <input
                className="bmr-line-input"
                style={{ flex: 1, marginLeft: 8 }}
                value={data.page3?.verified_by_qa || ''}
                onChange={(e) => updatePage('page3', 'verified_by_qa', e.target.value)}
              />
            </div>
          </div>

          <div style={{ marginTop: '20pt', marginBottom: '6pt' }}>
            <div className="bmr-mt-underlined-heading">
              MANUFACTURING AREA LINE CLEARANCE:
            </div>
          </div>

          <div className="bmr-mt-prev-product-row">
            <div className="bmr-mt-prev-col">
              <span className="bmr-mt-bold-label">PREVIOUS PRODUCT :</span>
              <input
                className="bmr-line-input"
                style={{ flex: 1, marginLeft: 6 }}
                value={data.page3?.previous_product_mfg || ''}
                onChange={(e) => updatePage('page3', 'previous_product_mfg', e.target.value)}
              />
            </div>
            <div className="bmr-mt-prev-col" style={{ justifyContent: 'flex-end' }}>
              <span className="bmr-mt-bold-label">BATCH NO.</span>
              <input
                className="bmr-line-input"
                style={{ width: 140, marginLeft: 6 }}
                value={data.page3?.batch_no_mfg || ''}
                onChange={(e) => updatePage('page3', 'batch_no_mfg', e.target.value)}
              />
            </div>
          </div>

          <table className="bmr-table bmr-mt-table">
            <colgroup>
              <col style={{ width: '10%' }} />
              <col style={{ width: '74%' }} />
              <col style={{ width: '16%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: 'center' }}>Sr. No.</th>
                <th>Activity</th>
                <th style={{ textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {mfgChecklistItems.map((row) => (
                <tr key={row.id}>
                  <td style={{ textAlign: 'center' }}>{row.num}</td>
                  <td>{row.text}</td>
                  <td style={{ textAlign: 'center' }}>
                    {renderYesNo(data.page3?.mfg_checklist?.[row.id], (val) => {
                      updatePage('page3', 'mfg_checklist', {
                        ...(data.page3?.mfg_checklist || {}),
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
  }

  // -------------------------------------------------------------
  // Page 4: Mfg Area Clearance (Part 2) & Mother Tincture Process
  // -------------------------------------------------------------
  const renderPage4 = () => (
    <div className="bmr-sheet bmr-mother-tincture-sheet" key="page-4">
      {renderHeader(4)}
      <div className="bmr-body bmr-mt-p4-body">
        {/* Continuation table directly under header */}
        <table className="bmr-table bmr-mt-table" style={{ marginTop: '2pt', marginBottom: '4pt' }}>
          <colgroup>
            <col style={{ width: '10%' }} />
            <col style={{ width: '74%' }} />
            <col style={{ width: '16%' }} />
          </colgroup>
          <tbody>
            <tr>
              <td style={{ textAlign: 'center' }}>5</td>
              <td>AHU system is properly working.</td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page4?.mfg_checklist?.item5, (val) => {
                  updatePage('page4', 'mfg_checklist', {
                    ...(data.page4?.mfg_checklist || {}),
                    item5: val,
                  })
                })}
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>6</td>
              <td>BMR is properly filled and duly signed till this stage.</td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page4?.mfg_checklist?.item6, (val) => {
                  updatePage('page4', 'mfg_checklist', {
                    ...(data.page4?.mfg_checklist || {}),
                    item6: val,
                  })
                })}
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>7</td>
              <td>Status labeling of manufacturing area is proper.</td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page4?.mfg_checklist?.item7, (val) => {
                  updatePage('page4', 'mfg_checklist', {
                    ...(data.page4?.mfg_checklist || {}),
                    item7: val,
                  })
                })}
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center', verticalAlign: 'top' }}>8</td>
              <td style={{ lineHeight: 1.35 }}>
                Temperature, % RH and differential pressure is within limit.
                <br />
                Temperature (Limit: 27°C ±2°C)
                <br />
                % Relative Humidity (Limit: 55% ± 5%)
                <br />
                <span className="bmr-mt-nowrap-label">
                  Differential Pressure (Limit NLT{' '}
                  <input
                    className="bmr-line-input bmr-mt-dp-input"
                    value={data.page4?.dp_limit || ''}
                    placeholder="____"
                    onChange={(e) => updatePage('page4', 'dp_limit', e.target.value)}
                  />{' '}
                  Pascal)
                </span>
              </td>
              <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                {renderYesNo(data.page4?.mfg_checklist?.item8, (val) => {
                  updatePage('page4', 'mfg_checklist', {
                    ...(data.page4?.mfg_checklist || {}),
                    item8: val,
                  })
                })}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Checked By / Verified By side by side */}
        <div className="bmr-mt-sign-two-col" style={{ margin: '3pt 0 4pt' }}>
          <div className="bmr-mt-sign-col-inline">
            <span className="bmr-mt-bold-label">Checked By / Date (Production) :</span>
            <input
              className="bmr-line-input"
              style={{ flex: 1, marginLeft: 6 }}
              value={data.page4?.checked_by_production || ''}
              onChange={(e) => updatePage('page4', 'checked_by_production', e.target.value)}
            />
          </div>
          <div className="bmr-mt-sign-col-inline" style={{ marginLeft: 20 }}>
            <span className="bmr-mt-bold-label">Verified by/Date (QA) :</span>
            <input
              className="bmr-line-input"
              style={{ flex: 1, marginLeft: 6 }}
              value={data.page4?.verified_by_qa || ''}
              onChange={(e) => updatePage('page4', 'verified_by_qa', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-mt-underlined-heading" style={{ margin: '4pt 0 3pt' }}>
          MANUFACTURING (MOTHER TINCTURE PROCESS):
        </div>

        {/* Process Table */}
        <table className="bmr-table bmr-mt-table bmr-mt-process-table" style={{ marginBottom: '3pt' }}>
          <colgroup>
            <col style={{ width: '8%' }} />
            <col style={{ width: '25%' }} />
            <col style={{ width: '67%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>
                Sr.<br />No.
              </th>
              <th>Equipment</th>
              <th>&nbsp;</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ textAlign: 'center' }}>1</td>
              <td>Herb</td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <span style={{ marginRight: '6px', fontWeight: 'bold' }}>.</span>
                  <input
                    className="bmr-cell-input"
                    value={data.page4?.process?.herb_text || ''}
                    onChange={(e) => {
                      updatePage('page4', 'process', {
                        ...(data.page4?.process || {}),
                        herb_text: e.target.value,
                      })
                    }}
                  />
                </div>
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>2</td>
              <td>Alcohol</td>
              <td>
                <input
                  className="bmr-cell-input"
                  value={data.page4?.process?.alcohol_text || ''}
                  onChange={(e) => {
                    updatePage('page4', 'process', {
                      ...(data.page4?.process || {}),
                      alcohol_text: e.target.value,
                    })
                  }}
                />
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>3</td>
              <td>Purified Water</td>
              <td>
                <input
                  className="bmr-cell-input"
                  value={data.page4?.process?.water_text || ''}
                  onChange={(e) => {
                    updatePage('page4', 'process', {
                      ...(data.page4?.process || {}),
                      water_text: e.target.value,
                    })
                  }}
                />
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>4</td>
              <td>Soaking date</td>
              <td>
                <BmrDateField
                  value={data.page4?.process?.soaking_date || ''}
                  onChange={(e) => {
                    updatePage('page4', 'process', {
                      ...(data.page4?.process || {}),
                      soaking_date: e.target.value,
                    })
                  }}
                  className="bmr-cell-input"
                />
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>5</td>
              <td>Filtration date</td>
              <td>
                <BmrDateField
                  value={data.page4?.process?.filtration_date || ''}
                  onChange={(e) => {
                    updatePage('page4', 'process', {
                      ...(data.page4?.process || {}),
                      filtration_date: e.target.value,
                    })
                  }}
                  className="bmr-cell-input"
                />
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>6</td>
              <td>Filtration time</td>
              <td>
                <div className="bmr-mt-inline-fields">
                  <span className="bmr-mt-nowrap-label">From :</span>
                  <input
                    className="bmr-line-input bmr-mt-time-input"
                    value={data.page4?.process?.filtration_from || ''}
                    onChange={(e) => {
                      updatePage('page4', 'process', {
                        ...(data.page4?.process || {}),
                        filtration_from: e.target.value,
                      })
                    }}
                  />
                  <span className="bmr-mt-nowrap-label" style={{ marginLeft: 6 }}>To:</span>
                  <input
                    className="bmr-line-input bmr-mt-time-input"
                    value={data.page4?.process?.filtration_to || ''}
                    onChange={(e) => {
                      updatePage('page4', 'process', {
                        ...(data.page4?.process || {}),
                        filtration_to: e.target.value,
                      })
                    }}
                  />
                  <span className="bmr-mt-nowrap-label" style={{ marginLeft: 6 }}>Total time (mins):</span>
                  <input
                    className="bmr-line-input bmr-mt-time-input"
                    value={data.page4?.process?.filtration_total_time || ''}
                    onChange={(e) => {
                      updatePage('page4', 'process', {
                        ...(data.page4?.process || {}),
                        filtration_total_time: e.target.value,
                      })
                    }}
                  />
                </div>
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>7</td>
              <td>Make Up</td>
              <td>
                <div className="bmr-mt-inline-fields">
                  <span className="bmr-mt-nowrap-label">Alcohol Quantity</span>
                  <input
                    className="bmr-line-input bmr-mt-qty-input"
                    value={data.page4?.process?.make_up_alcohol_qty || ''}
                    onChange={(e) => {
                      updatePage('page4', 'process', {
                        ...(data.page4?.process || {}),
                        make_up_alcohol_qty: e.target.value,
                      })
                    }}
                  />
                  <span className="bmr-mt-nowrap-label" style={{ marginLeft: 10 }}>Water Quantity</span>
                  <input
                    className="bmr-line-input bmr-mt-qty-input"
                    value={data.page4?.process?.make_up_water_qty || ''}
                    onChange={(e) => {
                      updatePage('page4', 'process', {
                        ...(data.page4?.process || {}),
                        make_up_water_qty: e.target.value,
                      })
                    }}
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        {/* Cleaned by / Verified by / Checked by / Total Volume */}
        <div style={{ marginTop: '4pt', display: 'flex', flexDirection: 'column', gap: '3pt' }}>
          <div className="bmr-mt-sign-two-col" style={{ marginBottom: 0 }}>
            <div className="bmr-mt-sign-col-inline">
              <span className="bmr-mt-bold-label">Cleaned by/ Date (Production) :</span>
              <input
                className="bmr-line-input"
                style={{ flex: 1, marginLeft: 6 }}
                value={data.page4?.cleaned_by_production || ''}
                onChange={(e) => updatePage('page4', 'cleaned_by_production', e.target.value)}
              />
            </div>
            <div className="bmr-mt-sign-col-inline" style={{ marginLeft: 20 }}>
              <span className="bmr-mt-bold-label">Verified by/ date (QA) :</span>
              <input
                className="bmr-line-input"
                style={{ flex: 1, marginLeft: 6 }}
                value={data.page4?.process_verified_by_qa || ''}
                onChange={(e) => updatePage('page4', 'process_verified_by_qa', e.target.value)}
              />
            </div>
          </div>

          <div className="bmr-mt-sign-col-inline" style={{ width: '60%' }}>
            <span className="bmr-mt-bold-label">Checked by/ Date (Production) :</span>
            <input
              className="bmr-line-input"
              style={{ flex: 1, marginLeft: 6 }}
              value={data.page4?.process_checked_by_production || ''}
              onChange={(e) => updatePage('page4', 'process_checked_by_production', e.target.value)}
            />
          </div>

          <div className="bmr-mt-sign-col-inline" style={{ width: '50%', marginTop: '2pt' }}>
            <span className="bmr-mt-bold-label" style={{ fontSize: '9pt' }}>a. Total Volume* :</span>
            <input
              className="bmr-line-input"
              style={{ width: '150px', marginLeft: 8 }}
              value={data.page4?.total_volume_a || ''}
              onChange={(e) => updatePage('page4', 'total_volume_a', e.target.value)}
            />
          </div>
        </div>
      </div>
      {renderFooter(4)}
    </div>
  )

  // -------------------------------------------------------------
  // Page 5: Yield Loss & Deviations
  // -------------------------------------------------------------
  const renderPage5 = () => {
    // Auto-calculate yield if Total Volume (a) and Filter qty (b) are available
    const aVal = parseFloat(data.page4?.total_volume_a || data.page1?.total_volume || '0')
    const bVal = parseFloat(data.page5?.filter_qty_b || '0')
    let autoCalcExpr = ''
    let autoYieldPct = ''
    if (aVal > 0 && bVal > 0) {
      const diff = aVal - bVal
      const pct = (diff * 100) / aVal
      autoCalcExpr = `${aVal} - ${bVal} × 100 / ${aVal}`
      autoYieldPct = pct >= 0 ? pct.toFixed(2) : '0.00'
    }

    const calcDisplay = data.page5?.yield_calc !== undefined && data.page5?.yield_calc !== ''
      ? data.page5.yield_calc
      : autoCalcExpr

    const pctDisplay = data.page5?.yield_percent !== undefined && data.page5?.yield_percent !== ''
      ? data.page5.yield_percent
      : autoYieldPct

    return (
      <div className="bmr-sheet bmr-mother-tincture-sheet" key="page-5">
        {renderHeader(5)}
        <div className="bmr-body bmr-mt-p5-body">
          <div className="bmr-mt-p5-filter-qty-row">
            <span className="bmr-mt-bold-label" style={{ fontSize: '9pt' }}>b. Filter qty. :</span>
            <input
              className="bmr-line-input"
              style={{ width: '150px', marginLeft: 8 }}
              value={data.page5?.filter_qty_b || ''}
              onChange={(e) => updatePage('page5', 'filter_qty_b', e.target.value)}
            />
          </div>

          <div style={{ margin: '3pt 0 4pt', fontWeight: 'bold', fontSize: '8.5pt' }}>
            *As per HPI Monograph
          </div>

          <div className="bmr-mt-underlined-heading" style={{ margin: '4pt 0 3pt' }}>
            YIELD LOSS :
          </div>

          {/* Formula Line */}
          <div className="bmr-mt-formula-row" style={{ margin: '4pt 0 6pt' }}>
            <span className="bmr-mt-formula-label">Formula</span>
            <div className="bmr-mt-fraction">
              <span className="bmr-mt-fraction-top">a – b x 100</span>
              <span className="bmr-mt-fraction-bottom">Total Volume</span>
            </div>
            <span className="bmr-mt-formula-eq">=</span>
            <input
              className="bmr-line-input bmr-mt-yield-calc-input"
              value={calcDisplay}
              placeholder="_____________________________"
              onChange={(e) => updatePage('page5', 'yield_calc', e.target.value)}
            />
            <span className="bmr-mt-formula-eq">=</span>
            <input
              className="bmr-line-input bmr-mt-yield-pct-input"
              value={pctDisplay}
              placeholder="____"
              onChange={(e) => updatePage('page5', 'yield_percent', e.target.value)}
            />
            <span style={{ fontWeight: 'normal', fontSize: '9pt', marginLeft: 4, whiteSpace: 'nowrap' }}>
              % ( Limit NMT 10%)
            </span>
          </div>

          <div style={{ marginTop: '6pt' }}>
            <div className="bmr-mt-underlined-heading" style={{ margin: '2pt 0 2pt' }}>
              DEVIATION :
            </div>
            <div className="bmr-mt-bold-label" style={{ marginTop: '2pt', fontSize: '8.5pt' }}>
              A) YIELD DEVIATION: If yield is out of limit to justify the reason as below:
            </div>
          </div>

          {/* 2 Dotted lines */}
          <div className="bmr-mt-dotted-lines" style={{ marginTop: '3pt' }}>
            <textarea
              className="bmr-mt-dotted-textarea"
              rows={2}
              value={data.page5?.yield_deviation_reason || ''}
              onChange={(e) => updatePage('page5', 'yield_deviation_reason', e.target.value)}
              placeholder="…………………………………………………………………………………………………………………………………&#10;…………………………………………………………………………………………………………………………………"
            />
          </div>

          {/* Prepared by / Approved by for Yield */}
          <div className="bmr-mt-sign-two-col" style={{ margin: '6pt 0 6pt' }}>
            <div className="bmr-mt-sign-col">
              <div className="bmr-mt-sign-title">Prepared by/ Date</div>
              <div className="bmr-mt-sign-subtitle">Production</div>
              <input
                className="bmr-line-input"
                style={{ width: '80%', marginTop: '2pt' }}
                value={data.page5?.yield_prepared_by || ''}
                onChange={(e) => updatePage('page5', 'yield_prepared_by', e.target.value)}
              />
            </div>
            <div className="bmr-mt-sign-col" style={{ textAlign: 'right' }}>
              <div className="bmr-mt-sign-title">Approved by/ Date</div>
              <div className="bmr-mt-sign-subtitle">QA</div>
              <input
                className="bmr-line-input"
                style={{ width: '80%', marginTop: '2pt', textAlign: 'right' }}
                value={data.page5?.yield_approved_by || ''}
                onChange={(e) => updatePage('page5', 'yield_approved_by', e.target.value)}
              />
            </div>
          </div>

          <div className="bmr-mt-bold-label" style={{ marginBottom: '4pt', fontSize: '9pt' }}>
            B) PROCEDURAL DEVIATION:
          </div>

          <table className="bmr-table bmr-mt-table bmr-mt-proc-table" style={{ marginBottom: '2pt' }}>
            <colgroup>
              <col style={{ width: '8%' }} />
              <col style={{ width: '37%' }} />
              <col style={{ width: '25%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '15%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: 'center' }}>
                  Sr.<br />No.
                </th>
                <th>Details of Deviation</th>
                <th>Corrective action</th>
                <th>Raise by</th>
                <th>Approved By(QA)</th>
              </tr>
            </thead>
            <tbody>
              {(data.page5?.procedural_deviations || [1, 2, 3]).map((row, idx) => (
                <tr key={idx} style={{ height: '18pt' }}>
                  <td style={{ textAlign: 'center' }}>{row.sr_no || idx + 1}</td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.details || ''}
                      onChange={(e) => {
                        const updated = [...(data.page5?.procedural_deviations || [])]
                        updated[idx] = { ...updated[idx], sr_no: String(idx + 1), details: e.target.value }
                        updatePage('page5', 'procedural_deviations', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.corrective_action || ''}
                      onChange={(e) => {
                        const updated = [...(data.page5?.procedural_deviations || [])]
                        updated[idx] = { ...updated[idx], sr_no: String(idx + 1), corrective_action: e.target.value }
                        updatePage('page5', 'procedural_deviations', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.raise_by || ''}
                      onChange={(e) => {
                        const updated = [...(data.page5?.procedural_deviations || [])]
                        updated[idx] = { ...updated[idx], sr_no: String(idx + 1), raise_by: e.target.value }
                        updatePage('page5', 'procedural_deviations', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.approved_by || ''}
                      onChange={(e) => {
                        const updated = [...(data.page5?.procedural_deviations || [])]
                        updated[idx] = { ...updated[idx], sr_no: String(idx + 1), approved_by: e.target.value }
                        updatePage('page5', 'procedural_deviations', updated)
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {renderFooter(5)}
      </div>
    )
  }

  // -------------------------------------------------------------
  // Page 6: Sign-off Page
  // -------------------------------------------------------------
  const renderPage6 = () => (
    <div className="bmr-sheet bmr-mother-tincture-sheet" key="page-6">
      {renderHeader(6)}
      <div className="bmr-body bmr-mt-p6-body">
        {/* Only Prepared by / Approved by under header, rest empty */}
        <div className="bmr-mt-sign-two-col" style={{ marginTop: '12pt' }}>
          <div className="bmr-mt-sign-col">
            <div className="bmr-mt-sign-title">Prepared by/ Date</div>
            <div className="bmr-mt-sign-subtitle">Production</div>
            <input
              className="bmr-line-input"
              style={{ width: '80%', marginTop: '4pt' }}
              value={data.page6?.prepared_by || ''}
              onChange={(e) => updatePage('page6', 'prepared_by', e.target.value)}
            />
          </div>
          <div className="bmr-mt-sign-col" style={{ textAlign: 'right' }}>
            <div className="bmr-mt-sign-title">Approved by/ Date</div>
            <div className="bmr-mt-sign-subtitle">QA</div>
            <input
              className="bmr-line-input"
              style={{ width: '80%', marginTop: '4pt', textAlign: 'right' }}
              value={data.page6?.approved_by || ''}
              onChange={(e) => updatePage('page6', 'approved_by', e.target.value)}
            />
          </div>
        </div>

        {/* Clean blank white space fills the middle */}
        <div style={{ flex: 1 }} />
      </div>
      {renderFooter(6)}
    </div>
  )

  return [
    renderPage1,
    renderPage2,
    renderPage3,
    renderPage4,
    renderPage5,
    renderPage6,
  ]
}
