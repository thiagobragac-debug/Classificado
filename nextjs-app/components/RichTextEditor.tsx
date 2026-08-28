'use client'

import React from 'react'
import dynamic from 'next/dynamic'
import 'react-quill-new/dist/quill.snow.css'
import { useLang } from '@/lib/lang-context'

// BUG CORRIGIDO (auditoria de cobertura de i18n, revalidação do zero):
// placeholder de loading hardcoded em PT. A primeira tentativa de correção
// lia document.documentElement.lang diretamente, partindo da premissa
// (errada) de que o `loading` de dynamic() roda fora de qualquer
// componente React — na verdade ele É renderizado dentro da árvore React
// normal (recebe {isLoading, pastDelay, error} como props), então TEM
// acesso a hooks/Context, incluindo useLang(). `document` não existe
// durante o SSR (Node.js), então aquela versão sempre caía no ramo PT no
// HTML de primeiro paint — confirmado ao vivo via curl. useLang() resolve
// via LangContext, disponível durante o SSR (LangProvider já recebe
// initialLang do cookie no layout), então funciona corretamente nos dois
// momentos (SSR e client).
function QuillLoadingFallback() {
  const { lang } = useLang()
  return <p>{lang === 'es' ? 'Cargando editor...' : 'Carregando editor...'}</p>
}

const ReactQuill = dynamic(() => import('react-quill-new'), {
  ssr: false,
  loading: QuillLoadingFallback,
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
