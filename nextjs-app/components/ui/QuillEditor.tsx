'use client'

import React, { useMemo } from 'react'
import dynamic from 'next/dynamic'
import 'react-quill-new/dist/quill.snow.css'

// Importing dynamically to prevent Next.js SSR issues with Quill
const ReactQuill = dynamic(() => import('react-quill-new'), { 
  ssr: false,
  loading: () => <div style={{ height: 140, padding: '1rem', border: '1px solid #e2e8f0', borderRadius: '0 0 12px 12px', background: '#f8fafc', color: '#94a3b8' }}>Carregando editor...</div>
})

interface QuillEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function QuillEditor({ value, onChange, placeholder }: QuillEditorProps) {
  const modules = useMemo(() => ({
    toolbar: [
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      ['link'],
      ['clean']
    ],
  }), [])

  return (
    <div className="quill-wrapper">
      <ReactQuill 
        theme="snow" 
        value={value} 
        onChange={onChange} 
        modules={modules}
        placeholder={placeholder}
      />
      <style jsx global>{`
        .quill-wrapper .ql-toolbar.ql-snow {
          box-sizing: border-box !important;
          width: 100% !important;
          border: 1px solid rgba(0,0,0,0.12) !important;
          border-radius: 12px 12px 0 0 !important;
          background: rgba(255,255,255,0.9);
          font-family: inherit;
          padding: 12px !important;
        }
        .quill-wrapper .ql-container.ql-snow {
          box-sizing: border-box !important;
          width: 100% !important;
          border: 1px solid rgba(0,0,0,0.12) !important;
          border-top: none !important;
          border-radius: 0 0 12px 12px !important;
          background: rgba(255,255,255,0.5);
          font-family: inherit;
          font-size: 0.95rem;
          transition: all .2s;
        }
        .quill-wrapper .ql-editor {
          min-height: 140px;
          padding: 1rem;
        }
        .quill-wrapper .ql-editor.ql-blank::before {
          font-style: normal;
          color: #94a3b8;
          font-size: 0.95rem;
          left: 1rem;
        }
        .quill-wrapper .ql-snow .ql-picker-label {
          font-family: inherit;
          font-weight: 600;
        }
        .quill-wrapper .ql-container.ql-snow:focus-within {
          background: #fff;
          border-color: #16a34a !important;
          box-shadow: 0 0 0 4px rgba(22,163,74,.12);
        }
      `}</style>
    </div>
  )
}
