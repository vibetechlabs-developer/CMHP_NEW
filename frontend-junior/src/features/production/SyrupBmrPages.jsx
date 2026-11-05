
export function getSyrupPageRenderers({
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
  // Page 1: Product Details & Attachments Checklist
  const renderPage1 = () => (
    <div className="bmr-sheet bmr-syrup-sheet" key="page-1">
      {renderHeader(1)}
      <div className="bmr-body bmr-p1-body">
        <div className="bmr-section-title" style={{ textDecoration: 'underline' }}>
          Product Details
        </div>
        <div className="bmr-syrup-p1-details">
          <div className="bmr-syrup-p1-row">
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
          <div className="bmr-syrup-p1-row">
            <span className="bmr-p1-num">2</span>
            <span className="bmr-p1-label">Expiry Date / Best Use Before :</span>
            <span className="bmr-p1-colon">:</span>
            <div className="bmr-p1-field">
              <input
                className="bmr-line-input"
                value={data.page1?.expiry_date !== undefined ? data.page1.expiry_date : '5 YEARS'}
                onChange={(e) => updatePage('page1', 'expiry_date', e.target.value)}
              />
            </div>
          </div>
          <div className="bmr-syrup-p1-row">
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
          <div className="bmr-syrup-p1-row">
            <span className="bmr-p1-num">4</span>
            <span className="bmr-p1-label">Date of Manufacturing Started :</span>
            <span className="bmr-p1-colon">:</span>
            <div className="bmr-p1-field">
              <BmrDateField
                value={data.page1?.mfg_started || ''}
                onChange={(e) => updatePage('page1', 'mfg_started', e.target.value)}
              />
            </div>
          </div>
          <div className="bmr-syrup-p1-row">
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

        <table className="bmr-syrup-p1-attachments">
          <colgroup>
            <col style={{ width: '80%' }} />
            <col style={{ width: '20%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Check List of Attachments</th>
              <th style={{ textAlign: 'center' }}>Marks of Compliance</th>
            </tr>
          </thead>
          <tbody>
            {[
              { key: 'rm_requisition', num: 1, text: 'RM requisition slip (ATTACHMENT 1)' },
              { key: 'test_request_bulk', num: 2, text: 'Test request slip of bulk product (ATTACHMENT 2)' },
              { key: 'release_note_bulk', num: 3, text: 'Release note of bulk product (ATTACHMENT 3)' },
              { key: 'pm_requisition', num: 4, text: 'PM requisition slip (ATTACHMENT 4)' },
              { key: 'specimen_carton_label', num: 5, text: 'Specimen of mono carton and label' },
              { key: 'test_request_finish', num: 6, text: 'Test request slip of Finish product (after packing) (ATTACHMENT 5)' },
              { key: 'test_report_coa', num: 7, text: 'Test report (COA) of finish Product ( after packing)' },
              { key: 'finish_transfer_slip', num: 8, text: 'Finish product transfer slip  (ATTACHMENT 6)' },
            ].map((item) => (
              <tr key={item.key} className="bmr-syrup-p1-row-att">
                <td>
                  <span style={{ display: 'inline-block', width: '20pt' }}>{item.num}</span>
                  <span>{item.text}</span>
                </td>
                <td>
                  <div
                    className={`bmr-syrup-p1-box ${data.page1?.attachments?.[item.key] ? 'checked' : ''}`}
                    onClick={() => {
                      setData((prev) => ({
                        ...prev,
                        page1: {
                          ...(prev.page1 || {}),
                          attachments: {
                            ...(prev.page1?.attachments || {}),
                            [item.key]: !prev.page1?.attachments?.[item.key],
                          },
                        },
                      }))
                    }}
                  >
                    {data.page1?.attachments?.[item.key] ? '✓' : ''}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {renderFooter(1)}
    </div>
  )

  // Page 2: RM Dispensing Area Line Clearance (Part 1)
  const renderPage2 = () => (
    <div className="bmr-sheet bmr-syrup-sheet" key="page-2">
      {renderHeader(2)}
      <div className="bmr-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2pt 0 4pt', fontSize: 11 }}>
          <div>
            <strong>Checked by/Date (Production) : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page2?.checked_by_date || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page2', 'checked_by_date', e.target.value)}
            />
          </div>
          <div>
            <strong>Verified by/Date (QA) : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page2?.verified_by_date || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page2', 'verified_by_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title">
          RAW MATERIAL DISPENSING AREA LINE CLEARANCE:
        </div>
        <div style={{ display: 'flex', gap: 30, margin: '2pt 0 4pt', fontSize: 11 }}>
          <div>
            <strong>PREVIOUS PRODUCT : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 180 }}
              value={data.page2?.previous_product || ''}
              onChange={(e) => updatePage('page2', 'previous_product', e.target.value)}
            />
          </div>
          <div>
            <strong>Batch No. </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page2?.previous_batch_no || ''}
              onChange={(e) => updatePage('page2', 'previous_batch_no', e.target.value)}
            />
          </div>
        </div>

        <table className="bmr-table">
          <colgroup>
            <col style={{ width: 45 }} />
            <col />
            <col style={{ width: 85 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Sr. No.</th>
              <th style={{ textAlign: 'center' }}>Activity</th>
              <th style={{ textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              { id: 'item1', sr: '1', text: 'Dispensing booth and equipments are cleaned and are dust free' },
              { id: 'item2', sr: '2', text: 'Relevant weighing balances are calibrated.' },
              { id: 'item3', sr: '3', text: 'All types of wastages are removed from dispensing area.' },
              { id: 'item4', sr: '4', text: 'All raw materials of previous products are removed from dispensing area' },
              { id: 'item5', sr: '5', text: 'Containers and other equipments used for weighing and transferring the materials are cleaned and dried' },
            ].map((row) => (
              <tr key={row.id}>
                <td style={{ textAlign: 'center' }}>{row.sr}</td>
                <td>{row.text}</td>
                <td style={{ textAlign: 'center' }}>
                  {renderYesNo(data.page2?.checklist?.[row.id], (val) =>
                    setData((p) => ({
                      ...p,
                      page2: {
                        ...(p.page2 || {}),
                        checklist: { ...(p.page2?.checklist || {}), [row.id]: val },
                      },
                    }))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {renderFooter(2)}
    </div>
  )

  // Page 3: RM Clearance (Part 2) & Mfg Area Clearance
  const renderPage3 = () => (
    <div className="bmr-sheet bmr-syrup-sheet" key="page-3">
      {renderHeader(3)}
      <div className="bmr-body">
        {/* Continuation table without header as in PDF */}
        <table className="bmr-table" style={{ marginTop: 2 }}>
          <colgroup>
            <col style={{ width: 45 }} />
            <col />
            <col style={{ width: 85 }} />
          </colgroup>
          <tbody>
            {[
              { id: 'item6', sr: '6', text: 'All approved labels are checked' },
              { id: 'item7', sr: '7', text: 'RM requisition sheet is filled and duly signed till this stage' },
              { id: 'item8', sr: '8', text: 'BMR is properly filled and duly signed till this stage.' },
              { id: 'item9', sr: '9', text: 'Status labeling of dispensing area is proper.' },
              { id: 'item10', sr: '10', text: 'Ensure temperature of dispensing area is within limit. (Limit 27℃ ± 2℃ )' },
            ].map((row) => (
              <tr key={row.id}>
                <td style={{ textAlign: 'center' }}>{row.sr}</td>
                <td>{row.text}</td>
                <td style={{ textAlign: 'center' }}>
                  {renderYesNo(data.page3?.checklist_cont?.[row.id], (val) =>
                    setData((p) => ({
                      ...p,
                      page3: {
                        ...(p.page3 || {}),
                        checklist_cont: { ...(p.page3?.checklist_cont || {}), [row.id]: val },
                      },
                    }))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4pt 0 6pt', fontSize: 11 }}>
          <div>
            <strong>Checked By / Date (Warehouse) : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page3?.warehouse_checked_by_date || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page3', 'warehouse_checked_by_date', e.target.value)}
            />
          </div>
          <div>
            <strong>Verified By/Date ( QA) : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page3?.qa_verified_by_date || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page3', 'qa_verified_by_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title">
          MANUFACTURING AREA LINE CLEARANCE:
        </div>
        <div style={{ display: 'flex', gap: 30, margin: '2pt 0 4pt', fontSize: 11 }}>
          <div>
            <strong>Previous Product: </strong>
            <input
              className="bmr-line-input"
              style={{ width: 180 }}
              value={data.page3?.mfg_previous_product || ''}
              onChange={(e) => updatePage('page3', 'mfg_previous_product', e.target.value)}
            />
          </div>
          <div>
            <strong>Batch No. </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page3?.mfg_previous_batch_no || ''}
              onChange={(e) => updatePage('page3', 'mfg_previous_batch_no', e.target.value)}
            />
          </div>
        </div>

        <table className="bmr-table">
          <colgroup>
            <col style={{ width: 45 }} />
            <col />
            <col style={{ width: 85 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Sr. No.</th>
              <th style={{ textAlign: 'center' }}>Activity</th>
              <th style={{ textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ textAlign: 'center' }}>1</td>
              <td>Previous Product left over is removed from area.</td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page3?.mfg_checklist?.item1, (val) =>
                  setData((p) => ({
                    ...p,
                    page3: {
                      ...(p.page3 || {}),
                      mfg_checklist: { ...(p.page3?.mfg_checklist || {}), item1: val },
                    },
                  }))
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {renderFooter(3)}
    </div>
  )

  // Page 4: Mfg Area Clearance (Part 2) & Equipments
  const renderPage4 = () => (
    <div className="bmr-sheet bmr-syrup-sheet" key="page-4">
      {renderHeader(4)}
      <div className="bmr-body">
        {/* Continuation table without header as in PDF */}
        <table className="bmr-table" style={{ marginTop: 2 }}>
          <colgroup>
            <col style={{ width: 45 }} />
            <col />
            <col style={{ width: 85 }} />
          </colgroup>
          <tbody>
            {[
              { id: 'item2', sr: '2', text: 'All equipments/ machineries are properly cleaned and dried.' },
              { id: 'item3', sr: '3', text: 'All equipments / machineries are in perfect working order.' },
              { id: 'item4', sr: '4', text: 'Manufacturing area is cleaned and all types of wastage are removed from this area.' },
              { id: 'item5', sr: '5', text: 'AHU system is properly working.' },
              { id: 'item6', sr: '6', text: 'BMR is properly filled and duly signed till this stage.' },
              { id: 'item7', sr: '7', text: 'Status labeling of manufacturing area is proper.' },
            ].map((row) => (
              <tr key={row.id}>
                <td style={{ textAlign: 'center' }}>{row.sr}</td>
                <td>{row.text}</td>
                <td style={{ textAlign: 'center' }}>
                  {renderYesNo(data.page4?.mfg_checklist_cont?.[row.id], (val) =>
                    setData((p) => ({
                      ...p,
                      page4: {
                        ...(p.page4 || {}),
                        mfg_checklist_cont: { ...(p.page4?.mfg_checklist_cont || {}), [row.id]: val },
                      },
                    }))
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td style={{ textAlign: 'center' }}>8</td>
              <td>
                <div>Temperature, % RH and differential pressure is within limit.</div>
                <div style={{ paddingLeft: 6, fontSize: '7.5pt', color: '#1e293b', marginTop: 1 }}>
                  Temperature (Limit: 27°C ± 2°C)<br />
                  % Relative Humidity (Limit: 55% ± 2%)<br />
                  Differential Pressure (Limit NLT{' '}
                  <input
                    className="bmr-line-input"
                    style={{ width: 45, textAlign: 'center', height: '13pt' }}
                    value={data.page4?.diff_pressure_limit || ''}
                    onChange={(e) => updatePage('page4', 'diff_pressure_limit', e.target.value)}
                  />{' '}
                  Pascal)
                </div>
              </td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page4?.mfg_checklist_cont?.item8, (val) =>
                  setData((p) => ({
                    ...p,
                    page4: {
                      ...(p.page4 || {}),
                      mfg_checklist_cont: { ...(p.page4?.mfg_checklist_cont || {}), item8: val },
                    },
                  }))
                )}
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3pt 0 4pt', fontSize: 11 }}>
          <div>
            <strong>Checked By / Date (Production) : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page4?.checked_by_prod_date || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page4', 'checked_by_prod_date', e.target.value)}
            />
          </div>
          <div>
            <strong>Verified by/Date (QA) : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page4?.verified_by_qa_date || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page4', 'verified_by_qa_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title">
          LIQUID ORAL MANUFACTURING:
        </div>
        <table className="bmr-table">
          <colgroup>
            <col style={{ width: 40 }} />
            <col style={{ width: 155 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 85 }} />
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
            {(data.page4?.equipments || []).map((eq, idx) => (
              <tr key={idx}>
                <td style={{ textAlign: 'center' }}>{eq.sr}</td>
                <td>
                  {idx === 4 ? (
                    <input
                      className="bmr-cell-input"
                      value={eq.name || ''}
                      onChange={(e) => {
                        const updated = [...(data.page4?.equipments || [])]
                        updated[idx].name = e.target.value
                        updatePage('page4', 'equipments', updated)
                      }}
                    />
                  ) : (
                    eq.name
                  )}
                </td>
                <td>
                  {idx === 4 ? (
                    <input
                      className="bmr-cell-input"
                      value={eq.id || ''}
                      onChange={(e) => {
                        const updated = [...(data.page4?.equipments || [])]
                        updated[idx].id = e.target.value
                        updatePage('page4', 'equipments', updated)
                      }}
                    />
                  ) : (
                    eq.id
                  )}
                </td>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={eq.date_cleaned || ''}
                    onChange={(e) => {
                      const updated = [...(data.page4?.equipments || [])]
                      updated[idx].date_cleaned = e.target.value
                      updatePage('page4', 'equipments', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={eq.prev_batch || ''}
                    onChange={(e) => {
                      const updated = [...(data.page4?.equipments || [])]
                      updated[idx].prev_batch = e.target.value
                      updatePage('page4', 'equipments', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 3, lineHeight: '1.4', fontSize: 10.5 }}>
          <div>
            <strong>Cleaned by/ Date (Production) : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 170 }}
              value={data.page4?.cleaned_by_date || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page4', 'cleaned_by_date', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <div>
              <strong>Checked by/ Date (Production) : </strong>
              <input
                className="bmr-line-input"
                style={{ width: 140 }}
                value={data.page4?.checked_by_date || ''}
                placeholder="Sign / Date"
                onChange={(e) => updatePage('page4', 'checked_by_date', e.target.value)}
              />
            </div>
            <div>
              <strong>Verified by /Date (QA) : </strong>
              <input
                className="bmr-line-input"
                style={{ width: 140 }}
                value={data.page4?.verified_by_date || ''}
                placeholder="Sign / Date"
                onChange={(e) => updatePage('page4', 'verified_by_date', e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>
      {renderFooter(4)}
    </div>
  )

  // Page 5: Bulk Manufacturing Process & Release Slips
  const renderPage5 = () => (
    <div className="bmr-sheet bmr-syrup-sheet" key="page-5">
      {renderHeader(5)}
      <div className="bmr-body bmr-syrup-p5">
        <div className="bmr-section-title">
          MANUFACTURING PROCESS OF BULK:
        </div>
        <table className="bmr-table" style={{ marginBottom: 2 }}>
          <colgroup>
            <col style={{ width: 35 }} />
            <col style={{ width: 185 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 75 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 45 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Sr.<br />No</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Process</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Equip. used</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Eq. ID</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time ( Hrs.)</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center', fontSize: 9 }}>From</th>
              <th style={{ textAlign: 'center', fontSize: 9 }}>To</th>
            </tr>
          </thead>
          <tbody>
            {(data.page5?.bulk_processes || []).map((p, idx) => (
              <tr key={idx}>
                <td style={{ textAlign: 'center' }}>{p.sr}</td>
                <td style={{ whiteSpace: 'pre-line' }}>
                  {idx === 3 ? (
                    <div>
                      Volume setting<br />
                      LTRs: <input
                        className="bmr-line-input"
                        style={{ width: 80, height: '13.5pt' }}
                        value={p.ltrs || ''}
                        onChange={(e) => {
                          const updated = [...(data.page5?.bulk_processes || [])]
                          updated[idx].ltrs = e.target.value
                          updatePage('page5', 'bulk_processes', updated)
                        }}
                      />
                    </div>
                  ) : (
                    p.process
                  )}
                </td>
                <td className={idx === 3 ? 'bmr-syrup-grey-cell' : ''} style={{ whiteSpace: 'pre-line' }}>
                  {idx === 3 ? null : p.equip}
                </td>
                <td className={idx === 3 ? 'bmr-syrup-grey-cell' : ''}>
                  {idx === 3 ? null : p.eq_id}
                </td>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={p.date || ''}
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
                    style={{ textAlign: 'center' }}
                    value={p.from_time || ''}
                    placeholder="HH:mm"
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
                    style={{ textAlign: 'center' }}
                    value={p.to_time || ''}
                    placeholder="HH:mm"
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

        <div className="bmr-sign-compact" style={{ lineHeight: '1.15', fontSize: '7.5pt', margin: '1pt 0' }}>
          <div>
            <strong>Done by/Date (Production) : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140, height: '11pt' }}
              value={data.page5?.done_by_date || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page5', 'done_by_date', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 1 }}>
            <div>
              <strong>Checked by/Date(Production) : </strong>
              <input
                className="bmr-line-input"
                style={{ width: 130, height: '11pt' }}
                value={data.page5?.checked_by_date || ''}
                placeholder="Sign / Date"
                onChange={(e) => updatePage('page5', 'checked_by_date', e.target.value)}
              />
            </div>
            <div>
              <strong>Verified by/Date (QA) </strong>
              <input
                className="bmr-line-input"
                style={{ width: 130, height: '11pt' }}
                value={data.page5?.verified_by_date || ''}
                placeholder="Sign / Date"
                onChange={(e) => updatePage('page5', 'verified_by_date', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* 4 sentences without border box matching PDF */}
        <div className="bmr-p5-text-block">
          <div>
            <strong>PROD: </strong>Test request sent to QA department on date{' '}
            <BmrDateField
              className="bmr-line-input"
              style={{ width: 85 }}
              value={data.page5?.prod_test_req_date || ''}
              onChange={(e) => updatePage('page5', 'prod_test_req_date', e.target.value)}
            />{' '}
            for bulk sampling. Sign/Date:{' '}
            <input
              className="bmr-line-input"
              style={{ width: 90 }}
              value={data.page5?.prod_test_req_sign || ''}
              onChange={(e) => updatePage('page5', 'prod_test_req_sign', e.target.value)}
            />
          </div>
          <div>
            <strong>QA: </strong>Test request sent to QC department on date{' '}
            <BmrDateField
              className="bmr-line-input"
              style={{ width: 85 }}
              value={data.page5?.qa_test_req_date || ''}
              onChange={(e) => updatePage('page5', 'qa_test_req_date', e.target.value)}
            />{' '}
            for bulk analysis. Sign/Date:{' '}
            <input
              className="bmr-line-input"
              style={{ width: 90 }}
              value={data.page5?.qa_test_req_sign || ''}
              onChange={(e) => updatePage('page5', 'qa_test_req_sign', e.target.value)}
            />
          </div>
          <div>
            <strong>QC: </strong>Bulk Release slip sent to QA on date{' '}
            <BmrDateField
              className="bmr-line-input"
              style={{ width: 85 }}
              value={data.page5?.qc_bulk_release_date || ''}
              onChange={(e) => updatePage('page5', 'qc_bulk_release_date', e.target.value)}
            />{' '}
            Sign/Date:{' '}
            <input
              className="bmr-line-input"
              style={{ width: 90 }}
              value={data.page5?.qc_bulk_release_sign || ''}
              onChange={(e) => updatePage('page5', 'qc_bulk_release_sign', e.target.value)}
            />
          </div>
          <div>
            <strong>QA: </strong>Bulk Release slip sent to Production on date{' '}
            <BmrDateField
              className="bmr-line-input"
              style={{ width: 85 }}
              value={data.page5?.qa_bulk_release_date || ''}
              onChange={(e) => updatePage('page5', 'qa_bulk_release_date', e.target.value)}
            />{' '}
            for filling. Sign/Date:{' '}
            <input
              className="bmr-line-input"
              style={{ width: 90 }}
              value={data.page5?.qa_bulk_release_sign || ''}
              onChange={(e) => updatePage('page5', 'qa_bulk_release_sign', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title">
          LIQUID FILLING AREA LINE CLEARANCE :
        </div>
        <div style={{ display: 'flex', gap: 24, margin: '0.5pt 0 1pt', fontSize: '7.5pt' }}>
          <div>
            <strong>Previous Product : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 160, height: '11pt' }}
              value={data.page5?.filling_previous_product || ''}
              onChange={(e) => updatePage('page5', 'filling_previous_product', e.target.value)}
            />
          </div>
          <div>
            <strong>Batch No. </strong>
            <input
              className="bmr-line-input"
              style={{ width: 120, height: '11pt' }}
              value={data.page5?.filling_previous_batch_no || ''}
              onChange={(e) => updatePage('page5', 'filling_previous_batch_no', e.target.value)}
            />
          </div>
        </div>

        <table className="bmr-table">
          <colgroup>
            <col style={{ width: 45 }} />
            <col />
            <col style={{ width: 85 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Sr. No.</th>
              <th style={{ textAlign: 'center' }}>Activity</th>
              <th style={{ textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              { id: 'item1', sr: '1', text: 'Area is Cleaned.' },
              { id: 'item2', sr: '2', text: 'Area is properly labeled.' },
              { id: 'item3', sr: '3', text: 'Left Over of previous product removed from area.' },
              { id: 'item4', sr: '4', text: 'BMR is properly filled and duly signed till this stage.' },
            ].map((row) => (
              <tr key={row.id}>
                <td style={{ textAlign: 'center' }}>{row.sr}</td>
                <td>{row.text}</td>
                <td style={{ textAlign: 'center' }}>
                  {renderYesNo(data.page5?.filling_checklist?.[row.id], (val) =>
                    setData((p) => ({
                      ...p,
                      page5: {
                        ...(p.page5 || {}),
                        filling_checklist: { ...(p.page5?.filling_checklist || {}), [row.id]: val },
                      },
                    }))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {renderFooter(5)}
    </div>
  )

  // Page 6: Liquid Oral Filling Equipment Clearance
  const renderPage6 = () => (
    <div className="bmr-sheet bmr-syrup-sheet" key="page-6">
      {renderHeader(6)}
      <div className="bmr-body">
        {/* Continuation rows 5 and 6 without header */}
        <table className="bmr-table" style={{ marginTop: 2 }}>
          <colgroup>
            <col style={{ width: 45 }} />
            <col />
            <col style={{ width: 85 }} />
          </colgroup>
          <tbody>
            <tr>
              <td style={{ textAlign: 'center' }}>5</td>
              <td>Cleaning record is filled of liquid filling line.</td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page6?.filling_checklist_cont?.item5, (val) =>
                  setData((p) => ({
                    ...p,
                    page6: {
                      ...(p.page6 || {}),
                      filling_checklist_cont: { ...(p.page6?.filling_checklist_cont || {}), item5: val },
                    },
                  }))
                )}
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: 'center' }}>6</td>
              <td>
                <div>Temperature, % RH &amp; Differential pressure is within limit Limits:</div>
                <div style={{ paddingLeft: 6, fontSize: '7.5pt', color: '#1e293b', marginTop: 1 }}>
                  Temperature : 27℃ ± 2℃ % RH 55% ± 2%<br />
                  Differential Pressure Limit NLT{' '}
                  <input
                    className="bmr-line-input"
                    style={{ width: 45, textAlign: 'center', height: '13pt' }}
                    value={data.page6?.diff_pressure_limit || ''}
                    onChange={(e) => updatePage('page6', 'diff_pressure_limit', e.target.value)}
                  />{' '}
                  Pascal
                </div>
              </td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page6?.filling_checklist_cont?.item6, (val) =>
                  setData((p) => ({
                    ...p,
                    page6: {
                      ...(p.page6 || {}),
                      filling_checklist_cont: { ...(p.page6?.filling_checklist_cont || {}), item6: val },
                    },
                  }))
                )}
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3pt 0 4pt', fontSize: 11 }}>
          <div>
            <strong>Checked By/Date (Production) : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page6?.checked_by_prod_date || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page6', 'checked_by_prod_date', e.target.value)}
            />
          </div>
          <div>
            <strong>Verified by/Date (QA) : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page6?.verified_by_qa_date || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page6', 'verified_by_qa_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title">
          LIQUID ORAL FILLING:
        </div>
        <div style={{ fontWeight: 'bold', fontSize: 10, margin: '0 0 2pt' }}>
          Equipment clearance
        </div>

        <table className="bmr-table">
          <colgroup>
            <col style={{ width: 40 }} />
            <col style={{ width: 155 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 85 }} />
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
          <tbody>
            {(data.page6?.filling_equipments || []).slice(0, 3).map((eq, idx) => (
              <tr key={idx}>
                <td style={{ textAlign: 'center' }}>{eq.sr}</td>
                <td>{eq.name}</td>
                <td className={!eq.id ? 'bmr-syrup-grey-cell' : ''}>
                  {eq.id}
                </td>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={eq.date_cleaned || ''}
                    onChange={(e) => {
                      const updated = [...(data.page6?.filling_equipments || [])]
                      updated[idx].date_cleaned = e.target.value
                      updatePage('page6', 'filling_equipments', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={eq.prev_batch || ''}
                    onChange={(e) => {
                      const updated = [...(data.page6?.filling_equipments || [])]
                      updated[idx].prev_batch = e.target.value
                      updatePage('page6', 'filling_equipments', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {renderFooter(6)}
    </div>
  )

  // Page 7: Volume Setting & Filling Volume Checks
  const renderPage7 = () => (
    <div className="bmr-sheet bmr-syrup-sheet" key="page-7">
      {renderHeader(7)}
      <div className="bmr-body">
        {/* Continuation of equipment clearance table without header as in PDF */}
        <table className="bmr-table" style={{ marginTop: 2 }}>
          <colgroup>
            <col style={{ width: 40 }} />
            <col style={{ width: 155 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 85 }} />
            <col />
          </colgroup>
          <tbody>
            {(data.page6?.filling_equipments || []).slice(3, 6).map((eq, idx) => {
              const actualIdx = idx + 3
              return (
                <tr key={actualIdx}>
                  <td style={{ textAlign: 'center' }}>{eq.sr}</td>
                  <td>{eq.name}</td>
                  <td>{eq.id}</td>
                  <td>
                    <BmrDateField
                      className="bmr-cell-input"
                      value={eq.date_cleaned || ''}
                      onChange={(e) => {
                        const updated = [...(data.page6?.filling_equipments || [])]
                        updated[actualIdx].date_cleaned = e.target.value
                        updatePage('page6', 'filling_equipments', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={eq.prev_batch || ''}
                      onChange={(e) => {
                        const updated = [...(data.page6?.filling_equipments || [])]
                        updated[actualIdx].prev_batch = e.target.value
                        updatePage('page6', 'filling_equipments', updated)
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3pt 0 4pt', fontSize: 11 }}>
          <div>
            <strong>Checked by/Date (Production) : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page6?.prod_checked_by_date || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page6', 'prod_checked_by_date', e.target.value)}
            />
          </div>
          <div>
            <strong>Verified by/Date (QA) : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page6?.qa_verified_by_date || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page6', 'qa_verified_by_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title">
          BOTTLE CLEANING BY AIR:
        </div>
        <div style={{ fontSize: 10.5, marginBottom: 4 }}>
          Clean the bottle as per the procedure given in SOP and maintain cleanliness.
        </div>

        <div className="bmr-section-title">
          VOLUME SETTING:
        </div>
        <div style={{ fontSize: 10.5, marginBottom: 4 }}>
          Set the required volume in each pump by adjusting in online display monitor.
        </div>

        <table className="bmr-table">
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 45 }} />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time ( Hrs)</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Done by (Production)</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Checked by<br />(Production)</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Checked by<br />(QA)</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center', fontSize: 9 }}>From</th>
              <th style={{ textAlign: 'center', fontSize: 9 }}>To</th>
            </tr>
          </thead>
          <tbody>
            {(data.page7?.volume_settings || []).map((row, idx) => (
              <tr key={idx}>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page7?.volume_settings || [])]
                      updated[idx].date = e.target.value
                      updatePage('page7', 'volume_settings', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.from_time || ''}
                    placeholder="HH:mm"
                    onChange={(e) => {
                      const updated = [...(data.page7?.volume_settings || [])]
                      updated[idx].from_time = e.target.value
                      updatePage('page7', 'volume_settings', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.to_time || ''}
                    placeholder="HH:mm"
                    onChange={(e) => {
                      const updated = [...(data.page7?.volume_settings || [])]
                      updated[idx].to_time = e.target.value
                      updatePage('page7', 'volume_settings', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page7?.volume_settings || [])]
                      updated[idx].done_by = e.target.value
                      updatePage('page7', 'volume_settings', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_prod || ''}
                    onChange={(e) => {
                      const updated = [...(data.page7?.volume_settings || [])]
                      updated[idx].checked_by_prod = e.target.value
                      updatePage('page7', 'volume_settings', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page7?.volume_settings || [])]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page7', 'volume_settings', updated)
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

  // Page 8: Uniformity Check, Plugging, Capping & Sealing
  const renderPage8 = () => (
    <div className="bmr-sheet bmr-syrup-sheet" key="page-8">
      {renderHeader(8)}
      <div className="bmr-body bmr-p8-body">
        <div className="bmr-section-title">
          FILLING RECORD AND UNIFORMITY OF VOLUME CHECK:
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginBottom: 2 }}>
          <span>Frequency 30 minutes.</span>
          <div>
            <strong>Date of Filling: </strong>
            <BmrDateField
              className="bmr-line-input"
              style={{ width: 100, height: '13pt' }}
              value={data.page7?.date_of_filling || ''}
              onChange={(e) => updatePage('page7', 'date_of_filling', e.target.value)}
            />
          </div>
        </div>

        <table className="bmr-table">
          <colgroup>
            <col style={{ width: 45 }} />
            <col style={{ width: 75 }} />
            <col style={{ width: 95 }} />
            <col style={{ width: 95 }} />
            <col style={{ width: 95 }} />
            <col style={{ width: 95 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Sr. No.</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Time<br />(Hrs)</th>
              <th colSpan={4} style={{ textAlign: 'center' }}>Filled volume (ml)</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center', fontSize: 9 }}>Pump-1</th>
              <th style={{ textAlign: 'center', fontSize: 9 }}>Pump-2</th>
              <th style={{ textAlign: 'center', fontSize: 9 }}>Pump-3</th>
              <th style={{ textAlign: 'center', fontSize: 9 }}>Pump-4</th>
            </tr>
          </thead>
          <tbody>
            {[
              ...(data.page7?.filling_records_p7 || []),
              ...(data.page8?.filling_records_p8 || []),
            ].slice(0, 8).map((row, idx) => (
              <tr key={idx}>
                <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.time || ''}
                    placeholder="HH:mm"
                    onChange={(e) => {
                      if (idx < 4) {
                        const updated = [...(data.page7?.filling_records_p7 || [])]
                        updated[idx].time = e.target.value
                        updatePage('page7', 'filling_records_p7', updated)
                      } else {
                        const updated = [...(data.page8?.filling_records_p8 || [])]
                        updated[idx - 4].time = e.target.value
                        updatePage('page8', 'filling_records_p8', updated)
                      }
                    }}
                  />
                </td>
                {['p1', 'p2', 'p3', 'p4'].map((pKey) => (
                  <td key={pKey}>
                    <input
                      className="bmr-cell-input"
                      style={{ textAlign: 'center' }}
                      value={row[pKey] || ''}
                      onChange={(e) => {
                        if (idx < 4) {
                          const updated = [...(data.page7?.filling_records_p7 || [])]
                          updated[idx][pKey] = e.target.value
                          updatePage('page7', 'filling_records_p7', updated)
                        } else {
                          const updated = [...(data.page8?.filling_records_p8 || [])]
                          updated[idx - 4][pKey] = e.target.value
                          updatePage('page8', 'filling_records_p8', updated)
                        }
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '2pt 0 4pt', fontSize: 10 }}>
          <div>
            <strong>Filled by: </strong>
            <input
              className="bmr-line-input"
              style={{ width: 100 }}
              value={data.page8?.filled_by || ''}
              placeholder="Sign"
              onChange={(e) => updatePage('page8', 'filled_by', e.target.value)}
            />
          </div>
          <div>
            <strong>Checked by/Date (production): </strong>
            <input
              className="bmr-line-input"
              style={{ width: 110 }}
              value={data.page8?.checked_by_prod || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page8', 'checked_by_prod', e.target.value)}
            />
          </div>
          <div>
            <strong>Checked by/Date (QA): </strong>
            <input
              className="bmr-line-input"
              style={{ width: 110 }}
              value={data.page8?.checked_by_qa || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page8', 'checked_by_qa', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title">
          INNER PLUGGING:
        </div>
        <div style={{ fontSize: 10, marginBottom: 3 }}>
          Load required quantity of cleaned inner plug. Remove defective inner plug online before plugging and keep it aside.
        </div>

        <div className="bmr-section-title">
          CAPPING:
        </div>
        <div style={{ fontSize: 10, marginBottom: 3 }}>
          Load required quantity of cleaned dual seal cap. Remove defective inner plug online before capping and keep it aside.
        </div>

        <div className="bmr-section-title">
          SEALING:
        </div>
        <div style={{ fontSize: 10, marginBottom: 2 }}>
          Sealing is done online by machine after capping activity and check for the leak/seal test
        </div>
      </div>
      {renderFooter(8)}
    </div>
  )

  // Page 9: Visual Inspection, Measuring Cup & Dispensing
  const renderPage9 = () => (
    <div className="bmr-sheet bmr-syrup-sheet" key="page-9">
      {renderHeader(9)}
      <div className="bmr-body bmr-syrup-p9">
        <div className="bmr-section-title" style={{ margin: '1pt 0' }}>
          VISUAL INSPECTION ( FOR DROPS / FOR SYRUP):
        </div>
        <div className="bmr-p9-text" style={{ fontSize: '7.5pt', lineHeight: '1.15', marginBottom: 1 }}>
          <strong>For Drops: </strong>Check the bottle for any particulate matter and foreign matter against white and black background on inspection table.<br />
          <strong>For Syrup: </strong>Check the bottle for cleanliness and batch details on the product label.
        </div>

        <table className="bmr-table" style={{ marginBottom: 3 }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 45 }} />
            <col />
            <col />
            <col />
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
              <th style={{ textAlign: 'center', fontSize: 9 }}>From</th>
              <th style={{ textAlign: 'center', fontSize: 9 }}>To</th>
            </tr>
          </thead>
          <tbody>
            {(data.page9?.visual_inspection || []).map((row, idx) => (
              <tr key={idx}>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page9?.visual_inspection || [])]
                      updated[idx].date = e.target.value
                      updatePage('page9', 'visual_inspection', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.from_time || ''}
                    placeholder="HH:mm"
                    onChange={(e) => {
                      const updated = [...(data.page9?.visual_inspection || [])]
                      updated[idx].from_time = e.target.value
                      updatePage('page9', 'visual_inspection', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.to_time || ''}
                    placeholder="HH:mm"
                    onChange={(e) => {
                      const updated = [...(data.page9?.visual_inspection || [])]
                      updated[idx].to_time = e.target.value
                      updatePage('page9', 'visual_inspection', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page9?.visual_inspection || [])]
                      updated[idx].done_by = e.target.value
                      updatePage('page9', 'visual_inspection', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_prod || ''}
                    onChange={(e) => {
                      const updated = [...(data.page9?.visual_inspection || [])]
                      updated[idx].checked_by_prod = e.target.value
                      updatePage('page9', 'visual_inspection', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page9?.visual_inspection || [])]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page9', 'visual_inspection', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-section-title" style={{ margin: '1pt 0' }}>
          MEASURING CUP:
        </div>
        <div className="bmr-p9-text" style={{ fontSize: '7.5pt', marginBottom: 1 }}>
          Place the clean measuring cup on dual seal cap.
        </div>
        <div className="bmr-syrup-radio-group" style={{ marginBottom: 3 }}>
          <label className="bmr-syrup-radio-label">
            <input
              type="radio"
              name="measuring_cup_syrup"
              checked={data.page9?.measuring_cup_applicable === 'Applicable'}
              onChange={() => updatePage('page9', 'measuring_cup_applicable', 'Applicable')}
            />
            <span>Applicable</span>
          </label>
          <span className="bmr-syrup-radio-sep">/</span>
          <label className="bmr-syrup-radio-label">
            <input
              type="radio"
              name="measuring_cup_syrup"
              checked={data.page9?.measuring_cup_applicable === 'Not Applicable.'}
              onChange={() => updatePage('page9', 'measuring_cup_applicable', 'Not Applicable.')}
            />
            <span>Not Applicable.</span>
          </label>
        </div>

        <table className="bmr-table" style={{ marginBottom: 3 }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 45 }} />
            <col />
            <col />
            <col />
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
              <th style={{ textAlign: 'center', fontSize: 9 }}>From</th>
              <th style={{ textAlign: 'center', fontSize: 9 }}>To</th>
            </tr>
          </thead>
          <tbody>
            {(data.page9?.measuring_cup_records || []).map((row, idx) => (
              <tr key={idx}>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page9?.measuring_cup_records || [])]
                      updated[idx].date = e.target.value
                      updatePage('page9', 'measuring_cup_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.from_time || ''}
                    placeholder="HH:mm"
                    onChange={(e) => {
                      const updated = [...(data.page9?.measuring_cup_records || [])]
                      updated[idx].from_time = e.target.value
                      updatePage('page9', 'measuring_cup_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.to_time || ''}
                    placeholder="HH:mm"
                    onChange={(e) => {
                      const updated = [...(data.page9?.measuring_cup_records || [])]
                      updated[idx].to_time = e.target.value
                      updatePage('page9', 'measuring_cup_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page9?.measuring_cup_records || [])]
                      updated[idx].done_by = e.target.value
                      updatePage('page9', 'measuring_cup_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_prod || ''}
                    onChange={(e) => {
                      const updated = [...(data.page9?.measuring_cup_records || [])]
                      updated[idx].checked_by_prod = e.target.value
                      updatePage('page9', 'measuring_cup_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page9?.measuring_cup_records || [])]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page9', 'measuring_cup_records', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-p9-text" style={{ margin: '1pt 0', fontSize: '7.5pt' }}>
          <strong>Total Nos. of Inspected Bottles: </strong>
          <input
            className="bmr-line-input"
            style={{ width: 110, height: '11pt' }}
            value={data.page9?.total_inspected_bottles || ''}
            onChange={(e) => updatePage('page9', 'total_inspected_bottles', e.target.value)}
          />{' '}
          Nos.
        </div>

        <div className="bmr-p9-text" style={{ display: 'flex', justifyContent: 'space-between', margin: '0.5pt 0 1.5pt', fontSize: '7.5pt' }}>
          <div>
            <strong>Checked by/Date (Production) : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 120, height: '11pt' }}
              value={data.page9?.checked_by_date || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page9', 'checked_by_date', e.target.value)}
            />
          </div>
          <div>
            <strong>Verified by/ Date (QA) : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 120, height: '11pt' }}
              value={data.page9?.verified_by_date || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page9', 'verified_by_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title" style={{ margin: '1pt 0' }}>
          PACKING MATERIAL DISPENSING AREA LINE CLEARANCE:
        </div>
        <div className="bmr-p9-text" style={{ display: 'flex', gap: 24, margin: '0.5pt 0 1pt', fontSize: '7.5pt' }}>
          <div>
            <strong>Previous Product: </strong>
            <input
              className="bmr-line-input"
              style={{ width: 150, height: '11pt' }}
              value={data.page9?.pm_previous_product || ''}
              onChange={(e) => updatePage('page9', 'pm_previous_product', e.target.value)}
            />
          </div>
          <div>
            <strong>Batch No. </strong>
            <input
              className="bmr-line-input"
              style={{ width: 110, height: '11pt' }}
              value={data.page9?.pm_previous_batch_no || ''}
              onChange={(e) => updatePage('page9', 'pm_previous_batch_no', e.target.value)}
            />
          </div>
        </div>

        <table className="bmr-table">
          <colgroup>
            <col style={{ width: 45 }} />
            <col />
            <col style={{ width: 85 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Sr. No.</th>
              <th style={{ textAlign: 'center' }}>Activity</th>
              <th style={{ textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              { id: 'item1', sr: '1', text: 'Previous product / batch materials are removed' },
              { id: 'item2', sr: '2', text: 'Previous product / batch labels are removed' },
            ].map((row) => (
              <tr key={row.id}>
                <td style={{ textAlign: 'center' }}>{row.sr}</td>
                <td>{row.text}</td>
                <td style={{ textAlign: 'center' }}>
                  {renderYesNo(data.page9?.pm_dispensing_clearance?.[row.id], (val) =>
                    setData((p) => ({
                      ...p,
                      page9: {
                        ...(p.page9 || {}),
                        pm_dispensing_clearance: { ...(p.page9?.pm_dispensing_clearance || {}), [row.id]: val },
                      },
                    }))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {renderFooter(9)}
    </div>
  )

  // Page 10: Packing Dispensing Clearance & Environmental
  const renderPage10 = () => (
    <div className="bmr-sheet bmr-syrup-sheet" key="page-10">
      {renderHeader(10)}
      <div className="bmr-body">
        {/* Continuation rows 3, 4, 5 without table header */}
        <table className="bmr-table" style={{ marginTop: 2 }}>
          <colgroup>
            <col style={{ width: 45 }} />
            <col />
            <col style={{ width: 85 }} />
          </colgroup>
          <tbody>
            {[
              { id: 'item3', sr: '3', text: 'Floor walls, and ceiling are cleaned properly' },
              { id: 'item4', sr: '4', text: 'Balance is cleaned and calibrated' },
              { id: 'item5', sr: '5', text: 'Status labels are affixed' },
            ].map((row) => (
              <tr key={row.id}>
                <td style={{ textAlign: 'center' }}>{row.sr}</td>
                <td>{row.text}</td>
                <td style={{ textAlign: 'center' }}>
                  {renderYesNo(data.page10?.pm_dispensing_clearance_cont?.[row.id], (val) =>
                    setData((p) => ({
                      ...p,
                      page10: {
                        ...(p.page10 || {}),
                        pm_dispensing_clearance_cont: { ...(p.page10?.pm_dispensing_clearance_cont || {}), [row.id]: val },
                      },
                    }))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4pt 0 6pt', fontSize: 11 }}>
          <div>
            <strong>Checked By/Date (Packing) : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page10?.checked_by_date || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page10', 'checked_by_date', e.target.value)}
            />
          </div>
          <div>
            <strong>Verified by/Date ( QA) : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page10?.verified_by_date || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page10', 'verified_by_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title">
          ENVIRONMENTAL CONTROL: ( Packing Area)
        </div>
        <div style={{ fontSize: 10, marginBottom: 2 }}>
          Check and record temperature and relative humidity twice a day.<br />
          Limit: Temperature: 27°C ± 2° C &nbsp;&nbsp;&nbsp;&nbsp; % RH 55% ± 2%
        </div>

        <table className="bmr-table" style={{ marginBottom: 4 }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 65 }} />
            <col style={{ width: 75 }} />
            <col style={{ width: 75 }} />
            <col />
            <col />
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
            {(data.page10?.env_records || []).map((row, idx) => (
              <tr key={idx}>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={data.page10?.env_date || ''}
                    onChange={(e) => updatePage('page10', 'env_date', e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.time || ''}
                    placeholder="HH:mm"
                    onChange={(e) => {
                      const updated = [...(data.page10?.env_records || [])]
                      updated[idx].time = e.target.value
                      updatePage('page10', 'env_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.temp || '27°C'}
                    onChange={(e) => {
                      const updated = [...(data.page10?.env_records || [])]
                      updated[idx].temp = e.target.value
                      updatePage('page10', 'env_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.rh || '55%'}
                    onChange={(e) => {
                      const updated = [...(data.page10?.env_records || [])]
                      updated[idx].rh = e.target.value
                      updatePage('page10', 'env_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_pkg || ''}
                    onChange={(e) => {
                      const updated = [...(data.page10?.env_records || [])]
                      updated[idx].checked_by_pkg = e.target.value
                      updatePage('page10', 'env_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page10?.env_records || [])]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page10', 'env_records', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-section-title">
          EQUIPMENT CLEARANCE FOR CARTON AND LABEL CODING:
        </div>
        <table className="bmr-table">
          <colgroup>
            <col style={{ width: 140 }} />
            <col style={{ width: 95 }} />
            <col style={{ width: 75 }} />
            <col style={{ width: 105 }} />
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
            {(data.page10?.coding_equipments || []).slice(0, 1).map((eq, idx) => (
              <tr key={idx}>
                <td>{eq.equip}</td>
                <td>{eq.id}</td>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={eq.date_cleaned || ''}
                    onChange={(e) => {
                      const updated = [...(data.page10?.coding_equipments || [])]
                      updated[idx].date_cleaned = e.target.value
                      updatePage('page10', 'coding_equipments', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={eq.prev_batch || ''}
                    onChange={(e) => {
                      const updated = [...(data.page10?.coding_equipments || [])]
                      updated[idx].prev_batch = e.target.value
                      updatePage('page10', 'coding_equipments', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={eq.cleaned_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page10?.coding_equipments || [])]
                      updated[idx].cleaned_by = e.target.value
                      updatePage('page10', 'coding_equipments', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {renderFooter(10)}
    </div>
  )

  // Page 11: Packing Details, Stereo & Coding Records
  const renderPage11 = () => (
    <div className="bmr-sheet bmr-syrup-sheet" key="page-11">
      {renderHeader(11)}
      <div className="bmr-body">
        {/* Continuation table without header as in PDF */}
        <table className="bmr-table" style={{ marginTop: 2 }}>
          <colgroup>
            <col style={{ width: 140 }} />
            <col style={{ width: 95 }} />
            <col style={{ width: 75 }} />
            <col style={{ width: 105 }} />
            <col />
          </colgroup>
          <tbody>
            {(data.page10?.coding_equipments || []).slice(1).map((eq, idx) => {
              const actualIdx = idx + 1
              return (
                <tr key={actualIdx}>
                  <td>{eq.equip}</td>
                  <td>{eq.id}</td>
                  <td>
                    <BmrDateField
                      className="bmr-cell-input"
                      value={eq.date_cleaned || ''}
                      onChange={(e) => {
                        const updated = [...(data.page10?.coding_equipments || [])]
                        updated[actualIdx].date_cleaned = e.target.value
                        updatePage('page10', 'coding_equipments', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={eq.prev_batch || ''}
                      onChange={(e) => {
                        const updated = [...(data.page10?.coding_equipments || [])]
                        updated[actualIdx].prev_batch = e.target.value
                        updatePage('page10', 'coding_equipments', updated)
                      }}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={eq.cleaned_by || ''}
                      onChange={(e) => {
                        const updated = [...(data.page10?.coding_equipments || [])]
                        updated[actualIdx].cleaned_by = e.target.value
                        updatePage('page10', 'coding_equipments', updated)
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '3pt 0 4pt', fontSize: 11 }}>
          <div>
            <strong>Checked By/Date (Packing) : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page10?.coding_checked_by_date || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page10', 'coding_checked_by_date', e.target.value)}
            />
          </div>
          <div>
            <strong>Verified By/Date (QA): </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page10?.coding_verified_by_date || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page10', 'coding_verified_by_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title">
          PACKING DETAILS:
        </div>
        <div style={{ margin: '2pt 0 4pt', fontSize: 11 }}>
          <strong>Packing Type: Pet Bottle /Glass Bottle: </strong>
          <input
            className="bmr-line-input"
            style={{ width: 160 }}
            value={data.page11?.packing_type || 'Pet Bottle /Glass Bottle'}
            onChange={(e) => updatePage('page11', 'packing_type', e.target.value)}
          />
        </div>

        <div className="bmr-section-title">
          STEREO DETAILS FOR LABEL AND CARTONS:
        </div>
        <table className="bmr-table" style={{ marginBottom: 4 }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 75 }} />
            <col style={{ width: 75 }} />
            <col style={{ width: 85 }} />
            <col />
            <col />
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
            {(data.page11?.stereo_details || []).slice(0, 2).map((row, idx) => (
              <tr key={idx}>
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
                  <input
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

        <div className="bmr-section-title">
          LABEL &nbsp;/ CARTON CODING:
        </div>
        <div style={{ fontSize: 10.5, marginBottom: 2 }}>
          Send the labels/cartons for coding as per the requirements and record the details in below given format.
        </div>
      </div>
      {renderFooter(11)}
    </div>
  )

  // Page 12: Coding Records, Line Clearance & Pasting
  const renderPage12 = () => (
    <div className="bmr-sheet bmr-syrup-sheet" key="page-12">
      {renderHeader(12)}
      <div className="bmr-body bmr-syrup-p12">
        {/* Table 1: Coding Material Qty table */}
        <table className="bmr-table" style={{ marginTop: 2, marginBottom: 2 }}>
          <colgroup>
            <col style={{ width: 45 }} />
            <col />
            <col style={{ width: 120 }} />
            <col style={{ width: 95 }} />
            <col style={{ width: 110 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Sr. No.</th>
              <th style={{ textAlign: 'center' }}>Packing Material</th>
              <th style={{ textAlign: 'center' }}>Qty. given for coding Nos.</th>
              <th style={{ textAlign: 'center' }}>Qty. Rej. Nos.</th>
              <th style={{ textAlign: 'center' }}>Qty. Rec. for Pkg. Nos.</th>
            </tr>
          </thead>
          <tbody>
            {(data.page11?.coding_records || []).slice(0, 2).map((row, idx) => (
              <tr key={idx}>
                <td style={{ textAlign: 'center' }}>{row.sr || idx + 1}</td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.material || (idx === 0 ? 'Label' : 'Carton')}
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
                    style={{ textAlign: 'center' }}
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
                    style={{ textAlign: 'center' }}
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
                    style={{ textAlign: 'center' }}
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

        {/* Table 2: Coding Time Records */}
        <table className="bmr-table" style={{ marginBottom: 2 }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 45 }} />
            <col />
            <col />
            <col />
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
              <th style={{ textAlign: 'center', fontSize: 9 }}>From</th>
              <th style={{ textAlign: 'center', fontSize: 9 }}>To</th>
            </tr>
          </thead>
          <tbody>
            {(data.page12?.coding_time_records || []).slice(0, 2).map((row, idx) => (
              <tr key={idx}>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page12?.coding_time_records || [])]
                      updated[idx].date = e.target.value
                      updatePage('page12', 'coding_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.from_time || ''}
                    placeholder="HH:mm"
                    onChange={(e) => {
                      const updated = [...(data.page12?.coding_time_records || [])]
                      updated[idx].from_time = e.target.value
                      updatePage('page12', 'coding_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.to_time || ''}
                    placeholder="HH:mm"
                    onChange={(e) => {
                      const updated = [...(data.page12?.coding_time_records || [])]
                      updated[idx].to_time = e.target.value
                      updatePage('page12', 'coding_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page12?.coding_time_records || [])]
                      updated[idx].done_by = e.target.value
                      updatePage('page12', 'coding_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_pkg || ''}
                    onChange={(e) => {
                      const updated = [...(data.page12?.coding_time_records || [])]
                      updated[idx].checked_by_pkg = e.target.value
                      updatePage('page12', 'coding_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page12?.coding_time_records || [])]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page12', 'coding_time_records', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-section-title">
          PACKING AREA LINE CLEARANCE:
        </div>
        <div className="bmr-p12-row" style={{ display: 'flex', gap: 24, margin: '0.5pt 0' }}>
          <div>
            <strong>Previous Product: </strong>
            <input
              className="bmr-line-input"
              style={{ width: 150, height: '11pt' }}
              value={data.page12?.pkg_previous_product || ''}
              onChange={(e) => updatePage('page12', 'pkg_previous_product', e.target.value)}
            />
          </div>
          <div>
            <strong>Batch No. </strong>
            <input
              className="bmr-line-input"
              style={{ width: 110, height: '11pt' }}
              value={data.page12?.pkg_previous_batch_no || ''}
              onChange={(e) => updatePage('page12', 'pkg_previous_batch_no', e.target.value)}
            />
          </div>
        </div>

        <table className="bmr-table" style={{ marginBottom: 2 }}>
          <colgroup>
            <col style={{ width: 35 }} />
            <col />
            <col style={{ width: 75 }} />
            <col style={{ width: 120 }} />
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
            {[
              { id: 'item1', sr: '1', text: 'Previous product / batch materials are removed' },
              { id: 'item2', sr: '2', text: 'Previous product/ batch labels are removed' },
              { id: 'item3', sr: '3', text: 'Floor, walls, and ceiling are cleaned' },
              { id: 'item4', sr: '4', text: 'Status labels are affixed' },
            ].map((row) => (
              <tr key={row.id}>
                <td style={{ textAlign: 'center' }}>{row.sr}</td>
                <td>{row.text}</td>
                <td style={{ textAlign: 'center' }}>
                  {renderYesNo(data.page12?.packing_area_clearance?.[row.id]?.status, (val) =>
                    setData((p) => ({
                      ...p,
                      page12: {
                        ...(p.page12 || {}),
                        packing_area_clearance: {
                          ...(p.page12?.packing_area_clearance || {}),
                          [row.id]: {
                            ...(p.page12?.packing_area_clearance?.[row.id] || {}),
                            status: val,
                          },
                        },
                      },
                    }))
                  )}
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={data.page12?.packing_area_clearance?.[row.id]?.sign_date || ''}
                    placeholder="Sign / Date"
                    onChange={(e) => {
                      const v = e.target.value
                      setData((p) => ({
                        ...p,
                        page12: {
                          ...(p.page12 || {}),
                          packing_area_clearance: {
                            ...(p.page12?.packing_area_clearance || {}),
                            [row.id]: {
                              ...(p.page12?.packing_area_clearance?.[row.id] || {}),
                              sign_date: v,
                            },
                          },
                        },
                      }))
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-p12-row" style={{ margin: '0.5pt 0' }}>
          <strong>Verified by/Date (QA) </strong>
          <input
            className="bmr-line-input"
            style={{ width: 150, height: '11pt' }}
            value={data.page12?.pkg_verified_by_date || ''}
            placeholder="Sign / Date"
            onChange={(e) => updatePage('page12', 'pkg_verified_by_date', e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '2pt 0 1pt' }}>
          <div className="bmr-section-title" style={{ margin: 0 }}>
            STICKER LABEL PASTING:
          </div>
          <div className="bmr-syrup-radio-group">
            <label className="bmr-syrup-radio-label">
              <input
                type="radio"
                name="sticker_label_syrup"
                checked={data.page12?.sticker_label_applicable === 'Applicable'}
                onChange={() => updatePage('page12', 'sticker_label_applicable', 'Applicable')}
              />
              <span>Applicable</span>
            </label>
            <span className="bmr-syrup-radio-sep">/</span>
            <label className="bmr-syrup-radio-label">
              <input
                type="radio"
                name="sticker_label_syrup"
                checked={data.page12?.sticker_label_applicable === 'Not Applicable'}
                onChange={() => updatePage('page12', 'sticker_label_applicable', 'Not Applicable')}
              />
              <span>Not Applicable</span>
            </label>
          </div>
        </div>

        <div className="bmr-p12-row" style={{ fontSize: '7.5pt', marginBottom: 1, color: '#000' }}>
          Clean the bottle if required. Affix the sticker label on bottle manually with proper alignment.
        </div>

        <table className="bmr-table">
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 45 }} />
            <col />
            <col />
            <col />
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
              <th style={{ textAlign: 'center', fontSize: 9 }}>From</th>
              <th style={{ textAlign: 'center', fontSize: 9 }}>To</th>
            </tr>
          </thead>
          <tbody>
            {(data.page12?.pasting_time_records || []).map((row, idx) => (
              <tr key={idx}>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page12?.pasting_time_records || [])]
                      updated[idx].date = e.target.value
                      updatePage('page12', 'pasting_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.from_time || ''}
                    placeholder="HH:mm"
                    onChange={(e) => {
                      const updated = [...(data.page12?.pasting_time_records || [])]
                      updated[idx].from_time = e.target.value
                      updatePage('page12', 'pasting_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.to_time || ''}
                    placeholder="HH:mm"
                    onChange={(e) => {
                      const updated = [...(data.page12?.pasting_time_records || [])]
                      updated[idx].to_time = e.target.value
                      updatePage('page12', 'pasting_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page12?.pasting_time_records || [])]
                      updated[idx].done_by = e.target.value
                      updatePage('page12', 'pasting_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_pkg || ''}
                    onChange={(e) => {
                      const updated = [...(data.page12?.pasting_time_records || [])]
                      updated[idx].checked_by_pkg = e.target.value
                      updatePage('page12', 'pasting_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page12?.pasting_time_records || [])]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page12', 'pasting_time_records', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {renderFooter(12)}
    </div>
  )

  // Page 13: Cartoning, Outer Packing & Bonded Slip
  const renderPage13 = () => (
    <div className="bmr-sheet bmr-syrup-sheet" key="page-13">
      {renderHeader(13)}
      <div className="bmr-body">
        <div className="bmr-section-title">
          CARTONING:
        </div>
        <div style={{ fontSize: 9.5, lineHeight: '1.25', marginBottom: 2, color: '#1e293b' }}>
          Keep the bottle in individual duplex carton.<br />
          Ensure that the bottles are not wet.<br />
          Affix a cello tape on the carton if required
        </div>

        <table className="bmr-table" style={{ marginBottom: 3 }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 45 }} />
            <col />
            <col />
            <col />
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
              <th style={{ textAlign: 'center', fontSize: 9 }}>From</th>
              <th style={{ textAlign: 'center', fontSize: 9 }}>To</th>
            </tr>
          </thead>
          <tbody>
            {(data.page13?.cartoning_time_records || []).slice(0, 3).map((row, idx) => (
              <tr key={idx}>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.cartoning_time_records || [])]
                      updated[idx].date = e.target.value
                      updatePage('page13', 'cartoning_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.from_time || ''}
                    placeholder="HH:mm"
                    onChange={(e) => {
                      const updated = [...(data.page13?.cartoning_time_records || [])]
                      updated[idx].from_time = e.target.value
                      updatePage('page13', 'cartoning_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.to_time || ''}
                    placeholder="HH:mm"
                    onChange={(e) => {
                      const updated = [...(data.page13?.cartoning_time_records || [])]
                      updated[idx].to_time = e.target.value
                      updatePage('page13', 'cartoning_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.cartoning_time_records || [])]
                      updated[idx].done_by = e.target.value
                      updatePage('page13', 'cartoning_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_pkg || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.cartoning_time_records || [])]
                      updated[idx].checked_by_pkg = e.target.value
                      updatePage('page13', 'cartoning_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.cartoning_time_records || [])]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page13', 'cartoning_time_records', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-section-title">
          OUTER PACKING:
        </div>
        <div style={{ fontSize: 9.5, lineHeight: '1.25', marginBottom: 2, color: '#1e293b' }}>
          Keep bottles / packed carton in inner outer corrugated box as per specified box size and close the box using BOPP gum tape. Affix a shipper label on it. Strap the outer corrugated box.Keep it on a palate.
        </div>

        <table className="bmr-table" style={{ marginBottom: 3 }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 45 }} />
            <col style={{ width: 45 }} />
            <col />
            <col />
            <col />
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
              <th style={{ textAlign: 'center', fontSize: 9 }}>From</th>
              <th style={{ textAlign: 'center', fontSize: 9 }}>To</th>
            </tr>
          </thead>
          <tbody>
            {(data.page13?.outer_packing_records || []).slice(0, 3).map((row, idx) => (
              <tr key={idx}>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.outer_packing_records || [])]
                      updated[idx].date = e.target.value
                      updatePage('page13', 'outer_packing_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.from_time || ''}
                    placeholder="HH:mm"
                    onChange={(e) => {
                      const updated = [...(data.page13?.outer_packing_records || [])]
                      updated[idx].from_time = e.target.value
                      updatePage('page13', 'outer_packing_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.to_time || ''}
                    placeholder="HH:mm"
                    onChange={(e) => {
                      const updated = [...(data.page13?.outer_packing_records || [])]
                      updated[idx].to_time = e.target.value
                      updatePage('page13', 'outer_packing_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.outer_packing_records || [])]
                      updated[idx].done_by = e.target.value
                      updatePage('page13', 'outer_packing_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_pkg || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.outer_packing_records || [])]
                      updated[idx].checked_by_pkg = e.target.value
                      updatePage('page13', 'outer_packing_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa || ''}
                    onChange={(e) => {
                      const updated = [...(data.page13?.outer_packing_records || [])]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page13', 'outer_packing_records', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ fontSize: 10, lineHeight: '1.4' }}>
          <div>Prepare bonded slip and transfer the batch to FP store</div>
          <div style={{ marginTop: 2 }}>
            <strong>Finish </strong>
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page13?.finish_bottles || ''}
              onChange={(e) => updatePage('page13', 'finish_bottles', e.target.value)}
            />{' '}
            Bottles ={' '}
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page13?.finish_litres || ''}
              onChange={(e) => updatePage('page13', 'finish_litres', e.target.value)}
            />{' '}
            Litres
          </div>
          <div style={{ marginTop: 2 }}>
            <strong>Retain </strong>
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page13?.retain_bottles || ''}
              onChange={(e) => updatePage('page13', 'retain_bottles', e.target.value)}
            />{' '}
            Bottles ={' '}
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page13?.retain_litres || ''}
              onChange={(e) => updatePage('page13', 'retain_litres', e.target.value)}
            />{' '}
            Litres
          </div>
        </div>
      </div>
      {renderFooter(13)}
    </div>
  )

  // Page 14: Packed Quantity, Reconciliation & QA Inspection
  const renderPage14 = () => (
    <div className="bmr-sheet bmr-syrup-sheet" key="page-14">
      {renderHeader(14)}
      <div className="bmr-body">
        <div style={{ fontSize: 10, lineHeight: '1.35', marginBottom: 4, marginTop: 2 }}>
          <div>
            <strong>Retain </strong>
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page13?.retain_bottles || data.page14?.retain_bottles || ''}
              onChange={(e) => {
                updatePage('page13', 'retain_bottles', e.target.value)
                updatePage('page14', 'retain_bottles', e.target.value)
              }}
            />{' '}
            Bottles ={' '}
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page13?.retain_litres || data.page14?.retain_litres || ''}
              onChange={(e) => {
                updatePage('page13', 'retain_litres', e.target.value)
                updatePage('page14', 'retain_litres', e.target.value)
              }}
            />{' '}
            Litres
          </div>
          <div style={{ marginTop: 1 }}>
            <strong>Analysis </strong>
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page14?.analysis_bottles || ''}
              onChange={(e) => updatePage('page14', 'analysis_bottles', e.target.value)}
            />{' '}
            Bottles ={' '}
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page14?.analysis_litres || ''}
              onChange={(e) => updatePage('page14', 'analysis_litres', e.target.value)}
            />{' '}
            Litres
          </div>
          <div style={{ marginTop: 1 }}>
            <strong>Total quantity packed </strong>
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page14?.total_packed_bottles || ''}
              onChange={(e) => updatePage('page14', 'total_packed_bottles', e.target.value)}
            />{' '}
            Bottles{' '}
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page14?.total_packed_litres || ''}
              onChange={(e) => updatePage('page14', 'total_packed_litres', e.target.value)}
            />{' '}
            Litres
          </div>
        </div>

        <div className="bmr-section-title">
          PACKING MATERIAL RECONCILIATION:
        </div>
        <div style={{ fontSize: 9.5, marginBottom: 4, color: '#1e293b' }}>
          After completion of the packing operation, check and record the details of the PM in below given table.
        </div>

        <table className="bmr-table">
          <colgroup>
            <col style={{ width: 28 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 52 }} />
            <col style={{ width: 48 }} />
            <col style={{ width: 44 }} />
            <col style={{ width: 44 }} />
            <col style={{ width: 44 }} />
            <col style={{ width: 44 }} />
            <col style={{ width: 44 }} />
            <col style={{ width: 50 }} />
            <col style={{ width: 52 }} />
            <col style={{ width: 52 }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'center', fontSize: 8 }}>Sr.<br />No.</th>
              <th rowSpan={2} style={{ textAlign: 'center', fontSize: 8 }}>Packing<br />Material</th>
              <th rowSpan={2} style={{ textAlign: 'center', fontSize: 8 }}>AR<br />No.</th>
              <th rowSpan={2} style={{ textAlign: 'center', fontSize: 8 }}>Qty.<br />Issued<br />Nos.</th>
              <th colSpan={4} style={{ textAlign: 'center', fontSize: 8 }}>Quantity Rejected</th>
              <th rowSpan={2} style={{ textAlign: 'center', fontSize: 8 }}>Qty.<br />Used<br />No.</th>
              <th rowSpan={2} style={{ textAlign: 'center', fontSize: 8 }}>Qty.<br />Returned<br />Nos.</th>
              <th rowSpan={2} style={{ textAlign: 'center', fontSize: 8 }}>Checked<br />By (Pkg)</th>
              <th rowSpan={2} style={{ textAlign: 'center', fontSize: 8 }}>Checked<br />By<br />(QA)</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center', fontSize: 7.5 }}>Coding<br />Rej.</th>
              <th style={{ textAlign: 'center', fontSize: 7.5 }}>Online</th>
              <th style={{ textAlign: 'center', fontSize: 7.5 }}>Excess</th>
              <th style={{ textAlign: 'center', fontSize: 7.5 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {(data.page14?.pm_reconciliation || []).slice(0, 3).map((row, idx) => (
              <tr key={idx}>
                <td style={{ textAlign: 'center' }}>{row.sr || idx + 1}</td>
                <td>{row.material}</td>
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
                    style={{ textAlign: 'center' }}
                    value={row.issued || ''}
                    onChange={(e) => {
                      const updated = [...(data.page14?.pm_reconciliation || [])]
                      updated[idx].issued = e.target.value
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
                      updated[idx].coding_rej = e.target.value
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
                      updated[idx].online_rej = e.target.value
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
                      updated[idx].excess = e.target.value
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
                      updated[idx].total_rej = e.target.value
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
                      updated[idx].used = e.target.value
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
                      updated[idx].returned = e.target.value
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
                      updated[idx].checked_pkg = e.target.value
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
                      updated[idx].checked_qa = e.target.value
                      updatePage('page14', 'pm_reconciliation', updated)
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

  // Page 15: QA Inspection & Yield Accountability
  const renderPage15 = () => (
    <div className="bmr-sheet bmr-syrup-sheet" key="page-15">
      {renderHeader(15)}
      <div className="bmr-body">
        {/* Continuation row 4 of PM Reconciliation table without header */}
        <table className="bmr-table" style={{ marginTop: 2, marginBottom: 4 }}>
          <colgroup>
            <col style={{ width: 28 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 52 }} />
            <col style={{ width: 48 }} />
            <col style={{ width: 44 }} />
            <col style={{ width: 44 }} />
            <col style={{ width: 44 }} />
            <col style={{ width: 44 }} />
            <col style={{ width: 44 }} />
            <col style={{ width: 50 }} />
            <col style={{ width: 52 }} />
            <col style={{ width: 52 }} />
          </colgroup>
          <tbody>
            {[(data.page14?.pm_reconciliation?.[3] || { sr: '4', material: 'Measuring Cap' })].map((row, idx) => (
              <tr key={idx}>
                <td style={{ textAlign: 'center' }}>{row.sr || '4'}</td>
                <td>{row.material || 'Measuring Cap'}</td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.ar_no || ''}
                    onChange={(e) => {
                      const updated = [...(data.page14?.pm_reconciliation || [])]
                      if (updated[3]) updated[3].ar_no = e.target.value
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
                      if (updated[3]) updated[3].issued = e.target.value
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
                      if (updated[3]) updated[3].coding_rej = e.target.value
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
                      if (updated[3]) updated[3].online_rej = e.target.value
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
                      if (updated[3]) updated[3].excess = e.target.value
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
                      if (updated[3]) updated[3].total_rej = e.target.value
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
                      if (updated[3]) updated[3].used = e.target.value
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
                      if (updated[3]) updated[3].returned = e.target.value
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
                      if (updated[3]) updated[3].checked_pkg = e.target.value
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
                      if (updated[3]) updated[3].checked_qa = e.target.value
                      updatePage('page14', 'pm_reconciliation', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-section-title">
          QA FINAL INSPECTION REPORT:
        </div>
        <table className="bmr-table" style={{ marginBottom: 4 }}>
          <colgroup>
            <col style={{ width: 85 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 75 }} />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Unit</th>
              <th style={{ textAlign: 'center' }}>Checking</th>
              <th style={{ textAlign: 'center' }}>No. of unit</th>
              <th style={{ textAlign: 'center' }}>Checked by/Date</th>
              <th style={{ textAlign: 'center' }}>Checked by/Date (QA)</th>
            </tr>
          </thead>
          <tbody>
            {[
              ...(data.page14?.qa_final_inspection || [{ unit: 'Outer box', checking: 'Quality and Quantity' }]),
              ...(data.page15?.qa_final_inspection_cont || [
                { unit: 'Inner box', checking: 'Quality and Quantity' },
                { unit: 'Carton', checking: 'Quality and Quantity' },
                { unit: 'Bottle', checking: 'Quality and Quantity' },
              ]),
            ].map((row, idx) => (
              <tr key={idx}>
                <td>{row.unit}</td>
                <td>{row.checking}</td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.no_of_unit || ''}
                    onChange={(e) => {
                      if (idx === 0) {
                        const updated = [...(data.page14?.qa_final_inspection || [])]
                        if (updated[0]) updated[0].no_of_unit = e.target.value
                        updatePage('page14', 'qa_final_inspection', updated)
                      } else {
                        const updated = [...(data.page15?.qa_final_inspection_cont || [])]
                        if (updated[idx - 1]) updated[idx - 1].no_of_unit = e.target.value
                        updatePage('page15', 'qa_final_inspection_cont', updated)
                      }
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by || ''}
                    placeholder="Sign / Date"
                    onChange={(e) => {
                      if (idx === 0) {
                        const updated = [...(data.page14?.qa_final_inspection || [])]
                        if (updated[0]) updated[0].checked_by = e.target.value
                        updatePage('page14', 'qa_final_inspection', updated)
                      } else {
                        const updated = [...(data.page15?.qa_final_inspection_cont || [])]
                        if (updated[idx - 1]) updated[idx - 1].checked_by = e.target.value
                        updatePage('page15', 'qa_final_inspection_cont', updated)
                      }
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa || ''}
                    placeholder="Sign / Date"
                    onChange={(e) => {
                      if (idx === 0) {
                        const updated = [...(data.page14?.qa_final_inspection || [])]
                        if (updated[0]) updated[0].checked_by_qa = e.target.value
                        updatePage('page14', 'qa_final_inspection', updated)
                      } else {
                        const updated = [...(data.page15?.qa_final_inspection_cont || [])]
                        if (updated[idx - 1]) updated[idx - 1].checked_by_qa = e.target.value
                        updatePage('page15', 'qa_final_inspection_cont', updated)
                      }
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ fontSize: 9.5, lineHeight: '1.4' }}>
          <div style={{ fontWeight: 'bold', marginBottom: 2 }}>Yield and accountability</div>
          <div style={{ paddingLeft: 6 }}>
            a)&nbsp; Quantity released/transferred to BSR by QA &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{' '}
            <input
              className="bmr-line-input"
              style={{ width: 80 }}
              value={data.page15?.yield?.qty_bsr_nos || ''}
              onChange={(e) => {
                const updated = { ...(data.page15?.yield || {}), qty_bsr_nos: e.target.value }
                updatePage('page15', 'yield', updated)
              }}
            />{' '}
            nos &nbsp;&nbsp;&nbsp;&nbsp;{' '}
            <input
              className="bmr-line-input"
              style={{ width: 80 }}
              value={data.page15?.yield?.qty_bsr_ltr || ''}
              onChange={(e) => {
                const updated = { ...(data.page15?.yield || {}), qty_bsr_ltr: e.target.value }
                updatePage('page15', 'yield', updated)
              }}
            />{' '}
            Ltr
          </div>
          <div style={{ paddingLeft: 6, marginTop: 1 }}>
            b)&nbsp; QC sample/retained sample &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{' '}
            <input
              className="bmr-line-input"
              style={{ width: 80 }}
              value={data.page15?.yield?.qc_sample_nos || ''}
              onChange={(e) => {
                const updated = { ...(data.page15?.yield || {}), qc_sample_nos: e.target.value }
                updatePage('page15', 'yield', updated)
              }}
            />{' '}
            nos &nbsp;&nbsp;&nbsp;&nbsp;{' '}
            <input
              className="bmr-line-input"
              style={{ width: 80 }}
              value={data.page15?.yield?.qc_sample_ltr || ''}
              onChange={(e) => {
                const updated = { ...(data.page15?.yield || {}), qc_sample_ltr: e.target.value }
                updatePage('page15', 'yield', updated)
              }}
            />{' '}
            Ltr
          </div>
          <div style={{ paddingLeft: 6, marginTop: 1 }}>
            c)&nbsp; Recoverable rejection &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{' '}
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page15?.yield?.rec_rej_nos || data.page15?.yield?.rec_rej_nos_ltr || ''}
              onChange={(e) => {
                const updated = {
                  ...(data.page15?.yield || {}),
                  rec_rej_nos: e.target.value,
                  rec_rej_nos_ltr: e.target.value,
                }
                updatePage('page15', 'yield', updated)
              }}
            />{' '}
            nos
          </div>
          <div style={{ paddingLeft: 6, marginTop: 1 }}>
            d)&nbsp; Recoverable rejection &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{' '}
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page15?.yield?.rec_rej_ltr || ''}
              onChange={(e) => {
                const updated = { ...(data.page15?.yield || {}), rec_rej_ltr: e.target.value }
                updatePage('page15', 'yield', updated)
              }}
            />{' '}
            Liters
          </div>
          <div style={{ paddingLeft: 6, marginTop: 1 }}>
            e)&nbsp; Non recoverable rejection &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{' '}
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page15?.yield?.non_rec_rej_nos || data.page15?.yield?.non_rec_rej_nos_ltr || ''}
              onChange={(e) => {
                const updated = {
                  ...(data.page15?.yield || {}),
                  non_rec_rej_nos: e.target.value,
                  non_rec_rej_nos_ltr: e.target.value,
                }
                updatePage('page15', 'yield', updated)
              }}
            />{' '}
            nos
          </div>
          <div style={{ paddingLeft: 6, marginTop: 1 }}>
            f)&nbsp; Non recoverable rejection &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{' '}
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page15?.yield?.non_rec_rej_ltr || ''}
              onChange={(e) => {
                const updated = { ...(data.page15?.yield || {}), non_rec_rej_ltr: e.target.value }
                updatePage('page15', 'yield', updated)
              }}
            />{' '}
            Liters
          </div>
        </div>
      </div>
      {renderFooter(15)}
    </div>
  )

  // Page 16: Final Yield & Accountability Formulas
  const renderPage16 = () => (
    <div className="bmr-sheet bmr-syrup-sheet" key="page-16">
      {renderHeader(16)}
      <div className="bmr-body">
        <div className="bmr-section-title" style={{ marginTop: 8 }}>
          FINAL YIELD:
        </div>
        <div className="bmr-syrup-formula-row">
          <span>Formula</span>
          <div className="bmr-syrup-fraction">
            <span className="bmr-syrup-fraction-num">a + b x 100</span>
            <span className="bmr-syrup-fraction-den">Batch size</span>
          </div>
          <span>=</span>
          <input
            className="bmr-line-input"
            style={{ width: 180, textAlign: 'center' }}
            value={data.page16?.final_yield_calc || data.page15?.final_yield_calc || ''}
            onChange={(e) => {
              updatePage('page16', 'final_yield_calc', e.target.value)
              updatePage('page15', 'final_yield_calc', e.target.value)
            }}
          />
          <span>=</span>
          <input
            className="bmr-line-input"
            style={{ width: 65, textAlign: 'center' }}
            value={data.page16?.final_yield_percent || data.page15?.final_yield_percent || ''}
            onChange={(e) => {
              updatePage('page16', 'final_yield_percent', e.target.value)
              updatePage('page15', 'final_yield_percent', e.target.value)
            }}
          />
          <strong>% &nbsp;&nbsp;( Limit NLT 97%)</strong>
        </div>

        <div className="bmr-section-title" style={{ marginTop: 24 }}>
          Accountability
        </div>
        <div className="bmr-syrup-formula-row">
          <span>Formula</span>
          <div className="bmr-syrup-fraction">
            <span className="bmr-syrup-fraction-num">a + b + c + d x 100</span>
            <span className="bmr-syrup-fraction-den">Batch size</span>
          </div>
          <span>=</span>
          <input
            className="bmr-line-input"
            style={{ width: 180, textAlign: 'center' }}
            value={data.page16?.accountability_calc || data.page15?.accountability_calc || ''}
            onChange={(e) => {
              updatePage('page16', 'accountability_calc', e.target.value)
              updatePage('page15', 'accountability_calc', e.target.value)
            }}
          />
          <span>=</span>
          <input
            className="bmr-line-input"
            style={{ width: 65, textAlign: 'center' }}
            value={data.page16?.accountability_percent || data.page15?.accountability_percent || ''}
            onChange={(e) => {
              updatePage('page16', 'accountability_percent', e.target.value)
              updatePage('page15', 'accountability_percent', e.target.value)
            }}
          />
          <strong>% &nbsp;&nbsp;( Limit NLT 98%)</strong>
        </div>
      </div>
      {renderFooter(16)}
    </div>
  )

  // Page 17: Carton and Label Specimen Attachment
  const renderPage17 = () => (
    <div className="bmr-sheet bmr-syrup-sheet" key="page-17">
      {renderHeader(17)}
      <div className="bmr-body">
        <p style={{ margin: '12px 0 8px', fontSize: 11, fontWeight: 'bold' }}>
          Attach the approved specimen of each carton/ label in below given space
        </p>

        <div
          className="bmr-specimen-upload-zone"
          style={{
            border: '2px dashed #94a3b8',
            borderRadius: 8,
            minHeight: 330,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#fafafa',
            padding: 16,
            marginTop: 6,
          }}
        >
          {data.page17?.specimen_image ? (
            <div style={{ textAlign: 'center', width: '100%' }}>
              <img
                src={data.page17.specimen_image}
                alt="Approved Specimen"
                style={{ maxHeight: 280, maxWidth: '90%', objectFit: 'contain', border: '1px solid #cbd5e1', borderRadius: 4 }}
              />
              <div className="no-print" style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="bmr-back-btn"
                  onClick={() => updatePage('page17', 'specimen_image', null)}
                >
                  Remove Specimen
                </button>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>📎</div>
              <label
                style={{
                  display: 'inline-block',
                  background: '#0284c7',
                  color: '#fff',
                  padding: '7px 18px',
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Upload Approved Specimen
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) {
                      const reader = new FileReader()
                      reader.onload = (ev) => {
                        updatePage('page17', 'specimen_image', ev.target.result)
                      }
                      reader.readAsDataURL(file)
                    }
                  }}
                />
              </label>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                PNG, JPG or PDF scan of approved mono carton &amp; label
              </div>
            </div>
          )}
        </div>
      </div>
      {renderFooter(17)}
    </div>
  )

  // Page 18: A) Yield Deviation Justification
  const renderPage18 = () => (
    <div className="bmr-sheet bmr-syrup-sheet" key="page-18">
      {renderHeader(18)}
      <div className="bmr-body">
        <div className="bmr-section-title" style={{ textDecoration: 'underline', margin: '4pt 0' }}>
          DEVIATION :
        </div>
        <div style={{ fontWeight: 'bold', fontSize: 10.5, margin: '6pt 0 10pt' }}>
          A)&nbsp; YIELD DEVIATION: If yield is out of limit to justify the reason as below:
        </div>

        <div style={{ margin: '8pt 0 16pt', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {[0, 1].map((idx) => (
            <div key={idx} style={{ width: '100%' }}>
              <input
                className="bmr-syrup-dotted-input"
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
      </div>
      {renderFooter(18)}
    </div>
  )

  // Page 19: B) Procedural Deviation & Final Approvals
  const renderPage19 = () => (
    <div className="bmr-sheet bmr-syrup-sheet" key="page-19">
      {renderHeader(19)}
      <div className="bmr-body">
        {/* Remaining 2 dotted lines from section A */}
        <div style={{ margin: '2pt 0 10pt', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[2, 3].map((idx) => (
            <div key={idx} style={{ width: '100%' }}>
              <input
                className="bmr-syrup-dotted-input"
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

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4pt 0 10pt', fontSize: 10.5 }}>
          <div>
            <strong>Prepared by/ Date </strong>
            <input
              className="bmr-line-input"
              style={{ width: 130 }}
              value={data.page18?.yield_dev_prod_sign || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page18', 'yield_dev_prod_sign', e.target.value)}
            />
            <div style={{ fontSize: 9.5, color: '#334155' }}>Production</div>
          </div>
          <div>
            <strong>Approved by/ Date </strong>
            <input
              className="bmr-line-input"
              style={{ width: 130 }}
              value={data.page18?.yield_dev_qa_sign || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page18', 'yield_dev_qa_sign', e.target.value)}
            />
            <div style={{ fontSize: 9.5, color: '#334155', textAlign: 'right' }}>QA</div>
          </div>
        </div>

        <div className="bmr-section-title" style={{ margin: '2pt 0' }}>
          B)&nbsp; PROCEDURAL DEVIATION:
        </div>

        <table className="bmr-table" style={{ marginTop: 2, marginBottom: 8 }}>
          <colgroup>
            <col style={{ width: 40 }} />
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
            {(data.page19?.procedural_deviations || []).map((row, idx) => (
              <tr key={idx} style={{ height: 26 }}>
                <td style={{ textAlign: 'center' }}>{row.sr || idx + 1}</td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.details || ''}
                    onChange={(e) => {
                      const updated = [...(data.page19?.procedural_deviations || [])]
                      updated[idx].details = e.target.value
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
                      updated[idx].action = e.target.value
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
                      updated[idx].raise_by = e.target.value
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
                      updated[idx].approved_qa = e.target.value
                      updatePage('page19', 'procedural_deviations', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4pt 0', fontSize: 10.5 }}>
          <div>
            <strong>Prepared by/ Date </strong>
            <input
              className="bmr-line-input"
              style={{ width: 130 }}
              value={data.page19?.proc_dev_prod_sign || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page19', 'proc_dev_prod_sign', e.target.value)}
            />
            <div style={{ fontSize: 9.5, color: '#334155' }}>Production</div>
          </div>
          <div>
            <strong>Approved by/ Date </strong>
            <input
              className="bmr-line-input"
              style={{ width: 130 }}
              value={data.page19?.proc_dev_qa_sign || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page19', 'proc_dev_qa_sign', e.target.value)}
            />
            <div style={{ fontSize: 9.5, color: '#334155', textAlign: 'right' }}>QA</div>
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
