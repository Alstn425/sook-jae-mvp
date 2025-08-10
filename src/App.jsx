// src/App.jsx
import { useEffect, useState } from 'react'
import localforage from 'localforage'

localforage.config({ name: 'sook-jae', storeName: 'homework_store' })

function App() {
  const [title, setTitle] = useState('')
  const [homeworks, setHomeworks] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const saved = (await localforage.getItem('homeworks')) || []
      if (mounted) {
        setHomeworks(saved)
        setIsLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (isLoading) return
    localforage.setItem('homeworks', homeworks)
  }, [homeworks, isLoading])

  const addHomework = (e) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    const id = (crypto?.randomUUID?.() ?? String(Date.now()))
    setHomeworks([{ id, title: trimmed, done: false, createdAt: Date.now() }, ...homeworks])
    setTitle('')
  }

  const toggleDone = (id) =>
    setHomeworks(homeworks.map(h => h.id === id ? { ...h, done: !h.done } : h))
  const removeItem = (id) =>
    setHomeworks(homeworks.filter(h => h.id !== id))

  const remaining = homeworks.filter(h => !h.done).length

  return (
    <div style={{ maxWidth: 560, margin: '40px auto', padding: 16 }}>
      <h1>숙제 체크</h1>
      <form onSubmit={addHomework} style={{ display: 'flex', gap: 8 }}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 수학 10문제"
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit">추가</button>
      </form>
      <p>남은 숙제: {remaining}개</p>
      {homeworks.length === 0 ? (
        <p>등록된 숙제가 없습니다.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {homeworks.map((h) => (
            <li key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #eee' }}>
              <input type="checkbox" checked={h.done} onChange={() => toggleDone(h.id)} />
              <span style={{ flex: 1, textDecoration: h.done ? 'line-through' : 'none', color: h.done ? '#888' : '#000' }}>{h.title}</span>
              <button onClick={() => removeItem(h.id)}>삭제</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default App