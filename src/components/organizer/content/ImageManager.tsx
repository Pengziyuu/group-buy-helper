import { useRef, useState } from 'react'
import type { CampaignImage } from '../../../services/demoCampaignStore'
import { Button } from '../../ui/Button'
import { MAX_CAMPAIGN_IMAGES, splitImageUploads } from './contentChecks'

type ImageManagerProps = {
  images: CampaignImage[]
  disabled: boolean
  onUploadImage?: (file: File) => Promise<string>
  onAddImage: (src: string) => void
  onRemoveImage: (index: number) => void
  onUploadingChange: (uploading: boolean) => void
}

const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error)

export function ImageManager({ images, disabled, onUploadImage, onAddImage, onRemoveImage, onUploadingChange }: ImageManagerProps) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [imageUrl, setImageUrl] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  // Desktop pickers fire `input` then `change`; some phones fire only `input`. The first one wins.
  const uploadingRef = useRef(false)
  const uploading = progress !== null
  const full = images.length >= MAX_CAMPAIGN_IMAGES

  const clearPicker = () => {
    if (inputRef.current) inputRef.current.value = ''
  }

  const uploadFiles = async (files: File[]) => {
    if (!onUploadImage || uploadingRef.current || files.length === 0) return
    const { accepted, skipped } = splitImageUploads(files, images.length)
    const problems = skipped.map((file) => `「${file.name}」沒有加入：最多 ${MAX_CAMPAIGN_IMAGES} 張`)
    setErrors(problems)
    if (accepted.length === 0) {
      clearPicker()
      return
    }
    uploadingRef.current = true
    onUploadingChange(true)
    setProgress({ done: 0, total: accepted.length })
    try {
      for (const [index, file] of accepted.entries()) {
        try {
          onAddImage(await onUploadImage(file))
        } catch (error) {
          problems.push(`「${file.name}」上傳失敗：${messageOf(error)}`)
          setErrors([...problems])
        }
        setProgress({ done: index + 1, total: accepted.length })
      }
    } finally {
      uploadingRef.current = false
      setProgress(null)
      onUploadingChange(false)
      clearPicker()
    }
  }

  const pickerDisabled = disabled || uploading || full

  return (
    <div className="content-images">
      {images.length > 0 ? (
        <ul className="content-image-grid" aria-label={`商品圖片，共 ${images.length} 張`}>
          {images.map((image, index) => (
            <li key={`${image.src}-${index}`} className="content-image-tile">
              <img src={image.src} alt="" loading="lazy" />
              {index === 0 && <span className="content-image-cover">封面</span>}
              <Button
                variant="utility"
                size="sm"
                className="content-image-remove"
                aria-label={`移除 ${image.alt}`}
                disabled={disabled || uploading}
                onClick={() => onRemoveImage(index)}
              >
                移除
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="content-help">還沒有圖片。第一張會當作封面。</p>
      )}
      <div className="content-image-add">
        {onUploadImage ? (
          <label
            className="ui-button content-image-picker"
            data-variant="secondary"
            data-size="sm"
            data-disabled={pickerDisabled || undefined}
          >
            <input
              ref={inputRef}
              className="ui-visually-hidden"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              aria-label="加入圖片"
              disabled={pickerDisabled}
              onInput={(event) => { void uploadFiles(Array.from(event.currentTarget.files ?? [])) }}
              onChange={(event) => { void uploadFiles(Array.from(event.target.files ?? [])) }}
            />
            <span aria-hidden="true">＋ 加入圖片</span>
          </label>
        ) : (
          <>
            <label className="content-image-url">
              <span>圖片網址</span>
              <input
                className="ui-input"
                value={imageUrl}
                placeholder="https://…"
                disabled={disabled || full}
                onChange={(event) => setImageUrl(event.target.value)}
              />
            </label>
            <Button
              variant="secondary"
              size="sm"
              disabled={disabled || full || !imageUrl.trim()}
              onClick={() => {
                onAddImage(imageUrl.trim())
                setImageUrl('')
              }}
            >
              新增圖片
            </Button>
          </>
        )}
        <span className="content-image-count">{images.length} / {MAX_CAMPAIGN_IMAGES} 張</span>
      </div>
      <p className="content-help">
        {onUploadImage ? '可一次選多張，會依序上傳；支援 JPG、PNG、WebP，每張 5 MB 以內。' : '本機示範以圖片網址加入。'}
      </p>
      <p className="content-image-progress" aria-live="polite">
        {progress ? `上傳中 ${Math.min(progress.done + 1, progress.total)}／${progress.total}…` : ''}
      </p>
      {errors.length > 0 && (
        <ul className="content-image-errors" role="alert">
          {errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}
        </ul>
      )}
    </div>
  )
}
