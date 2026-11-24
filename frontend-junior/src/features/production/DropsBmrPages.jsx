import React from 'react'
import SpecimenUpload from './SpecimenUpload'
import { formatDateDDMMYYYY } from './bmrDateUtils'

export function getDropsPageRenderers({
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
const renderPage1 = () => (
    <div className="bmr-sheet bmr-drops-sheet" key="page-1">
      {renderHeader(1)}
      <div className="bmr-body bmr-p1-body">
        <div className="bmr-section-title" style={{ textDecoration: 'underline', fontWeight: 'bold', margin: '4pt 0 6pt' }}>
          Product Details
        </div>
        <div className="bmr-p1-details-grid">
          <div className="bmr-p1-row">
            <span className="bmr-p1-label">1 Manufacturing Date</span>
            <span className="bmr-p1-colon">:</span>
            <BmrDateField
              className="bmr-line-input"
              value={data.page1.mfg_date || ''}
              onChange={(e) => updatePage('page1', 'mfg_date', e.target.value)}
            />
          </div>
          <div className="bmr-p1-row">
            <span className="bmr-p1-label">2 Expiry Date / Best Use Before :</span>
            <span className="bmr-p1-colon">:</span>
            <input
              className="bmr-line-input"
              value={data.page1.expiry_date !== undefined ? data.page1.expiry_date : '5 YEARS'}
              onChange={(e) => updatePage('page1', 'expiry_date', e.target.value)}
            />
          </div>
          <div className="bmr-p1-row">
            <span className="bmr-p1-label">3 Batch Size</span>
            <span className="bmr-p1-colon">:</span>
            <input
              className="bmr-line-input"
              value={data.page1.batch_size || ''}
              onChange={(e) => updatePage('page1', 'batch_size', e.target.value)}
            />
          </div>
          <div className="bmr-p1-row">
            <span className="bmr-p1-label">4 Date of Manufacturing Started:</span>
            <span className="bmr-p1-colon">:</span>
            <BmrDateField
              className="bmr-line-input"
              value={data.page1.mfg_started || ''}
              onChange={(e) => updatePage('page1', 'mfg_started', e.target.value)}
            />
          </div>
          <div className="bmr-p1-row">
            <span className="bmr-p1-label">5 Date of Manufacturing Completed</span>
            <span className="bmr-p1-colon">:</span>
            <BmrDateField
              className="bmr-line-input"
              value={data.page1.mfg_completed || ''}
              onChange={(e) => updatePage('page1', 'mfg_completed', e.target.value)}
            />
          </div>
        </div>

        <table className="bmr-p1-attachments-table">
          <colgroup>
            <col style={{ width: '456pt' }} />
            <col style={{ width: '60pt' }} />
          </colgroup>
          <thead>
            <tr>
              <th className="bmr-p1-th-check">Check List of Attachments</th>
              <th className="bmr-p1-th-marks">Marks of Compliance</th>
            </tr>
          </thead>
          <tbody>
            {[
              { num: '1', key: 'rm_requisition', label: 'RM requisition slip (ATTACHMENT 1)' },
              { num: '2', key: 'test_request_bulk', label: 'Test request slip of bulk product (ATTACHMENT 2)' },
              { num: '3', key: 'release_note_bulk', label: 'Release note of bulk product (ATTACHMENT 3)' },
              { num: '4', key: 'pm_requisition', label: 'PM requisition slip (ATTACHMENT 4)' },
              { num: '5', key: 'specimen_carton_label', label: 'Specimen of mono carton and label' },
              { num: '6', key: 'test_request_finish', label: 'Test request slip of Finish product (after packing) (ATTACHMENT 5)' },
              { num: '7', key: 'test_report_coa', label: 'Test report (COA) of finish Product ( after packing)' },
              { num: '8', isUnderline: true, key: 'finish_transfer_slip', label: 'Finish product transfer slip (ATTACHMENT 6)' },
            ].map((item) => (
              <tr key={item.key} className="bmr-p1-table-row">
                <td className="bmr-p1-td-text">
                  <span className="bmr-p1-td-num" style={{ textDecoration: item.isUnderline ? 'underline' : 'none' }}>
                    {item.num}
                  </span>
                  <span className="bmr-p1-td-label" style={{ textDecoration: item.isUnderline ? 'underline' : 'none' }}>
                    {item.label}
                  </span>
                </td>
                <td
                  className="bmr-p1-td-box"
                  onClick={() =>
                    setData((prev) => ({
                      ...prev,
                      page1: {
                        ...prev.page1,
                        attachments: {
                          ...prev.page1.attachments,
                          [item.key]: !prev.page1.attachments?.[item.key],
                        },
                      },
                    }))
                  }
                >
                  <div className={`bmr-p1-compliance-box ${data.page1.attachments?.[item.key] ? 'checked' : ''}`}>
                    {data.page1.attachments?.[item.key] ? '✓' : ''}
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

  const renderPage2 = () => (
    <div className="bmr-sheet bmr-drops-sheet" key="page-2">
      {renderHeader(2)}
      <div className="bmr-body">
        <div className="bmr-sign-row" style={{ marginBottom: 12 }}>
          <div className="bmr-sign-item">
            <span>Checked by/Date: </span>
            <input
              className="bmr-line-input"
              value={data.page2.checked_by_date}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page2', 'checked_by_date', e.target.value)}
            />
            <span style={{ fontSize: 10, color: '#475569' }}>(Liquid Department In-charge)</span>
          </div>
          <div className="bmr-sign-item">
            <span>Verified by/Date: </span>
            <input
              className="bmr-line-input"
              value={data.page2.verified_by_date}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page2', 'verified_by_date', e.target.value)}
            />
            <span style={{ fontSize: 10, color: '#475569' }}>(QA)</span>
          </div>
        </div>

        <div className="bmr-section-title">RAW MATERIAL DISPENSING AREA LINE CLEARANCE:</div>
        <div style={{ display: 'flex', gap: 30, margin: '8px 0 12px' }}>
          <div>
            <strong>PREVIOUS PRODUCT : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 180 }}
              value={data.page2.previous_product}
              onChange={(e) => updatePage('page2', 'previous_product', e.target.value)}
            />
          </div>
          <div>
            <strong>Batch No. </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page2.previous_batch_no}
              onChange={(e) => updatePage('page2', 'previous_batch_no', e.target.value)}
            />
          </div>
        </div>

        <table className="bmr-table">
          <thead>
            <tr>
              <th style={{ width: 60, textAlign: 'center' }}>Sr. No.</th>
              <th>Activity</th>
              <th style={{ width: 110, textAlign: 'center' }}>Status</th>
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
                  {renderYesNo(data.page2.checklist?.[row.id], (val) =>
                    setData((p) => ({
                      ...p,
                      page2: {
                        ...p.page2,
                        checklist: { ...p.page2.checklist, [row.id]: val },
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

  const renderPage3 = () => (
    <div className="bmr-sheet bmr-drops-sheet" key="page-3">
      {renderHeader(3)}
      <div className="bmr-body">
        <table className="bmr-table">
          <thead>
            <tr>
              <th style={{ width: 60, textAlign: 'center' }}>Sr. No.</th>
              <th>Activity</th>
              <th style={{ width: 110, textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
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
                  {renderYesNo(data.page3.checklist?.[row.id], (val) =>
                    setData((p) => ({
                      ...p,
                      page3: {
                        ...p.page3,
                        checklist: { ...p.page3.checklist, [row.id]: val },
                      },
                    }))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ margin: '14px 0 20px', lineHeight: '2' }}>
          <div>
            <strong>Checked By / Date (Warehouse) : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 260 }}
              value={data.page3.warehouse_checked_by_date}
              placeholder="Signature / Date"
              onChange={(e) => updatePage('page3', 'warehouse_checked_by_date', e.target.value)}
            />
          </div>
          <div>
            <strong>Verified By/Date ( QA) : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 260 }}
              value={data.page3.qa_verified_by_date}
              placeholder="Signature / Date"
              onChange={(e) => updatePage('page3', 'qa_verified_by_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title">MANUFACTURING AREA LINE CLEARANCE:</div>
        <div style={{ display: 'flex', gap: 30, margin: '8px 0 12px' }}>
          <div>
            <strong>Previous Product: </strong>
            <input
              className="bmr-line-input"
              style={{ width: 180 }}
              value={data.page3.mfg_previous_product}
              onChange={(e) => updatePage('page3', 'mfg_previous_product', e.target.value)}
            />
          </div>
          <div>
            <strong>Batch No. </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page3.mfg_previous_batch_no}
              onChange={(e) => updatePage('page3', 'mfg_previous_batch_no', e.target.value)}
            />
          </div>
        </div>

        <table className="bmr-table">
          <thead>
            <tr>
              <th style={{ width: 60, textAlign: 'center' }}>Sr. No.</th>
              <th>Activity</th>
              <th style={{ width: 110, textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ textAlign: 'center' }}>1</td>
              <td>Previous Product left over is removed from area.</td>
              <td style={{ textAlign: 'center' }}>
                {renderYesNo(data.page3.mfg_checklist?.item1, (val) =>
                  setData((p) => ({
                    ...p,
                    page3: {
                      ...p.page3,
                      mfg_checklist: { ...p.page3.mfg_checklist, item1: val },
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

  const renderPage4 = () => (
    <div className="bmr-sheet bmr-drops-sheet" key="page-4">
      {renderHeader(4)}
      <div className="bmr-body">
        <table className="bmr-table">
          <thead>
            <tr>
              <th style={{ width: 60, textAlign: 'center' }}>Sr. No.</th>
              <th>Activity</th>
              <th style={{ width: 110, textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              { id: 'item2', sr: '2', text: 'All equipments/ machineries are properly cleaned and dried.' },
              { id: 'item3', sr: '3', text: 'All equipments / machineries are in perfect working order.' },
              { id: 'item4', sr: '4', text: 'Manufacturing area is cleaned and all types of wastage are removed from this area.' },
              { id: 'item5', sr: '5', text: 'AHU system is properly working.' },
              { id: 'item6', sr: '6', text: 'BMR is properly filled and duly signed till this stage.' },
              { id: 'item7', sr: '7', text: 'Status labeling of manufacturing area is proper.' },
              {
                id: 'item8',
                sr: '8',
                text: (
                  <div>
                    Temperature, % RH and differential pressure is within limit.
                    <div style={{ paddingLeft: 12, marginTop: 4, color: '#334155' }}>
                      • Temperature (Limit: 27°C ± 2°C)<br />
                      • % Relative Humidity (Limit: 55% ± 2%)<br />
                      • Differential Pressure (Limit NLT Pascal)
                    </div>
                  </div>
                ),
              },
            ].map((row) => (
              <tr key={row.id}>
                <td style={{ textAlign: 'center' }}>{row.sr}</td>
                <td>{row.text}</td>
                <td style={{ textAlign: 'center' }}>
                  {renderYesNo(data.page4.mfg_checklist?.[row.id], (val) =>
                    setData((p) => ({
                      ...p,
                      page4: {
                        ...p.page4,
                        mfg_checklist: { ...p.page4.mfg_checklist, [row.id]: val },
                      },
                    }))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-sign-row" style={{ margin: '10px 0 16px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <strong>Checked By / Date (Production) : </strong>
            <BmrDateField
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page4.checked_by_prod_date}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page4', 'checked_by_prod_date', e.target.value)}
            />
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <strong>Verified by/Date (QA) : </strong>
            <BmrDateField
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page4.verified_by_qa_date}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page4', 'verified_by_qa_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title">LIQUID ORAL MANUFACTURING:</div>
        <table className="bmr-table">
          <colgroup>
            <col style={{ width: '8%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '22%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Sr. No.</th>
              <th>Equipment</th>
              <th>Equipment ID</th>
              <th>Date of last cleaning</th>
              <th>Previous product/Batch no.</th>
            </tr>
          </thead>
          <tbody>
            {(data.page4.equipments || []).map((eq, idx) => (
              <tr key={idx}>
                <td style={{ textAlign: 'center' }}>{eq.sr}</td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={eq.name}
                    onChange={(e) => {
                      const updated = [...data.page4.equipments]
                      updated[idx].name = e.target.value
                      updatePage('page4', 'equipments', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={eq.id}
                    onChange={(e) => {
                      const updated = [...data.page4.equipments]
                      updated[idx].id = e.target.value
                      updatePage('page4', 'equipments', updated)
                    }}
                  />
                </td>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={eq.date_cleaned}
                    onChange={(e) => {
                      const updated = [...data.page4.equipments]
                      updated[idx].date_cleaned = e.target.value
                      updatePage('page4', 'equipments', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={eq.prev_batch}
                    placeholder="Previous Batch"
                    onChange={(e) => {
                      const updated = [...data.page4.equipments]
                      updated[idx].prev_batch = e.target.value
                      updatePage('page4', 'equipments', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {renderFooter(4)}
    </div>
  )

  const renderPage5 = () => (
    <div className="bmr-sheet bmr-drops-sheet" key="page-5">
      {renderHeader(5)}
      <div className="bmr-body bmr-p5-body">
        <div style={{ marginBottom: 4, lineHeight: '1.4' }}>
          <div>
            <strong>Cleaned by/ Date (Production) : </strong>
            <input
              className="bmr-line-input"
              value={data.page5.cleaned_by_date}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page5', 'cleaned_by_date', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <strong>Checked by/ Date (Production) : </strong>
              <input
                className="bmr-line-input"
                value={data.page5.checked_by_date}
                placeholder="Sign / Date"
                onChange={(e) => updatePage('page5', 'checked_by_date', e.target.value)}
              />
            </div>
            <div>
              <strong>Verified by /Date (QA) : </strong>
              <input
                className="bmr-line-input"
                value={data.page5.verified_by_date}
                placeholder="Sign / Date"
                onChange={(e) => updatePage('page5', 'verified_by_date', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="bmr-section-title" style={{ margin: '4px 0 3px' }}>MANUFACTURING PROCESS OF BULK:</div>
        <table className="bmr-table" style={{ marginBottom: 6 }}>
          <thead>
            <tr>
              <th rowSpan={2} style={{ width: 45, textAlign: 'center' }}>Sr. No</th>
              <th rowSpan={2}>Process</th>
              <th rowSpan={2}>Equip. used</th>
              <th rowSpan={2}>Eq. ID</th>
              <th rowSpan={2} style={{ width: 100 }}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time ( Hrs.)</th>
            </tr>
            <tr>
              <th style={{ width: 70, textAlign: 'center' }}>From</th>
              <th style={{ width: 70, textAlign: 'center' }}>To</th>
            </tr>
          </thead>
          <tbody>
            {(data.page5.bulk_processes || []).map((p, idx) => (
              <tr key={idx}>
                <td style={{ textAlign: 'center' }}>{p.sr}</td>
                <td>
                  <textarea
                    className="bmr-cell-input"
                    rows={1}
                    style={{ minHeight: 22, height: 22, resize: 'none' }}
                    value={p.process}
                    onChange={(e) => {
                      const updated = [...data.page5.bulk_processes]
                      updated[idx].process = e.target.value
                      updatePage('page5', 'bulk_processes', updated)
                    }}
                  />
                  {p.ltrs !== undefined && (
                    <div style={{ marginTop: 2 }}>
                      <strong>LTRs: </strong>
                      <input
                        className="bmr-line-input"
                        style={{ width: 100 }}
                        value={p.ltrs}
                        onChange={(e) => {
                          const updated = [...data.page5.bulk_processes]
                          updated[idx].ltrs = e.target.value
                          updatePage('page5', 'bulk_processes', updated)
                        }}
                      />
                    </div>
                  )}
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={p.equip}
                    onChange={(e) => {
                      const updated = [...data.page5.bulk_processes]
                      updated[idx].equip = e.target.value
                      updatePage('page5', 'bulk_processes', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={p.eq_id}
                    onChange={(e) => {
                      const updated = [...data.page5.bulk_processes]
                      updated[idx].eq_id = e.target.value
                      updatePage('page5', 'bulk_processes', updated)
                    }}
                  />
                </td>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={p.date}
                    onChange={(e) => {
                      const updated = [...data.page5.bulk_processes]
                      updated[idx].date = e.target.value
                      updatePage('page5', 'bulk_processes', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    className="bmr-cell-input"
                    value={p.from_time}
                    onChange={(e) => {
                      const updated = [...data.page5.bulk_processes]
                      updated[idx].from_time = e.target.value
                      updatePage('page5', 'bulk_processes', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    className="bmr-cell-input"
                    value={p.to_time}
                    onChange={(e) => {
                      const updated = [...data.page5.bulk_processes]
                      updated[idx].to_time = e.target.value
                      updatePage('page5', 'bulk_processes', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ margin: '4px 0', lineHeight: '1.4' }}>
          <div>
            <strong>Done by/Date (Production) : </strong>
            <input
              className="bmr-line-input"
              value={data.page5.done_by_date}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page5', 'done_by_date', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              <strong>Checked by/Date(Production) : </strong>
              <input
                className="bmr-line-input"
                value={data.page5.checked_by_prod_date}
                placeholder="Sign / Date"
                onChange={(e) => updatePage('page5', 'checked_by_prod_date', e.target.value)}
              />
            </div>
            <div>
              <strong>Verified by/Date (QA) : </strong>
              <input
                className="bmr-line-input"
                value={data.page5.verified_by_qa_date}
                placeholder="Sign / Date"
                onChange={(e) => updatePage('page5', 'verified_by_qa_date', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div style={{ border: '1px solid #cbd5e1', padding: '4px 8px', background: '#f8fafc', borderRadius: 4, fontSize: '8pt' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', height: 18 }}>
            <strong>PROD: </strong> Test request sent to QA department on date
            <BmrDateField
              className="bmr-line-input"
              style={{ width: 95, fontSize: '8pt' }}
              value={data.page5.prod_test_req_date}
              onChange={(e) => updatePage('page5', 'prod_test_req_date', e.target.value)}
            />
            for bulk sampling. Sign/Date:
            <input
              className="bmr-line-input"
              style={{ width: 75, fontSize: '8pt' }}
              value={data.page5.prod_test_req_sign}
              placeholder="Sign"
              onChange={(e) => updatePage('page5', 'prod_test_req_sign', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', height: 18 }}>
            <strong>QA: </strong> Test request sent to QC department on date
            <BmrDateField
              className="bmr-line-input"
              style={{ width: 95, fontSize: '8pt' }}
              value={data.page5.qa_test_req_date}
              onChange={(e) => updatePage('page5', 'qa_test_req_date', e.target.value)}
            />
            for bulk analysis. Sign/Date:
            <input
              className="bmr-line-input"
              style={{ width: 75, fontSize: '8pt' }}
              value={data.page5.qa_test_req_sign}
              placeholder="Sign"
              onChange={(e) => updatePage('page5', 'qa_test_req_sign', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', height: 18 }}>
            <strong>QC: </strong> Bulk Release slip sent to QA on date
            <BmrDateField
              className="bmr-line-input"
              style={{ width: 95, fontSize: '8pt' }}
              value={data.page5.qc_bulk_release_date}
              onChange={(e) => updatePage('page5', 'qc_bulk_release_date', e.target.value)}
            />
            Sign/Date:
            <input
              className="bmr-line-input"
              style={{ width: 75, fontSize: '8pt' }}
              value={data.page5.qc_bulk_release_sign}
              placeholder="Sign"
              onChange={(e) => updatePage('page5', 'qc_bulk_release_sign', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', height: 18 }}>
            <strong>QA: </strong> Bulk Release slip sent to Production on date
            <BmrDateField
              className="bmr-line-input"
              style={{ width: 95, fontSize: '8pt' }}
              value={data.page5.qa_bulk_release_date}
              onChange={(e) => updatePage('page5', 'qa_bulk_release_date', e.target.value)}
            />
            for filling. Sign/Date:
            <input
              className="bmr-line-input"
              style={{ width: 75, fontSize: '8pt' }}
              value={data.page5.qa_bulk_release_sign}
              placeholder="Sign"
              onChange={(e) => updatePage('page5', 'qa_bulk_release_sign', e.target.value)}
            />
          </div>
        </div>
      </div>
      {renderFooter(5)}
    </div>
  )

  const renderPage6 = () => (
    <div className="bmr-sheet bmr-drops-sheet" key="page-6">
      {renderHeader(6)}
      <div className="bmr-body">
        <div className="bmr-section-title">LIQUID FILLING AREA LINE CLEARANCE :</div>
        <div style={{ display: 'flex', gap: 30, margin: '8px 0 12px' }}>
          <div>
            <strong>Previous Product : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 180 }}
              value={data.page6.previous_product}
              onChange={(e) => updatePage('page6', 'previous_product', e.target.value)}
            />
          </div>
          <div>
            <strong>Batch No. </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page6.previous_batch_no}
              onChange={(e) => updatePage('page6', 'previous_batch_no', e.target.value)}
            />
          </div>
        </div>

        <table className="bmr-table">
          <thead>
            <tr>
              <th style={{ width: 60, textAlign: 'center' }}>Sr. No.</th>
              <th>Activity</th>
              <th style={{ width: 110, textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {[
              { id: 'item1', sr: '1', text: 'Area is Cleaned.' },
              { id: 'item2', sr: '2', text: 'Area is properly labeled.' },
              { id: 'item3', sr: '3', text: 'Left Over of previous product removed from area.' },
              { id: 'item4', sr: '4', text: 'BMR is properly filled and duly signed till this stage.' },
              { id: 'item5', sr: '5', text: 'Cleaning record is filled of liquid filling line.' },
              {
                id: 'item6',
                sr: '6',
                text: (
                  <div>
                    Temperature, % RH &amp; Differential pressure is within limit Limits:
                    <div style={{ paddingLeft: 12, marginTop: 4, color: '#334155' }}>
                      • Temperature : 27℃ ± 2℃ %<br />
                      • RH 55% ± 2%<br />
                      • Differential Pressure Limit NLT Pascal
                    </div>
                  </div>
                ),
              },
            ].map((row) => (
              <tr key={row.id}>
                <td style={{ textAlign: 'center' }}>{row.sr}</td>
                <td>{row.text}</td>
                <td style={{ textAlign: 'center' }}>
                  {renderYesNo(data.page6.filling_line_clearance?.[row.id], (val) =>
                    setData((p) => ({
                      ...p,
                      page6: {
                        ...p.page6,
                        filling_line_clearance: { ...p.page6.filling_line_clearance, [row.id]: val },
                      },
                    }))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-sign-row" style={{ margin: '10px 0 16px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <strong>Checked By/Date (Production) : </strong>
            <BmrDateField
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page6.checked_by_date}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page6', 'checked_by_date', e.target.value)}
            />
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <strong>Verified by/Date (QA) : </strong>
            <BmrDateField
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page6.verified_by_date}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page6', 'verified_by_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title">LIQUID ORAL FILLING:</div>
        <div style={{ fontWeight: 700, margin: '4px 0 6px' }}>Equipment clearance</div>
        <table className="bmr-table">
          <colgroup>
            <col style={{ width: '8%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '22%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Sr. No.</th>
              <th>Equipment</th>
              <th>Equipment ID</th>
              <th>Date of last cleaning</th>
              <th>Previous Product /Batch No.</th>
            </tr>
          </thead>
          <tbody>
            {(data.page6.filling_equipments || []).map((eq, idx) => (
              <tr key={idx}>
                <td style={{ textAlign: 'center' }}>{eq.sr}</td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={eq.name}
                    onChange={(e) => {
                      const updated = [...data.page6.filling_equipments]
                      updated[idx].name = e.target.value
                      updatePage('page6', 'filling_equipments', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={eq.id}
                    onChange={(e) => {
                      const updated = [...data.page6.filling_equipments]
                      updated[idx].id = e.target.value
                      updatePage('page6', 'filling_equipments', updated)
                    }}
                  />
                </td>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={eq.date_cleaned}
                    onChange={(e) => {
                      const updated = [...data.page6.filling_equipments]
                      updated[idx].date_cleaned = e.target.value
                      updatePage('page6', 'filling_equipments', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={eq.prev_batch}
                    placeholder="Previous Batch"
                    onChange={(e) => {
                      const updated = [...data.page6.filling_equipments]
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

  const renderPage7 = () => (
    <div className="bmr-sheet bmr-drops-sheet" key="page-7">
      {renderHeader(7)}
      <div className="bmr-body">
        <table className="bmr-table">
          <colgroup>
            <col style={{ width: '8%' }} />
            <col style={{ width: '28%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '22%' }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ textAlign: 'center' }}>Sr. No.</th>
              <th>Equipment</th>
              <th>Equipment ID</th>
              <th>Date of last cleaning</th>
              <th>Previous Product /Batch No.</th>
            </tr>
          </thead>
          <tbody>
            {(data.page7.filling_equipments_cont || []).map((eq, idx) => (
              <tr key={idx}>
                <td style={{ textAlign: 'center' }}>{eq.sr}</td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={eq.name}
                    onChange={(e) => {
                      const updated = [...data.page7.filling_equipments_cont]
                      updated[idx].name = e.target.value
                      updatePage('page7', 'filling_equipments_cont', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={eq.id}
                    onChange={(e) => {
                      const updated = [...data.page7.filling_equipments_cont]
                      updated[idx].id = e.target.value
                      updatePage('page7', 'filling_equipments_cont', updated)
                    }}
                  />
                </td>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={eq.date_cleaned}
                    onChange={(e) => {
                      const updated = [...data.page7.filling_equipments_cont]
                      updated[idx].date_cleaned = e.target.value
                      updatePage('page7', 'filling_equipments_cont', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={eq.prev_batch}
                    placeholder="Previous Batch"
                    onChange={(e) => {
                      const updated = [...data.page7.filling_equipments_cont]
                      updated[idx].prev_batch = e.target.value
                      updatePage('page7', 'filling_equipments_cont', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-sign-row" style={{ margin: '10px 0 16px' }}>
          <div>
            <strong>Checked by/Date (Production) : </strong>
            <input
              className="bmr-line-input"
              value={data.page7.checked_by_date}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page7', 'checked_by_date', e.target.value)}
            />
          </div>
          <div>
            <strong>Verified by/Date (QA) : </strong>
            <input
              className="bmr-line-input"
              value={data.page7.verified_by_date}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page7', 'verified_by_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title">BOTTLE CLEANING BY AIR:</div>
        <p style={{ margin: '4px 0 14px' }}>
          Clean the bottle as per the procedure given in SOP and maintain cleanliness.
        </p>

        <div className="bmr-section-title">VOLUME SETTING:</div>
        <p style={{ margin: '4px 0 10px' }}>
          Set the required volume in each pump by adjusting in online display monitor.
        </p>

        <table className="bmr-table">
          <thead>
            <tr>
              <th rowSpan={2} style={{ width: 110 }}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time ( Hrs)</th>
              <th rowSpan={2}>Done by (Production)</th>
              <th rowSpan={2}>Checked by (Production)</th>
              <th rowSpan={2}>Checked by (QA)</th>
            </tr>
            <tr>
              <th style={{ width: 75, textAlign: 'center' }}>From</th>
              <th style={{ width: 75, textAlign: 'center' }}>To</th>
            </tr>
          </thead>
          <tbody>
            {(data.page7.volume_settings || []).map((row, idx) => (
              <tr key={idx}>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date}
                    onChange={(e) => {
                      const updated = [...data.page7.volume_settings]
                      updated[idx].date = e.target.value
                      updatePage('page7', 'volume_settings', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    className="bmr-cell-input"
                    value={row.from_time}
                    onChange={(e) => {
                      const updated = [...data.page7.volume_settings]
                      updated[idx].from_time = e.target.value
                      updatePage('page7', 'volume_settings', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    className="bmr-cell-input"
                    value={row.to_time}
                    onChange={(e) => {
                      const updated = [...data.page7.volume_settings]
                      updated[idx].to_time = e.target.value
                      updatePage('page7', 'volume_settings', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by}
                    placeholder="Sign"
                    onChange={(e) => {
                      const updated = [...data.page7.volume_settings]
                      updated[idx].done_by = e.target.value
                      updatePage('page7', 'volume_settings', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_prod}
                    placeholder="Sign"
                    onChange={(e) => {
                      const updated = [...data.page7.volume_settings]
                      updated[idx].checked_by_prod = e.target.value
                      updatePage('page7', 'volume_settings', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa}
                    placeholder="Sign"
                    onChange={(e) => {
                      const updated = [...data.page7.volume_settings]
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

  const renderPage8 = () => (
    <div className="bmr-sheet bmr-drops-sheet" key="page-8">
      {renderHeader(8)}
      <div className="bmr-body bmr-p8-body">
        <div className="bmr-section-title" style={{ margin: '2pt 0 2pt' }}>FILLING RECORD AND UNIFORMITY OF VOLUME CHECK:</div>
        <p style={{ margin: '1pt 0 3pt' }}>Frequency 30 minutes.</p>
        <div style={{ marginBottom: 4 }}>
          <strong style={{ marginRight: 6 }}>Date of Filling: </strong>
          <BmrDateField
            className="bmr-line-input"
            style={{ width: 130 }}
            value={data.page8.date_of_filling}
            onChange={(e) => updatePage('page8', 'date_of_filling', e.target.value)}
          />
        </div>

        <table className="bmr-table" style={{ marginBottom: 3 }}>
          <colgroup>
            <col style={{ width: '10%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '18%' }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Sr. No.</th>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Time (Hrs)</th>
              <th colSpan={4} style={{ textAlign: 'center' }}>Filled volume (ml)</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center' }}>Pump-1</th>
              <th style={{ textAlign: 'center' }}>Pump-2</th>
              <th style={{ textAlign: 'center' }}>Pump-3</th>
              <th style={{ textAlign: 'center' }}>Pump-4</th>
            </tr>
          </thead>
          <tbody>
            {(data.page8.filling_records || []).map((r, idx) => (
              <tr key={idx}>
                <td style={{ textAlign: 'center' }}>{r.sr}</td>
                <td>
                  <input
                    type="time"
                    className="bmr-cell-input"
                    value={r.time}
                    onChange={(e) => {
                      const updated = [...data.page8.filling_records]
                      updated[idx].time = e.target.value
                      updatePage('page8', 'filling_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={r.p1}
                    onChange={(e) => {
                      const updated = [...data.page8.filling_records]
                      updated[idx].p1 = e.target.value
                      updatePage('page8', 'filling_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={r.p2}
                    onChange={(e) => {
                      const updated = [...data.page8.filling_records]
                      updated[idx].p2 = e.target.value
                      updatePage('page8', 'filling_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={r.p3}
                    onChange={(e) => {
                      const updated = [...data.page8.filling_records]
                      updated[idx].p3 = e.target.value
                      updatePage('page8', 'filling_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={r.p4}
                    onChange={(e) => {
                      const updated = [...data.page8.filling_records]
                      updated[idx].p4 = e.target.value
                      updatePage('page8', 'filling_records', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-sign-row" style={{ margin: '3pt 0' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <strong>Filled by: </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page8.filled_by}
              placeholder="Sign"
              onChange={(e) => updatePage('page8', 'filled_by', e.target.value)}
            />
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <strong>Checked by/Date (production): </strong>
            <BmrDateField
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page8.checked_by_prod}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page8', 'checked_by_prod', e.target.value)}
            />
          </div>
        </div>
        <div style={{ margin: '2pt 0 3pt', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <strong>Checked by/Date (QA): </strong>
          <BmrDateField
            className="bmr-line-input"
            style={{ width: 140 }}
            value={data.page8.checked_by_qa}
            placeholder="Sign / Date"
            onChange={(e) => updatePage('page8', 'checked_by_qa', e.target.value)}
          />
        </div>

        <div className="bmr-section-title" style={{ marginTop: '3pt', marginBottom: '1pt' }}>INNER PLUGGING:</div>
        <p style={{ margin: '1pt 0 2pt', fontSize: '8.5pt' }}>
          Load required quantity of cleaned inner plug. Remove defective inner plug online before plugging and keep it aside.
        </p>

        <div className="bmr-section-title" style={{ marginTop: '2pt', marginBottom: '1pt' }}>CAPPING:</div>
        <p style={{ margin: '1pt 0 2pt', fontSize: '8.5pt' }}>
          Load required quantity of cleaned dual seal cap. Remove defective inner plug online before capping and keep it aside.
        </p>

        <div className="bmr-section-title" style={{ marginTop: '2pt', marginBottom: '1pt' }}>SEALING:</div>
        <p style={{ margin: '1pt 0 2pt', fontSize: '8.5pt' }}>
          Sealing is done online by machine after capping activity and check for the leak/seal test
        </p>
      </div>
      {renderFooter(8)}
    </div>
  )

  const renderPage9 = () => {
    const table1Rows = (data.page9.sealing_checks && data.page9.sealing_checks.length > 0)
      ? data.page9.sealing_checks
      : (data.page9.inspection_table1 && data.page9.inspection_table1.length > 0)
        ? data.page9.inspection_table1
        : [
            { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
            { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
          ]

    const table2Rows = (data.page9.visual_inspection && data.page9.visual_inspection.length > 0)
      ? data.page9.visual_inspection
      : (data.page9.inspection_table2 && data.page9.inspection_table2.length > 0)
        ? data.page9.inspection_table2
        : [
            { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
            { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
          ]

    const table3Rows = (data.page9.measuring_cup_checks && data.page9.measuring_cup_checks.length > 0)
      ? data.page9.measuring_cup_checks
      : [
          { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
          { date: '', from_time: '', to_time: '', done_by: '', checked_by_prod: '', checked_by_qa: '' },
        ]

    const handleUpdateTable1 = (idx, field, val) => {
      const updated = [...table1Rows]
      updated[idx] = { ...updated[idx], [field]: val }
      setData((p) => ({
        ...p,
        page9: {
          ...p.page9,
          sealing_checks: updated,
          inspection_table1: updated,
        },
      }))
    }

    const handleUpdateTable2 = (idx, field, val) => {
      const updated = [...table2Rows]
      updated[idx] = { ...updated[idx], [field]: val }
      setData((p) => ({
        ...p,
        page9: {
          ...p.page9,
          visual_inspection: updated,
          inspection_table2: updated,
        },
      }))
    }

    const handleUpdateTable3 = (idx, field, val) => {
      const updated = [...table3Rows]
      updated[idx] = { ...updated[idx], [field]: val }
      setData((p) => ({
        ...p,
        page9: {
          ...p.page9,
          measuring_cup_checks: updated,
        },
      }))
    }

    return (
      <div className="bmr-sheet bmr-drops-sheet" key="page-9">
        {renderHeader()}
        <div className="bmr-body bmr-p9-body">
          <table className="bmr-table" style={{ marginBottom: 3 }}>
            <colgroup>
              <col style={{ width: '18%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2}>Date</th>
                <th colSpan={2} style={{ textAlign: 'center' }}>Time ( Hrs)</th>
                <th rowSpan={2}>Done by (Production)</th>
                <th rowSpan={2}>Checked by (Production)</th>
                <th rowSpan={2}>Checked by (QA)</th>
              </tr>
              <tr>
                <th style={{ textAlign: 'center' }}>From</th>
                <th style={{ textAlign: 'center' }}>To</th>
              </tr>
            </thead>
            <tbody>
              {table1Rows.map((row, idx) => (
                <tr key={idx}>
                  <td>
                    <BmrDateField
                      className="bmr-cell-input"
                      value={row.date}
                      onChange={(e) => handleUpdateTable1(idx, 'date', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      className="bmr-cell-input"
                      value={row.from_time}
                      onChange={(e) => handleUpdateTable1(idx, 'from_time', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      className="bmr-cell-input"
                      value={row.to_time}
                      onChange={(e) => handleUpdateTable1(idx, 'to_time', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.done_by}
                      placeholder="Sign"
                      onChange={(e) => handleUpdateTable1(idx, 'done_by', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_by_prod}
                      placeholder="Sign"
                      onChange={(e) => handleUpdateTable1(idx, 'checked_by_prod', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_by_qa}
                      placeholder="Sign"
                      onChange={(e) => handleUpdateTable1(idx, 'checked_by_qa', e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="bmr-section-title" style={{ margin: '2pt 0 1pt' }}>VISUAL INSPECTION ( FOR DROPS / FOR SYRUP):</div>
          <p style={{ margin: '1pt 0 1pt', fontSize: '8.5pt' }}>
            <strong>For Drops: </strong>Check the bottle for any particulate matter and foreign matter against white and black background on inspection table.
          </p>
          <p style={{ margin: '1pt 0 2pt', fontSize: '8.5pt' }}>
            <strong>For Syrup: </strong>Check the bottle for cleanliness and batch details on the product label.
          </p>

          <table className="bmr-table" style={{ marginBottom: 3 }}>
            <colgroup>
              <col style={{ width: '18%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2}>Date</th>
                <th colSpan={2} style={{ textAlign: 'center' }}>Time (Hrs)</th>
                <th rowSpan={2}>Done By Production</th>
                <th rowSpan={2}>Checked By Production</th>
                <th rowSpan={2}>Checked By QA</th>
              </tr>
              <tr>
                <th style={{ textAlign: 'center' }}>From</th>
                <th style={{ textAlign: 'center' }}>To</th>
              </tr>
            </thead>
            <tbody>
              {table2Rows.map((row, idx) => (
                <tr key={idx}>
                  <td>
                    <BmrDateField
                      className="bmr-cell-input"
                      value={row.date}
                      onChange={(e) => handleUpdateTable2(idx, 'date', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      className="bmr-cell-input"
                      value={row.from_time}
                      onChange={(e) => handleUpdateTable2(idx, 'from_time', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      className="bmr-cell-input"
                      value={row.to_time}
                      onChange={(e) => handleUpdateTable2(idx, 'to_time', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.done_by}
                      placeholder="Sign"
                      onChange={(e) => handleUpdateTable2(idx, 'done_by', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_by_prod}
                      placeholder="Sign"
                      onChange={(e) => handleUpdateTable2(idx, 'checked_by_prod', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_by_qa}
                      placeholder="Sign"
                      onChange={(e) => handleUpdateTable2(idx, 'checked_by_qa', e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="bmr-section-title" style={{ margin: '2pt 0 1pt' }}>MEASURING CUP:</div>
          <p style={{ margin: '1pt 0 2pt', fontSize: '8.5pt' }}>Place the clean measuring cup on dual seal cap.</p>
          <div style={{ margin: '1pt 0 2pt', display: 'flex', gap: 24, alignItems: 'center' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontWeight: 600, fontSize: '8.5pt', whiteSpace: 'nowrap' }}>
              <input
                type="radio"
                name="measuring_cup"
                value="Applicable"
                checked={data.page9.measuring_cup_applicable === 'Applicable'}
                onChange={() => updatePage('page9', 'measuring_cup_applicable', 'Applicable')}
              />
              Applicable
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontWeight: 600, fontSize: '8.5pt', whiteSpace: 'nowrap' }}>
              <input
                type="radio"
                name="measuring_cup"
                value="Not Applicable"
                checked={data.page9.measuring_cup_applicable === 'Not Applicable'}
                onChange={() => updatePage('page9', 'measuring_cup_applicable', 'Not Applicable')}
              />
              Not Applicable.
            </label>
          </div>

          <table className="bmr-table" style={{ marginBottom: 3 }}>
            <colgroup>
              <col style={{ width: '18%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2}>Date</th>
                <th colSpan={2} style={{ textAlign: 'center' }}>Time (Hrs)</th>
                <th rowSpan={2}>Done By Production</th>
                <th rowSpan={2}>Checked By Production</th>
                <th rowSpan={2}>Checked By QA</th>
              </tr>
              <tr>
                <th style={{ textAlign: 'center' }}>From</th>
                <th style={{ textAlign: 'center' }}>To</th>
              </tr>
            </thead>
            <tbody>
              {table3Rows.map((row, idx) => (
                <tr key={idx}>
                  <td>
                    <BmrDateField
                      className="bmr-cell-input"
                      value={row.date}
                      onChange={(e) => handleUpdateTable3(idx, 'date', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      className="bmr-cell-input"
                      value={row.from_time}
                      onChange={(e) => handleUpdateTable3(idx, 'from_time', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      className="bmr-cell-input"
                      value={row.to_time}
                      onChange={(e) => handleUpdateTable3(idx, 'to_time', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.done_by}
                      placeholder="Sign"
                      onChange={(e) => handleUpdateTable3(idx, 'done_by', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_by_prod}
                      placeholder="Sign"
                      onChange={(e) => handleUpdateTable3(idx, 'checked_by_prod', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_by_qa}
                      placeholder="Sign"
                      onChange={(e) => handleUpdateTable3(idx, 'checked_by_qa', e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ margin: '2pt 0 3pt', fontSize: '8.5pt' }}>
            <span>Total Nos. of Inspected Bottles: </span>
            <input
              className="bmr-line-input"
              style={{ width: 100, textAlign: 'center' }}
              value={data.page9.total_inspected_bottles}
              placeholder=""
              onChange={(e) => updatePage('page9', 'total_inspected_bottles', e.target.value)}
            />
            <span> Nos.</span>
          </div>

          <div className="bmr-sign-row" style={{ margin: '2pt 0 2pt' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <strong>Checked by/Date (Production) : </strong>
              <BmrDateField
                className="bmr-line-input"
                style={{ width: 140 }}
                value={data.page9.checked_by_date}
                placeholder="Sign / Date"
                onChange={(e) => updatePage('page9', 'checked_by_date', e.target.value)}
              />
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <strong>Verified by/ Date (QA) : </strong>
              <BmrDateField
                className="bmr-line-input"
                style={{ width: 140 }}
                value={data.page9.verified_by_date}
                placeholder="Sign / Date"
                onChange={(e) => updatePage('page9', 'verified_by_date', e.target.value)}
              />
            </div>
          </div>

          <div className="bmr-section-title" style={{ marginTop: '2pt', marginBottom: '0' }}>
            PACKING MATERIAL DISPENSING AREA LINE CLEARANCE:
          </div>
        </div>
        {renderFooter(9)}
      </div>
    )
  }

  const renderPage10 = () => (
    <div className="bmr-sheet bmr-drops-sheet" key="page-10">
      {renderHeader(10)}
      <div className="bmr-body">
        <div style={{ display: 'flex', gap: 30, margin: '2pt 0 4pt', fontSize: '8.5pt' }}>
          <div>
            <strong>Previous Product: </strong>
            <input
              className="bmr-line-input"
              style={{ width: 160 }}
              value={data.page10.previous_product || ''}
              onChange={(e) => updatePage('page10', 'previous_product', e.target.value)}
            />
          </div>
          <div>
            <strong>Batch No. </strong>
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page10.previous_batch_no || ''}
              onChange={(e) => updatePage('page10', 'previous_batch_no', e.target.value)}
            />
          </div>
        </div>

        <table className="bmr-table">
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
                  {renderYesNo(data.page10.packing_dispensing_clearance?.[row.id], (val) =>
                    setData((p) => ({
                      ...p,
                      page10: {
                        ...p.page10,
                        packing_dispensing_clearance: { ...p.page10.packing_dispensing_clearance, [row.id]: val },
                      },
                    }))
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-sign-row" style={{ margin: '2pt 0 4pt', display: 'flex', justifyContent: 'space-between', fontSize: '8.5pt' }}>
          <div>
            <strong>Checked By/Date (Packing) : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page10.checked_by_date || ''}
              placeholder=""
              onChange={(e) => updatePage('page10', 'checked_by_date', e.target.value)}
            />
          </div>
          <div>
            <strong>Verified by/Date ( QA) : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page10.verified_by_date || ''}
              placeholder=""
              onChange={(e) => updatePage('page10', 'verified_by_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title">ENVIRONMENTAL CONTROL: ( Packing Area)</div>
        <p style={{ margin: '1pt 0 2pt' }}>Check and record temperature and relative humidity twice a day.</p>
        <p style={{ margin: '1pt 0 3pt', color: '#475569' }}>
          <strong>Limit: Temperature: 27°C ± 2° C | % RH 55% ± 2%</strong>
        </p>

        <table className="bmr-table">
          <colgroup>
            <col style={{ width: '18%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Date</th>
              <th style={{ textAlign: 'center' }}>Time Hrs.</th>
              <th style={{ textAlign: 'center' }}>Temp °C</th>
              <th style={{ textAlign: 'center' }}>% RH</th>
              <th>Checked By (Packaging)</th>
              <th>Checked By (QA)</th>
            </tr>
          </thead>
          <tbody>
            {(data.page10.environmental_control || []).map((row, idx) => (
              <tr key={idx}>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date}
                    onChange={(e) => {
                      const updated = [...data.page10.environmental_control]
                      updated[idx].date = e.target.value
                      updatePage('page10', 'environmental_control', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    className="bmr-cell-input"
                    value={row.time}
                    onChange={(e) => {
                      const updated = [...data.page10.environmental_control]
                      updated[idx].time = e.target.value
                      updatePage('page10', 'environmental_control', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.temp}
                    onChange={(e) => {
                      const updated = [...data.page10.environmental_control]
                      updated[idx].temp = e.target.value
                      updatePage('page10', 'environmental_control', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    style={{ textAlign: 'center' }}
                    value={row.rh}
                    onChange={(e) => {
                      const updated = [...data.page10.environmental_control]
                      updated[idx].rh = e.target.value
                      updatePage('page10', 'environmental_control', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_pkg}
                    placeholder=""
                    onChange={(e) => {
                      const updated = [...data.page10.environmental_control]
                      updated[idx].checked_by_pkg = e.target.value
                      updatePage('page10', 'environmental_control', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa}
                    placeholder=""
                    onChange={(e) => {
                      const updated = [...data.page10.environmental_control]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page10', 'environmental_control', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-section-title" style={{ margin: '2pt 0 2pt' }}>EQUIPMENT CLEARANCE FOR CARTON AND LABEL CODING:</div>
        <table className="bmr-table" style={{ marginBottom: 0 }}>
          <colgroup>
            <col style={{ width: '25%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '19%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '18%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Equipment</th>
              <th>Equipment ID</th>
              <th>Date of Last Cleaning</th>
              <th>Previous Product/ Batch No.</th>
              <th>Cleaned By (Packaging)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <input
                  className="bmr-cell-input"
                  value={data.page10.coding_equipments_row1?.equip || ''}
                  onChange={(e) =>
                    setData((p) => ({
                      ...p,
                      page10: {
                        ...p.page10,
                        coding_equipments_row1: {
                          ...p.page10,
                          coding_equipments_row1: {
                            ...p.page10.coding_equipments_row1,
                            equip: e.target.value,
                          },
                        },
                      },
                    }))
                  }
                />
              </td>
              <td>
                <input
                  className="bmr-cell-input"
                  value={data.page10.coding_equipments_row1?.id || ''}
                  onChange={(e) =>
                    setData((p) => ({
                      ...p,
                      page10: {
                        ...p.page10,
                        coding_equipments_row1: {
                          ...p.page10.coding_equipments_row1,
                          id: e.target.value,
                        },
                      },
                    }))
                  }
                />
              </td>
              <td>
                <BmrDateField
                  className="bmr-cell-input"
                  value={data.page10.coding_equipments_row1?.date_cleaned || ''}
                  onChange={(e) =>
                    setData((p) => ({
                      ...p,
                      page10: {
                        ...p.page10,
                        coding_equipments_row1: {
                          ...p.page10.coding_equipments_row1,
                          date_cleaned: e.target.value,
                        },
                      },
                    }))
                  }
                />
              </td>
              <td>
                <input
                  className="bmr-cell-input"
                  value={data.page10.coding_equipments_row1?.prev_batch || ''}
                  placeholder=""
                  onChange={(e) =>
                    setData((p) => ({
                      ...p,
                      page10: {
                        ...p.page10,
                        coding_equipments_row1: {
                          ...p.page10.coding_equipments_row1,
                          prev_batch: e.target.value,
                        },
                      },
                    }))
                  }
                />
              </td>
              <td>
                <input
                  className="bmr-cell-input"
                  value={data.page10.coding_equipments_row1?.cleaned_by || ''}
                  placeholder=""
                  onChange={(e) =>
                    setData((p) => ({
                      ...p,
                      page10: {
                        ...p.page10,
                        coding_equipments_row1: {
                          ...p.page10.coding_equipments_row1,
                          cleaned_by: e.target.value,
                        },
                      },
                    }))
                  }
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {renderFooter(10)}
    </div>
  )

  const renderPage11 = () => (
    <div className="bmr-sheet bmr-drops-sheet" key="page-11">
      {renderHeader(11)}
      <div className="bmr-body">
        <table className="bmr-table" style={{ marginBottom: 3 }}>
          <colgroup>
            <col style={{ width: '25%' }} />
            <col style={{ width: '18%' }} />
            <col style={{ width: '19%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '18%' }} />
          </colgroup>
          <tbody>
            {(data.page11.coding_equipments || []).map((eq, idx) => (
              <tr key={idx}>
                <td>{eq.equip}</td>
                <td>{eq.id}</td>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={eq.date_cleaned}
                    onChange={(e) => {
                      const updated = [...data.page11.coding_equipments]
                      updated[idx].date_cleaned = e.target.value
                      updatePage('page11', 'coding_equipments', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={eq.prev_batch}
                    placeholder=""
                    onChange={(e) => {
                      const updated = [...data.page11.coding_equipments]
                      updated[idx].prev_batch = e.target.value
                      updatePage('page11', 'coding_equipments', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={eq.cleaned_by}
                    placeholder=""
                    onChange={(e) => {
                      const updated = [...data.page11.coding_equipments]
                      updated[idx].cleaned_by = e.target.value
                      updatePage('page11', 'coding_equipments', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-sign-row" style={{ margin: '2pt 0 3pt', display: 'flex', justifyContent: 'space-between', fontSize: '8.5pt' }}>
          <div>
            <strong>Checked By/Date (Packing) : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page11.checked_by_date || ''}
              placeholder=""
              onChange={(e) => updatePage('page11', 'checked_by_date', e.target.value)}
            />
          </div>
          <div>
            <strong>Verified By/Date (QA): </strong>
            <input
              className="bmr-line-input"
              style={{ width: 120 }}
              value={data.page11.verified_by_date || ''}
              placeholder=""
              onChange={(e) => updatePage('page11', 'verified_by_date', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title">PACKING DETAILS:</div>
        <div style={{ margin: '1pt 0 3pt', fontSize: '8.5pt' }}>
          <strong>Packing Type: Pet Bottle /Glass Bottle: </strong>
          <input
            className="bmr-line-input"
            style={{ width: 180 }}
            value={data.page11.packing_type}
            onChange={(e) => updatePage('page11', 'packing_type', e.target.value)}
          />
        </div>

        <div className="bmr-section-title">STEREO DETAILS FOR LABEL AND CARTONS:</div>
        <table className="bmr-table">
          <colgroup>
            <col style={{ width: '16%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '14%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Batch No.</th>
              <th>Mfg. Date</th>
              <th>Exp. Date/ Best Before</th>
              <th>MRP Rs. Incl. of taxes</th>
              <th>Checked By Packing Sup.</th>
              <th>Checked by QA</th>
            </tr>
          </thead>
          <tbody>
            {(data.page11.stereo_details || []).map((st, idx) => (
              <tr key={idx}>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={st.batch_no}
                    onChange={(e) => {
                      const updated = [...data.page11.stereo_details]
                      updated[idx].batch_no = e.target.value
                      updatePage('page11', 'stereo_details', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={formatDateDDMMYYYY(st.mfg_date)}
                    onChange={(e) => {
                      const updated = [...data.page11.stereo_details]
                      updated[idx].mfg_date = e.target.value
                      updatePage('page11', 'stereo_details', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={st.exp_date}
                    onChange={(e) => {
                      const updated = [...data.page11.stereo_details]
                      updated[idx].exp_date = e.target.value
                      updatePage('page11', 'stereo_details', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={st.mrp}
                    onChange={(e) => {
                      const updated = [...data.page11.stereo_details]
                      updated[idx].mrp = e.target.value
                      updatePage('page11', 'stereo_details', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={st.checked_by_pkg}
                    placeholder=""
                    onChange={(e) => {
                      const updated = [...data.page11.stereo_details]
                      updated[idx].checked_by_pkg = e.target.value
                      updatePage('page11', 'stereo_details', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={st.checked_by_qa}
                    placeholder=""
                    onChange={(e) => {
                      const updated = [...data.page11.stereo_details]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page11', 'stereo_details', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-section-title">LABEL / CARTON CODING:</div>
        <p style={{ margin: '1pt 0 2pt' }}>
          Send the labels/cartons for coding as per the requirements and record the details in below given format.
        </p>
      </div>
      {renderFooter(11)}
    </div>
  )

  const renderPage12 = () => {
    const codingRows = (data.page12.coding_records && data.page12.coding_records.length > 0)
      ? data.page12.coding_records
      : (data.page12.coding_materials && data.page12.coding_materials.length > 0)
        ? data.page12.coding_materials
        : [
            { sr: '1', material: 'Label', qty_given: '', qty_rej: '', qty_rec: '' },
            { sr: '2', material: 'Carton', qty_given: '', qty_rej: '', qty_rec: '' },
          ]

    const handleUpdateCodingRow = (idx, field, val) => {
      const updated = [...codingRows]
      updated[idx] = { ...updated[idx], [field]: val }
      setData((p) => ({
        ...p,
        page12: {
          ...p.page12,
          coding_records: updated,
          coding_materials: updated,
        },
      }))
    }

    const timeRows = (data.page12.coding_time_records && data.page12.coding_time_records.length > 0)
      ? data.page12.coding_time_records
      : [
          { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
          { date: '', from_time: '', to_time: '', done_by: '', checked_by_pkg: '', checked_by_qa: '' },
        ]

    const handleUpdateTimeRow = (idx, field, val) => {
      const updated = [...timeRows]
      updated[idx] = { ...updated[idx], [field]: val }
      setData((p) => ({
        ...p,
        page12: {
          ...p.page12,
          coding_time_records: updated,
        },
      }))
    }

    return (
      <div className="bmr-sheet bmr-drops-sheet" key="page-12">
        {renderHeader()}
        <div className="bmr-body bmr-p12-body">
          <div className="bmr-section-title" style={{ margin: '1pt 0 1pt' }}>LABEL / CARTON CODING:</div>
          <p style={{ margin: '1pt 0 2pt', fontSize: '8.5pt' }}>
            Send the labels/cartons for coding as per the requirements and record the details in below given format.
          </p>

          <table className="bmr-table" style={{ marginBottom: 3 }}>
            <colgroup>
              <col style={{ width: '8%' }} />
              <col style={{ width: '32%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: 'center' }}>Sr. No.</th>
                <th>Packing Material</th>
                <th>Qty. given for coding Nos.</th>
                <th>Qty. Rej. Nos.</th>
                <th>Qty. Rec. for Pkg. Nos.</th>
              </tr>
            </thead>
            <tbody>
              {codingRows.map((row, idx) => (
                <tr key={idx}>
                  <td style={{ textAlign: 'center' }}>{row.sr}</td>
                  <td>{row.material}</td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.qty_given}
                      onChange={(e) => handleUpdateCodingRow(idx, 'qty_given', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.qty_rej}
                      onChange={(e) => handleUpdateCodingRow(idx, 'qty_rej', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.qty_rec}
                      onChange={(e) => handleUpdateCodingRow(idx, 'qty_rec', e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <table className="bmr-table" style={{ marginBottom: 3 }}>
            <colgroup>
              <col style={{ width: '18%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '22%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead>
              <tr>
                <th rowSpan={2}>Date</th>
                <th colSpan={2} style={{ textAlign: 'center' }}>Time(Hrs)</th>
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
              {timeRows.map((row, idx) => (
                <tr key={idx}>
                  <td>
                    <BmrDateField
                      className="bmr-cell-input"
                      value={row.date}
                      onChange={(e) => handleUpdateTimeRow(idx, 'date', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      className="bmr-cell-input"
                      value={row.from_time}
                      onChange={(e) => handleUpdateTimeRow(idx, 'from_time', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="time"
                      className="bmr-cell-input"
                      value={row.to_time}
                      onChange={(e) => handleUpdateTimeRow(idx, 'to_time', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.done_by}
                      placeholder="Sign"
                      onChange={(e) => handleUpdateTimeRow(idx, 'done_by', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_by_pkg}
                      placeholder="Sign"
                      onChange={(e) => handleUpdateTimeRow(idx, 'checked_by_pkg', e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      className="bmr-cell-input"
                      value={row.checked_by_qa}
                      placeholder="Sign"
                      onChange={(e) => handleUpdateTimeRow(idx, 'checked_by_qa', e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="bmr-section-title" style={{ margin: '2pt 0 1pt' }}>PACKING AREA LINE CLEARANCE:</div>
          <div style={{ display: 'flex', gap: 30, margin: '1pt 0 2pt', fontSize: '8.5pt' }}>
            <div>
              <strong>Previous Product: </strong>
              <input
                className="bmr-line-input"
                style={{ width: 160 }}
                value={data.page12.packing_area_clearance?.previous_product || ''}
                onChange={(e) =>
                  setData((p) => ({
                    ...p,
                    page12: {
                      ...p.page12,
                      packing_area_clearance: {
                        ...p.page12.packing_area_clearance,
                        previous_product: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>
            <div>
              <strong>Batch No. </strong>
              <input
                className="bmr-line-input"
                style={{ width: 120 }}
                value={data.page12.packing_area_clearance?.previous_batch_no || ''}
                onChange={(e) =>
                  setData((p) => ({
                    ...p,
                    page12: {
                      ...p.page12,
                      packing_area_clearance: {
                        ...p.page12.packing_area_clearance,
                        previous_batch_no: e.target.value,
                      },
                    },
                  }))
                }
              />
            </div>
          </div>

          <table className="bmr-table" style={{ marginBottom: 3 }}>
            <colgroup>
              <col style={{ width: '8%' }} />
              <col style={{ width: '46%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '30%' }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: 'center' }}>Sr. No.</th>
                <th>Activity</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th>Checked By / sign Date</th>
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
                    {renderYesNo(data.page12.packing_area_clearance?.[row.id]?.status, (val) =>
                      setData((p) => ({
                        ...p,
                        page12: {
                          ...p.page12,
                          packing_area_clearance: {
                            ...p.page12.packing_area_clearance,
                            [row.id]: {
                              ...p.page12.packing_area_clearance?.[row.id],
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
                      value={data.page12.packing_area_clearance?.[row.id]?.sign_date || ''}
                      placeholder="Sign / Date"
                      onChange={(e) =>
                        setData((p) => ({
                          ...p,
                          page12: {
                            ...p.page12,
                            packing_area_clearance: {
                              ...p.page12.packing_area_clearance,
                              [row.id]: {
                                ...p.page12.packing_area_clearance?.[row.id],
                                sign_date: e.target.value,
                              },
                            },
                          },
                        }))
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ margin: '2pt 0 3pt', fontSize: '8.5pt' }}>
            <strong style={{ marginRight: 6 }}>Verified by/Date (QA) </strong>
            <BmrDateField
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page12.verified_by_qa_date}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page12', 'verified_by_qa_date', e.target.value)}
            />
          </div>

          <div className="bmr-section-title" style={{ margin: '2pt 0 1pt' }}>STICKER LABEL PASTING:</div>
          <div style={{ margin: '1pt 0 2pt', display: 'flex', gap: 24, alignItems: 'center' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontWeight: 600, fontSize: '8.5pt', whiteSpace: 'nowrap' }}>
              <input
                type="radio"
                name="sticker_pasting"
                value="Applicable"
                checked={data.page12.sticker_label_pasting_applicable === 'Applicable'}
                onChange={() => updatePage('page12', 'sticker_label_pasting_applicable', 'Applicable')}
              />
              Applicable
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontWeight: 600, fontSize: '8.5pt', whiteSpace: 'nowrap' }}>
              <input
                type="radio"
                name="sticker_pasting"
                value="Not Applicable"
                checked={data.page12.sticker_label_pasting_applicable === 'Not Applicable'}
                onChange={() => updatePage('page12', 'sticker_label_pasting_applicable', 'Not Applicable')}
              />
              Not Applicable
            </label>
          </div>
          <p style={{ margin: '1pt 0 2pt', fontSize: '8.5pt' }}>
            Clean the bottle if required. Affix the sticker label on bottle manually with proper alignment.
          </p>
        </div>
        {renderFooter(12)}
      </div>
    )
  }

  const renderPage13 = () => (
    <div className="bmr-sheet bmr-drops-sheet" key="page-13">
      {renderHeader(13)}
      <div className="bmr-body bmr-p13-body">
        <table className="bmr-table" style={{ marginBottom: 2 }}>
          <colgroup>
            <col style={{ width: '18%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2}>Date</th>
              <th colSpan={2} style={{ textAlign: 'center' }}>Time</th>
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
            {(data.page13.pasting_time_records || []).map((row, idx) => (
              <tr key={idx}>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date}
                    onChange={(e) => {
                      const updated = [...data.page13.pasting_time_records]
                      updated[idx].date = e.target.value
                      updatePage('page13', 'pasting_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    className="bmr-cell-input"
                    value={row.from_time}
                    onChange={(e) => {
                      const updated = [...data.page13.pasting_time_records]
                      updated[idx].from_time = e.target.value
                      updatePage('page13', 'pasting_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    className="bmr-cell-input"
                    value={row.to_time}
                    onChange={(e) => {
                      const updated = [...data.page13.pasting_time_records]
                      updated[idx].to_time = e.target.value
                      updatePage('page13', 'pasting_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by}
                    placeholder="Sign"
                    onChange={(e) => {
                      const updated = [...data.page13.pasting_time_records]
                      updated[idx].done_by = e.target.value
                      updatePage('page13', 'pasting_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_pkg}
                    placeholder="Sign"
                    onChange={(e) => {
                      const updated = [...data.page13.pasting_time_records]
                      updated[idx].checked_by_pkg = e.target.value
                      updatePage('page13', 'pasting_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa}
                    placeholder="Sign"
                    onChange={(e) => {
                      const updated = [...data.page13.pasting_time_records]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page13', 'pasting_time_records', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-section-title" style={{ margin: '1pt 0 1pt' }}>CARTONING:</div>
        <p style={{ margin: '1pt 0 1pt', fontSize: '8.5pt' }}>• Keep the bottle in individual duplex carton.</p>
        <p style={{ margin: '1pt 0 1pt', fontSize: '8.5pt' }}>• Ensure that the bottles are not wet.</p>
        <p style={{ margin: '1pt 0 2pt', fontSize: '8.5pt' }}>• Affix a cello tape on the carton if required</p>

        <table className="bmr-table" style={{ marginBottom: 2 }}>
          <colgroup>
            <col style={{ width: '18%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
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
            {(data.page13.cartoning_time_records || []).map((row, idx) => (
              <tr key={idx}>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date}
                    onChange={(e) => {
                      const updated = [...data.page13.cartoning_time_records]
                      updated[idx].date = e.target.value
                      updatePage('page13', 'cartoning_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    className="bmr-cell-input"
                    value={row.from_time}
                    onChange={(e) => {
                      const updated = [...data.page13.cartoning_time_records]
                      updated[idx].from_time = e.target.value
                      updatePage('page13', 'cartoning_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    className="bmr-cell-input"
                    value={row.to_time}
                    onChange={(e) => {
                      const updated = [...data.page13.cartoning_time_records]
                      updated[idx].to_time = e.target.value
                      updatePage('page13', 'cartoning_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by}
                    placeholder="Sign"
                    onChange={(e) => {
                      const updated = [...data.page13.cartoning_time_records]
                      updated[idx].done_by = e.target.value
                      updatePage('page13', 'cartoning_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_pkg}
                    placeholder="Sign"
                    onChange={(e) => {
                      const updated = [...data.page13.cartoning_time_records]
                      updated[idx].checked_by_pkg = e.target.value
                      updatePage('page13', 'cartoning_time_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa}
                    placeholder="Sign"
                    onChange={(e) => {
                      const updated = [...data.page13.cartoning_time_records]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page13', 'cartoning_time_records', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-section-title" style={{ margin: '1pt 0 1pt' }}>OUTER PACKING:</div>
        <p style={{ margin: '1pt 0 2pt', fontSize: '8.5pt' }}>
          Keep bottles / packed carton in inner outer corrugated box as per specified box size and close the box using BOPP gum tape. Affix a shipper label on it. Strap the outer corrugated box. Keep it on a palate.
        </p>

        <table className="bmr-table" style={{ marginBottom: 2 }}>
          <colgroup>
            <col style={{ width: '18%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '10%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '20%' }} />
            <col style={{ width: '20%' }} />
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
            {(data.page13.outer_packing_records || []).map((row, idx) => (
              <tr key={idx}>
                <td>
                  <BmrDateField
                    className="bmr-cell-input"
                    value={row.date}
                    onChange={(e) => {
                      const updated = [...data.page13.outer_packing_records]
                      updated[idx].date = e.target.value
                      updatePage('page13', 'outer_packing_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    className="bmr-cell-input"
                    value={row.from_time}
                    onChange={(e) => {
                      const updated = [...data.page13.outer_packing_records]
                      updated[idx].from_time = e.target.value
                      updatePage('page13', 'outer_packing_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    type="time"
                    className="bmr-cell-input"
                    value={row.to_time}
                    onChange={(e) => {
                      const updated = [...data.page13.outer_packing_records]
                      updated[idx].to_time = e.target.value
                      updatePage('page13', 'outer_packing_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.done_by}
                    placeholder="Sign"
                    onChange={(e) => {
                      const updated = [...data.page13.outer_packing_records]
                      updated[idx].done_by = e.target.value
                      updatePage('page13', 'outer_packing_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_pkg}
                    placeholder="Sign"
                    onChange={(e) => {
                      const updated = [...data.page13.outer_packing_records]
                      updated[idx].checked_by_pkg = e.target.value
                      updatePage('page13', 'outer_packing_records', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_by_qa}
                    placeholder="Sign"
                    onChange={(e) => {
                      const updated = [...data.page13.outer_packing_records]
                      updated[idx].checked_by_qa = e.target.value
                      updatePage('page13', 'outer_packing_records', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ margin: '3pt 0 1pt', fontSize: '8.5pt' }}>
          <div><strong>Prepare bonded slip and transfer the batch to FP store</strong></div>
          <div style={{ marginTop: '2pt', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Finish </span>
            <input
              className="bmr-line-input"
              style={{ width: 100, textAlign: 'center' }}
              value={data.page13.finish_bottles || ''}
              placeholder=""
              onChange={(e) => updatePage('page13', 'finish_bottles', e.target.value)}
            />
            <span>Bottles = </span>
            <input
              className="bmr-line-input"
              style={{ width: 100, textAlign: 'center' }}
              value={data.page13.finish_litres || ''}
              placeholder=""
              onChange={(e) => updatePage('page13', 'finish_litres', e.target.value)}
            />
            <span>Litres</span>
          </div>
        </div>
      </div>
      {renderFooter(13)}
    </div>
  )

  const renderPage14 = () => (
    <div className="bmr-sheet bmr-drops-sheet" key="page-14">
      {renderHeader(14)}
      <div className="bmr-body">
        <div style={{ margin: '3pt 0 5pt', fontSize: '8.5pt', lineHeight: '1.6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong style={{ width: 140 }}>Retain : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 85, textAlign: 'center' }}
              value={data.page14.retain_bottles || ''}
              placeholder=""
              onChange={(e) => updatePage('page14', 'retain_bottles', e.target.value)}
            />
            <span>Bottles = </span>
            <input
              className="bmr-line-input"
              style={{ width: 85, textAlign: 'center' }}
              value={data.page14.retain_litres || ''}
              placeholder=""
              onChange={(e) => updatePage('page14', 'retain_litres', e.target.value)}
            />
            <span>Litres</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong style={{ width: 140 }}>Analysis : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 85, textAlign: 'center' }}
              value={data.page14.analysis_bottles || ''}
              placeholder=""
              onChange={(e) => updatePage('page14', 'analysis_bottles', e.target.value)}
            />
            <span>Bottles = </span>
            <input
              className="bmr-line-input"
              style={{ width: 85, textAlign: 'center' }}
              value={data.page14.analysis_litres || ''}
              placeholder=""
              onChange={(e) => updatePage('page14', 'analysis_litres', e.target.value)}
            />
            <span>Litres</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong style={{ width: 140 }}>Total quantity packed : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 85, textAlign: 'center' }}
              value={data.page14.total_packed_bottles || ''}
              placeholder=""
              onChange={(e) => updatePage('page14', 'total_packed_bottles', e.target.value)}
            />
            <span>Bottles </span>
            <input
              className="bmr-line-input"
              style={{ width: 85, textAlign: 'center' }}
              value={data.page14.total_packed_litres || ''}
              placeholder=""
              onChange={(e) => updatePage('page14', 'total_packed_litres', e.target.value)}
            />
            <span>Litres</span>
          </div>
        </div>

        <div className="bmr-section-title" style={{ margin: '2pt 0 1pt' }}>PACKING MATERIAL RECONCILLATION:</div>
        <p style={{ margin: '1pt 0 3pt', fontSize: '8.5pt' }}>
          After completion of the packing operation, check and record the details of the PM in below given table.
        </p>

        <table className="bmr-table" style={{ fontSize: '7.5pt', marginBottom: 0 }}>
          <colgroup>
            <col style={{ width: '6%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} style={{ textAlign: 'center' }}>Sr. No.</th>
              <th rowSpan={2}>Packing Material</th>
              <th rowSpan={2}>AR No.</th>
              <th rowSpan={2}>Qty. Issued Nos.</th>
              <th colSpan={4} style={{ textAlign: 'center' }}>Quantity Rejected</th>
              <th rowSpan={2}>Qty. Used No.</th>
              <th rowSpan={2}>Qty. Returned Nos.</th>
              <th rowSpan={2}>Checked By (Pkg)</th>
              <th rowSpan={2}>Checked By (QA)</th>
            </tr>
            <tr>
              <th style={{ textAlign: 'center' }}>Coding Rejection</th>
              <th style={{ textAlign: 'center' }}>Online</th>
              <th style={{ textAlign: 'center' }}>Excess</th>
              <th style={{ textAlign: 'center' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {(data.page14.pm_reconciliation || []).map((row, idx) => (
              <tr key={idx}>
                <td style={{ textAlign: 'center' }}>{row.sr}</td>
                <td>{row.material}</td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.ar_no}
                    onChange={(e) => {
                      const updated = [...data.page14.pm_reconciliation]
                      updated[idx].ar_no = e.target.value
                      updatePage('page14', 'pm_reconciliation', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.issued}
                    onChange={(e) => {
                      const updated = [...data.page14.pm_reconciliation]
                      updated[idx].issued = e.target.value
                      updatePage('page14', 'pm_reconciliation', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.coding_rej}
                    onChange={(e) => {
                      const updated = [...data.page14.pm_reconciliation]
                      updated[idx].coding_rej = e.target.value
                      updatePage('page14', 'pm_reconciliation', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.online_rej}
                    onChange={(e) => {
                      const updated = [...data.page14.pm_reconciliation]
                      updated[idx].online_rej = e.target.value
                      updatePage('page14', 'pm_reconciliation', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.excess}
                    onChange={(e) => {
                      const updated = [...data.page14.pm_reconciliation]
                      updated[idx].excess = e.target.value
                      updatePage('page14', 'pm_reconciliation', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.total_rej}
                    onChange={(e) => {
                      const updated = [...data.page14.pm_reconciliation]
                      updated[idx].total_rej = e.target.value
                      updatePage('page14', 'pm_reconciliation', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.used}
                    onChange={(e) => {
                      const updated = [...data.page14.pm_reconciliation]
                      updated[idx].used = e.target.value
                      updatePage('page14', 'pm_reconciliation', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.returned}
                    onChange={(e) => {
                      const updated = [...data.page14.pm_reconciliation]
                      updated[idx].returned = e.target.value
                      updatePage('page14', 'pm_reconciliation', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_pkg}
                    placeholder="Sign"
                    onChange={(e) => {
                      const updated = [...data.page14.pm_reconciliation]
                      updated[idx].checked_pkg = e.target.value
                      updatePage('page14', 'pm_reconciliation', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_qa}
                    placeholder="Sign"
                    onChange={(e) => {
                      const updated = [...data.page14.pm_reconciliation]
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

  const renderPage15 = () => (
    <div className="bmr-sheet bmr-drops-sheet" key="page-15">
      {renderHeader(15)}
      <div className="bmr-body">
        <table className="bmr-table" style={{ fontSize: '7.5pt', marginBottom: 4 }}>
          <colgroup>
            <col style={{ width: '6%' }} />
            <col style={{ width: '14%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '6%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '11%' }} />
          </colgroup>
          <tbody>
            {(data.page15.pm_reconciliation_cont || []).map((row, idx) => (
              <tr key={idx}>
                <td style={{ textAlign: 'center' }}>{row.sr}</td>
                <td>{row.material}</td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.ar_no}
                    onChange={(e) => {
                      const updated = [...data.page15.pm_reconciliation_cont]
                      updated[idx].ar_no = e.target.value
                      updatePage('page15', 'pm_reconciliation_cont', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.issued}
                    onChange={(e) => {
                      const updated = [...data.page15.pm_reconciliation_cont]
                      updated[idx].issued = e.target.value
                      updatePage('page15', 'pm_reconciliation_cont', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.coding_rej}
                    onChange={(e) => {
                      const updated = [...data.page15.pm_reconciliation_cont]
                      updated[idx].coding_rej = e.target.value
                      updatePage('page15', 'pm_reconciliation_cont', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.online_rej}
                    onChange={(e) => {
                      const updated = [...data.page15.pm_reconciliation_cont]
                      updated[idx].online_rej = e.target.value
                      updatePage('page15', 'pm_reconciliation_cont', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.excess}
                    onChange={(e) => {
                      const updated = [...data.page15.pm_reconciliation_cont]
                      updated[idx].excess = e.target.value
                      updatePage('page15', 'pm_reconciliation_cont', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.total_rej}
                    onChange={(e) => {
                      const updated = [...data.page15.pm_reconciliation_cont]
                      updated[idx].total_rej = e.target.value
                      updatePage('page15', 'pm_reconciliation_cont', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.used}
                    onChange={(e) => {
                      const updated = [...data.page15.pm_reconciliation_cont]
                      updated[idx].used = e.target.value
                      updatePage('page15', 'pm_reconciliation_cont', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.returned}
                    onChange={(e) => {
                      const updated = [...data.page15.pm_reconciliation_cont]
                      updated[idx].returned = e.target.value
                      updatePage('page15', 'pm_reconciliation_cont', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_pkg}
                    placeholder=""
                    onChange={(e) => {
                      const updated = [...data.page15.pm_reconciliation_cont]
                      updated[idx].checked_pkg = e.target.value
                      updatePage('page15', 'pm_reconciliation_cont', updated)
                    }}
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.checked_qa}
                    placeholder=""
                    onChange={(e) => {
                      const updated = [...data.page15.pm_reconciliation_cont]
                      updated[idx].checked_qa = e.target.value
                      updatePage('page15', 'pm_reconciliation_cont', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-section-title">QA FINAL INSPECTION REPORT:</div>
        <table className="bmr-table">
          <colgroup>
            <col style={{ width: '18%' }} />
            <col style={{ width: '32%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '17%' }} />
            <col style={{ width: '17%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Unit</th>
              <th>Checking</th>
              <th>No. of unit</th>
              <th>Checked by/Date</th>
              <th>Checked by/Date (QA)</th>
            </tr>
          </thead>
          <tbody>
            {[
              { unit: 'Outer box', key: 'outer_box' },
              { unit: 'Inner box', key: 'inner_box' },
              { unit: 'Carton', key: 'carton' },
              { unit: 'Bottle', key: 'bottle' },
            ].map((item) => (
              <tr key={item.key}>
                <td>{item.unit}</td>
                <td>Quality and Quantity</td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={data.page15.qa_inspection?.[item.key]?.no_of_unit || ''}
                    onChange={(e) =>
                      setData((p) => ({
                        ...p,
                        page15: {
                          ...p.page15,
                          qa_inspection: {
                            ...p.page15.qa_inspection,
                            [item.key]: { ...p.page15.qa_inspection?.[item.key], no_of_unit: e.target.value },
                          },
                        },
                      }))
                    }
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={data.page15.qa_inspection?.[item.key]?.checked_by || ''}
                    placeholder=""
                    onChange={(e) =>
                      setData((p) => ({
                        ...p,
                        page15: {
                          ...p.page15,
                          qa_inspection: {
                            ...p.page15.qa_inspection,
                            [item.key]: { ...p.page15.qa_inspection?.[item.key], checked_by: e.target.value },
                          },
                        },
                      }))
                    }
                  />
                </td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={data.page15.qa_inspection?.[item.key]?.checked_qa || ''}
                    placeholder=""
                    onChange={(e) =>
                      setData((p) => ({
                        ...p,
                        page15: {
                          ...p.page15,
                          qa_inspection: {
                            ...p.page15.qa_inspection,
                            [item.key]: { ...p.page15.qa_inspection?.[item.key], checked_qa: e.target.value },
                          },
                        },
                      }))
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="bmr-section-title" style={{ margin: '3pt 0 2pt' }}>Yield and accountability</div>
        <div style={{ fontSize: '8.5pt', lineHeight: '1.6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>a) Quantity released/transferred to BSR by QA</span>
            <input
              className="bmr-line-input"
              style={{ width: 60, textAlign: 'center' }}
              value={data.page15.yield_release_qa_nos || ''}
              onChange={(e) => updatePage('page15', 'yield_release_qa_nos', e.target.value)}
            />
            <span>nos</span>
            <input
              className="bmr-line-input"
              style={{ width: 60, textAlign: 'center' }}
              value={data.page15.yield_release_qa_ltr || ''}
              onChange={(e) => updatePage('page15', 'yield_release_qa_ltr', e.target.value)}
            />
            <span>Ltr</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>b) QC sample/retained sample</span>
            <input
              className="bmr-line-input"
              style={{ width: 60, textAlign: 'center' }}
              value={data.page15.yield_qc_sample_nos || ''}
              onChange={(e) => updatePage('page15', 'yield_qc_sample_nos', e.target.value)}
            />
            <span>nos</span>
            <input
              className="bmr-line-input"
              style={{ width: 60, textAlign: 'center' }}
              value={data.page15.yield_qc_sample_ltr || ''}
              onChange={(e) => updatePage('page15', 'yield_qc_sample_ltr', e.target.value)}
            />
            <span>Ltr</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>c) Recoverable rejection</span>
            <input
              className="bmr-line-input"
              style={{ width: 120, textAlign: 'center' }}
              value={data.page15.yield_recov_rej_nos || ''}
              onChange={(e) => updatePage('page15', 'yield_recov_rej_nos', e.target.value)}
            />
            <span>nos</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>d) Recoverable rejection</span>
            <input
              className="bmr-line-input"
              style={{ width: 120, textAlign: 'center' }}
              value={data.page15.yield_recov_rej_liters || ''}
              onChange={(e) => updatePage('page15', 'yield_recov_rej_liters', e.target.value)}
            />
            <span>Liters</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>e) Non recoverable rejection</span>
            <input
              className="bmr-line-input"
              style={{ width: 120, textAlign: 'center' }}
              value={data.page15.yield_non_recov_rej_nos || ''}
              onChange={(e) => updatePage('page15', 'yield_non_recov_rej_nos', e.target.value)}
            />
            <span>nos</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>f) Non recoverable rejection</span>
            <input
              className="bmr-line-input"
              style={{ width: 120, textAlign: 'center' }}
              value={data.page15.yield_non_recov_rej_liters || ''}
              onChange={(e) => updatePage('page15', 'yield_non_recov_rej_liters', e.target.value)}
            />
            <span>Liters</span>
          </div>
        </div>
      </div>
      {renderFooter(15)}
    </div>
  )

  const renderPage16 = () => (
    <div className="bmr-sheet bmr-drops-sheet" key="page-16">
      {renderHeader(16)}
      <div className="bmr-body">
        <div className="bmr-section-title">FINAL YIELD:</div>
        <div style={{ margin: '14px 0 24px', lineHeight: '2.5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>
              Formula <span style={{ textDecoration: 'underline' }}>a + b x 100</span> =
              <br />
              <span style={{ paddingLeft: 60 }}>Batch size</span>
            </span>
            <input
              className="bmr-line-input"
              style={{ width: 220 }}
              value={data.page16.final_yield_calc}
              placeholder="Calculation"
              onChange={(e) => updatePage('page16', 'final_yield_calc', e.target.value)}
            />
            <span> = </span>
            <input
              className="bmr-line-input"
              style={{ width: 80, textAlign: 'center' }}
              value={data.page16.final_yield_percent}
              placeholder="%"
              onChange={(e) => updatePage('page16', 'final_yield_percent', e.target.value)}
            />
            <strong>% ( Limit NLT 97%)</strong>
          </div>
        </div>

        <div className="bmr-section-title">Accountability</div>
        <div style={{ margin: '14px 0 24px', lineHeight: '2.5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span>
              Formula <span style={{ textDecoration: 'underline' }}>a + b + c + d x 100</span> =
              <br />
              <span style={{ paddingLeft: 60 }}>Batch size</span>
            </span>
            <input
              className="bmr-line-input"
              style={{ width: 220 }}
              value={data.page16.accountability_calc}
              placeholder="Calculation"
              onChange={(e) => updatePage('page16', 'accountability_calc', e.target.value)}
            />
            <span> = </span>
            <input
              className="bmr-line-input"
              style={{ width: 80, textAlign: 'center' }}
              value={data.page16.accountability_percent}
              placeholder="%"
              onChange={(e) => updatePage('page16', 'accountability_percent', e.target.value)}
            />
            <strong>% ( Limit NLT 98%)</strong>
          </div>
        </div>
      </div>
      {renderFooter(16)}
    </div>
  )

    const renderPage17 = () => (
    <div className="bmr-sheet bmr-drops-sheet" key="page-17">
      {renderHeader(17)}
      <div className="bmr-body">
        <SpecimenUpload
          images={data.page17?.specimens || (data.page17?.specimen_image ? [data.page17.specimen_image] : [])}
          onChange={(newImages) => {
            updatePage('page17', 'specimens', newImages)
            if (newImages.length > 0) {
              updatePage('page17', 'specimen_image', newImages[0]?.dataUrl || newImages[0])
            } else {
              updatePage('page17', 'specimen_image', '')
            }
          }}
          maxHeight={450}
        />
      </div>
      {renderFooter(17)}
    </div>
  )

  const renderPage18 = () => (
    <div className="bmr-sheet bmr-drops-sheet" key="page-18">
      {renderHeader(18)}
      <div className="bmr-body">
        <div className="bmr-section-title" style={{ margin: '8pt 0 4pt' }}>
          DEVIATION :
        </div>
        <div style={{ fontWeight: 'bold', fontSize: '9pt', margin: '4pt 0 8pt' }}>
          A) YIELD DEVIATION: If yield is out of limit to justify the reason as below:
        </div>
        <div style={{ margin: '4pt 0 8pt', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1].map((idx) => (
            <input
              key={idx}
              className="bmr-line-input"
              style={{ width: '100%', borderBottom: '1px dotted #000', fontSize: '9pt' }}
              value={data.page18?.yield_deviation_lines?.[idx] || ''}
              placeholder="…………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………"
              onChange={(e) => {
                const updated = [...(data.page18?.yield_deviation_lines || ['', ''])]
                updated[idx] = e.target.value
                updatePage('page18', 'yield_deviation_lines', updated)
              }}
            />
          ))}
        </div>
      </div>
      {renderFooter(18)}
    </div>
  )

  const renderPage19 = () => (
    <div className="bmr-sheet bmr-drops-sheet" key="page-19">
      {renderHeader(19)}
      <div className="bmr-body">
        <div style={{ margin: '4pt 0 8pt', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1].map((idx) => (
            <input
              key={idx}
              className="bmr-line-input"
              style={{ width: '100%', borderBottom: '1px dotted #000', fontSize: '9pt' }}
              value={data.page19?.yield_deviation_lines?.[idx] || ''}
              placeholder="…………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………………"
              onChange={(e) => {
                const updated = [...(data.page19?.yield_deviation_lines || ['', ''])]
                updated[idx] = e.target.value
                updatePage('page19', 'yield_deviation_lines', updated)
              }}
            />
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '4pt 0 10pt', fontSize: '9pt' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong>Prepared by/ Date Production : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page19?.yield_dev_prod_sign || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page19', 'yield_dev_prod_sign', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong>Approved by/ Date QA : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page19?.yield_dev_qa_sign || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page19', 'yield_dev_qa_sign', e.target.value)}
            />
          </div>
        </div>

        <div className="bmr-section-title" style={{ margin: '6pt 0 3pt' }}>
          B) PROCEDURAL DEVIATION:
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
            {(data.page19?.procedural_deviations || [
              { sr: '1', details: '', action: '', raise_by: '', approved_qa: '' },
              { sr: '2', details: '', action: '', raise_by: '', approved_qa: '' },
              { sr: '3', details: '', action: '', raise_by: '', approved_qa: '' },
              { sr: '4', details: '', action: '', raise_by: '', approved_qa: '' },
              { sr: '5', details: '', action: '', raise_by: '', approved_qa: '' },
              { sr: '6', details: '', action: '', raise_by: '', approved_qa: '' },
            ]).map((row, idx) => (
              <tr key={idx} style={{ height: 24 }}>
                <td style={{ textAlign: 'center' }}>{row.sr || idx + 1}</td>
                <td>
                  <input
                    className="bmr-cell-input"
                    value={row.details || ''}
                    onChange={(e) => {
                      const updated = [...(data.page19?.procedural_deviations || [])]
                      if (!updated[idx]) updated[idx] = {}
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
                      if (!updated[idx]) updated[idx] = {}
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
                      if (!updated[idx]) updated[idx] = {}
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
                      if (!updated[idx]) updated[idx] = {}
                      updated[idx].approved_qa = e.target.value
                      updatePage('page19', 'procedural_deviations', updated)
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', justifyContent: 'space-between', margin: '8pt 0 10pt', fontSize: '9pt' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong>Prepared by/ Date Production : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page19?.proc_dev_prod_sign || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page19', 'proc_dev_prod_sign', e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <strong>Approved by/ Date QA : </strong>
            <input
              className="bmr-line-input"
              style={{ width: 140 }}
              value={data.page19?.proc_dev_qa_sign || ''}
              placeholder="Sign / Date"
              onChange={(e) => updatePage('page19', 'proc_dev_qa_sign', e.target.value)}
            />
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
