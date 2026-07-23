import os
import re

def main():
    app_dir = r"c:\classificado\nextjs-app\app\(public)\login"
    components_dir = os.path.join(app_dir, "components")

    # 1. Update page.tsx for Skeleton Loader
    page_path = os.path.join(app_dir, "page.tsx")
    with open(page_path, 'r', encoding='utf-8') as f:
        page_content = f.read()

    skeleton_css = """<div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: '400px', margin: '0 auto' }}>
            <div style={{ height: '40px', background: 'rgba(0,0,0,0.05)', borderRadius: '99px', marginBottom: '1.5rem' }}></div>
            <div style={{ height: '48px', background: 'rgba(0,0,0,0.05)', borderRadius: '12px', marginBottom: '1.5rem' }}></div>
            <div style={{ height: '16px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px', width: '30%', marginBottom: '0.5rem' }}></div>
            <div style={{ height: '48px', background: 'rgba(0,0,0,0.05)', borderRadius: '12px', marginBottom: '1rem' }}></div>
            <div style={{ height: '16px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px', width: '30%', marginBottom: '0.5rem' }}></div>
            <div style={{ height: '48px', background: 'rgba(0,0,0,0.05)', borderRadius: '12px', marginBottom: '2rem' }}></div>
            <div style={{ height: '48px', background: 'rgba(0,0,0,0.05)', borderRadius: '12px' }}></div>
          </div>"""
    
    page_content = page_content.replace(
        """<Suspense fallback={<div style={{ padding: '4rem', textAlign: 'center' }}>Carregando...</div>}>""",
        f"""<Suspense fallback={{{skeleton_css}}}>"""
    )
    with open(page_path, 'w', encoding='utf-8') as f:
        f.write(page_content)

    # 2. Update LoginBanner.tsx for next/image
    banner_path = os.path.join(components_dir, "LoginBanner.tsx")
    with open(banner_path, 'r', encoding='utf-8') as f:
        banner_content = f.read()

    banner_content = banner_content.replace("import Link from 'next/link'", "import Link from 'next/link'\nimport Image from 'next/image'")
    banner_content = banner_content.replace("""<div className="login-banner">""", """<div className="login-banner">
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <Image 
          src="/assets/hero_farm.webp" 
          alt="Fundo rural agro" 
          fill
          priority
          style={{ objectFit: 'cover' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(22, 163, 74, 0.8), rgba(6, 78, 59, 0.8))' }} />
      </div>
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>""")
    banner_content = banner_content.replace("""</div>\n    </div>""", """</div>\n      </div>\n    </div>""")
    
    # Also we need to clean up the CSS background for loginBanner in page.module.css since we moved it to Image
    css_path = os.path.join(app_dir, "page.module.css")
    with open(css_path, 'r', encoding='utf-8') as f:
        css_content = f.read()
    
    css_content = css_content.replace("""background: linear-gradient(135deg, rgba(22, 163, 74, 0.8), rgba(6, 78, 59, 0.8)), url('/assets/hero_farm.webp') center/cover;""", "/* background image handled by next/image in component */")
    with open(css_path, 'w', encoding='utf-8') as f:
        f.write(css_content)

    with open(banner_path, 'w', encoding='utf-8') as f:
        f.write(banner_content)

    # 3. Update AuthContainer.tsx for framer-motion
    auth_path = os.path.join(components_dir, "AuthContainer.tsx")
    with open(auth_path, 'r', encoding='utf-8') as f:
        auth_content = f.read()
    
    auth_content = auth_content.replace("import { useLang } from '@/lib/lang-context'", "import { useLang } from '@/lib/lang-context'\nimport { motion, AnimatePresence } from 'framer-motion'")
    
    auth_content = auth_content.replace("""{mode === 'login' && (
        <LoginForm 
          onSetAlert={handleSetAlert} 
          onNavigateToForgot={navigateToForgot} 
        />
      )}""", """<AnimatePresence mode="wait">
        {mode === 'login' && (
          <motion.div key="login" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }}>
            <LoginForm 
              onSetAlert={handleSetAlert} 
              onNavigateToForgot={navigateToForgot} 
            />
          </motion.div>
        )}""")
        
    auth_content = auth_content.replace("""{mode === 'register' && (
        <RegisterForm 
          onSetAlert={handleSetAlert} 
          onSuccess={() => setMode('login')} 
        />
      )}""", """{mode === 'register' && (
          <motion.div key="register" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
            <RegisterForm 
              onSetAlert={handleSetAlert} 
              onSuccess={() => setMode('login')} 
            />
          </motion.div>
        )}""")
        
    auth_content = auth_content.replace("""{mode === 'forgot_password' && (
        <ForgotPasswordForm 
          onSetAlert={handleSetAlert} 
          onBack={() => { setMode('login'); setAlertInfo(null); }} 
          initialEmail={forgotEmail}
        />
      )}""", """{mode === 'forgot_password' && (
          <motion.div key="forgot" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.2 }}>
            <ForgotPasswordForm 
              onSetAlert={handleSetAlert} 
              onBack={() => { setMode('login'); setAlertInfo(null); }} 
              initialEmail={forgotEmail}
            />
          </motion.div>
        )}
      </AnimatePresence>""")

    with open(auth_path, 'w', encoding='utf-8') as f:
        f.write(auth_content)

    # 4. Update LoginForm.tsx
    login_path = os.path.join(components_dir, "LoginForm.tsx")
    with open(login_path, 'r', encoding='utf-8') as f:
        login_content = f.read()

    login_content = login_content.replace("import { useLang } from '@/lib/lang-context'", "import { useLang } from '@/lib/lang-context'\nimport { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react'")
    
    # Fix the redirect logic
    login_content = login_content.replace("""let safeRedirect = '/painel'
      if (redirect) {
        try {
          const resolved = new URL(redirect, window.location.origin)
          if (resolved.origin === window.location.origin) {
            safeRedirect = resolved.pathname + resolved.search
          } else {
            if (redirect.startsWith('/')) safeRedirect = redirect;
          }
        } catch {
          if (redirect.startsWith('/')) safeRedirect = redirect;
        }
      }""", """let safeRedirect = '/painel'
      if (redirect && redirect.startsWith('/')) {
        if (!redirect.startsWith('//')) {
          safeRedirect = redirect;
        }
      }""")

    # Replace SVG for Email
    login_content = re.sub(r'<svg viewBox="0 0 24 24"[^>]*>.*?</svg>', '<Mail size={18} aria-hidden="true" style={{ position: "absolute", left: "1rem", color: "var(--clr-muted)" }} />', login_content, count=1)
    
    # Replace SVG for Password
    login_content = re.sub(r'<svg viewBox="0 0 24 24"[^>]*><rect[^>]*></rect><path[^>]*></path></svg>', '<Lock size={18} aria-hidden="true" style={{ position: "absolute", left: "1rem", color: "var(--clr-muted)" }} />', login_content, count=1)

    # Replace Toggle Password SVGs
    login_content = re.sub(
        r'<svg viewBox="0 0 24 24"[^>]*>.*?\{showPassword \? \(.*?<path[^>]*></path><line[^>]*></line></>.*?\) : \(.*?<path[^>]*></path><circle[^>]*></circle></>.*?\}*?</svg>',
        '{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}',
        login_content,
        flags=re.DOTALL
    )

    # Update Submit Button
    login_content = login_content.replace(
        """{loading ? t('auth_login_ing') : t('auth_login_btn')}""",
        """{loading ? <><Loader2 size={20} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} /> {t('auth_login_ing')}</> : t('auth_login_btn')}"""
    )
    # Add animation style to global css for spin if it doesn't exist. Actually I can just use a style block or assume nextjs has some tailwind or raw css.
    # Better to use raw css or inline a style tag. Wait, I will just add standard `spin` keyframes in `page.module.css` or `globals.css` if missing.
    # Let's add it to `page.module.css`
    with open(css_path, 'a', encoding='utf-8') as f:
        f.write("\n@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }\n")

    # A11y Focus on Toggle button
    login_content = login_content.replace(
        """aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}""",
        """aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword}"""
    )
    login_content = login_content.replace(
        """style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}""",
        """style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', outline: 'none' }} className="focus-ring" """
    )
    
    with open(login_path, 'w', encoding='utf-8') as f:
        f.write(login_content)

    print("Success")

if __name__ == '__main__':
    main()
