// Feature: show-up-2-move
// Layout wrapper that provides the app shell for authenticated pages.

import { ReactNode } from 'react'
import Navigation from './Navigation'
import { gradients } from '../lib/theme'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div style={styles.container}>
      <Navigation />
      <main style={styles.main}>{children}</main>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: gradients.brandBg,
    backgroundAttachment: 'fixed',
  },
  main: {
    flex: 1,
    width: '100%',
    maxWidth: 1200,
    margin: '0 auto',
    padding: '24px 24px 64px',
  },
}
