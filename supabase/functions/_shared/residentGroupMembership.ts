export type ResidentGroupStatus = 'in_group' | 'not_in_group' | 'unknown'
type LookupOptions = { fetcher?: typeof fetch; deadlineMs?: number; concurrency?: number }

export async function checkResidentGroupMemberships(
  groupId: string,
  subjects: string[],
  accessToken: string,
  { fetcher = fetch, deadlineMs = 8_000, concurrency = 4 }: LookupOptions = {},
): Promise<ResidentGroupStatus[]> {
  const result: ResidentGroupStatus[] = subjects.map(() => 'unknown')
  if (!groupId || !accessToken || subjects.length === 0) return result
  const controller = new AbortController()
  let expire!: (value: number) => void
  const expired = new Promise<number>((resolve) => { expire = resolve })
  const timer = setTimeout(() => { controller.abort(); expire(0) }, Math.min(8_000, Math.max(1, deadlineMs)))
  const base = `https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}`
  async function status(path: string): Promise<number> {
    if (controller.signal.aborted) return 0
    return await Promise.race([
      expired,
      Promise.resolve().then(() => fetcher(base + path, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
        redirect: 'error',
      })).then((response) => {
        // No profile body is needed; never persist or log it.
        void response.body?.cancel().catch(() => {})
        return response.status
      }).catch(() => 0),
    ])
  }
  let next = 0
  try {
    await Promise.all(Array.from({ length: Math.min(subjects.length, 4, Math.max(1, concurrency)) }, async () => {
      while (next < subjects.length && !controller.signal.aborted) {
        const index = next++
        const memberStatus = await status(`/member/${encodeURIComponent(subjects[index])}`)
        if (memberStatus === 200) result[index] = 'in_group'
        // 404 alone can also mean the bot left the group.
        else if (memberStatus === 404 && await status('/summary') === 200) result[index] = 'not_in_group'
      }
    }))
    return result
  } finally {
    clearTimeout(timer)
  }
}
