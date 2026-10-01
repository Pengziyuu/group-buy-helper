import { configure } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'

// findBy*/waitFor give up after 1s by default, which a loaded CI runner can exceed while rendering.
configure({ asyncUtilTimeout: 5_000 })
