import { expect, test } from '@playwright/test'

test('serves the standalone Open-Science overview at the clean route', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  const response = await page.goto('/open-science/overview?lang=zh')

  expect(response?.status()).toBe(200)
  expect(response?.headers()['content-security-policy']).toContain("default-src 'self'")
  expect(response?.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin')
  await expect(page).toHaveTitle(/AIPOCH.*Open-Science/i)
  await expect(page.locator('iframe')).toHaveCount(2)
  await expect(page.locator('nav')).toHaveCount(0)
  await expect(page.locator('footer')).toHaveCount(0)

  const chineseDeck = page.frameLocator('#deck-zh')
  await expect(chineseDeck.getByText('01 / 16', { exact: true })).toBeVisible()
  await expect(chineseDeck.locator('.slide.active')).toBeVisible()

  // Keep the brand on one line in the hero and community diagram, retaining the hero's yellow highlight.
  const highlightedBrand = chineseDeck.locator('.hero-title .highlight-text')
  await expect(highlightedBrand).toHaveText('Open-Science')
  await expect(highlightedBrand).toHaveCSS('background-color', 'rgb(241, 221, 103)')
  await expect(chineseDeck.locator('.hero-title br')).toHaveCount(0)
  await expect(chineseDeck.locator('.community-core strong')).toHaveText('Open-Science')
  await expect(chineseDeck.locator('.community-core strong br')).toHaveCount(0)

  await expect(chineseDeck.locator('img')).not.toHaveCount(0)
  await chineseDeck.locator('#nextBtn').click({ force: true })
  await expect(chineseDeck.getByText('02 / 16', { exact: true })).toBeVisible()
  expect(consoleErrors).toEqual([])
})
