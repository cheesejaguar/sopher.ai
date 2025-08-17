import { describe, it, expect } from 'vitest'
import { useStore, type Message } from './zustand'

describe('useStore', () => {
  it('updates state through provided actions', () => {
    const initial = useStore.getState()

    const message: Message = {
      id: '1',
      role: 'user',
      content: 'hello',
      timestamp: new Date(),
    }

    initial.addMessage(message)
    expect(useStore.getState().messages).toEqual([message])

    initial.setGenerating(true)
    expect(useStore.getState().isGenerating).toBe(true)

    initial.setProgress(42)
    expect(useStore.getState().progress).toBe(42)

    initial.incrementCost(2.5)
    expect(useStore.getState().totalCost).toBe(2.5)
  })
})
