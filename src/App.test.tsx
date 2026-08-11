import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('customer campaign app', () => {
  it('shows the verified campaign progress and visible order wall', () => {
    render(<App />)

    expect(screen.getByRole('heading', { name: '一涼製冰所 超厚三明治冰餅' })).toBeInTheDocument()
    expect(screen.getByText('62 / 100')).toBeInTheDocument()
    expect(screen.getByText('還差 38 個成團')).toBeInTheDocument()
    expect(screen.getByText('斯祈')).toBeInTheDocument()
    expect(screen.getByText('佩怡')).toBeInTheDocument()
  })

  it('lets the signed-in customer update only their own order', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: '增加 牛奶' }))
    expect(screen.getByText('我的訂單 7 個')).toBeInTheDocument()
    expect(screen.getByText('$315')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '送出訂單' }))
    expect(screen.getByText('63 / 100')).toBeInTheDocument()
    expect(screen.getByText('訂單已更新')).toBeInTheDocument()
  })
})
