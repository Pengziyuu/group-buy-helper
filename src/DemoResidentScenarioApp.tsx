import { useState } from 'react'
import App from './App'
import type { VisibleOrder } from './data/demo'
import type { DemoResidentScenario } from './data/demoResidentScenarios'

/** One made-up campaign; orders and binding live in memory so the page can be clicked through. */
export function DemoResidentScenarioApp({ scenario }: { scenario: DemoResidentScenario }) {
  const [orders, setOrders] = useState<VisibleOrder[]>(scenario.orders)
  const [customer, setCustomer] = useState(scenario.customer)

  return (
    <App
      publishedContent={scenario.content}
      campaignStatus={scenario.status}
      visibleOrders={orders}
      residentCustomer={customer}
      verifiedResidentIdentity={{ displayName: '測試住戶', pictureUrl: null }}
      onBindResident={async (input) => {
        const bound = { customerId: 'demo-scenario-me', name: '測試住戶', householdKind: input.kind, period: input.period, unit: input.unit }
        setCustomer(bound)
        return bound
      }}
      onSubmitOrder={async (items, customItems) => {
        const at = new Date().toISOString()
        setOrders((current) => {
          const existing = current.find((order) => order.customerId === customer?.customerId)
          if (existing) return current.map((order) => order === existing ? { ...order, items, customItems, updatedAt: at } : order)
          if (!customer) return current
          return [...current, { ...customer, pictureUrl: null, items, customItems, orderedAt: at, updatedAt: at }]
        })
      }}
    />
  )
}
