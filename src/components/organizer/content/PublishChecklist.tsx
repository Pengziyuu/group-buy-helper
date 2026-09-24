export function PublishChecklist({ blockers }: { blockers: string[] }) {
  return (
    <section className="content-checklist" aria-labelledby="content-checklist-heading">
      <h3 id="content-checklist-heading">發布前檢查</h3>
      {blockers.length === 0 ? (
        <p className="content-checklist-ready"><span aria-hidden="true">✓ </span>必填項目都已完成</p>
      ) : (
        <ul>{blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul>
      )}
    </section>
  )
}
