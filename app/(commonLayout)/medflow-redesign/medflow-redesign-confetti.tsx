'use client'

import confetti from 'canvas-confetti'
import { useEffect, useRef } from 'react'

const colors = ['#111111', '#147047', '#f06e15', '#f5bf2e', '#749eb8']
const bursts = [
  { origin: { x: 0.5, y: 0.42 }, particleCount: 150, spread: 360, startVelocity: 42 },
  {
    angle: 66,
    origin: { x: 0.02, y: 1 },
    particleCount: 70,
    spread: 52,
    startVelocity: 48
  },
  {
    angle: 114,
    origin: { x: 0.98, y: 1 },
    particleCount: 70,
    spread: 52,
    startVelocity: 48
  }
] as const

export const MedFlowRedesignConfetti = ({ active }: { active: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!active || !canvas) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reducedMotion.matches) return

    const fire = confetti.create(canvas, { disableForReducedMotion: true, resize: true })
    const frame = window.requestAnimationFrame(() => {
      void Promise.all(
        bursts.map((burst) => fire({ ...burst, colors, disableForReducedMotion: true, ticks: 180 }))
      )
    })
    const stopForReducedMotion = () => {
      if (reducedMotion.matches) fire.reset()
    }

    reducedMotion.addEventListener('change', stopForReducedMotion)
    return () => {
      window.cancelAnimationFrame(frame)
      reducedMotion.removeEventListener('change', stopForReducedMotion)
      fire.reset()
    }
  }, [active])

  return active ? (
    <canvas ref={canvasRef} className="mf-redesign-confetti" tabIndex={-1} aria-hidden="true" />
  ) : null
}
