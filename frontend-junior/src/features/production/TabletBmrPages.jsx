import React from 'react'

export function getTabletPageRenderers({
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
  // Helper for Applicable / Not Applicable toggle
  const renderApplicableToggle = (value, onChange) => (
    <span className="bmr-applicable-toggle-wrap">
      <label className="bmr-syrup-radio-label">
        <input
          type="radio"
          checked={value === 'Applicable'}
          onChange={() => onChange('Applicable')}
        />
        <span>Applicable</span>
      </label>
      <span className="bmr-syrup-radio-sep">/</span>
      <label className="bmr-syrup-radio-label">
        <input
          type="radio"
          checked={value === 'Not Applicable'}
          onChange={() => onChange('Not Applicable')}
        />
        <span>Not Applicable</span>
      </label>
    </span>
  )

  // -------------------------------------------------------------
  // Page 1: Product Details & Attachments Checklist
  // -------------------------------------------------------------
  const renderPage1 = () => (
    <div className="bmr-sheet bmr-tablet-sheet" key="page-1">
      {renderHeader(1)}
      <div className="bmr-body bmr-tablet-p1-body">
        <div className="bmr-tablet-section-heading" style={{ textDecoration: 'none', fontWeight: 'bold' }}>
          Product Details
        </div>
        <div className="bmr-tablet-p1-details">
          <div className="bmr-tablet-p1-row">
            <span className="bmr-p1-num">1</span>
            <span className="bmr-p1-label">Manufacturing Date</span>
            <span className="bmr-p1-colon">:</span>
            <div className="bmr-p1-field">
              <BmrDateField
                value={data.page1?.mfg_date || ''}
                onChange={(e) => updatePage('page1', 'mfg_date', e.target.value)}
              />
            </div>
          </div>
          <div className="bmr-tablet-p1-row">
            <span className="bmr-p1-num">2</span>
            <span className="bmr-p1-label">Expiry Date / Best Use Before :</span>
            <span className="bmr-p1-colon">:</span>
            <div className="bmr-p1-field">
              <input
                className="bmr-line-input"
                value={data.page1?.expiry_date !== undefined ? data.page1.expiry_date : '3 YEARS'}
                onChange={(e) => updatePage('page1', 'expiry_date', e.target.value)}
              />
            </div>
          </div>
          <div className="bmr-tablet-p1-row">
            <span className="bmr-p1-num">3</span>
            <span className="bmr-p1-label">Batch Size</span>
            <span className="bmr-p1-colon">:</span>
            <div className="bmr-p1-field">
              <input
                className="bmr-line-input"
                value={data.page1?.batch_size || ''}
                onChange={(e) => updatePage('page1', 'batch_size', e.target.value)}
              />
            </div>
          </div>
          <div className="bmr-tablet-p1-row">
            <span className="bmr-p1-num">4</span>
            <span className="bmr-p1-label">Date of Manufacturing Started:</span>
            <span className="bmr-p1-colon">:</span>
            <div className="bmr-p1-field">
              <BmrDateField
                value={data.page1?.mfg_started || ''}
                onChange={(e) => updatePage('page1', 'mfg_started', e.target.value)}
              />
            </div>
          </div>
          <div className="bmr-tablet-p1-row">
            <span className="bmr-p1-num">5</span>
            <span className="bmr-p1-label">Date of Manufacturing Completed</span>
            <span className="bmr-p1-colon">:</span>
            <div className="bmr-p1-field">
              <BmrDateField
                value={data.page1?.mfg_completed || ''}
                onChange={(e) => updatePage('page1', 'mfg_completed', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="bmr-tablet-checklist-container">
          <table className="bmr-tablet-checklist-table">
            <colgroup>
              <col style={{ width: '78%' }} />
              <col style={{ width: '22%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', fontWeight: 'normal', border: 'none', paddingLeft: 0 }}>
                  Check List of Attachments
                </th>
                <th style={{ textAlign: 'center', fontWeight: 'normal', border: 'none' }}>
                  Marks of Compliance
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                { key: 'item1', num: 1, text: 'RM requisition slip (ATTACHMENT 1)' },
                { key: 'item2', num: 2, text: 'Test request slip of bulk product (ATTACHMENT 2)' },
                { key: 'item3', num: 3, text: 'Release note of bulk product (ATTACHMENT 3)' },
                { key: 'item4', num: 4, text: 'PM requisition slip (ATTACHMENT 4)' },
                { key: 'item5', num: 5, text: 'Specimen of mono carton and label' },
                { key: 'item6', num: 6, text: 'Test request slip of Finish product (after packing) (ATTACHMENT 5)' },
                { key: 'item7', num: 7, text: 'Test report (COA) of finish Product (after packing)' },
                { key: 'item8', num: 8, text: 'QA report on inspection and release of finish product' },
                { key: 'item9', num: 9, text: 'Finish product transfer slip (ATTACHMENT 6)' },
              ].map((item) => {
                const checked = Boolean(data.page1?.attachments?.[item.key])
                return (
                  <tr key={item.key}>
                    <td style={{ border: 'none', padding: '2.5pt 0' }}>
                      <span style={{ display: 'inline-block', width: 24 }}>{item.num}</span>
                      <span>{item.text}</span>
                    </td>
                    <td style={{ border: 'none', textAlign: 'center', padding: '2.5pt 0' }}>
                      <div
                        className={`bmr-compliance-box ${checked ? 'checked' : ''}`}
                        onClick={() => {
                          const updated = {
                            ...(data.page1?.attachments || {}),
                            [item.key]: !checked,
                          }
                          updatePage('page1', 'attachments', updated)
                        }}
                      >
                        {checked ? '✓' : ''}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
      {renderFooter(1)}
    </div>
  )

  // -------------------------------------------------------------
  // Page 2: RM Dispensing Area Line Clearance (Part 1)
  // -------------------------------------------------------------
  const renderPage2 = () => (
    <div className="bmr-sheet bmr-tablet-sheet" key="page-2">
      {renderHeader(2)}
      <div className="bmr-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '8pt 0 12pt' }}>
          <div>
            <div>Checked by/Date</div>
            <div style={{ marginTop: 2 }}>Tablet Department In-charge</div>
            <div style={{ marginTop: 4 }}>
              <input
                className="bmr-line-input"
                style={{ width: 180 }}
                placeholder="Sign / Date"
                value={data.page2?.checked_by_date || ''}
                onChange={(e) => updatePage('page2', 'checked_by_date', e.target.value)}
              />
            </div>
          </div>
          <div style={{ textAlign: 'left', minWidth: 160 }}>
            <div>Verified by/Date</div>
            <div style={{ marginTop: 2 }}>QA</div>
            <div style={{ marginTop: 4 }}>
              <input
                className="bmr-line-input"
                style={{ width: 160 }}
                placeholder="Sign / Date"
                value={data.page2?.verified_by_date || ''}
                onChange={(e) => updatePage('page2', 'verified_by_date', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold' }}>
          RAW MATERIAL DISPENSING AREA LINE CLEARANCE:
        </div>

        <div style={{ display: 'flex', gap: 20, margin: '6pt 0 8pt', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <span>PREVIOUS PRODUCT</span>
            <span style={{ margin: '0 6px' }}>:</span>
            <input
              className="bmr-line-input"
              style={{ flex: 1 }}
              value={data.page2?.previous_product || ''}
              onChange={(e) => updatePage('page2', 'previous_product', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', width: 200 }}>
            <span>Batch No.</span>
            <input
              className="bmr-line-input"
              style={{ flex: 1, marginLeft: 6 }}
              value={data.page2?.previous_batch_no || ''}
              onChange={(e) => updatePage('page2', 'previous_batch_no', e.target.value)}
            />
          </div>
        </div>

        <table className="bmr-table">
          <colgroup>
            <col style={{ width: 50 }} />
            <col />
            <col style={{ width: 75 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Sr. No.</th>
              <th>Activity</th>
              <th style={{ textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              { num: '1', key: 'item1', text: 'Dispensing booth and equipment are cleaned and are dust free' },
              { num: '2', key: 'item2', text: 'Relevant weighing balances are calibrated.' },
              { num: '3', key: 'item3', text: 'All types of wastages are removed from dispensing area.' },
              { num: '4', key: 'item4', text: 'All raw materials of previous products are removed from dispensing area' },
              {
                num: '5',
                key: 'item5',
                text: 'Containers and other equipment used for weighing and transferring the materials are cleaned and dried',
              },
              { num: '6', key: 'item6', text: 'All approved labels are checked' },
              { num: '7', key: 'item7', text: 'RM requisition sheet is filled and duly signed till this stage' },
            ].map((row) => (
              <tr key={row.num}>
                <td style={{ textAlign: 'center' }}>{row.num}</td>
                <td>{row.text}</td>
                <td style={{ textAlign: 'center' }}>
                  {renderYesNo(data.page2?.checklist?.[row.key] || 'Yes', (val) => {
                    const updated = { ...(data.page2?.checklist || {}), [row.key]: val }
                    updatePage('page2', 'checklist', updated)
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

  // -------------------------------------------------------------
  // Page 3: RM Clearance (Part 2) & Mfg Area Clearance
  // -------------------------------------------------------------
  const renderPage3 = () => (
    <div className="bmr-sheet bmr-tablet-sheet" key="page-3">
      {renderHeader(3)}
      <div className="bmr-body">
        {/* Continuation table with blank first row */}
        <table className="bmr-table" style={{ marginTop: 2, marginBottom: 8 }}>
          <colgroup>
            <col style={{ width: 50 }} />
            <col />
            <col style={{ width: 75 }} />
          </colgroup>
          <tbody>
            {/* Blank first row as in PDF */}
            <tr style={{ height: 16 }}>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>8</td>
              <td>BMR is properly filled and duly signed till this stage.</td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page3?.checklist_cont?.item8 || 'Yes', (val) => {
                  const updated = { ...(data.page3?.checklist_cont || {}), item8: val }
                  updatePage('page3', 'checklist_cont', updated)
                })}
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>9</td>
              <td>Status labeling of dispensing area is proper.</td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page3?.checklist_cont?.item9 || 'Yes', (val) => {
                  const updated = { ...(data.page3?.checklist_cont || {}), item9: val }
                  updatePage('page3', 'checklist_cont', updated)
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
                {renderYesNo(data.page3?.checklist_cont?.item10 || 'Yes', (val) => {
                  const updated = { ...(data.page3?.checklist_cont || {}), item10: val }
                  updatePage('page3', 'checklist_cont', updated)
                })}
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '8pt 0 16pt' }}>
          <div>
            <span>Checked By / Date (Warehouse) : </span>
            <input
              className="bmr-line-input"
              style={{ width: 170 }}
              value={data.page3?.warehouse_checked_by_date || ''}
              onChange={(e) => updatePage('page3', 'warehouse_checked_by_date', e.target.value)}
            />
          </div>
          <div>
            <span>Verified By/Date ( QA) : </span>
            <input
              className="bmr-line-input"
              style={{ width: 160 }}
              value={data.page3?.qa_verified_by_date || ''}
              onChange={(e) => updatePage('page3', 'qa_verified_by_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold' }}>
          MANUFACTURING AREA LINE CLEARANCE:
        </div>

        <div style={{ display: 'flex', gap: 20, margin: '6pt 0 8pt', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <span>Previous Product:</span>
            <input
              className="bmr-line-input"
              style={{ flex: 1, marginLeft: 6 }}
              value={data.page3?.mfg_previous_product || ''}
              onChange={(e) => updatePage('page3', 'mfg_previous_product', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', width: 200 }}>
            <span>Batch No.</span>
            <input
              className="bmr-line-input"
              style={{ flex: 1, marginLeft: 6 }}
              value={data.page3?.mfg_previous_batch_no || ''}
              onChange={(e) => updatePage('page3', 'mfg_previous_batch_no', e.target.value)}
            />
          </div>
        </div>

        <table className="bmr-table">
          <colgroup>
            <col style={{ width: 50 }} />
            <col />
            <col style={{ width: 75 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Sr. No.</th>
              <th>Activity</th>
              <th style={{ textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              { num: '1', key: 'item1', text: 'Previous Product left over is removed from area.' },
              { num: '2', key: 'item2', text: 'All equipment/ machineries are properly cleaned and dried.' },
              { num: '3', key: 'item3', text: 'All equipment / machineries are in perfect working order.' },
              {
                num: '4',
                key: 'item4',
                text: 'Manufacturing area is cleaned and all types of wastage are removed from this area.',
              },
            ].map((row) => (
              <tr key={row.num}>
                <td style={{ textAlign: 'center' }}>{row.num}</td>
                <td>{row.text}</td>
                <td style={{ textAlign: 'center' }}>
                  {renderYesNo(data.page3?.mfg_checklist?.[row.key] || 'Yes', (val) => {
                    const updated = { ...(data.page3?.mfg_checklist || {}), [row.key]: val }
                    updatePage('page3', 'mfg_checklist', updated)
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

  // -------------------------------------------------------------
  // Page 4: Mfg Area Clearance (Part 2) & Equipment
  // -------------------------------------------------------------
  const renderPage4 = () => (
    <div className="bmr-sheet bmr-tablet-sheet" key="page-4">
      {renderHeader(4)}
      <div className="bmr-body">
        <table className="bmr-table" style={{ marginTop: 2, marginBottom: 6 }}>
          <colgroup>
            <col style={{ width: 50 }} />
            <col />
            <col style={{ width: 75 }} />
          </colgroup>
          <tbody>
            <tr>
              <td style={{ textAlign: 'center' }}>5</td>
              <td>AHU system is properly working.</td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page4?.mfg_checklist_cont?.item5 || 'Yes', (val) => {
                  const updated = { ...(data.page4?.mfg_checklist_cont || {}), item5: val }
                  updatePage('page4', 'mfg_checklist_cont', updated)
                })}
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>6</td>
              <td>BMR is properly filled and duly signed till this stage.</td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page4?.mfg_checklist_cont?.item6 || 'Yes', (val) => {
                  const updated = { ...(data.page4?.mfg_checklist_cont || {}), item6: val }
                  updatePage('page4', 'mfg_checklist_cont', updated)
                })}
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>7</td>
              <td>Status labeling of manufacturing area is proper.</td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page4?.mfg_checklist_cont?.item7 || 'Yes', (val) => {
                  const updated = { ...(data.page4?.mfg_checklist_cont || {}), item7: val }
                  updatePage('page4', 'mfg_checklist_cont', updated)
                })}
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>8</td>
              <td>
                Temperature, % RH and differential pressure is within limit.
                <br />
                Temperature (Limit: 27°C ± 2°C)
                <br />
                % Relative Humidity (Limit: 55% ± 2%)
                <br />
                Differential Pressure (Limit NLT{' '}
                <input
                  className="bmr-line-input"
                  style={{
                    width: 50,
                    textAlign: 'center',
                    border: 'none',
                    borderBottom: '1px solid #000',
                    display: 'inline-block',
                    verticalAlign: 'baseline',
                    height: 14,
                    lineHeight: '14px',
                    padding: '0 2px',
                    margin: '0 2px',
                  }}
                  value={data.page4?.diff_pressure_limit || ''}
                  onChange={(e) => updatePage('page4', 'diff_pressure_limit', e.target.value)}
                />{' '}
                Pascal)
              </td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page4?.mfg_checklist_cont?.item8 || 'Yes', (val) => {
                  const updated = { ...(data.page4?.mfg_checklist_cont || {}), item8: val }
                  updatePage('page4', 'mfg_checklist_cont', updated)
                })}
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4pt 0 8pt' }}>
          <div>
            <span>Checked By / Date (Production) : </span>
            <input
              className="bmr-line-input"
              style={{ width: 170 }}
              value={data.page4?.checked_by_prod_date || ''}
              onChange={(e) => updatePage('page4', 'checked_by_prod_date', e.target.value)}
            />
          </div>
          <div>
            <span>Verified by/Date (QA) : </span>
            <input
              className="bmr-line-input"
              style={{ width: 160 }}
              value={data.page4?.verified_by_qa_date || ''}
              onChange={(e) => updatePage('page4', 'verified_by_qa_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', textDecoration: 'underline' }}>
          TABLET MANUFACTURING:
        </div>

        <table className="bmr-table" style={{ marginTop: 4, marginBottom: 6 }}>
          <colgroup>
            <col style={{ width: 42 }} />
            <col style={{ width: 175 }} />
            <col style={{ width: 95 }} />
            <col style={{ width: 85 }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>
                Sr.
                <br />
                No.
              </th>
              <th>Equipment</th>
              <th>Equipment ID</th>
              <th>
                Date of last
                <br />
                cleaning
              </th>
              <th>Previous product/Batch no.</th>
            </tr>
          </thead>
          <tbody>
            {[
              { sr: '1', name: 'Mass Mixture', id: 'CM/EQ/TB/07' },
              { sr: '2', name: 'Multi Mill', id: 'CM/EQ/TB/08' },
              {
                sr: '3',
                name: 'Tray Dryer –Autotimer and Thermostatic (36 Aluminum Trays)',
                id: 'CM/EQ/TB/06',
              },
              {
                sr: '4',
                name: 'Tablet Punching Machine ( 27 Station Double Rotary)',
                id: 'CM/EQ/TB/05',
              },
            ].map((eq, idx) => {
              const row = data.page4?.equipments?.[idx] || eq
              return (
                <tr key={eq.sr}>
                  <td style={{ textAlign: 'center' }}>{eq.sr}</td>
                  <td>{eq.name}</td>
                  <td>{eq.id}</td>
                  <td>
                    <BmrDateField
                      value={row.date_cleaned || ''}
                      onChange={(e) => {
                        const updated = [...(data.page4?.equipments || [])]
                        updated[idx] = { ...row, date_cleaned: e.target.value }
                        updatePage('page4', 'equipments', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.prev_batch || ''}
                      onChange={(e) => {
                        const updated = [...(data.page4?.equipments || [])]
                        updated[idx] = { ...row, prev_batch: e.target.value }
                        updatePage('page4', 'equipments', updated)
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div style={{ margin: '4pt 0' }}>
          <span>Cleaned by/ Date (Production) : </span>
          <input
            className="bmr-line-input"
            style={{ width: 220 }}
            value={data.page4?.cleaned_by_date || ''}
            onChange={(e) => updatePage('page4', 'cleaned_by_date', e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4pt 0' }}>
          <div>
            <span>Checked by/ Date (Production) : </span>
            <input
              className="bmr-line-input"
              style={{ width: 180 }}
              value={data.page4?.checked_by_date || ''}
              onChange={(e) => updatePage('page4', 'checked_by_date', e.target.value)}
            />
          </div>
          <div>
            <span>Verified by /Date (QA) : </span>
            <input
              className="bmr-line-input"
              style={{ width: 170 }}
              value={data.page4?.verified_by_date || ''}
              onChange={(e) => updatePage('page4', 'verified_by_date', e.target.value)}
            />
          </div>
        </div>
      </div>
      {renderFooter(4)}
    </div>
  )

  // -------------------------------------------------------------
  // Page 5: Manufacturing Process of Tablet Bulk
  // -------------------------------------------------------------
  const renderPage5 = () => (
    <div className="bmr-sheet bmr-tablet-sheet" key="page-5">
      {renderHeader(5)}
      <div className="bmr-body">
        <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', textDecoration: 'underline', margin: '8pt 0 10pt' }}>
          MANUFACTURING PROCESS OF TABLET BULK:
        </div>

        <table className="bmr-table" style={{ marginBottom: 6 }}>
          <colgroup>
            <col style={{ width: 36 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 105 }} />
            <col style={{ width: 95 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 45 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'center' }}>
                Sr.
                <br />
                No
              </th>
              <th rowSpan={2}>Process</th>
              <th rowSpan={2}>Equip. used</th>
              <th rowSpan={2}>Eq. ID</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time (Hrs.)</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center' }}>From</th>
              <th style={{ textAlign: 'center' }}>To</th>
            </tr>
          </thead>
          <tbody>
            {[
              { sr: '1', process: 'Mixing and Binding of powders', equip: 'Mass Mixture', eq_id: 'CM/EQ/TB/07' },
              { sr: '2', process: 'Granulation of powder', equip: 'Multi Mill', eq_id: 'CM/EQ/TB/08' },
              {
                sr: '3',
                process: 'Drying of wet granules',
                equip: 'Tray Dryer –Autotimer and Thermostatic (36 Aluminum Trays)',
                eq_id: 'CM/EQ/TB/06',
              },
            ].map((p, idx) => {
              const row = data.page5?.bulk_processes?.[idx] || p
              return (
                <tr key={p.sr} style={{ height: 95 }}>
                  <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: 6 }}>{p.sr}</td>
                  <td style={{ verticalAlign: 'top', paddingTop: 6 }}>{p.process}</td>
                  <td style={{ verticalAlign: 'top', paddingTop: 6 }}>{p.equip}</td>
                  <td style={{ verticalAlign: 'top', paddingTop: 6 }}>
                    {p.eq_id === 'CM/EQ/TB/07' ? (
                      <>
                        CM/EQ/TB/0
                        <br />
                        7
                      </>
                    ) : p.eq_id === 'CM/EQ/TB/08' ? (
                      <>
                        CM/EQ/TB/0
                        <br />
                        8
                      </>
                    ) : (
                      <>
                        CM/EQ/TB/0
                        <br />
                        6
                      </>
                    )}
                  </td>
                  <td style={{ verticalAlign: 'top', paddingTop: 6 }}>
                    <BmrDateField
                      value={row.date || ''}
                      onChange={(e) => {
                        const updated = [...(data.page5?.bulk_processes || [])]
                        updated[idx] = { ...row, date: e.target.value }
                        updatePage('page5', 'bulk_processes', updated)
                      }}
                    />
                  </td>
                  <td style={{ verticalAlign: 'top', paddingTop: 6 }}>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.from_time || ''}
                      onChange={(e) => {
                        const updated = [...(data.page5?.bulk_processes || [])]
                        updated[idx] = { ...row, from_time: e.target.value }
                        updatePage('page5', 'bulk_processes', updated)
                      }}
                    />
                  </td>
                  <td style={{ verticalAlign: 'top', paddingTop: 6 }}>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.to_time || ''}
                      onChange={(e) => {
                        const updated = [...(data.page5?.bulk_processes || [])]
                        updated[idx] = { ...row, to_time: e.target.value }
                        updatePage('page5', 'bulk_processes', updated)
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {renderFooter(5)}
    </div>
  )

  // -------------------------------------------------------------
  // Page 6: Bulk Release Slips & Mixing of Granules
  // -------------------------------------------------------------
  const renderPage6 = () => (
    <div className="bmr-sheet bmr-tablet-sheet" key="page-6">
      {renderHeader(6)}
      <div className="bmr-body">
        {/* Blank continuation row as in PDF */}
        <table className="bmr-table" style={{ marginTop: 2, marginBottom: 6 }}>
          <colgroup>
            <col style={{ width: 36 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 105 }} />
            <col style={{ width: 95 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 45 }} />
          </colgroup>
          <tbody>
            <tr style={{ height: 26 }}>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
            </tr>
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4pt 0 10pt' }}>
          <div>
            <span>Checked by/Date (Production) </span>
            <input
              className="bmr-line-input"
              style={{ width: 160 }}
              value={data.page6?.checked_by_date || ''}
              onChange={(e) => updatePage('page6', 'checked_by_date', e.target.value)}
            />
          </div>
          <div>
            <span>Verified by/Date (QA) </span>
            <input
              className="bmr-line-input"
              style={{ width: 160 }}
              value={data.page6?.verified_by_date || ''}
              onChange={(e) => updatePage('page6', 'verified_by_date', e.target.value)}
            />
          </div>
        </div>

        <div style={{ lineHeight: 1.8, fontSize: '8.5pt', marginBottom: 12 }}>
          <div>
            PROD: Test request sent to QA department on date{' '}
            <input
              className="bmr-line-input"
              style={{ width: 110, textAlign: 'center' }}
              value={data.page6?.prod_test_req_date || ''}
              onChange={(e) => updatePage('page6', 'prod_test_req_date', e.target.value)}
            />{' '}
            for tablet bulk sampling. Sign/Date:{' '}
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page6?.prod_test_req_sign || ''}
              onChange={(e) => updatePage('page6', 'prod_test_req_sign', e.target.value)}
            />
          </div>
          <div>
            QA: Test request sent to QC department on date{' '}
            <input
              className="bmr-line-input"
              style={{ width: 110, textAlign: 'center' }}
              value={data.page6?.qa_test_req_date || ''}
              onChange={(e) => updatePage('page6', 'qa_test_req_date', e.target.value)}
            />{' '}
            for tablet bulk analysis. Sign/Date:{' '}
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page6?.qa_test_req_sign || ''}
              onChange={(e) => updatePage('page6', 'qa_test_req_sign', e.target.value)}
            />
          </div>
          <div>
            QC: Tablet bulk Release slip sent to QA on date{' '}
            <input
              className="bmr-line-input"
              style={{ width: 110, textAlign: 'center' }}
              value={data.page6?.qc_bulk_release_date || ''}
              onChange={(e) => updatePage('page6', 'qc_bulk_release_date', e.target.value)}
            />{' '}
            Sign/Date:{' '}
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page6?.qc_bulk_release_sign || ''}
              onChange={(e) => updatePage('page6', 'qc_bulk_release_sign', e.target.value)}
            />
          </div>
          <div>
            QA: Tablet bulk Release slip sent to Production on date{' '}
            <input
              className="bmr-line-input"
              style={{ width: 100, textAlign: 'center' }}
              value={data.page6?.qa_bulk_release_date || ''}
              onChange={(e) => updatePage('page6', 'qa_bulk_release_date', e.target.value)}
            />{' '}
            for compression .Sign/Date:{' '}
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page6?.qa_bulk_release_sign || ''}
              onChange={(e) => updatePage('page6', 'qa_bulk_release_sign', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold' }}>
          MIXING OF GRANULES FROM ALL LOTS
        </div>
        <div style={{ fontSize: '8.5pt', margin: '2pt 0 6pt' }}>
          Take equal proportion from all lots such that the total of 100 Kg can be mixed at a single time.
        </div>

        <table className="bmr-table" style={{ marginBottom: 12 }}>
          <colgroup>
            <col style={{ width: 36 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 105 }} />
            <col style={{ width: 95 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 45 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'center' }}>
                Sr.
                <br />
                No
              </th>
              <th rowSpan={2}>Process</th>
              <th rowSpan={2}>Equip. used</th>
              <th rowSpan={2}>Eq. ID</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time (Hrs.)</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center' }}>From</th>
              <th style={{ textAlign: 'center' }}>To</th>
            </tr>
          </thead>
          <tbody>
            {[(data.page6?.mixing_records?.[0] || { sr: '1', process: 'Mixing of dried granules', equip: 'Mass Mixture', eq_id: 'CM/EQ/TB/07' })].map((row, idx) => (
              <tr key={idx} style={{ height: 75 }}>
                <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: 6 }}>1</td>
                <td style={{ verticalAlign: 'top', paddingTop: 6 }}>Mixing of dried granules</td>
                <td style={{ verticalAlign: 'top', paddingTop: 6 }}>Mass Mixture</td>
                <td style={{ verticalAlign: 'top', paddingTop: 6 }}>CM/EQ/TB/07</td>
                <td style={{ verticalAlign: 'top', paddingTop: 6 }}>
                  <BmrDateField
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page6?.mixing_records || [])]
                      updated[0] = { ...row, date: e.target.value }
                      updatePage('page6', 'mixing_records', updated)
                    }}
                  />
                </td>
                <td style={{ verticalAlign: 'top', paddingTop: 6 }}>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.from_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page6?.mixing_records || [])]
                      updated[0] = { ...row, from_time: e.target.value }
                      updatePage('page6', 'mixing_records', updated)
                    }}
                  />
                </td>
                <td style={{ verticalAlign: 'top', paddingTop: 6 }}>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.to_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page6?.mixing_records || [])]
                      updated[0] = { ...row, to_time: e.target.value }
                      updatePage('page6', 'mixing_records', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', textDecoration: 'underline' }}>
          MANUFACTURING PROCESS OF TABLETS
        </div>

        {/* Header only table as in PDF */}
        <table className="bmr-table">
          <colgroup>
            <col style={{ width: 36 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 105 }} />
            <col style={{ width: 95 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 45 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'center' }}>
                Sr.
                <br />
                No
              </th>
              <th rowSpan={2}>Process</th>
              <th rowSpan={2}>Equip. used</th>
              <th rowSpan={2}>Eq. ID</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time (Hrs.)</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center' }}>From</th>
              <th style={{ textAlign: 'center' }}>To</th>
            </tr>
          </thead>
          <tbody>{/* Empty body - header only as per PDF */}</tbody>
        </table>
      </div>
      {renderFooter(6)}
    </div>
  )

  // -------------------------------------------------------------
  // Page 7: Compression & Tablet Packing Area Clearance
  // -------------------------------------------------------------
  const renderPage7 = () => (
    <div className="bmr-sheet bmr-tablet-sheet" key="page-7">
      {renderHeader(7)}
      <div className="bmr-body">
        {/* Continuation row for Compression of dried granules */}
        <table className="bmr-table" style={{ marginTop: 2, marginBottom: 6 }}>
          <colgroup>
            <col style={{ width: 36 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 105 }} />
            <col style={{ width: 95 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 45 }} />
          </colgroup>
          <tbody>
            {[(data.page7?.compression_records?.[0] || { sr: '1', process: 'Compression of dried granules', equip: 'Tablet Punching Machine (27 Station Double Rotary)', eq_id: 'CM/EQ/TB/05' })].map((row, idx) => (
              <tr key={idx} style={{ height: 60 }}>
                <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: 6 }}>1</td>
                <td style={{ verticalAlign: 'top', paddingTop: 6 }}>
                  Compression of dried
                  <br />
                  granules
                </td>
                <td style={{ verticalAlign: 'top', paddingTop: 6 }}>
                  Tablet Punching
                  <br />
                  Machine
                  <br />
                  (27 Station Double
                  <br />
                  Rotary)
                </td>
                <td style={{ verticalAlign: 'top', paddingTop: 6 }}>CM/EQ/TB/05</td>
                <td style={{ verticalAlign: 'top', paddingTop: 6 }}>
                  <BmrDateField
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page7?.compression_records || [])]
                      updated[0] = { ...row, date: e.target.value }
                      updatePage('page7', 'compression_records', updated)
                    }}
                  />
                </td>
                <td style={{ verticalAlign: 'top', paddingTop: 6 }}>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.from_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page7?.compression_records || [])]
                      updated[0] = { ...row, from_time: e.target.value }
                      updatePage('page7', 'compression_records', updated)
                    }}
                  />
                </td>
                <td style={{ verticalAlign: 'top', paddingTop: 6 }}>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.to_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page7?.compression_records || [])]
                      updated[0] = { ...row, to_time: e.target.value }
                      updatePage('page7', 'compression_records', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4pt 0 10pt' }}>
          <div>
            <span>Checked by/Date (Production) </span>
            <input
              className="bmr-line-input"
              style={{ width: 160 }}
              value={data.page7?.checked_by_date || ''}
              onChange={(e) => updatePage('page7', 'checked_by_date', e.target.value)}
            />
          </div>
          <div>
            <span>Verified by/Date (QA) </span>
            <input
              className="bmr-line-input"
              style={{ width: 160 }}
              value={data.page7?.verified_by_date || ''}
              onChange={(e) => updatePage('page7', 'verified_by_date', e.target.value)}
            />
          </div>
        </div>

        <div style={{ lineHeight: 1.8, fontSize: '8.5pt', marginBottom: 12 }}>
          <div>
            PROD: Test request sent to QA department on date{' '}
            <input
              className="bmr-line-input"
              style={{ width: 100, textAlign: 'center' }}
              value={data.page7?.prod_inprocess_date || ''}
              onChange={(e) => updatePage('page7', 'prod_inprocess_date', e.target.value)}
            />{' '}
            for in-process tablets sampling.
            <br />
            Sign/Date:{' '}
            <input
              className="bmr-line-input"
              style={{ width: 220 }}
              value={data.page7?.prod_inprocess_sign || ''}
              onChange={(e) => updatePage('page7', 'prod_inprocess_sign', e.target.value)}
            />
          </div>
          <div>
            QA: Test request sent to QC department on date{' '}
            <input
              className="bmr-line-input"
              style={{ width: 110, textAlign: 'center' }}
              value={data.page7?.qa_inprocess_date || ''}
              onChange={(e) => updatePage('page7', 'qa_inprocess_date', e.target.value)}
            />{' '}
            for in-process tablets analysis.
            <br />
            Sign/Date:{' '}
            <input
              className="bmr-line-input"
              style={{ width: 150 }}
              value={data.page7?.qa_inprocess_sign || ''}
              onChange={(e) => updatePage('page7', 'qa_inprocess_sign', e.target.value)}
            />
          </div>
          <div>
            QC: In-process tablets Release slip sent to QA on date{' '}
            <input
              className="bmr-line-input"
              style={{ width: 110, textAlign: 'center' }}
              value={data.page7?.qc_inprocess_release_date || ''}
              onChange={(e) => updatePage('page7', 'qc_inprocess_release_date', e.target.value)}
            />{' '}
            Sign/Date:{' '}
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page7?.qc_inprocess_release_sign || ''}
              onChange={(e) => updatePage('page7', 'qc_inprocess_release_sign', e.target.value)}
            />
          </div>
          <div>
            QA: In-process tablets Release slip sent to Production on date{' '}
            <input
              className="bmr-line-input"
              style={{ width: 95, textAlign: 'center' }}
              value={data.page7?.qa_inprocess_release_date || ''}
              onChange={(e) => updatePage('page7', 'qa_inprocess_release_date', e.target.value)}
            />{' '}
            for Compression
            <br />
            Sign/Date:{' '}
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page7?.qa_inprocess_release_sign || ''}
              onChange={(e) => updatePage('page7', 'qa_inprocess_release_sign', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', textDecoration: 'underline' }}>
          TABLET PACKING AREA LINE CLEARANCE :
        </div>

        <div style={{ display: 'flex', gap: 20, margin: '6pt 0 8pt', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <span>Previous Product:</span>
            <input
              className="bmr-line-input"
              style={{ flex: 1, marginLeft: 6 }}
              value={data.page7?.packing_previous_product || ''}
              onChange={(e) => updatePage('page7', 'packing_previous_product', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', width: 200 }}>
            <span>Batch No.</span>
            <input
              className="bmr-line-input"
              style={{ flex: 1, marginLeft: 6 }}
              value={data.page7?.packing_previous_batch_no || ''}
              onChange={(e) => updatePage('page7', 'packing_previous_batch_no', e.target.value)}
            />
          </div>
        </div>

        <table className="bmr-table">
          <colgroup>
            <col style={{ width: 50 }} />
            <col />
            <col style={{ width: 75 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Sr. No.</th>
              <th>Activity</th>
              <th style={{ textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              { num: '1', key: 'item1', text: 'Area is Cleaned.' },
              { num: '2', key: 'item2', text: 'Area is properly labeled.' },
              { num: '3', key: 'item3', text: 'Left Over of previous product removed from area.' },
              { num: '4', key: 'item4', text: 'BMR is properly filled and duly signed till this stage.' },
            ].map((row) => (
              <tr key={row.num}>
                <td style={{ textAlign: 'center' }}>{row.num}</td>
                <td>{row.text}</td>
                <td style={{ textAlign: 'center' }}>
                  {renderYesNo(data.page7?.packing_checklist?.[row.key] || 'Yes', (val) => {
                    const updated = { ...(data.page7?.packing_checklist || {}), [row.key]: val }
                    updatePage('page7', 'packing_checklist', updated)
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {renderFooter(7)}
    </div>
  )

  // -------------------------------------------------------------
  // Page 8: Packing Area Clearance (Part 2), Dipunch & Weight/Pressure Setting
  // -------------------------------------------------------------
  const renderPage8 = () => (
    <div className="bmr-sheet bmr-tablet-sheet" key="page-8">
      {renderHeader(8)}
      <div className="bmr-body">
        <table className="bmr-table" style={{ marginTop: 2, marginBottom: 6 }}>
          <colgroup>
            <col style={{ width: 50 }} />
            <col />
            <col style={{ width: 75 }} />
          </colgroup>
          <tbody>
            <tr>
              <td style={{ textAlign: 'center' }}>5</td>
              <td>Cleaning record is filled of liquid filling line.</td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page8?.packing_checklist_cont?.item5 || 'Yes', (val) => {
                  const updated = { ...(data.page8?.packing_checklist_cont || {}), item5: val }
                  updatePage('page8', 'packing_checklist_cont', updated)
                })}
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>6</td>
              <td>
                Temperature, % RH &amp; Differential pressure is within limit Limits:
                <br />
                Temperature : 27℃ ± 2℃ %
                <br />
                RH 55% ± 2%
                <br />
                Differential Pressure Limit NLT{' '}
                <input
                  className="bmr-line-input"
                  style={{
                    width: 50,
                    textAlign: 'center',
                    border: 'none',
                    borderBottom: '1px solid #000',
                    display: 'inline-block',
                    verticalAlign: 'baseline',
                    height: 14,
                    lineHeight: '14px',
                    padding: '0 2px',
                    margin: '0 2px',
                  }}
                  value={data.page8?.diff_pressure_limit || ''}
                  onChange={(e) => updatePage('page8', 'diff_pressure_limit', e.target.value)}
                />{' '}
                Pascal
              </td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page8?.packing_checklist_cont?.item6 || 'Yes', (val) => {
                  const updated = { ...(data.page8?.packing_checklist_cont || {}), item6: val }
                  updatePage('page8', 'packing_checklist_cont', updated)
                })}
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4pt 0 12pt' }}>
          <div>
            <span>Checked By/Date (Production) : </span>
            <input
              className="bmr-line-input"
              style={{ width: 170 }}
              value={data.page8?.checked_by_date || ''}
              onChange={(e) => updatePage('page8', 'checked_by_date', e.target.value)}
            />
          </div>
          <div>
            <span>Verified by/Date (QA) : </span>
            <input
              className="bmr-line-input"
              style={{ width: 160 }}
              value={data.page8?.verified_by_date || ''}
              onChange={(e) => updatePage('page8', 'verified_by_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', textDecoration: 'underline' }}>
          DIPUNCH SETTING:
        </div>
        <div style={{ fontSize: '8.5pt', margin: '2pt 0 6pt' }}>
          Set the required weight in each pump by adjusting in online display monitor.
        </div>

        <table className="bmr-table" style={{ marginBottom: 14 }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 45 }} />
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 95 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time ( Hrs)</th>
              <th rowSpan={2}>Done by (Production)</th>
              <th rowSpan={2}>Checked by<br />(Production)</th>
              <th rowSpan={2}>Checked by<br />(QA)</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center' }}>From</th>
              <th style={{ textAlign: 'center' }}>To</th>
            </tr>
          </thead>
          <tbody>
            {[(data.page8?.dipunch_settings?.[0] || {})].map((row, idx) => (
              <tr key={idx} style={{ height: 22 }}>
                <td>
                  <BmrDateField
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page8?.dipunch_settings || [])]
                      updated[0] = { ...row, date: e.target.value }
                      updatePage('page8', 'dipunch_settings', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.from_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page8?.dipunch_settings || [])]
                      updated[0] = { ...row, from_time: e.target.value }
                      updatePage('page8', 'dipunch_settings', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.to_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page8?.dipunch_settings || [])]
                      updated[0] = { ...row, to_time: e.target.value }
                      updatePage('page8', 'dipunch_settings', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page8?.dipunch_settings || [])]
                      updated[0] = { ...row, done_by: e.target.value }
                      updatePage('page8', 'dipunch_settings', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_prod || ''}
                    onChange={(e) => {
                      const updated = [...(data.page8?.dipunch_settings || [])]
                      updated[0] = { ...row, checked_prod: e.target.value }
                      updatePage('page8', 'dipunch_settings', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page8?.dipunch_settings || [])]
                      updated[0] = { ...row, checked_qa: e.target.value }
                      updatePage('page8', 'dipunch_settings', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', textDecoration: 'underline' }}>
          WEIGHT AND PRESSURE SETTING:
        </div>
        <div style={{ fontSize: '8.5pt', margin: '2pt 0 6pt' }}>
          Set the required weight in each pump by adjusting in online display monitor.
        </div>

        <table className="bmr-table">
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 45 }} />
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 95 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time ( Hrs)</th>
              <th rowSpan={2}>Done by (Production)</th>
              <th rowSpan={2}>Checked by<br />(Production)</th>
              <th rowSpan={2}>Checked by<br />(QA)</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center' }}>From</th>
              <th style={{ textAlign: 'center' }}>To</th>
            </tr>
          </thead>
          <tbody>
            {[(data.page8?.weight_pressure_settings?.[0] || {})].map((row, idx) => (
              <tr key={idx} style={{ height: 22 }}>
                <td>
                  <BmrDateField
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page8?.weight_pressure_settings || [])]
                      updated[0] = { ...row, date: e.target.value }
                      updatePage('page8', 'weight_pressure_settings', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.from_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page8?.weight_pressure_settings || [])]
                      updated[0] = { ...row, from_time: e.target.value }
                      updatePage('page8', 'weight_pressure_settings', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.to_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page8?.weight_pressure_settings || [])]
                      updated[0] = { ...row, to_time: e.target.value }
                      updatePage('page8', 'weight_pressure_settings', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page8?.weight_pressure_settings || [])]
                      updated[0] = { ...row, done_by: e.target.value }
                      updatePage('page8', 'weight_pressure_settings', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_prod || ''}
                    onChange={(e) => {
                      const updated = [...(data.page8?.weight_pressure_settings || [])]
                      updated[0] = { ...row, checked_prod: e.target.value }
                      updatePage('page8', 'weight_pressure_settings', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page8?.weight_pressure_settings || [])]
                      updated[0] = { ...row, checked_qa: e.target.value }
                      updatePage('page8', 'weight_pressure_settings', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {renderFooter(8)}
    </div>
  )

  // -------------------------------------------------------------
  // Page 9: Test Reports of Tablets & Liner Seal Heading
  // -------------------------------------------------------------
  const renderPage9 = () => (
    <div className="bmr-sheet bmr-tablet-sheet" key="page-9">
      {renderHeader(9)}
      <div className="bmr-body">
        <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', textDecoration: 'underline', margin: '6pt 0 8pt' }}>
          TEST REPORTS OF TABLETS:
        </div>

        <table className="bmr-table" style={{ marginBottom: 6 }}>
          <colgroup>
            <col style={{ width: 55 }} />
            <col style={{ width: 75 }} />
            <col style={{ width: 75 }} />
            <col style={{ width: 75 }} />
            <col style={{ width: 75 }} />
            <col style={{ width: 75 }} />
            <col style={{ width: 75 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Sr.No.</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>
                Uniformity of Weight
                <br />
                (mg)
              </th>
              <th colSpan={2} style={{ textAlign: 'center' }}>
                Diameter
                <br />
                (mm)
              </th>
              <th colSpan={2} style={{ textAlign: 'center' }}>
                Thickness
                <br />
                (mm)
              </th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center' }}>LHS</th>
              <th style={{ textAlign: 'center' }}>RHS</th>
              <th style={{ textAlign: 'center' }}>LHS</th>
              <th style={{ textAlign: 'center' }}>RHS</th>
              <th style={{ textAlign: 'center' }}>LHS</th>
              <th style={{ textAlign: 'center' }}>RHS</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 10 }, (_, i) => {
              const row = data.page9?.test_reports?.[i] || { sr: `${i + 1}.` }
              return (
                <tr key={i} style={{ height: 21 }}>
                  <td style={{ textAlign: 'center' }}>{i + 1}.</td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.weight_lhs || ''}
                      onChange={(e) => {
                        const updated = [...(data.page9?.test_reports || [])]
                        updated[i] = { ...row, weight_lhs: e.target.value }
                        updatePage('page9', 'test_reports', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.weight_rhs || ''}
                      onChange={(e) => {
                        const updated = [...(data.page9?.test_reports || [])]
                        updated[i] = { ...row, weight_rhs: e.target.value }
                        updatePage('page9', 'test_reports', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.diam_lhs || ''}
                      onChange={(e) => {
                        const updated = [...(data.page9?.test_reports || [])]
                        updated[i] = { ...row, diam_lhs: e.target.value }
                        updatePage('page9', 'test_reports', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.diam_rhs || ''}
                      onChange={(e) => {
                        const updated = [...(data.page9?.test_reports || [])]
                        updated[i] = { ...row, diam_rhs: e.target.value }
                        updatePage('page9', 'test_reports', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.thick_lhs || ''}
                      onChange={(e) => {
                        const updated = [...(data.page9?.test_reports || [])]
                        updated[i] = { ...row, thick_lhs: e.target.value }
                        updatePage('page9', 'test_reports', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.thick_rhs || ''}
                      onChange={(e) => {
                        const updated = [...(data.page9?.test_reports || [])]
                        updated[i] = { ...row, thick_rhs: e.target.value }
                        updatePage('page9', 'test_reports', updated)
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '6pt 0' }}>
          <div>
            <span>Filled by </span>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page9?.filled_by || ''}
              onChange={(e) => updatePage('page9', 'filled_by', e.target.value)}
            />
          </div>
          <div>
            <span>Checked by/Date (production): </span>
            <input
              className="bmr-line-input"
              style={{ width: 160 }}
              value={data.page9?.checked_by_prod_date || ''}
              onChange={(e) => updatePage('page9', 'checked_by_prod_date', e.target.value)}
            />
          </div>
        </div>

        <div style={{ margin: '4pt 0 12pt' }}>
          <span>Checked by/Date (QA): </span>
          <input
            className="bmr-line-input"
            style={{ width: 180 }}
            value={data.page9?.checked_by_qa_date || ''}
            onChange={(e) => updatePage('page9', 'checked_by_qa_date', e.target.value)}
          />
        </div>

        {/* Heading LINER SEAL sits at the bottom of Page 9, body on Page 10 */}
        <div style={{ marginTop: 'auto', marginBottom: 6 }}>
          <span className="bmr-tablet-section-heading" style={{ fontWeight: 'bold' }}>
            LINER SEAL: (Applicable / Not Applicable)
          </span>{' '}
          {renderApplicableToggle(
            data.page9?.liner_seal_applicable || 'Applicable',
            (val) => updatePage('page9', 'liner_seal_applicable', val)
          )}
        </div>
      </div>
      {renderFooter(9)}
    </div>
  )

  // -------------------------------------------------------------
  // Page 10: Capping & Visual Inspection
  // -------------------------------------------------------------
  const renderPage10 = () => (
    <div className="bmr-sheet bmr-tablet-sheet" key="page-10">
      {renderHeader(10)}
      <div className="bmr-body">
        <div style={{ fontSize: '8.5pt', margin: '4pt 0 6pt' }}>
          Load required quantity of cleaned liner. Remove defective liner before sealing and keep it aside.
        </div>

        <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', textDecoration: 'underline' }}>
          CAPPING:
        </div>
        <div style={{ fontSize: '8.5pt', margin: '2pt 0 4pt' }}>
          Load required quantity of cleaned dual seal cap. Remove defective cap before capping and keep it
          <br />
          aside.
        </div>

        <table className="bmr-table" style={{ marginBottom: 8 }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 45 }} />
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 95 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time ( Hrs)</th>
              <th rowSpan={2}>Done by<br />(Production)</th>
              <th rowSpan={2}>Checked by<br />(Production)</th>
              <th rowSpan={2}>Checked by<br />(QA)</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center' }}>From</th>
              <th style={{ textAlign: 'center' }}>To</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 2 }, (_, idx) => {
              const row = data.page10?.capping_records?.[idx] || {}
              return (
                <tr key={idx} style={{ height: 21 }}>
                  <td>
                    <BmrDateField
                      value={row.date || ''}
                      onChange={(e) => {
                        const updated = [...(data.page10?.capping_records || [])]
                        updated[idx] = { ...row, date: e.target.value }
                        updatePage('page10', 'capping_records', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.from_time || ''}
                      onChange={(e) => {
                        const updated = [...(data.page10?.capping_records || [])]
                        updated[idx] = { ...row, from_time: e.target.value }
                        updatePage('page10', 'capping_records', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.to_time || ''}
                      onChange={(e) => {
                        const updated = [...(data.page10?.capping_records || [])]
                        updated[idx] = { ...row, to_time: e.target.value }
                        updatePage('page10', 'capping_records', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.done_by || ''}
                      onChange={(e) => {
                        const updated = [...(data.page10?.capping_records || [])]
                        updated[idx] = { ...row, done_by: e.target.value }
                        updatePage('page10', 'capping_records', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_prod || ''}
                      onChange={(e) => {
                        const updated = [...(data.page10?.capping_records || [])]
                        updated[idx] = { ...row, checked_prod: e.target.value }
                        updatePage('page10', 'capping_records', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_qa || ''}
                      onChange={(e) => {
                        const updated = [...(data.page10?.capping_records || [])]
                        updated[idx] = { ...row, checked_qa: e.target.value }
                        updatePage('page10', 'capping_records', updated)
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', margin: '4pt 0 2pt' }}>
          VISUAL INSPECTION ( FOR TABLETS):
        </div>
        <div style={{ fontSize: '8.5pt', margin: '1pt 0 4pt' }}>For Tablets:</div>

        <table className="bmr-table" style={{ marginBottom: 6 }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 45 }} />
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 95 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time (Hrs)</th>
              <th rowSpan={2}>Done By<br />Production</th>
              <th rowSpan={2}>Checked By<br />Production</th>
              <th rowSpan={2}>Checked By<br />QA</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center' }}>From</th>
              <th style={{ textAlign: 'center' }}>To</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 3 }, (_, idx) => {
              const row = data.page10?.visual_inspection_records?.[idx] || {}
              return (
                <tr key={idx} style={{ height: 21 }}>
                  <td>
                    <BmrDateField
                      value={row.date || ''}
                      onChange={(e) => {
                        const updated = [...(data.page10?.visual_inspection_records || [])]
                        updated[idx] = { ...row, date: e.target.value }
                        updatePage('page10', 'visual_inspection_records', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.from_time || ''}
                      onChange={(e) => {
                        const updated = [...(data.page10?.visual_inspection_records || [])]
                        updated[idx] = { ...row, from_time: e.target.value }
                        updatePage('page10', 'visual_inspection_records', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.to_time || ''}
                      onChange={(e) => {
                        const updated = [...(data.page10?.visual_inspection_records || [])]
                        updated[idx] = { ...row, to_time: e.target.value }
                        updatePage('page10', 'visual_inspection_records', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.done_by || ''}
                      onChange={(e) => {
                        const updated = [...(data.page10?.visual_inspection_records || [])]
                        updated[idx] = { ...row, done_by: e.target.value }
                        updatePage('page10', 'visual_inspection_records', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_prod || ''}
                      onChange={(e) => {
                        const updated = [...(data.page10?.visual_inspection_records || [])]
                        updated[idx] = { ...row, checked_prod: e.target.value }
                        updatePage('page10', 'visual_inspection_records', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_qa || ''}
                      onChange={(e) => {
                        const updated = [...(data.page10?.visual_inspection_records || [])]
                        updated[idx] = { ...row, checked_qa: e.target.value }
                        updatePage('page10', 'visual_inspection_records', updated)
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div style={{ margin: '4pt 0 6pt' }}>
          <span>Total Nos. of Inspected Bottles: </span>
          <input
            className="bmr-line-input"
            style={{ width: 120, textAlign: 'center' }}
            value={data.page10?.total_inspected_bottles || ''}
            onChange={(e) => updatePage('page10', 'total_inspected_bottles', e.target.value)}
          />
          <span> Nos.</span>
        </div>

        <table className="bmr-table" style={{ marginBottom: 6 }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 45 }} />
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 95 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time (Hrs)</th>
              <th rowSpan={2}>Done By<br />Production</th>
              <th rowSpan={2}>Checked By<br />Production</th>
              <th rowSpan={2}>Checked By<br />QA</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center' }}>From</th>
              <th style={{ textAlign: 'center' }}>To</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 2 }, (_, idx) => {
              const row = data.page10?.visual_inspection_records_2?.[idx] || {}
              return (
                <tr key={idx} style={{ height: 21 }}>
                  <td>
                    <BmrDateField
                      value={row.date || ''}
                      onChange={(e) => {
                        const updated = [...(data.page10?.visual_inspection_records_2 || [])]
                        updated[idx] = { ...row, date: e.target.value }
                        updatePage('page10', 'visual_inspection_records_2', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.from_time || ''}
                      onChange={(e) => {
                        const updated = [...(data.page10?.visual_inspection_records_2 || [])]
                        updated[idx] = { ...row, from_time: e.target.value }
                        updatePage('page10', 'visual_inspection_records_2', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.to_time || ''}
                      onChange={(e) => {
                        const updated = [...(data.page10?.visual_inspection_records_2 || [])]
                        updated[idx] = { ...row, to_time: e.target.value }
                        updatePage('page10', 'visual_inspection_records_2', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.done_by || ''}
                      onChange={(e) => {
                        const updated = [...(data.page10?.visual_inspection_records_2 || [])]
                        updated[idx] = { ...row, done_by: e.target.value }
                        updatePage('page10', 'visual_inspection_records_2', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_prod || ''}
                      onChange={(e) => {
                        const updated = [...(data.page10?.visual_inspection_records_2 || [])]
                        updated[idx] = { ...row, checked_prod: e.target.value }
                        updatePage('page10', 'visual_inspection_records_2', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_qa || ''}
                      onChange={(e) => {
                        const updated = [...(data.page10?.visual_inspection_records_2 || [])]
                        updated[idx] = { ...row, checked_qa: e.target.value }
                        updatePage('page10', 'visual_inspection_records_2', updated)
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4pt 0' }}>
          <div>
            <span>Checked by/Date (Production) : </span>
            <input
              className="bmr-line-input"
              style={{ width: 170 }}
              value={data.page10?.checked_by_date || ''}
              onChange={(e) => updatePage('page10', 'checked_by_date', e.target.value)}
            />
          </div>
          <div>
            <span>Verified by/ Date (QA) : </span>
            <input
              className="bmr-line-input"
              style={{ width: 160 }}
              value={data.page10?.verified_by_date || ''}
              onChange={(e) => updatePage('page10', 'verified_by_date', e.target.value)}
            />
          </div>
        </div>
      </div>
      {renderFooter(10)}
    </div>
  )

  // -------------------------------------------------------------
  // Page 11: PM Dispensing, Environmental Control & Coding Equipment
  // -------------------------------------------------------------
  const renderPage11 = () => (
    <div className="bmr-sheet bmr-tablet-sheet" key="page-11">
      {renderHeader(11)}
      <div className="bmr-body">
        <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', textDecoration: 'underline', margin: '4pt 0 6pt' }}>
          PACKING MATERIAL DISPENSING AREA LINE CLEARANCE:
        </div>

        <div style={{ display: 'flex', gap: 20, margin: '4pt 0 6pt', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <span>Previous Product:</span>
            <input
              className="bmr-line-input"
              style={{ flex: 1, marginLeft: 6 }}
              value={data.page11?.previous_product || ''}
              onChange={(e) => updatePage('page11', 'previous_product', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', width: 200 }}>
            <span>Batch No.</span>
            <input
              className="bmr-line-input"
              style={{ flex: 1, marginLeft: 6 }}
              value={data.page11?.previous_batch_no || ''}
              onChange={(e) => updatePage('page11', 'previous_batch_no', e.target.value)}
            />
          </div>
        </div>

        <table className="bmr-table" style={{ marginBottom: 4 }}>
          <colgroup>
            <col style={{ width: 50 }} />
            <col />
            <col style={{ width: 75 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Sr. No.</th>
              <th>Activity</th>
              <th style={{ textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              { num: '1', key: 'item1', text: 'Previous product / batch materials are removed' },
              { num: '2', key: 'item2', text: 'Previous product / batch labels are removed' },
              { num: '3', key: 'item3', text: 'Floor walls, and ceiling are cleaned properly' },
              { num: '4', key: 'item4', text: 'Balance is cleaned and calibrated' },
              { num: '5', key: 'item5', text: 'Status labels are affixed' },
            ].map((row) => (
              <tr key={row.num}>
                <td style={{ textAlign: 'center' }}>{row.num}</td>
                <td>{row.text}</td>
                <td style={{ textAlign: 'center' }}>
                  {renderYesNo(data.page11?.pm_dispensing_checklist?.[row.key] || 'Yes', (val) => {
                    const updated = { ...(data.page11?.pm_dispensing_checklist || {}), [row.key]: val }
                    updatePage('page11', 'pm_dispensing_checklist', updated)
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4pt 0 8pt' }}>
          <div>
            <span>Checked By/Date (Packing) </span>
            <input
              className="bmr-line-input"
              style={{ width: 170 }}
              value={data.page11?.checked_by_date || ''}
              onChange={(e) => updatePage('page11', 'checked_by_date', e.target.value)}
            />
          </div>
          <div>
            <span>Verified by/Date ( QA)</span>
            <input
              className="bmr-line-input"
              style={{ width: 160 }}
              value={data.page11?.verified_by_date || ''}
              onChange={(e) => updatePage('page11', 'verified_by_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', margin: '4pt 0 2pt' }}>
          ENVIRONMENTAL CONTROL: ( Packing Area)
        </div>
        <div style={{ fontSize: '8.5pt', margin: '1pt 0' }}>
          Check and record temperature and relative humidity twice a day.
        </div>
        <div style={{ fontSize: '8.5pt', margin: '1pt 0 4pt' }}>
          Limit: Temperature: 27°C ± 2° C % RH 55% ± 2%
        </div>

        <table className="bmr-table" style={{ marginBottom: 8 }}>
          <colgroup>
            <col style={{ width: 80 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 95 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Date</th>
              <th>Time Hrs.</th>
              <th>Temp °C</th>
              <th>% RH</th>
              <th>Checked By<br />(Packaging)</th>
              <th>Checked By<br />(QA)</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 2 }, (_, idx) => {
              const row = data.page11?.env_records?.[idx] || {}
              return (
                <tr key={idx} style={{ height: 21 }}>
                  <td>
                    <BmrDateField
                      value={row.date || ''}
                      onChange={(e) => {
                        const updated = [...(data.page11?.env_records || [])]
                        updated[idx] = { ...row, date: e.target.value }
                        updatePage('page11', 'env_records', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.time || ''}
                      onChange={(e) => {
                        const updated = [...(data.page11?.env_records || [])]
                        updated[idx] = { ...row, time: e.target.value }
                        updatePage('page11', 'env_records', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.temp || ''}
                      onChange={(e) => {
                        const updated = [...(data.page11?.env_records || [])]
                        updated[idx] = { ...row, temp: e.target.value }
                        updatePage('page11', 'env_records', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.rh || ''}
                      onChange={(e) => {
                        const updated = [...(data.page11?.env_records || [])]
                        updated[idx] = { ...row, rh: e.target.value }
                        updatePage('page11', 'env_records', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_pkg || ''}
                      onChange={(e) => {
                        const updated = [...(data.page11?.env_records || [])]
                        updated[idx] = { ...row, checked_pkg: e.target.value }
                        updatePage('page11', 'env_records', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_qa || ''}
                      onChange={(e) => {
                        const updated = [...(data.page11?.env_records || [])]
                        updated[idx] = { ...row, checked_qa: e.target.value }
                        updatePage('page11', 'env_records', updated)
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', textDecoration: 'underline', margin: '4pt 0 4pt' }}>
          EQUIPMENT CLEARANCE FOR CARTON AND LABEL CODING:
        </div>

        <table className="bmr-table">
          <colgroup>
            <col style={{ width: 130 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 100 }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>Equipment</th>
              <th>Equipment ID</th>
              <th>
                Date of Last
                <br />
                Cleaning
              </th>
              <th>
                Previous Product/
                <br />
                Batch No.
              </th>
              <th>
                Cleaned By
                <br />
                (Packaging)
              </th>
            </tr>
          </thead>
          <tbody>
            {[
              { equip: 'Carton Coding Machine', id: 'CM/EQ/PD/02' },
              { equip: 'Label Printing Machine', id: 'CM/EQ/PD/02' },
            ].map((eq, idx) => {
              const row = data.page11?.coding_equipments?.[idx] || eq
              return (
                <tr key={eq.equip} style={{ height: 21 }}>
                  <td>{eq.equip}</td>
                  <td>{eq.id}</td>
                  <td>
                    <BmrDateField
                      value={row.date_cleaned || ''}
                      onChange={(e) => {
                        const updated = [...(data.page11?.coding_equipments || [])]
                        updated[idx] = { ...row, date_cleaned: e.target.value }
                        updatePage('page11', 'coding_equipments', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.prev_batch || ''}
                      onChange={(e) => {
                        const updated = [...(data.page11?.coding_equipments || [])]
                        updated[idx] = { ...row, prev_batch: e.target.value }
                        updatePage('page11', 'coding_equipments', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.cleaned_by || ''}
                      onChange={(e) => {
                        const updated = [...(data.page11?.coding_equipments || [])]
                        updated[idx] = { ...row, cleaned_by: e.target.value }
                        updatePage('page11', 'coding_equipments', updated)
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {renderFooter(11)}
    </div>
  )

  // -------------------------------------------------------------
  // Page 12: Packing Table, Packing Details, Stereo & Coding
  // -------------------------------------------------------------
  const renderPage12 = () => (
    <div className="bmr-sheet bmr-tablet-sheet" key="page-12">
      {renderHeader(12)}
      <div className="bmr-body">
        {/* Continuation row for Packing Table */}
        <table className="bmr-table" style={{ marginTop: 2, marginBottom: 4 }}>
          <colgroup>
            <col style={{ width: 130 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 100 }} />
            <col />
          </colgroup>
          <tbody>
            {[(data.page12?.packing_table || { equip: 'Packing Table', id: 'CM/EQ/PD/11' })].map((row, idx) => (
              <tr key={idx} style={{ height: 21 }}>
                <td>Packing Table</td>
                <td>CM/EQ/PD/11</td>
                <td>
                  <BmrDateField
                    value={row.date_cleaned || ''}
                    onChange={(e) => updatePage('page12', 'packing_table', { ...row, date_cleaned: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.prev_batch || ''}
                    onChange={(e) => updatePage('page12', 'packing_table', { ...row, prev_batch: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.cleaned_by || ''}
                    onChange={(e) => updatePage('page12', 'packing_table', { ...row, cleaned_by: e.target.value })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4pt 0 8pt' }}>
          <div>
            <span>Checked By/Date (Packing): </span>
            <input
              className="bmr-line-input"
              style={{ width: 170 }}
              value={data.page12?.checked_by_date || ''}
              onChange={(e) => updatePage('page12', 'checked_by_date', e.target.value)}
            />
          </div>
          <div>
            <span>Verified By/Date (QA): </span>
            <input
              className="bmr-line-input"
              style={{ width: 160 }}
              value={data.page12?.verified_by_date || ''}
              onChange={(e) => updatePage('page12', 'verified_by_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', textDecoration: 'underline' }}>
          PACKING DETAILS:
        </div>
        <div style={{ margin: '2pt 0 6pt' }}>
          <span>Packing Type: Pet Bottle /Glass Bottle: </span>
          <input
            className="bmr-line-input"
            style={{ width: 200 }}
            value={data.page12?.packing_type || ''}
            onChange={(e) => updatePage('page12', 'packing_type', e.target.value)}
          />
        </div>

        <div style={{ margin: '4pt 0 2pt' }}>
          <span className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', textDecoration: 'underline' }}>
            STEREO DETAILS FOR LABEL AND CARTONS: (Applicable / Not Applicable)
          </span>{' '}
          {renderApplicableToggle(
            data.page12?.stereo_applicable || 'Applicable',
            (val) => updatePage('page12', 'stereo_applicable', val)
          )}
        </div>

        <table className="bmr-table" style={{ marginBottom: 6 }}>
          <colgroup>
            <col style={{ width: 105 }} />
            <col style={{ width: 75 }} />
            <col style={{ width: 75 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 85 }} />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>Batch No.</th>
              <th>Mfg. Date</th>
              <th>Exp. Date/<br />Best Before</th>
              <th>MRP Rs. Incl. of<br />taxes</th>
              <th>Checked By<br />Packing Sup.</th>
              <th>Checked by QA</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 2 }, (_, idx) => {
              const row = data.page12?.stereo_details?.[idx] || {}
              return (
                <tr key={idx} style={{ height: 21 }}>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ whiteSpace: 'nowrap', fontSize: '8pt' }}
                      value={row.batch_no || ''}
                      onChange={(e) => {
                        const updated = [...(data.page12?.stereo_details || [])]
                        updated[idx] = { ...row, batch_no: e.target.value }
                        updatePage('page12', 'stereo_details', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.mfg_date || ''}
                      onChange={(e) => {
                        const updated = [...(data.page12?.stereo_details || [])]
                        updated[idx] = { ...row, mfg_date: e.target.value }
                        updatePage('page12', 'stereo_details', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.exp_date || ''}
                      onChange={(e) => {
                        const updated = [...(data.page12?.stereo_details || [])]
                        updated[idx] = { ...row, exp_date: e.target.value }
                        updatePage('page12', 'stereo_details', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.mrp || ''}
                      onChange={(e) => {
                        const updated = [...(data.page12?.stereo_details || [])]
                        updated[idx] = { ...row, mrp: e.target.value }
                        updatePage('page12', 'stereo_details', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_pkg || ''}
                      onChange={(e) => {
                        const updated = [...(data.page12?.stereo_details || [])]
                        updated[idx] = { ...row, checked_pkg: e.target.value }
                        updatePage('page12', 'stereo_details', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_qa || ''}
                      onChange={(e) => {
                        const updated = [...(data.page12?.stereo_details || [])]
                        updated[idx] = { ...row, checked_qa: e.target.value }
                        updatePage('page12', 'stereo_details', updated)
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div style={{ margin: '4pt 0 2pt' }}>
          <span className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', textDecoration: 'underline' }}>
            LABEL / CARTON CODING: (Applicable / Not Applicable)
          </span>{' '}
          {renderApplicableToggle(
            data.page12?.coding_applicable || 'Applicable',
            (val) => updatePage('page12', 'coding_applicable', val)
          )}
        </div>
        <div style={{ fontSize: '8.5pt', margin: '1pt 0 4pt' }}>
          Send the labels/cartons for coding as per the requirements and record the details in below given format.
        </div>

        <table className="bmr-table" style={{ marginBottom: 6 }}>
          <colgroup>
            <col style={{ width: 45 }} />
            <col style={{ width: 140 }} />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Sr. No.</th>
              <th>Packing Material</th>
              <th>Qty. given for coding Nos.</th>
              <th>Qty. Rej. Nos.</th>
              <th>Qty. Rec. for Pkg.<br />Nos.</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 2 }, (_, idx) => {
              const row = data.page12?.coding_materials?.[idx] || { sr: String(idx + 1) }
              return (
                <tr key={idx} style={{ height: 21 }}>
                  <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.material || ''}
                      onChange={(e) => {
                        const updated = [...(data.page12?.coding_materials || [])]
                        updated[idx] = { ...row, material: e.target.value }
                        updatePage('page12', 'coding_materials', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.qty_given || ''}
                      onChange={(e) => {
                        const updated = [...(data.page12?.coding_materials || [])]
                        updated[idx] = { ...row, qty_given: e.target.value }
                        updatePage('page12', 'coding_materials', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.qty_rej || ''}
                      onChange={(e) => {
                        const updated = [...(data.page12?.coding_materials || [])]
                        updated[idx] = { ...row, qty_rej: e.target.value }
                        updatePage('page12', 'coding_materials', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.qty_rec || ''}
                      onChange={(e) => {
                        const updated = [...(data.page12?.coding_materials || [])]
                        updated[idx] = { ...row, qty_rec: e.target.value }
                        updatePage('page12', 'coding_materials', updated)
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <table className="bmr-table">
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 45 }} />
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 95 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time(Hrs)</th>
              <th rowSpan={2}>Done By Pkg</th>
              <th rowSpan={2}>Checked By Pkg</th>
              <th rowSpan={2}>Checked By<br />QA</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center' }}>From</th>
              <th style={{ textAlign: 'center' }}>To</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 2 }, (_, idx) => {
              const row = data.page12?.coding_times?.[idx] || {}
              return (
                <tr key={idx} style={{ height: 21 }}>
                  <td>
                    <BmrDateField
                      value={row.date || ''}
                      onChange={(e) => {
                        const updated = [...(data.page12?.coding_times || [])]
                        updated[idx] = { ...row, date: e.target.value }
                        updatePage('page12', 'coding_times', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.from_time || ''}
                      onChange={(e) => {
                        const updated = [...(data.page12?.coding_times || [])]
                        updated[idx] = { ...row, from_time: e.target.value }
                        updatePage('page12', 'coding_times', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.to_time || ''}
                      onChange={(e) => {
                        const updated = [...(data.page12?.coding_times || [])]
                        updated[idx] = { ...row, to_time: e.target.value }
                        updatePage('page12', 'coding_times', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.done_by || ''}
                      onChange={(e) => {
                        const updated = [...(data.page12?.coding_times || [])]
                        updated[idx] = { ...row, done_by: e.target.value }
                        updatePage('page12', 'coding_times', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_pkg || ''}
                      onChange={(e) => {
                        const updated = [...(data.page12?.coding_times || [])]
                        updated[idx] = { ...row, checked_pkg: e.target.value }
                        updatePage('page12', 'coding_times', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_qa || ''}
                      onChange={(e) => {
                        const updated = [...(data.page12?.coding_times || [])]
                        updated[idx] = { ...row, checked_qa: e.target.value }
                        updatePage('page12', 'coding_times', updated)
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {renderFooter(12)}
    </div>
  )

  // -------------------------------------------------------------
  // Page 13: Packing Area Line Clearance, Sticker Label Pasting & Cartoning
  // -------------------------------------------------------------
  const renderPage13 = () => (
    <div className="bmr-sheet bmr-tablet-sheet" key="page-13">
      {renderHeader(13)}
      <div className="bmr-body">
        <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', textDecoration: 'underline', margin: '4pt 0 6pt' }}>
          PACKING AREA LINE CLEARANCE:
        </div>

        <div style={{ display: 'flex', gap: 20, margin: '4pt 0 6pt', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <span>Previous Product:</span>
            <input
              className="bmr-line-input"
              style={{ flex: 1, marginLeft: 6 }}
              value={data.page13?.previous_product || ''}
              onChange={(e) => updatePage('page13', 'previous_product', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', width: 200 }}>
            <span>Batch No.</span>
            <input
              className="bmr-line-input"
              style={{ flex: 1, marginLeft: 6 }}
              value={data.page13?.previous_batch_no || ''}
              onChange={(e) => updatePage('page13', 'previous_batch_no', e.target.value)}
            />
          </div>
        </div>

        <table className="bmr-table" style={{ marginBottom: 6 }}>
          <colgroup>
            <col style={{ width: 45 }} />
            <col />
            <col style={{ width: 75 }} />
            <col style={{ width: 140 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>
                Sr.
                <br />
                No.
              </th>
              <th>Activity</th>
              <th style={{ textAlign: 'center' }}>Status</th>
              <th>Checked By / sign Date</th>
            </tr>
          </thead>
          <tbody>
            {[
              { num: '1', key: 'item1', text: 'Previous product / batch materials are removed' },
              { num: '2', key: 'item2', text: 'Previous product/ batch labels are removed' },
              { num: '3', key: 'item3', text: 'Floor, walls, and ceiling are cleaned' },
              { num: '4', key: 'item4', text: 'Status labels are affixed' },
            ].map((row) => {
              const itemData = data.page13?.packing_area_checklist?.[row.key] || { status: 'Yes', sign_date: '' }
              return (
                <tr key={row.num} style={{ height: 21 }}>
                  <td style={{ textAlign: 'center' }}>{row.num}</td>
                  <td>{row.text}</td>
                  <td style={{ textAlign: 'center' }}>
                    {renderYesNo(itemData.status || 'Yes', (val) => {
                      const updated = {
                        ...(data.page13?.packing_area_checklist || {}),
                        [row.key]: { ...itemData, status: val },
                      }
                      updatePage('page13', 'packing_area_checklist', updated)
                    })}
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={itemData.sign_date || ''}
                      onChange={(e) => {
                        const updated = {
                          ...(data.page13?.packing_area_checklist || {}),
                          [row.key]: { ...itemData, sign_date: e.target.value },
                        }
                        updatePage('page13', 'packing_area_checklist', updated)
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div style={{ margin: '4pt 0 10pt' }}>
          <span>Verified by/Date (QA) </span>
          <input
            className="bmr-line-input"
            style={{ width: 180 }}
            value={data.page13?.verified_by_date || ''}
            onChange={(e) => updatePage('page13', 'verified_by_date', e.target.value)}
          />
        </div>

        <div style={{ margin: '4pt 0 2pt' }}>
          <span className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', textDecoration: 'underline' }}>
            STICKER LABEL PASTING:
          </span>{' '}
          {renderApplicableToggle(
            data.page13?.sticker_label_applicable || 'Applicable',
            (val) => updatePage('page13', 'sticker_label_applicable', val)
          )}
        </div>
        <div style={{ fontSize: '8.5pt', margin: '1pt 0 4pt' }}>
          Clean the bottle if required. Affix the sticker label on bottle manually / on auto machine with proper
          <br />
          alignment.
        </div>

        <table className="bmr-table" style={{ marginBottom: 14 }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 45 }} />
            <col />
            <col style={{ width: 100 }} />
            <col style={{ width: 100 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time</th>
              <th rowSpan={2}>Done By Pkg</th>
              <th rowSpan={2}>Checked By<br />Pkg</th>
              <th rowSpan={2}>Checked By QA</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center' }}>From</th>
              <th style={{ textAlign: 'center' }}>To</th>
            </tr>
          </thead>
          <tbody>
            {[(data.page13?.pasting_times?.[0] || {})].map((row, idx) => (
              <tr key={idx} style={{ height: 21 }}>
                <td>
                  <BmrDateField
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.pasting_times || [])]
                      updated[0] = { ...row, date: e.target.value }
                      updatePage('page13', 'pasting_times', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.from_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.pasting_times || [])]
                      updated[0] = { ...row, from_time: e.target.value }
                      updatePage('page13', 'pasting_times', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.to_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.pasting_times || [])]
                      updated[0] = { ...row, to_time: e.target.value }
                      updatePage('page13', 'pasting_times', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.pasting_times || [])]
                      updated[0] = { ...row, done_by: e.target.value }
                      updatePage('page13', 'pasting_times', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_pkg || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.pasting_times || [])]
                      updated[0] = { ...row, checked_pkg: e.target.value }
                      updatePage('page13', 'pasting_times', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.pasting_times || [])]
                      updated[0] = { ...row, checked_qa: e.target.value }
                      updatePage('page13', 'pasting_times', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', textDecoration: 'underline' }}>
          CARTONING:
        </div>
        <div style={{ fontSize: '8.5pt', margin: '2pt 0 4pt' }}>
          Keep the bottle in individual duplex carton. Affix a cello tape on the carton if required.
        </div>
      </div>
      {renderFooter(13)}
    </div>
  )

  // -------------------------------------------------------------
  // Page 14: Outer Packing & PM Reconciliation (Part 1)
  // -------------------------------------------------------------
  const renderPage14 = () => (
    <div className="bmr-sheet bmr-tablet-sheet" key="page-14">
      {renderHeader(14)}
      <div className="bmr-body">
        {/* Continuation table for Cartoning */}
        <table className="bmr-table" style={{ marginTop: 2, marginBottom: 6 }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 45 }} />
            <col />
            <col style={{ width: 100 }} />
            <col style={{ width: 100 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time Hrs.</th>
              <th rowSpan={2}>Done By Pkg</th>
              <th rowSpan={2}>Checked By<br />Pkg</th>
              <th rowSpan={2}>Checked By QA</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center' }}>From</th>
              <th style={{ textAlign: 'center' }}>To</th>
            </tr>
          </thead>
          <tbody>
            {[(data.page14?.cartoning_times?.[0] || {})].map((row, idx) => (
              <tr key={idx} style={{ height: 21 }}>
                <td>
                  <BmrDateField
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page14?.cartoning_times || [])]
                      updated[0] = { ...row, date: e.target.value }
                      updatePage('page14', 'cartoning_times', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.from_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page14?.cartoning_times || [])]
                      updated[0] = { ...row, from_time: e.target.value }
                      updatePage('page14', 'cartoning_times', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.to_time || ''}
                    onChange={(e) => {
                      const updated = [...(data.page14?.cartoning_times || [])]
                      updated[0] = { ...row, to_time: e.target.value }
                      updatePage('page14', 'cartoning_times', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page14?.cartoning_times || [])]
                      updated[0] = { ...row, done_by: e.target.value }
                      updatePage('page14', 'cartoning_times', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_pkg || ''}
                    onChange={(e) => {
                      const updated = [...(data.page14?.cartoning_times || [])]
                      updated[0] = { ...row, checked_pkg: e.target.value }
                      updatePage('page14', 'cartoning_times', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page14?.cartoning_times || [])]
                      updated[0] = { ...row, checked_qa: e.target.value }
                      updatePage('page14', 'cartoning_times', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', textDecoration: 'underline' }}>
          OUTER PACKING:
        </div>
        <div style={{ fontSize: '8.5pt', margin: '1pt 0 4pt' }}>
          Keep bottles / packed carton in inner outer corrugated box as per specified box size and close the box
          <br />
          using BOPP gum tape. Affix a shipper label on it. Strap the outer corrugated box.Keep it on a palate.
        </div>

        <table className="bmr-table" style={{ marginBottom: 6 }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 45 }} />
            <col />
            <col style={{ width: 100 }} />
            <col style={{ width: 100 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time Hrs.</th>
              <th rowSpan={2}>Done By Pkg</th>
              <th rowSpan={2}>Checked By Pkg</th>
              <th rowSpan={2}>Checked By QA</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center' }}>From</th>
              <th style={{ textAlign: 'center' }}>To</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 2 }, (_, idx) => {
              const row = data.page14?.outer_packing_times?.[idx] || {}
              return (
                <tr key={idx} style={{ height: 21 }}>
                  <td>
                    <BmrDateField
                      value={row.date || ''}
                      onChange={(e) => {
                        const updated = [...(data.page14?.outer_packing_times || [])]
                        updated[idx] = { ...row, date: e.target.value }
                        updatePage('page14', 'outer_packing_times', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.from_time || ''}
                      onChange={(e) => {
                        const updated = [...(data.page14?.outer_packing_times || [])]
                        updated[idx] = { ...row, from_time: e.target.value }
                        updatePage('page14', 'outer_packing_times', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.to_time || ''}
                      onChange={(e) => {
                        const updated = [...(data.page14?.outer_packing_times || [])]
                        updated[idx] = { ...row, to_time: e.target.value }
                        updatePage('page14', 'outer_packing_times', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.done_by || ''}
                      onChange={(e) => {
                        const updated = [...(data.page14?.outer_packing_times || [])]
                        updated[idx] = { ...row, done_by: e.target.value }
                        updatePage('page14', 'outer_packing_times', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_pkg || ''}
                      onChange={(e) => {
                        const updated = [...(data.page14?.outer_packing_times || [])]
                        updated[idx] = { ...row, checked_pkg: e.target.value }
                        updatePage('page14', 'outer_packing_times', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_qa || ''}
                      onChange={(e) => {
                        const updated = [...(data.page14?.outer_packing_times || [])]
                        updated[idx] = { ...row, checked_qa: e.target.value }
                        updatePage('page14', 'outer_packing_times', updated)
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div style={{ fontSize: '8.5pt', lineHeight: 1.8, margin: '4pt 0 6pt' }}>
          <div>Prepare bonded slip and transfer the batch to FP store</div>
          <div>
            Finish{' '}
            <input
              className="bmr-line-input"
              style={{ width: 140, textAlign: 'center' }}
              value={data.page14?.finish_bottles || ''}
              onChange={(e) => updatePage('page14', 'finish_bottles', e.target.value)}
            />{' '}
            Bottles ={' '}
            <input
              className="bmr-line-input"
              style={{ width: 160, textAlign: 'center' }}
              value={data.page14?.finish_bottles_val || ''}
              onChange={(e) => updatePage('page14', 'finish_bottles_val', e.target.value)}
            />
          </div>
          <div>
            Retain
            <input
              className="bmr-line-input"
              style={{ width: 140, textAlign: 'center' }}
              value={data.page14?.retain_bottles || ''}
              onChange={(e) => updatePage('page14', 'retain_bottles', e.target.value)}
            />{' '}
            Bottles ={' '}
            <input
              className="bmr-line-input"
              style={{ width: 160, textAlign: 'center' }}
              value={data.page14?.retain_bottles_val || ''}
              onChange={(e) => updatePage('page14', 'retain_bottles_val', e.target.value)}
            />
          </div>
          <div>
            Analysis{' '}
            <input
              className="bmr-line-input"
              style={{ width: 150, textAlign: 'center' }}
              value={data.page14?.analysis_bottles || ''}
              onChange={(e) => updatePage('page14', 'analysis_bottles', e.target.value)}
            />
            Bottles ={' '}
            <input
              className="bmr-line-input"
              style={{ width: 160, textAlign: 'center' }}
              value={data.page14?.analysis_bottles_val || ''}
              onChange={(e) => updatePage('page14', 'analysis_bottles_val', e.target.value)}
            />
          </div>
          <div>
            Total quantity packed{' '}
            <input
              className="bmr-line-input"
              style={{ width: 150, textAlign: 'center' }}
              value={data.page14?.total_packed_bottles || ''}
              onChange={(e) => updatePage('page14', 'total_packed_bottles', e.target.value)}
            />
            Bottles{' '}
            <input
              className="bmr-line-input"
              style={{ width: 120, textAlign: 'center' }}
              value={data.page14?.total_packed_bottles_val || ''}
              onChange={(e) => updatePage('page14', 'total_packed_bottles_val', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', textDecoration: 'underline' }}>
          PACKING MATERIAL RECONCILLATION:
        </div>
        <div style={{ fontSize: '8.5pt', margin: '1pt 0 4pt' }}>
          After completion of the packing operation, check and record the details of the PM in below given
          <br />
          table.
        </div>

        <table className="bmr-table">
          <colgroup>
            <col style={{ width: 28 }} />
            <col style={{ width: 70 }} />
            <col style={{ width: 46 }} />
            <col style={{ width: 44 }} />
            <col style={{ width: 46 }} />
            <col style={{ width: 40 }} />
            <col style={{ width: 40 }} />
            <col style={{ width: 40 }} />
            <col style={{ width: 40 }} />
            <col style={{ width: 44 }} />
            <col style={{ width: 48 }} />
            <col style={{ width: 48 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'center' }}>
                Sr.
                <br />
                No.
              </th>
              <th rowSpan={2}>Packing<br />Material</th>
              <th rowSpan={2}>AR<br />No.</th>
              <th rowSpan={2}>Qty.<br />Issued<br />Nos.</th>
              <th colSpan={4} style={{ textAlign: 'center' }}>Quantity Rejected</th>
              <th rowSpan={2}>Qty.<br />Used<br />No.</th>
              <th rowSpan={2}>Qty.<br />Returned<br />Nos.</th>
              <th rowSpan={2}>Checked<br />By (Pkg)</th>
              <th rowSpan={2}>Checked<br />By<br />(QA)</th>
            </tr>
            <tr>
              <th>Coding<br />Rejection</th>
              <th>Online</th>
              <th>Excess</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {[
              { sr: '1', material: 'Label' },
              { sr: '2', material: 'Box' },
            ].map((p, idx) => {
              const row = data.page14?.pm_reconciliation?.[idx] || p
              return (
                <tr key={p.sr} style={{ height: 21 }}>
                  <td style={{ textAlign: 'center' }}>{p.sr}</td>
                  <td>{p.material}</td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.ar_no || ''}
                      onChange={(e) => {
                        const updated = [...(data.page14?.pm_reconciliation || [])]
                        updated[idx] = { ...row, ar_no: e.target.value }
                        updatePage('page14', 'pm_reconciliation', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.issued || ''}
                      onChange={(e) => {
                        const updated = [...(data.page14?.pm_reconciliation || [])]
                        updated[idx] = { ...row, issued: e.target.value }
                        updatePage('page14', 'pm_reconciliation', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.coding_rej || ''}
                      onChange={(e) => {
                        const updated = [...(data.page14?.pm_reconciliation || [])]
                        updated[idx] = { ...row, coding_rej: e.target.value }
                        updatePage('page14', 'pm_reconciliation', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.online_rej || ''}
                      onChange={(e) => {
                        const updated = [...(data.page14?.pm_reconciliation || [])]
                        updated[idx] = { ...row, online_rej: e.target.value }
                        updatePage('page14', 'pm_reconciliation', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.excess || ''}
                      onChange={(e) => {
                        const updated = [...(data.page14?.pm_reconciliation || [])]
                        updated[idx] = { ...row, excess: e.target.value }
                        updatePage('page14', 'pm_reconciliation', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.total_rej || ''}
                      onChange={(e) => {
                        const updated = [...(data.page14?.pm_reconciliation || [])]
                        updated[idx] = { ...row, total_rej: e.target.value }
                        updatePage('page14', 'pm_reconciliation', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.used || ''}
                      onChange={(e) => {
                        const updated = [...(data.page14?.pm_reconciliation || [])]
                        updated[idx] = { ...row, used: e.target.value }
                        updatePage('page14', 'pm_reconciliation', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row.returned || ''}
                      onChange={(e) => {
                        const updated = [...(data.page14?.pm_reconciliation || [])]
                        updated[idx] = { ...row, returned: e.target.value }
                        updatePage('page14', 'pm_reconciliation', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_pkg || ''}
                      onChange={(e) => {
                        const updated = [...(data.page14?.pm_reconciliation || [])]
                        updated[idx] = { ...row, checked_pkg: e.target.value }
                        updatePage('page14', 'pm_reconciliation', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_qa || ''}
                      onChange={(e) => {
                        const updated = [...(data.page14?.pm_reconciliation || [])]
                        updated[idx] = { ...row, checked_qa: e.target.value }
                        updatePage('page14', 'pm_reconciliation', updated)
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {renderFooter(14)}
    </div>
  )

  // -------------------------------------------------------------
  // Page 15: QA Final Inspection & Yield
  // -------------------------------------------------------------
  const renderPage15 = () => {
    // Auto-compute final yield formula: (a + b) x 100 / batch_size
    const batchSizeNum = parseFloat(String(data.page1?.batch_size || data.header?.batch_size || '').replace(/[^0-9.]/g, ''))
    const aVal = data.page15?.yield_a !== undefined ? data.page15.yield_a : ''
    const bVal = data.page15?.yield_b !== undefined ? data.page15.yield_b : ''
    const aNum = parseFloat(aVal)
    const bNum = parseFloat(bVal)
    let autoYieldCalc = data.page15?.final_yield_calc
    let autoYieldPercent = data.page15?.final_yield_percent

    if (autoYieldCalc === undefined && !isNaN(aNum) && !isNaN(bNum) && batchSizeNum > 0) {
      const calcVal = ((aNum + bNum) * 100) / batchSizeNum
      autoYieldPercent = calcVal.toFixed(2)
      autoYieldCalc = `${aNum} + ${bNum} x 100 / ${batchSizeNum}`
    }

    return (
      <div className="bmr-sheet bmr-tablet-sheet" key="page-15">
        {renderHeader(15)}
        <div className="bmr-body">
          {/* Continuation rows 3 Inserts, 4 Ved without header */}
          <table className="bmr-table" style={{ marginTop: 2, marginBottom: 6 }}>
            <colgroup>
              <col style={{ width: 28 }} />
              <col style={{ width: 70 }} />
              <col style={{ width: 46 }} />
              <col style={{ width: 44 }} />
              <col style={{ width: 46 }} />
              <col style={{ width: 40 }} />
              <col style={{ width: 40 }} />
              <col style={{ width: 40 }} />
              <col style={{ width: 40 }} />
              <col style={{ width: 44 }} />
              <col style={{ width: 48 }} />
              <col style={{ width: 48 }} />
            </colgroup>
            <tbody>
              {[
                { sr: '3', material: 'Inserts' },
                { sr: '4', material: 'Ved' },
              ].map((p, idx) => {
                const row = data.page15?.pm_reconciliation_cont?.[idx] || p
                return (
                  <tr key={p.sr} style={{ height: 21 }}>
                    <td style={{ textAlign: 'center' }}>{p.sr}</td>
                    <td>{p.material}</td>
                    <td>
                      <input
                        className="bmr-cell-input"
                        value={row.ar_no || ''}
                        onChange={(e) => {
                          const updated = [...(data.page15?.pm_reconciliation_cont || [])]
                          updated[idx] = { ...row, ar_no: e.target.value }
                          updatePage('page15', 'pm_reconciliation_cont', updated)
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="bmr-cell-input"
                        style={{ textAlign: 'center' }}
                        value={row.issued || ''}
                        onChange={(e) => {
                          const updated = [...(data.page15?.pm_reconciliation_cont || [])]
                          updated[idx] = { ...row, issued: e.target.value }
                          updatePage('page15', 'pm_reconciliation_cont', updated)
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="bmr-cell-input"
                        style={{ textAlign: 'center' }}
                        value={row.coding_rej || ''}
                        onChange={(e) => {
                          const updated = [...(data.page15?.pm_reconciliation_cont || [])]
                          updated[idx] = { ...row, coding_rej: e.target.value }
                          updatePage('page15', 'pm_reconciliation_cont', updated)
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="bmr-cell-input"
                        style={{ textAlign: 'center' }}
                        value={row.online_rej || ''}
                        onChange={(e) => {
                          const updated = [...(data.page15?.pm_reconciliation_cont || [])]
                          updated[idx] = { ...row, online_rej: e.target.value }
                          updatePage('page15', 'pm_reconciliation_cont', updated)
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="bmr-cell-input"
                        style={{ textAlign: 'center' }}
                        value={row.excess || ''}
                        onChange={(e) => {
                          const updated = [...(data.page15?.pm_reconciliation_cont || [])]
                          updated[idx] = { ...row, excess: e.target.value }
                          updatePage('page15', 'pm_reconciliation_cont', updated)
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="bmr-cell-input"
                        style={{ textAlign: 'center' }}
                        value={row.total_rej || ''}
                        onChange={(e) => {
                          const updated = [...(data.page15?.pm_reconciliation_cont || [])]
                          updated[idx] = { ...row, total_rej: e.target.value }
                          updatePage('page15', 'pm_reconciliation_cont', updated)
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="bmr-cell-input"
                        style={{ textAlign: 'center' }}
                        value={row.used || ''}
                        onChange={(e) => {
                          const updated = [...(data.page15?.pm_reconciliation_cont || [])]
                          updated[idx] = { ...row, used: e.target.value }
                          updatePage('page15', 'pm_reconciliation_cont', updated)
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="bmr-cell-input"
                        style={{ textAlign: 'center' }}
                        value={row.returned || ''}
                        onChange={(e) => {
                          const updated = [...(data.page15?.pm_reconciliation_cont || [])]
                          updated[idx] = { ...row, returned: e.target.value }
                          updatePage('page15', 'pm_reconciliation_cont', updated)
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="bmr-cell-input"
                        value={row.checked_pkg || ''}
                        onChange={(e) => {
                          const updated = [...(data.page15?.pm_reconciliation_cont || [])]
                          updated[idx] = { ...row, checked_pkg: e.target.value }
                          updatePage('page15', 'pm_reconciliation_cont', updated)
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="bmr-cell-input"
                        value={row.checked_qa || ''}
                        onChange={(e) => {
                          const updated = [...(data.page15?.pm_reconciliation_cont || [])]
                          updated[idx] = { ...row, checked_qa: e.target.value }
                          updatePage('page15', 'pm_reconciliation_cont', updated)
                        }}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', textDecoration: 'underline', margin: '4pt 0 4pt' }}>
            QA FINAL INSPECTION REPORT:
          </div>

          <table className="bmr-table" style={{ marginBottom: 6 }}>
            <colgroup>
              <col style={{ width: 85 }} />
              <col style={{ width: 140 }} />
              <col style={{ width: 75 }} />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>Unit</th>
                <th>Checking</th>
                <th style={{ textAlign: 'center' }}>No. of unit</th>
                <th>Checked by/Date</th>
                <th>Checked by/Date<br />(QA)</th>
              </tr>
            </thead>
            <tbody>
              {[
                { unit: 'Outer box', checking: 'Quality and Quantity' },
                { unit: 'Inner box', checking: 'Quality and Quantity' },
                { unit: 'Carton', checking: 'Quality and Quantity' },
                { unit: 'Bottle', checking: 'Quality and Quantity' },
              ].map((item, idx) => {
                const row = data.page15?.qa_final_inspections?.[idx] || item
                return (
                  <tr key={item.unit} style={{ height: 21 }}>
                    <td>{item.unit}</td>
                    <td>{item.checking}</td>
                    <td>
                      <input
                        className="bmr-cell-input"
                        style={{ textAlign: 'center' }}
                        value={row.no_of_unit || ''}
                        onChange={(e) => {
                          const updated = [...(data.page15?.qa_final_inspections || [])]
                          updated[idx] = { ...row, no_of_unit: e.target.value }
                          updatePage('page15', 'qa_final_inspections', updated)
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="bmr-cell-input"
                        value={row.checked_by || ''}
                        onChange={(e) => {
                          const updated = [...(data.page15?.qa_final_inspections || [])]
                          updated[idx] = { ...row, checked_by: e.target.value }
                          updatePage('page15', 'qa_final_inspections', updated)
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="bmr-cell-input"
                        value={row.checked_by_qa || ''}
                        onChange={(e) => {
                          const updated = [...(data.page15?.qa_final_inspections || [])]
                          updated[idx] = { ...row, checked_by_qa: e.target.value }
                          updatePage('page15', 'qa_final_inspections', updated)
                        }}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div style={{ fontSize: '8.5pt', lineHeight: 1.6, margin: '4pt 0 6pt' }}>
            Release by QA for transfer to finished product store through Finish Product transfer slip no.{' '}
            <input
              className="bmr-line-input"
              style={{ width: 100, textAlign: 'center' }}
              value={data.page15?.qa_release_slip_no || ''}
              onChange={(e) => updatePage('page15', 'qa_release_slip_no', e.target.value)}
            />
            <br />
            on time and date{' '}
            <input
              className="bmr-line-input"
              style={{ width: 160 }}
              value={data.page15?.qa_release_time_date || ''}
              onChange={(e) => updatePage('page15', 'qa_release_time_date', e.target.value)}
            />
            .
          </div>

          <div style={{ fontSize: '8.5pt', margin: '2pt 0 2pt' }}>Yield and accountability</div>
          <div style={{ fontSize: '8.5pt', lineHeight: 1.7, paddingLeft: 6, marginBottom: 8 }}>
            <div>
              a) Quantity released/transferred to BSR by QA{' '}
              <input
                className="bmr-line-input"
                style={{ width: 140, textAlign: 'center' }}
                value={aVal}
                onChange={(e) => updatePage('page15', 'yield_a', e.target.value)}
              />
              nos
            </div>
            <div>
              b) QC sample/retained sample{' '}
              <input
                className="bmr-line-input"
                style={{ width: 140, textAlign: 'center' }}
                value={bVal}
                onChange={(e) => updatePage('page15', 'yield_b', e.target.value)}
              />
              nos
            </div>
            <div>
              c) Recoverable rejection{' '}
              <input
                className="bmr-line-input"
                style={{ width: 140, textAlign: 'center' }}
                value={data.page15?.yield_c || ''}
                onChange={(e) => updatePage('page15', 'yield_c', e.target.value)}
              />
              nos/gms
            </div>
            <div>
              d) Non recoverable rejection{' '}
              <input
                className="bmr-line-input"
                style={{ width: 140, textAlign: 'center' }}
                value={data.page15?.yield_d || ''}
                onChange={(e) => updatePage('page15', 'yield_d', e.target.value)}
              />
              nos/gms
            </div>
          </div>

          <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', textDecoration: 'underline' }}>
            FINAL YIELD:
          </div>

          <div className="bmr-syrup-formula-row" style={{ margin: '4pt 0 10pt' }}>
            <span>Formula</span>
            <div className="bmr-syrup-fraction">
              <span className="bmr-syrup-fraction-num">a + b x 100</span>
              <span className="bmr-syrup-fraction-den">Batch size</span>
            </div>
            <span>=</span>
            <input
              className="bmr-line-input"
              style={{ width: 140, textAlign: 'center' }}
              value={autoYieldPercent !== undefined && autoYieldPercent !== null ? autoYieldPercent : ''}
              onChange={(e) => {
                updatePage('page15', 'final_yield_percent', e.target.value)
              }}
            />
            <span>% ( Limit NLT 97%)</span>
          </div>

          <div style={{ fontSize: '8.5pt', margin: '4pt 0' }}>Accountability</div>
        </div>
        {renderFooter(15)}
      </div>
    )
  }

  // -------------------------------------------------------------
  // Page 16: Final Yield (Formula 2)
  // -------------------------------------------------------------
  const renderPage16 = () => {
    // Formula 2: a + b + c + d x 100 / Batch size = ___ % (Limit NLT 98%)
    const batchSizeNum = parseFloat(String(data.page1?.batch_size || data.header?.batch_size || '').replace(/[^0-9.]/g, ''))
    const aVal = parseFloat(data.page15?.yield_a || 0)
    const bVal = parseFloat(data.page15?.yield_b || 0)
    const cVal = parseFloat(data.page15?.yield_c || 0)
    const dVal = parseFloat(data.page15?.yield_d || 0)
    let autoAccPercent = data.page16?.accountability_percent
    if (autoAccPercent === undefined && batchSizeNum > 0 && (aVal || bVal || cVal || dVal)) {
      const calcVal = ((aVal + bVal + cVal + dVal) * 100) / batchSizeNum
      autoAccPercent = calcVal.toFixed(2)
    }

    return (
      <div className="bmr-sheet bmr-tablet-sheet" key="page-16">
        {renderHeader(16)}
        <div className="bmr-body">
          <div className="bmr-syrup-formula-row" style={{ margin: '14pt 0' }}>
            <span>Formula</span>
            <div className="bmr-syrup-fraction">
              <span className="bmr-syrup-fraction-num">a + b + c + d x 100</span>
              <span className="bmr-syrup-fraction-den">Batch size</span>
            </div>
            <span>=</span>
            <input
              className="bmr-line-input"
              style={{ width: 140, textAlign: 'center' }}
              value={autoAccPercent !== undefined && autoAccPercent !== null ? autoAccPercent : ''}
              onChange={(e) => updatePage('page16', 'accountability_percent', e.target.value)}
            />
            <span>% ( Limit NLT 98%)</span>
          </div>
          {/* Rest of page empty as per PDF */}
        </div>
        {renderFooter(16)}
      </div>
    )
  }

  // -------------------------------------------------------------
  // Page 17: Specimen of Carton / Label
  // -------------------------------------------------------------
  const renderPage17 = () => {
    const handleFileChange = (e) => {
      const file = e.target.files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (event) => {
          updatePage('page17', 'specimen_image', event.target.result)
        }
        reader.readAsDataURL(file)
      }
    }

    return (
      <div className="bmr-sheet bmr-tablet-sheet" key="page-17">
        {renderHeader(17)}
        <div className="bmr-body">
          <div style={{ margin: '8pt 0', fontSize: '9pt' }}>
            Attach the approved specimen of each carton/ label in below given space
          </div>

          <div className="bmr-specimen-box">
            {data.page17?.specimen_image ? (
              <div style={{ textAlign: 'center', width: '100%' }}>
                <img
                  src={data.page17.specimen_image}
                  alt="Specimen preview"
                  className="bmr-specimen-preview"
                />
                <div style={{ marginTop: 8 }} className="no-print">
                  <button
                    type="button"
                    className="bmr-back-btn"
                    style={{ fontSize: 11, padding: '3px 8px' }}
                    onClick={() => updatePage('page17', 'specimen_image', null)}
                  >
                    Remove Specimen
                  </button>
                </div>
              </div>
            ) : (
              <div className="no-print" style={{ color: '#64748b', fontSize: 13, padding: '40px 20px' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📎</div>
                <div style={{ marginBottom: 12 }}>Attach specimen image here</div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  style={{ fontSize: 12 }}
                />
              </div>
            )}
          </div>
        </div>
        {renderFooter(17)}
      </div>
    )
  }

  // -------------------------------------------------------------
  // Page 18: Yield Deviation
  // -------------------------------------------------------------
  const renderPage18 = () => (
    <div className="bmr-sheet bmr-tablet-sheet" key="page-18">
      {renderHeader(18)}
      <div className="bmr-body">
        <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', textDecoration: 'underline', margin: '10pt 0 10pt' }}>
          DEVIATION :
        </div>

        <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', margin: '4pt 0 12pt' }}>
          A) YIELD DEVIATION: If yield is out of limit to justify the reason as below:
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, margin: '8pt 0 24pt' }}>
          {Array.from({ length: 4 }, (_, idx) => (
            <input
              key={idx}
              className="bmr-line-input"
              style={{
                width: '100%',
                borderBottom: '1px dotted #000',
                height: 18,
                fontSize: '9pt',
              }}
              value={data.page18?.yield_deviation_lines?.[idx] || ''}
              onChange={(e) => {
                const updated = [...(data.page18?.yield_deviation_lines || ['', '', '', ''])]
                updated[idx] = e.target.value
                updatePage('page18', 'yield_deviation_lines', updated)
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
          <div>
            <div>Prepared by/ Date</div>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 4 }}>
              <span>Production </span>
              <input
                className="bmr-line-input"
                style={{ width: 170, marginLeft: 6 }}
                placeholder="Sign / Date"
                value={data.page18?.prepared_by_date || ''}
                onChange={(e) => updatePage('page18', 'prepared_by_date', e.target.value)}
              />
            </div>
          </div>
          <div style={{ textAlign: 'left', minWidth: 200 }}>
            <div>Approved by/ Date</div>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 4 }}>
              <span>QA </span>
              <input
                className="bmr-line-input"
                style={{ width: 170, marginLeft: 6 }}
                placeholder="Sign / Date"
                value={data.page18?.approved_by_date || ''}
                onChange={(e) => updatePage('page18', 'approved_by_date', e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
      {renderFooter(18)}
    </div>
  )

  // -------------------------------------------------------------
  // Page 19: Procedural Deviation
  // -------------------------------------------------------------
  const renderPage19 = () => (
    <div className="bmr-sheet bmr-tablet-sheet" key="page-19">
      {renderHeader(19)}
      <div className="bmr-body">
        <div className="bmr-tablet-section-heading" style={{ fontWeight: 'bold', textDecoration: 'underline', margin: '10pt 0 8pt' }}>
          B) PROCEDURAL DEVIATION:
        </div>

        <table className="bmr-table" style={{ marginBottom: 16 }}>
          <colgroup>
            <col style={{ width: 45 }} />
            <col style={{ width: 180 }} />
            <col />
            <col style={{ width: 85 }} />
            <col style={{ width: 100 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>
                Sr.
                <br />
                No.
              </th>
              <th>Details of Deviation</th>
              <th>Corrective action</th>
              <th>Raise by</th>
              <th>Approved By(QA)</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }, (_, idx) => {
              const row = data.page19?.procedural_deviations?.[idx] || { sr: String(idx + 1) }
              return (
                <tr key={idx} style={{ height: 26 }}>
                  <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.details || ''}
                      onChange={(e) => {
                        const updated = [...(data.page19?.procedural_deviations || [])]
                        updated[idx] = { ...row, details: e.target.value }
                        updatePage('page19', 'procedural_deviations', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.action || ''}
                      onChange={(e) => {
                        const updated = [...(data.page19?.procedural_deviations || [])]
                        updated[idx] = { ...row, action: e.target.value }
                        updatePage('page19', 'procedural_deviations', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.raise_by || ''}
                      onChange={(e) => {
                        const updated = [...(data.page19?.procedural_deviations || [])]
                        updated[idx] = { ...row, raise_by: e.target.value }
                        updatePage('page19', 'procedural_deviations', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.approved_qa || ''}
                      onChange={(e) => {
                        const updated = [...(data.page19?.procedural_deviations || [])]
                        updated[idx] = { ...row, approved_qa: e.target.value }
                        updatePage('page19', 'procedural_deviations', updated)
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
          <div>
            <div>Prepared by/ Date</div>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 4 }}>
              <span>Production </span>
              <input
                className="bmr-line-input"
                style={{ width: 170, marginLeft: 6 }}
                placeholder="Sign / Date"
                value={data.page19?.prepared_by_date || ''}
                onChange={(e) => updatePage('page19', 'prepared_by_date', e.target.value)}
              />
            </div>
          </div>
          <div style={{ textAlign: 'left', minWidth: 200 }}>
            <div>Approved by/ Date</div>
            <div style={{ display: 'flex', alignItems: 'center', marginTop: 4 }}>
              <span>QA </span>
              <input
                className="bmr-line-input"
                style={{ width: 170, marginLeft: 6 }}
                placeholder="Sign / Date"
                value={data.page19?.approved_by_date || ''}
                onChange={(e) => updatePage('page19', 'approved_by_date', e.target.value)}
              />
            </div>
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
