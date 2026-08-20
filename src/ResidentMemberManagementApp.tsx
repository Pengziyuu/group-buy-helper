import { useEffect, useState } from 'react'
import { formatZhTwTimestamp } from './domain/timestamp'
import type { ResidentMember } from './services/residentMemberManagementGateway'
import './ResidentMemberManagementApp.css'

type Props = {
  members: ResidentMember[]
  onSetBlocked: (memberCode: string, blocked: boolean) => Promise<void>
}

function householdLabel(member: ResidentMember): string {
  if (member.period === null || !member.unit) return '尚未綁定期別／戶號'
  const period = new Intl.NumberFormat('zh-Hant-u-nu-hanidec').format(member.period)
  return `${period}期・${member.unit}`
}

function Avatar({ member }: { member: ResidentMember }) {
  if (member.pictureUrl) {
    return <img src={member.pictureUrl} alt={`${member.displayName}的LINE頭貼`} referrerPolicy="no-referrer" />
  }
  return <span aria-hidden="true">{member.displayName.slice(0, 1)}</span>
}

export default function ResidentMemberManagementApp({ members, onSetBlocked }: Props) {
  const [visibleMembers, setVisibleMembers] = useState(members)
  const [removeTarget, setRemoveTarget] = useState<ResidentMember | null>(null)
  const [busyCode, setBusyCode] = useState('')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')

  useEffect(() => { setVisibleMembers(members) }, [members])

  const changeBlocked = async (member: ResidentMember, blocked: boolean) => {
    if (busyCode) return
    setBusyCode(member.memberCode)
    setError('')
    setFeedback('')
    try {
      await onSetBlocked(member.memberCode, blocked)
      setVisibleMembers((current) => current.map((item) => item.memberCode === member.memberCode
        ? { ...item, blocked, blockedAt: blocked ? new Date().toISOString() : null }
        : item))
      setFeedback(blocked
        ? `已移除並封鎖${member.displayName}`
        : `已解除${member.displayName}的封鎖`)
      setRemoveTarget(null)
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : '更新住戶狀態失敗')
    } finally {
      setBusyCode('')
    }
  }

  return (
    <section className="resident-member-management" aria-labelledby="resident-member-heading">
      <div className="resident-member-heading">
        <div>
          <p className="admin-eyebrow">LINE MEMBERS</p>
          <h2 id="resident-member-heading">住戶管理</h2>
          <p>名稱與頭貼來自LINE官方驗證；陌生住戶可移除並封鎖。</p>
        </div>
        <span>{visibleMembers.filter((member) => !member.blocked).length} 位住戶</span>
      </div>

      {feedback && <p className="resident-member-feedback" role="status">{feedback}</p>}
      {error && <p className="resident-member-error" role="alert">{error}</p>}
      {visibleMembers.length === 0 && <p className="resident-member-empty">目前還沒有住戶加入。</p>}

      <div className="resident-member-list">
        {visibleMembers.map((member) => (
          <article key={member.memberCode} className={member.blocked ? 'resident-member-card is-blocked' : 'resident-member-card'}>
            <div className="resident-member-avatar"><Avatar member={member} /></div>
            <div className="resident-member-copy">
              <div>
                <h3>{member.displayName}</h3>
                {member.blocked && <span>已封鎖</span>}
              </div>
              <p>{householdLabel(member)}</p>
              <small>加入時間 {formatZhTwTimestamp(member.joinedAt)}</small>
            </div>
            {member.blocked ? (
              <button type="button" className="secondary-action" aria-label={`解除封鎖 ${member.displayName}`} disabled={Boolean(busyCode)} onClick={() => { void changeBlocked(member, false) }}>
                {busyCode === member.memberCode ? '處理中…' : '解除封鎖'}
              </button>
            ) : (
              <button type="button" className="danger-link" aria-label={`移除並封鎖 ${member.displayName}`} disabled={Boolean(busyCode)} onClick={() => setRemoveTarget(member)}>
                移除並封鎖
              </button>
            )}
          </article>
        ))}
      </div>

      {removeTarget && (
        <div className="campaign-delete-backdrop">
          <section className="campaign-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="resident-remove-heading">
            <h2 id="resident-remove-heading">確認移除住戶</h2>
            <p>確定要移除並封鎖「{removeTarget.displayName}」嗎？</p>
            <p>對方將立即失去住戶存取權，除非團主日後解除封鎖。</p>
            {error && <p role="alert">{error}</p>}
            <div>
              <button type="button" className="secondary-action" disabled={Boolean(busyCode)} onClick={() => { setRemoveTarget(null); setError('') }}>取消</button>
              <button type="button" className="danger-action" disabled={Boolean(busyCode)} onClick={() => { void changeBlocked(removeTarget, true) }}>
                {busyCode ? '處理中…' : '確認移除並封鎖'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  )
}
