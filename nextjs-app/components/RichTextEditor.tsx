'use client'

import React from 'react'
import dynamic from 'next/dynamic'
import 'react-quill-new/dist/quill.snow.css'

// BUG CORRIGIDO (auditoria de cobertura de i18n em todas as páginas de
// cliente, retomada da validação "sem exceção"): placeholder de loading
// hardcoded em PT. O `loading` de dynamic() roda fora de qualquer
// componente React (sem acesso a hooks como useLang), então lê o idioma
// direto de document.documentElement.lang - já mantido sincronizado por
// lib/lang-context.tsx toda vez que o idioma muda ou na carga inicial.
const ReactQuill = dynamic(() => import('react-quill-new'), {
  ssr: false,
  loading: () => <p>{typeof document !== 'undefined' && document.documentElement.lang === 'es' ? 'Cargando editor...' : 'Carregando editor...'}</p>,
})


interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const modules = {
    toolbar: [
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      ['link']
    ]
  }

  return (
    <div className="quill-wrapper">
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        placeholder={placeholder}
      />
    </div>
  )
}
