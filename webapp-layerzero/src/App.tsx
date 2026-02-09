import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Deposit from './pages/Deposit'
import Send from './pages/Send'
import Withdraw from './pages/Withdraw'
import CrossChain from './pages/CrossChain'
import Receive from './pages/Receive'
import ImportNote from './pages/ImportNote'
import Settings from './pages/Settings'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="deposit" element={<Deposit />} />
        <Route path="send" element={<Send />} />
        <Route path="withdraw" element={<Withdraw />} />
        <Route path="receive" element={<Receive />} />
        <Route path="import" element={<ImportNote />} />
        <Route path="cross-chain" element={<CrossChain />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}

export default App
