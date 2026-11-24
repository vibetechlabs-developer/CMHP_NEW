import React, { useRef } from 'react'

export default function SpecimenUpload({
  images = [],
  onChange,
  maxHeight = 360,
  instructionText = 'Attach the approved specimen of each carton/ label in below given space',
}) {
  const fileInputRef = useRef(null)

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    const readPromises = files.map((file) => {
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => {
          resolve({
            id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: file.name,
            dataUrl: reader.result,
          })
        }
        reader.readAsDataURL(file)
      })
    })

    Promise.all(readPromises).then((newImgs) => {
      const currentList = Array.isArray(images)
        ? images
        : (images ? [{ id: 'legacy-1', name: 'Specimen', dataUrl: images }] : [])
      onChange([...currentList, ...newImgs])
      if (fileInputRef.current) fileInputRef.current.value = ''
    })
  }

  const handleRemove = (id) => {
    const currentList = Array.isArray(images)
      ? images
      : (images ? [{ id: 'legacy-1', name: 'Specimen', dataUrl: images }] : [])
    onChange(currentList.filter((img) => img.id !== id && img.dataUrl !== id))
  }

  const imgList = Array.isArray(images)
    ? images
    : (images ? [{ id: 'legacy-1', name: 'Specimen', dataUrl: images }] : [])

  return (
    <div className="bmr-specimen-upload-wrapper" style={{ width: '100%' }}>
      {instructionText && (
        <p className="bmr-specimen-instruction" style={{
          margin: '8pt 0 6pt',
          fontSize: '10pt',
          fontWeight: 'normal',
          fontFamily: "'Times New Roman', Times, serif",
        }}>
          {instructionText}
        </p>
      )}

      <div
        className="bmr-specimen-upload-zone"
        style={{
          border: '1.5px dashed #94a3b8',
          borderRadius: '4px',
          minHeight: maxHeight,
          padding: '10pt',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: imgList.length ? 'flex-start' : 'center',
          background: '#ffffff',
          position: 'relative',
        }}
      >
        {/* On-screen controls - hidden in print */}
        <div className="no-print bmr-specimen-controls" style={{
          marginBottom: imgList.length ? '12px' : 0,
          textAlign: 'center',
        }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileChange}
            id="specimen-file-upload-input"
          />
          <label
            htmlFor="specimen-file-upload-input"
            className="bmr-specimen-upload-btn"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              background: '#0284c7',
              color: '#ffffff',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              userSelect: 'none',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}
          >
            📎 Choose File (Multiple Images Allowed)
          </label>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
            PNG, JPG, JPEG accepted. Images print directly inside the specimen space.
          </div>
        </div>

        {/* Thumbnails grid */}
        {imgList.length > 0 && (
          <div
            className="bmr-specimen-grid"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12pt',
              width: '100%',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {imgList.map((img, idx) => (
              <div
                key={img.id || idx}
                className="bmr-specimen-thumb-item"
                style={{
                  position: 'relative',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '4px',
                  background: '#ffffff',
                  maxWidth: imgList.length === 1 ? '95%' : (imgList.length === 2 ? '46%' : '30%'),
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <img
                  src={img.dataUrl || img}
                  alt={img.name || `Specimen ${idx + 1}`}
                  className="bmr-specimen-img"
                  style={{
                    maxWidth: '100%',
                    maxHeight: imgList.length === 1 ? `${maxHeight - 50}pt` : '140pt',
                    objectFit: 'contain',
                    display: 'block',
                  }}
                />
                <button
                  type="button"
                  className="no-print bmr-specimen-remove-btn"
                  onClick={() => handleRemove(img.id || img.dataUrl || img)}
                  title="Remove specimen image"
                  style={{
                    position: 'absolute',
                    top: '-8px',
                    right: '-8px',
                    width: '22px',
                    height: '22px',
                    borderRadius: '11px',
                    background: '#ef4444',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    lineHeight: '22px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
