import { expect, test } from '@playwright/test'

test('serves the corporate presentation with images and synchronized bilingual navigation', async ({
  page
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  const response = await page.goto('/open-science/overview-corporate?lang=zh')
  expect(response?.status()).toBe(200)
  expect(response?.headers()['content-security-policy']).toContain("default-src 'self'")
  expect(response?.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin')
  await expect(page).toHaveTitle(/AIPOCH.*Expert Collaboration/)
  await expect(page.locator('iframe')).toHaveCount(2)
  await expect(page.locator('nav, footer')).toHaveCount(0)

  const chinese = page.frameLocator('#deck-zh')
  await expect(chinese.locator('.slide.active')).toHaveAttribute('data-page', '01')
  await expect(chinese.locator('body')).not.toContainText(/open\s*science/i)
  await expect
    .poll(async () =>
      chinese
        .locator('img')
        .evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0
          )
        )
    )
    .toBe(true)
  await chinese.locator('#nextBtn').click({ force: true })
  await expect(chinese.locator('.slide.active')).toHaveAttribute('data-page', '02')
  await chinese.getByRole('button', { name: 'Switch to English', exact: true }).click()
  const english = page.frameLocator('#deck-en')
  await expect(english.locator('.slide.active')).toHaveAttribute('data-page', '02')
  await expect(page).toHaveURL(/lang=en#slide-02$/)
  await expect(english.locator('body')).not.toContainText(/open\s*science/i)
  await page.screenshot({ path: test.info().outputPath('corporate-overview.png') })
  expect(errors).toEqual([])
})
