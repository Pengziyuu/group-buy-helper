import { useEffect, useState } from 'react'
import { formatZhTwTimestamp } from './domain/timestamp'
import type { ResidentMember } from './services/residentMemberManagementGateway'
import { ConfirmDialog } from './components/ui/ConfirmDialog'
import { FeedbackMessage } from './components/ui/FeedbackMessage'
import {
  formatHouseholdUnit,
  formatResidentPeriod,
  HOUSEHOLD_LETTERS,
  HOUSEHOLD_NUMBERS,
  HOUSEHOLD_PREFIXES,
  parseHouseholdUnit,
  RESIDENT_PERIODS,
  type ResidentPeriod,
} from './domain/household'
import './ResidentMemberManagementApp.css'

type Props = {
  members: ResidentMember[]
  onSetBlocked: (memberCode: string, blocked: boolean) => Promise<void>
  onUpdateHousehold: (memberCode: string, household: { period: number; unit: string }) => Promise<void>
}

function householdLabel(member: ResidentMember): string {
  if (member.period === null || !member.unit) return '尚未綁定期別／戶號'
  return `${formatResidentPeriod(member.period)}・${member.unit}`
}

function Avatar({ member }: { member: ResidentMember }) {
  if (member.pictureUrl) {
    return <img src={member.pictureUrl} alt={`${member.displayName}的LINE頭貼`} referrerPolicy="no-referrer" />
  }
  return <span aria-hidden="true">{member.displayName.slice(0, 1)}</span>
}

export default function ResidentMemberManagementApp({ members, onSetBlocked, onUpdateHousehold }: Props) {
  const [visibleMembers, setVisibleMembers] = useState(members)
  const [removeTarget, setRemoveTarget] = useState<ResidentMember | null>(null)
  const [editTargetCode, setEditTargetCode] = useState('')
  const [editPeriod, setEditPeriod] = useState<ResidentPeriod>(2)
  const [editPrefix, setEditPrefix] = useState(1)
  const [editLetter, setEditLetter] = useState('A')
  const [editNumber, setEditNumber] = useState(1)
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

  const openHouseholdEditor = (member: ResidentMember) => {
    const period = RESIDENT_PERIODS.includes(member.period as ResidentPeriod)
      ? member.period as ResidentPeriod
      : 2
    try {
      const parsed = parseHouseholdUnit(period, member.unit ?? '')
      setEditPeriod(parsed.period)
      setEditPrefix(parsed.prefix ?? 1)
      setEditLetter(parsed.letter)
      setEditNumber(parsed.number)
    } catch {
      const partial = (member.unit ?? '').toUpperCase().match(/([A-Z])([1-9]|1[0-5])$/)
      setEditPeriod(period)
      setEditPrefix(1)
      setEditLetter(partial?.[1] ?? 'A')
      setEditNumber(Number(partial?.[2] ?? 1))
    }
    setError('')
    setFeedback('')
    setEditTargetCode(member.memberCode)
  }

  const updateHousehold = async (member: ResidentMember) => {
    if (busyCode) return
    const unit = formatHouseholdUnit({
      period: editPeriod,
      prefix: editPeriod === 1 ? null : editPrefix,
      letter: editLetter,
      number: editNumber,
    })
    setBusyCode(member.memberCode)
    setError('')
    setFeedback('')
    try {
      await onUpdateHousehold(member.memberCode, { period: editPeriod, unit })
      setVisibleMembers((current) => current.map((item) => item.memberCode === member.memberCode
        ? { ...item, period: editPeriod, unit }
        : item))
      setFeedback(`已更新${member.displayName}的期別／戶號`)
      setEditTargetCode('')
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : '調整住戶資料失敗')
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

      {feedback && <FeedbackMessage tone="success">{feedback}</FeedbackMessage>}
      {error && <FeedbackMessage tone="error">{error}</FeedbackMessage>}
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
            <div className="resident-member-actions">
              {member.period !== null && member.unit && (
                <button type="button" className="resident-action resident-action-secondary" aria-label={`調整住戶資料 ${member.displayName}`} disabled={Boolean(busyCode)} onClick={() => openHouseholdEditor(member)}>
                  <span aria-hidden="true">✎</span>調整期別／戶號
                </button>
              )}
              {member.blocked ? (
                <button type="button" className="resident-action resident-action-secondary" aria-label={`解除封鎖 ${member.displayName}`} disabled={Boolean(busyCode)} onClick={() => { void changeBlocked(member, false) }}>
                  <span aria-hidden="true">↺</span>{busyCode === member.memberCode ? '處理中…' : '解除封鎖'}
                </button>
              ) : (
                <button type="button" className="resident-action resident-action-danger" aria-label={`移除並封鎖 ${member.displayName}`} disabled={Boolean(busyCode)} onClick={() => setRemoveTarget(member)}>
                  <span aria-hidden="true">⊘</span>移除並封鎖
                </button>
              )}
            </div>
            {editTargetCode === member.memberCode && (
              <div className="resident-household-editor" aria-label={`調整${member.displayName}的住戶資料`}>
                <label><span>期別</span><select aria-label={`${member.displayName} 期別`} value={editPeriod} onChange={(event) => setEditPeriod(Number(event.target.value) as ResidentPeriod)}>
                  {RESIDENT_PERIODS.map((period) => <option key={period} value={period}>{new Intl.NumberFormat('zh-Hant-u-nu-hanidec').format(period)}期</option>)}
                </select></label>
                {editPeriod !== 1 && <label><span>前段</span><select aria-label={`${member.displayName} 前段`} value={editPrefix} onChange={(event) => setEditPrefix(Number(event.target.value))}>
                  {HOUSEHOLD_PREFIXES.map((prefix) => <option key={prefix} value={prefix}>{prefix}</option>)}
                </select></label>}
                <label><span>棟別</span><select aria-label={`${member.displayName} 棟別`} value={editLetter} onChange={(event) => setEditLetter(event.target.value)}>
                  {HOUSEHOLD_LETTERS.map((letter) => <option key={letter} value={letter}>{letter}</option>)}
                </select></label>
                <label><span>號碼</span><select aria-label={`${member.displayName} 號碼`} value={editNumber} onChange={(event) => setEditNumber(Number(event.target.value))}>
                  {HOUSEHOLD_NUMBERS.map((number) => <option key={number} value={number}>{number}</option>)}
                </select></label>
                <div className="resident-household-editor-actions">
                  <button type="button" className="secondary-action" disabled={Boolean(busyCode)} onClick={() => setEditTargetCode('')}>取消</button>
                  <button type="button" className="primary-action" aria-label={`儲存住戶資料 ${member.displayName}`} disabled={Boolean(busyCode)} onClick={() => { void updateHousehold(member) }}>
                    {busyCode === member.memberCode ? '儲存中…' : '儲存調整'}
                  </button>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>

      {removeTarget && (
        <ConfirmDialog
          title="確認移除住戶"
          confirmLabel="確認移除並封鎖"
          busy={Boolean(busyCode)}
          onCancel={() => { setRemoveTarget(null); setError('') }}
          onConfirm={() => { void changeBlocked(removeTarget, true) }}
        >
            <p>確定要移除並封鎖「{removeTarget.displayName}」嗎？</p>
            <p>對方將立即失去住戶存取權，除非團主日後解除封鎖。</p>
            {error && <FeedbackMessage tone="error">{error}</FeedbackMessage>}
        </ConfirmDialog>
      )}
    </section>
  )
}
