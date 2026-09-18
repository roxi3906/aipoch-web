import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'

import { MedFlowRedesignExperience } from '../../app/(commonLayout)/medflow-redesign/medflow-redesign-experience'

const textFromMarkup = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

const cssRule = (css: string, selector: string) => {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`))?.[1] ?? ''
}

describe('MedFlow redesign page', () => {
  test('renders every error result exposed by the original preview', () => {
    const invalidHtml = renderToStaticMarkup(
      <MedFlowRedesignExperience initialState="error" submissionResult="success" />
    )
    const serverHtml = renderToStaticMarkup(
      <MedFlowRedesignExperience initialState="server" submissionResult="success" />
    )
    const duplicateHtml = renderToStaticMarkup(
      <MedFlowRedesignExperience initialState="duplicate" submissionResult="success" />
    )

    expect(textFromMarkup(invalidHtml)).toContain('Enter a valid email address.')
    expect(textFromMarkup(serverHtml)).toContain(
      'We couldn’t submit your request. Please try again.'
    )
    expect(textFromMarkup(duplicateHtml)).toContain('This email is already on the waitlist.')
  })

  test('restores the full accessible success state', () => {
    const html = renderToStaticMarkup(
      <MedFlowRedesignExperience initialState="success" submissionResult="success" />
    )
    const text = textFromMarkup(html)

    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('aria-labelledby="mf-redesign-success-title"')
    expect(html).toContain('id="mf-redesign-success-title"')
    expect(html).toContain('class="mf-redesign-success-name"')
    expect(text).toContain("You're in, Dr. Maya Chen !")
    expect(text).toContain('While you wait — join the community and follow along:')
    expect(text).toContain('SIGNAL RECEIVED')
    expect(text).toContain('Explore AIPOCH →')
  })

  test('uses real image assets and preserves external-link protections', () => {
    const html = renderToStaticMarkup(
      <MedFlowRedesignExperience initialState="completed" submissionResult="success" />
    )

    expect(html).toContain('<img')
    expect(html).not.toContain('>◉<')
    expect(html).toContain(
      'href="https://aipoch.com/privacy-policy" target="_blank" rel="noreferrer"'
    )
  })

  test('matches the preview typography and constrains the dynamic success name', () => {
    const css = readFileSync('app/(commonLayout)/medflow-redesign/medflow-redesign.css', 'utf8')
    const backgroundRule = cssRule(css, '.mf-redesign-background')
    const titleRule = cssRule(css, '.mf-redesign-intro h1')
    const promiseRule = cssRule(css, '.mf-redesign-promise')
    const promiseEmphasisRule = cssRule(css, '.mf-redesign-promise em')

    expect(css).toContain('var(--font-inter)')
    expect(css).toContain('var(--font-mono)')
    expect(css).not.toContain('var(--font-dm-serif-display)')
    expect(titleRule).toContain('font-family: Georgia, "Times New Roman", serif')
    expect(titleRule).toContain('font-size: 78px')
    expect(promiseRule).toContain('font-family: Georgia, "Times New Roman", serif')
    expect(promiseEmphasisRule).toContain('font-style: italic')
    expect(backgroundRule).toContain('top: 330px')
    expect(backgroundRule).toContain('left: 50%')
    expect(backgroundRule).toContain('width: 1440px')
    expect(backgroundRule).toContain('height: 810px')
    expect(css).toMatch(/\.mf-redesign-success-name\s*\{[\s\S]*?min-width:\s*0/)
    expect(css).toMatch(/\.mf-redesign-success-name\s*\{[\s\S]*?text-overflow:\s*ellipsis/)
  })
})
