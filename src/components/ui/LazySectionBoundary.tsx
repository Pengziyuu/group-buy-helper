import { Component, type ReactNode } from 'react'
import { ErrorState } from './AsyncState'

type Props = { children: ReactNode; onReload?: () => void }
type State = { failed: boolean }

export class LazySectionBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return <main className="live-state-shell"><ErrorState
        title="畫面暫時無法載入"
        message="請檢查網路連線後重新載入頁面。"
        actionLabel="重新載入頁面"
        onAction={this.props.onReload ?? (() => window.location.reload())}
        page
      /></main>
    }
    return this.props.children
  }
}
