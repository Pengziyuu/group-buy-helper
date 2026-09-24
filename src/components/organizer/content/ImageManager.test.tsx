import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { CampaignImage } from '../../../services/demoCampaignStore'
import { ImageManager } from './ImageManager'

const png = (name: string) => new File(['image'], name, { type: 'image/png' })

function Harness({ initial = [], onUploadImage, onUploadingChange = vi.fn() }: {
  initial?: CampaignImage[]
  onUploadImage?: (file: File) => Promise<string>
  onUploadingChange?: (uploading: boolean) => void
}) {
  const [images, setImages] = useState(initial)
  return (
    <ImageManager
      images={images}
      disabled={false}
      onUploadImage={onUploadImage}
      onAddImage={(src) => setImages((current) => [...current, { src, alt: `第 ${current.length + 1} 張商品圖片` }])}
      onRemoveImage={(index) => setImages((current) => current.filter((_, currentIndex) => currentIndex !== index))}
      onUploadingChange={onUploadingChange}
    />
  )
}

const tiles = () => within(screen.getByRole('list', { name: /^商品圖片，共/ })).getAllByRole('listitem')

describe('ImageManager', () => {
  it('uploads every selected image in order and marks the first as the cover', async () => {
    const user = userEvent.setup()
    const onUploadImage = vi.fn(async (file: File) => `https://storage.test/${file.name}`)
    const onUploadingChange = vi.fn()
    render(<Harness onUploadImage={onUploadImage} onUploadingChange={onUploadingChange} />)

    const input = screen.getByLabelText<HTMLInputElement>('加入圖片')
    expect(input).toHaveAttribute('multiple')
    await user.upload(input, [png('a.png'), png('b.png')])

    await waitFor(() => expect(screen.getByRole('list', { name: '商品圖片，共 2 張' })).toBeInTheDocument())
    expect(onUploadImage.mock.calls.map(([file]) => file.name)).toEqual(['a.png', 'b.png'])
    expect(within(tiles()[0]).getByText('封面')).toBeInTheDocument()
    expect(within(tiles()[1]).queryByText('封面')).not.toBeInTheDocument()
    await waitFor(() => expect(onUploadingChange.mock.calls).toEqual([[true], [false]]))
    expect(input.files).toHaveLength(0)
  })

  it('keeps the images that uploaded and names the one that failed', async () => {
    const user = userEvent.setup()
    const onUploadImage = vi.fn(async (file: File) => {
      if (file.name === 'big.png') throw new Error('圖片不可超過 5 MB')
      return `https://storage.test/${file.name}`
    })
    render(<Harness onUploadImage={onUploadImage} />)

    await user.upload(screen.getByLabelText('加入圖片'), [png('a.png'), png('big.png'), png('c.png')])

    expect(await screen.findByRole('alert')).toHaveTextContent('「big.png」上傳失敗：圖片不可超過 5 MB')
    await waitFor(() => expect(screen.getByRole('list', { name: '商品圖片，共 2 張' })).toBeInTheDocument())
    expect(onUploadImage).toHaveBeenCalledTimes(3)
  })

  it('uploads only as many images as there is room for and names the rest', async () => {
    const user = userEvent.setup()
    const onUploadImage = vi.fn(async (file: File) => `https://storage.test/${file.name}`)
    const nine = Array.from({ length: 9 }, (_, index) => ({ src: `/${index}.png`, alt: `第 ${index + 1} 張商品圖片` }))
    render(<Harness initial={nine} onUploadImage={onUploadImage} />)

    await user.upload(screen.getByLabelText('加入圖片'), [png('x.png'), png('y.png'), png('z.png')])

    await waitFor(() => expect(screen.getByRole('list', { name: '商品圖片，共 10 張' })).toBeInTheDocument())
    expect(onUploadImage).toHaveBeenCalledTimes(1)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('「y.png」沒有加入：最多 10 張')
    expect(alert).toHaveTextContent('「z.png」沒有加入：最多 10 張')
    await waitFor(() => expect(screen.getByLabelText('加入圖片')).toBeDisabled())
  })

  it('locks the picker and shows progress while uploading', async () => {
    const user = userEvent.setup()
    let finish!: (url: string) => void
    const onUploadImage = vi.fn(() => new Promise<string>((resolve) => { finish = resolve }))
    render(<Harness onUploadImage={onUploadImage} />)

    await user.upload(screen.getByLabelText('加入圖片'), png('a.png'))
    expect(screen.getByLabelText('加入圖片')).toBeDisabled()
    expect(screen.getByText('上傳中 1／1…')).toBeInTheDocument()

    finish('https://storage.test/a.png')
    await waitFor(() => expect(screen.getByLabelText('加入圖片')).toBeEnabled())
    expect(screen.queryByText(/上傳中/)).not.toBeInTheDocument()
  })

  it('handles a mobile picker that only fires input', async () => {
    const onUploadImage = vi.fn(async () => 'https://storage.test/phone.png')
    render(<Harness onUploadImage={onUploadImage} />)

    fireEvent.input(screen.getByLabelText('加入圖片'), { target: { files: [png('Samsung照片.png')] } })

    await waitFor(() => expect(screen.getByRole('list', { name: '商品圖片，共 1 張' })).toBeInTheDocument())
    expect(onUploadImage).toHaveBeenCalledTimes(1)
  })

  it('removes an image by its label', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[{ src: '/a.png', alt: '第 1 張商品圖片' }, { src: '/b.png', alt: '第 2 張商品圖片' }]} onUploadImage={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '移除 第 2 張商品圖片' }))

    expect(screen.getByRole('list', { name: '商品圖片，共 1 張' })).toBeInTheDocument()
  })

  it('adds images by address in the local demo', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    expect(screen.queryByLabelText('加入圖片')).not.toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: '圖片網址' }), '/second.svg')
    await user.click(screen.getByRole('button', { name: '新增圖片' }))

    expect(screen.getByRole('list', { name: '商品圖片，共 1 張' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: '圖片網址' })).toHaveValue('')
  })
})
