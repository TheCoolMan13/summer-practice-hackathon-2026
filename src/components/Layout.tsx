// Feature: show-up-2-move
// Layout wrapper component
// Provides consistent navigation and structure for all authenticated pages

import { ReactNode } from 'react'
import Navigation from './Navigation'

interface LayoutProps {
  children: ReactNode
}

/**
 * Layout
 *
 * Wraps authenticated pages with:
 *  - Navigation bar (with notification bell and user menu)
 *  - Main content area
 *  - Consistent styling and spacing
 */
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
    background: '#f9fafb',
  },
  main: {
    flex: 1,
  },
}
