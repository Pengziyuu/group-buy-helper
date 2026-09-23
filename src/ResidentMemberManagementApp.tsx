import { useEffect, useState } from 'react'
import { formatZhTwTimestamp } from './domain/timestamp'
import type { ResidentFilter } from './routing'
import type { ResidentMember, ResidentGroupStatusUpdate } from './services/residentMemberManagementGateway'
import { countResidents, matchesResidentFilter, matchesResidentSearch, residentHouseholdLabel } from './components/organizer/residentView'
import { Button } from './components/ui/Button'
import { ConfirmDialog } from './components/ui/ConfirmDialog'
import { FeedbackMessage } from './components/ui/FeedbackMessage'
import { Menu } from './components/ui/Menu'
import { SegmentedControl } from './components/ui/SegmentedControl'
import { StatusBadge } from './components/ui/StatusBadge'
import {
  type HouseholdKind,
  formatHouseholdUnit,
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
  initialFilter?: ResidentFilter
  onSetBlocked: (memberCode: string, blocked: boolean) => Promise<void>
  onUpdateHousehold: (memberCode: string, household: { kind: HouseholdKind; period: number | null; unit: string | null }) => Promise<void>
  onRefreshGroupStatuses?: (memberCodes: string[]) => Promise<ResidentGroupStatusUpdate[]>
}

const GROUP_CHECK_BATCH_SIZE = 20
const GROUP_CHECK_BUSY = 'group-check'

function groupStatusLabel(status: ResidentMember['groupStatus']): string {
  if (status === 'in_group') return '在群組內'
  if (status === 'not_in_group') return '不在群組'
  if (status === 'unknown') return '無法確認'
  return '尚未查驗'
}

function Avatar({ member }: { member: ResidentMember }) {
  if (member.pictureUrl) {
    return <img src={member.pictureUrl} alt={`${member.displayName}的LINE頭貼`} referrerPolicy="no-referrer" />
  }
  return <span aria-hidden="true">{member.displayName.slice(0, 1)}</span>
}

export default function ResidentMemberManagementApp({ members, initialFilter = 'all', onSetBlocked, onUpdateHousehold, onRefreshGroupStatuses }: Props) {
  const [visibleMembers, setVisibleMembers] = useState(members)
  const [filter, setFilter] = useState<ResidentFilter>(initialFilter)
  const [query, setQuery] = useState('')
  const [removeTarget, setRemoveTarget] = useState<ResidentMember | null>(null)
  const [editTargetCode, setEditTargetCode] = useState('')
  const [editKind, setEditKind] = useState<HouseholdKind>('resident')
  const [editPeriod, setEditPeriod] = useState<ResidentPeriod>(2)
  const [editPrefix, setEditPrefix] = useState(1)
  const [editLetter, setEditLetter] = useState('A')
  const [editNumber, setEditNumber] = useState(1)
  const [busyCode, setBusyCode] = useState('')
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [groupCheckProgress, setGroupCheckProgress] = useState<{ done: number; total: number } | null>(null)

  useEffect(() => { setVisibleMembers(members) }, [members])

  const activeMembers = visibleMembers.filter((member) => !member.blocked)
  const counts = countResidents(visibleMembers)
  const shownMembers = visibleMembers.filter((member) => matchesResidentFilter(member, filter) && matchesResidentSearch(member, query))
  const groupCounts = {
    in: activeMembers.filter((member) => member.groupStatus === 'in_group').length,
    out: activeMembers.filter((member) => member.groupStatus === 'not_in_group').length,
  }

  const refreshAllGroupStatuses = async () => {
    if (busyCode || !onRefreshGroupStatuses) return
    const codes = activeMembers.map((member) => member.memberCode)
    if (codes.length === 0) return
    setBusyCode(GROUP_CHECK_BUSY)
    setError('')
    setFeedback('')
    let failed = 0
    try {
      for (let start = 0; start < codes.length; start += GROUP_CHECK_BATCH_SIZE) {
        setGroupCheckProgress({ done: start, total: codes.length })
        const batch = codes.slice(start, start + GROUP_CHECK_BATCH_SIZE)
        try {
          const statuses = new Map((await onRefreshGroupStatuses(batch)).map((status) => [status.memberCode, status]))
          if (batch.some((code) => !statuses.has(code))) throw new Error('群組查驗結果不完整')
          setVisibleMembers((current) => current.map((item) => {
            const status = statuses.get(item.memberCode)
            return status ? { ...item, groupStatus: status.groupStatus, groupCheckedAt: status.groupCheckedAt } : item
          }))
        } catch {
          // The server keeps the previous result for a batch it could not confirm.
          failed += batch.length
        }
      }
      if (failed > 0) setError(`${failed} 位暫時無法確認，原本的結果未變更，請稍後再試`)
      else setFeedback(`已更新 ${codes.length} 位住戶的群組狀態`)
    } finally {
      setGroupCheckProgress(null)
      setBusyCode('')
    }
  }

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
      setFeedback(blocked ? `已移除並封鎖${member.displayName}` : `已解除${member.displayName}的封鎖`)
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
    setEditKind(member.householdKind ?? 'resident')
    setError('')
    setFeedback('')
    setEditTargetCode(member.memberCode)
  }

  const updateHousehold = async (member: ResidentMember) => {
    if (busyCode) return
    const unit = formatHouseholdUnit({
      kind: editKind,
      period: editPeriod,
      prefix: editPeriod === 1 ? null : editPrefix,
      letter: editLetter,
      number: editNumber,
    })
    // 'other' has no household: formatHouseholdUnit returns null for that kind,
    // which is the value the CHECK constraint wants, not a validation failure.
    if (editKind === 'resident' && unit === null) return
    const household = editKind === 'other'
      ? { kind: 'other' as const, period: null, unit: null }
      : { kind: 'resident' as const, period: editPeriod, unit: unit! }
    setBusyCode(member.memberCode)
    setError('')
    setFeedback('')
    try {
      await onUpdateHousehold(member.memberCode, household)
      setVisibleMembers((current) => current.map((item) => item.memberCode === member.memberCode
        ? { ...item, householdKind: household.kind, period: household.period, unit: household.unit }
        : item))
      setFeedback(editKind === 'other' ? `已將${member.displayName}改為其他` : `已更新${member.displayName}的期別／戶號`)
      setEditTargetCode('')
    } catch (changeError) {
      setError(changeError instanceof Error ? changeError.message : '調整住戶資料失敗')
    } finally {
      setBusyCode('')
    }
  }

  return (
    <main className="organizer-page resident-member-management" aria-labelledby="resident-member-heading">
      <div className="organizer-page-heading">
        <h1 id="resident-member-heading">住戶 <span className="ui-num">{activeMembers.length} 位</span></h1>
      </div>

      <div className="resident-member-toolbar">
        <input
          className="ui-input resident-member-search"
          type="search"
          aria-label="搜尋住戶"
          placeholder="搜尋名字或戶號"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <SegmentedControl
          label="住戶篩選"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: '全部', count: counts.all },
            { value: 'unbound', label: '未填戶號', count: counts.unbound },
            { value: 'other', label: '其他', count: counts.other },
            { value: 'blocked', label: '已封鎖', count: counts.blocked },
          ]}
        />
      </div>

      {onRefreshGroupStatuses && (
        <section className="resident-group-check" aria-label="LINE群組查驗">
          <ul className="resident-group-summary" aria-label="正式群組狀態">
            <li><span className="resident-group-dot" data-status="in_group" aria-hidden="true" />在群組內 <strong>{groupCounts.in}</strong></li>
            <li><span className="resident-group-dot" data-status="not_in_group" aria-hidden="true" />不在群組 <strong>{groupCounts.out}</strong></li>
            <li><span className="resident-group-dot" data-status="unchecked" aria-hidden="true" />尚未查驗 <strong>{activeMembers.length - groupCounts.in - groupCounts.out}</strong></li>
          </ul>
          <Button
            variant="secondary"
            size="sm"
            aria-label="更新全部群組狀態"
            disabled={Boolean(busyCode) || activeMembers.length === 0}
            onClick={() => { void refreshAllGroupStatuses() }}
          >
            <span aria-hidden="true">↻</span>
            {groupCheckProgress ? `查驗中…${groupCheckProgress.done}/${groupCheckProgress.total}` : '更新全部群組狀態'}
          </Button>
          <p>群組狀態僅供核對，不會自動停用既有住戶。</p>
        </section>
      )}

      {feedback && <FeedbackMessage tone="success">{feedback}</FeedbackMessage>}
      {error && !removeTarget && <FeedbackMessage tone="error">{error}</FeedbackMessage>}
      {visibleMembers.length === 0
        ? <p className="resident-member-empty">目前還沒有住戶加入。</p>
        : shownMembers.length === 0 && <p className="resident-member-empty">沒有符合條件的住戶。</p>}

      <div className="resident-member-list">
        {shownMembers.map((member) => {
          const nameId = `resident-member-name-${member.memberCode}`
          const canEditHousehold = !member.blocked && (member.householdKind === 'other' || (member.period !== null && Boolean(member.unit)))
          return (
            <article key={member.memberCode} aria-labelledby={nameId} className={member.blocked ? 'resident-member-card is-blocked' : 'resident-member-card'}>
              <div className="resident-member-avatar"><Avatar member={member} /></div>
              <div className="resident-member-copy">
                <div className="resident-member-name">
                  <h2 id={nameId}>{member.displayName}</h2>
                  {member.blocked && <StatusBadge tone="neutral">已封鎖</StatusBadge>}
                </div>
                <p>{residentHouseholdLabel(member)}</p>
                <small>加入時間 {formatZhTwTimestamp(member.joinedAt)}</small>
                {onRefreshGroupStatuses && !member.blocked && (
                  <p className="resident-member-group-status">
                    <span className="resident-group-dot" data-status={member.groupStatus ?? 'unchecked'} aria-hidden="true" />
                    {groupStatusLabel(member.groupStatus)}
                  </p>
                )}
              </div>
              <div className="resident-member-actions">
                {canEditHousehold && (
                  <Button variant="utility" size="sm" aria-label={`調整住戶資料 ${member.displayName}`} disabled={Boolean(busyCode)} onClick={() => openHouseholdEditor(member)}>
                    調整戶號
                  </Button>
                )}
                {member.blocked ? (
                  <Button variant="utility" size="sm" aria-label={`解除封鎖 ${member.displayName}`} disabled={Boolean(busyCode)} onClick={() => { void changeBlocked(member, false) }}>
                    {busyCode === member.memberCode ? '處理中…' : '解除封鎖'}
                  </Button>
                ) : (
                  <Menu
                    size="sm"
                    label={`更多操作 ${member.displayName}`}
                    items={[{
                      label: '移除並封鎖',
                      ariaLabel: `移除並封鎖 ${member.displayName}`,
                      tone: 'danger',
                      disabled: Boolean(busyCode),
                      onSelect: () => { setError(''); setRemoveTarget(member) },
                    }]}
                  />
                )}
              </div>
              {editTargetCode === member.memberCode && (
                <div className="resident-household-editor" aria-label={`調整${member.displayName}的住戶資料`}>
                  <label><span>期別</span><select
                    aria-label={`${member.displayName} 期別`}
                    value={editKind === 'other' ? 'other' : editPeriod}
                    onChange={(event) => {
                      if (event.target.value === 'other') {
                        setEditKind('other')
                        return
                      }
                      setEditKind('resident')
                      setEditPeriod(Number(event.target.value) as ResidentPeriod)
                    }}
                  >
                    {RESIDENT_PERIODS.map((period) => <option key={period} value={period}>{new Intl.NumberFormat('zh-Hant-u-nu-hanidec').format(period)}期</option>)}
                    <option value="other">其他</option>
                  </select></label>
                  {editKind === 'resident' && <><fieldset className="resident-household-unit">
                    <legend>戶號</legend>
                    <div className="resident-household-unit-parts">
                      {editPeriod !== 1 && <label><span>數字</span><select aria-label={`${member.displayName} 戶號數字`} value={editPrefix} onChange={(event) => setEditPrefix(Number(event.target.value))}>
                        {HOUSEHOLD_PREFIXES.map((prefix) => <option key={prefix} value={prefix}>{prefix}</option>)}
                      </select></label>}
                      <label><span>英文字母</span><select aria-label={`${member.displayName} 戶號英文字母`} value={editLetter} onChange={(event) => setEditLetter(event.target.value)}>
                        {HOUSEHOLD_LETTERS.map((letter) => <option key={letter} value={letter}>{letter}</option>)}
                      </select></label>
                    </div>
                  </fieldset>
                  <label><span>樓層</span><select aria-label={`${member.displayName} 樓層`} value={editNumber} onChange={(event) => setEditNumber(Number(event.target.value))}>
                    {HOUSEHOLD_NUMBERS.map((number) => <option key={number} value={number}>{number}</option>)}
                  </select></label></>}
                  <div className="resident-household-editor-actions">
                    <Button variant="secondary" size="sm" disabled={Boolean(busyCode)} onClick={() => setEditTargetCode('')}>取消</Button>
                    <Button size="sm" aria-label={`儲存住戶資料 ${member.displayName}`} disabled={Boolean(busyCode)} onClick={() => { void updateHousehold(member) }}>
                      {busyCode === member.memberCode ? '儲存中…' : '儲存調整'}
                    </Button>
                  </div>
                </div>
              )}
            </article>
          )
        })}
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
    </main>
  )
}
