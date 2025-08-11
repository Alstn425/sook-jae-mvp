import { useEffect, useState } from 'react'
import localforage from 'localforage'
import { supabase } from './lib/supabaseClient'

localforage.config({ name: 'sook-jae', storeName: 'homework_store' })

function App() {
  const [title, setTitle] = useState('')
  const [homeworks, setHomeworks] = useState([])
  const [isLoading, setIsLoading] = useState(true)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [user, setUser] = useState(null)
  const [syncing, setSyncing] = useState(false)

  // 1) 로컬 데이터 로드
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

  // 2) 로컬 저장
  useEffect(() => {
    if (isLoading) return
    localforage.setItem('homeworks', homeworks)
  }, [homeworks, isLoading])

  // 3) 세션 확인 및 auth 변경 구독
  useEffect(() => {
    let sub
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      setUser(data.session?.user ?? null)
      sub = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          // 로그인 직후 자동 동기화
          syncAll().catch(() => {})
        }
      })
    })()
    return () => { sub?.data?.subscription?.unsubscribe?.() }
  }, [])

  const addHomework = (e) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now())
    const now = Date.now()
    const newItem = { id, title: trimmed, done: false, createdAt: now, updatedAt: now }
    setHomeworks([newItem, ...homeworks])
    setTitle('')
  }

  const toggleDone = (id) => {
    const now = Date.now()
    setHomeworks(homeworks.map(h => h.id === id ? { ...h, done: !h.done, updatedAt: now } : h))
  }

  const removeItem = (id) => setHomeworks(homeworks.filter(h => h.id !== id))

  // 4) 이메일/비번 가입/로그인/로그아웃
  const signUp = async (e) => {
    e.preventDefault()
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) alert(error.message)
    else alert('회원가입 완료. 이제 로그인하세요.')
  }
  const signIn = async (e) => {
    e.preventDefault()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) alert(error.message)
    else await syncAll()
  }
  const signOut = async () => {
    await supabase.auth.signOut()
  }

  // 5) 동기화: 서버↔로컬 병합 후 서버 upsert 및 로컬 저장
  const syncAll = async () => {
    if (!user) { alert('로그인 후 동기화하세요.'); return }
    setSyncing(true)
    try {
      // 서버 데이터 가져오기
      const { data: serverRows, error: selErr } = await supabase
        .from('homeworks')
        .select('*')
      if (selErr) throw selErr

      const localById = new Map(homeworks.map(h => [h.id, h]))
      const serverById = new Map((serverRows || []).map(r => [r.id, r]))

      const mergedMap = new Map()

      // 공통/로컬 전용
      for (const [id, localItem] of localById.entries()) {
        const s = serverById.get(id)
        if (!s) {
          mergedMap.set(id, localItem) // 서버에 새로 올릴 항목
        } else {
          const serverItem = {
            id: s.id,
            title: s.title,
            done: s.done,
            createdAt: Number(s.created_at),
            updatedAt: Number(s.updated_at),
          }
          mergedMap.set(
            id,
            (localItem.updatedAt || 0) >= (serverItem.updatedAt || 0)
              ? localItem
              : serverItem
          )
          serverById.delete(id)
        }
      }
      // 서버 전용 나머지
      for (const [id, s] of serverById.entries()) {
        mergedMap.set(id, {
          id: s.id,
          title: s.title,
          done: s.done,
          createdAt: Number(s.created_at),
          updatedAt: Number(s.updated_at),
        })
      }

      const merged = Array.from(mergedMap.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))

      // 누락된 타임스탬프 보정: 서버 업서트 시 NOT NULL 위반 방지
      const nowTs = Date.now()
      const mergedWithTimestamps = merged.map((h) => {
        const createdAt = Number(
          h.createdAt ?? h.updatedAt ?? nowTs
        )
        const updatedAt = Number(
          h.updatedAt ?? h.createdAt ?? createdAt ?? nowTs
        )
        return { ...h, createdAt, updatedAt }
      })

      // 서버에 upsert (본인 데이터만)
      const upsertRows = mergedWithTimestamps.map(h => ({
        id: h.id,
        user_id: user.id,
        title: h.title,
        done: h.done,
        created_at: h.createdAt,
        updated_at: h.updatedAt,
      }))
      const { error: upErr } = await supabase.from('homeworks').upsert(upsertRows, { onConflict: 'id' })
      if (upErr) throw upErr

      // 로컬 저장 및 상태 반영
      await localforage.setItem('homeworks', mergedWithTimestamps)
      setHomeworks(mergedWithTimestamps)
      alert('동기화 완료')
    } catch (err) {
      console.error(err)
      alert('동기화 오류: ' + (err?.message || 'Unknown'))
    } finally {
      setSyncing(false)
    }
  }

  const remaining = homeworks.filter(h => !h.done).length

  return (
    <div style={{ maxWidth: 640, margin: '40px auto', padding: 16 }}>
      <h1>숙제 체크</h1>

      {!user ? (
        <form onSubmit={signIn} style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            type="email"
            required
            style={{ padding: 8 }}
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호(최소 6자)"
            type="password"
            required
            style={{ padding: 8 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit">로그인</button>
            <button type="button" onClick={signUp}>회원가입</button>
          </div>
        </form>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
          <span>로그인: {user.email}</span>
          <button onClick={signOut}>로그아웃</button>
          <button onClick={syncAll} disabled={syncing}>{syncing ? '동기화 중...' : '동기화'}</button>
        </div>
      )}

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
            <li
              key={h.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 0',
                borderBottom: '1px solid #eee',
              }}
            >
              <input type="checkbox" checked={h.done} onChange={() => toggleDone(h.id)} />
              <span
                style={{
                  flex: 1,
                  textDecoration: h.done ? 'line-through' : 'none',
                  color: h.done ? '#888' : '#000',
                }}
              >
                {h.title}
              </span>
              <button onClick={() => removeItem(h.id)}>삭제</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default App