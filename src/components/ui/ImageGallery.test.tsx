import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ImageGallery } from './ImageGallery'

const images = [
  { src: '/one.jpg', alt: '第一張' },
  { src: '/two.jpg', alt: '第二張' },
  { src: '/three.jpg', alt: '第三張' },
]

describe('ImageGallery', () => {
  it('shows one large image and opens the viewer at that image', async () => {
    const user = userEvent.setup()
    const open = vi.fn()
    render(<ImageGallery images={[images[0]]} onOpen={open} />)

    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '放大檢視 第 1 張圖片：第一張' }))
    expect(open).toHaveBeenCalledWith(0)
  })

  it('switches the large image from the thumbnails', async () => {
    const user = userEvent.setup()
    const open = vi.fn()
    render(<ImageGallery images={images} onOpen={open} />)

    const thumbnails = screen.getByRole('group', { name: '共 3 張圖片' })
    expect(within(thumbnails).getByRole('button', { name: '顯示第 1 張圖片' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(thumbnails).getByRole('button', { name: '顯示第 3 張圖片' }))
    expect(within(thumbnails).getByRole('button', { name: '顯示第 3 張圖片' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: '放大檢視 第 3 張圖片：第三張' }))
    expect(open).toHaveBeenCalledWith(2)
  })

  it('replaces a broken image with a notice but keeps the other images reachable', async () => {
    const user = userEvent.setup()
    render(<ImageGallery images={images} onOpen={vi.fn()} />)

    fireEvent.error(screen.getByRole('img', { name: '第一張' }))
    expect(screen.getByRole('status')).toHaveTextContent('圖片暫時無法顯示')
    await user.click(screen.getByRole('button', { name: '顯示第 2 張圖片' }))
    expect(screen.getByRole('button', { name: '放大檢視 第 2 張圖片：第二張' })).toBeInTheDocument()
  })

  it('renders nothing without images', () => {
    const { container } = render(<ImageGallery images={[]} onOpen={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
