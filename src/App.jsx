import { useEffect, useMemo, useRef, useState } from 'react'

const LOGIN = 'Nahel'
const PASSWORD = '2008'
const STORAGE_KEY = 'nahelboard.boards.v1'
const SESSION_KEY = 'nahelboard.loggedIn.v1'

const actorSvg = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 140">
  <rect width="140" height="140" rx="32" fill="#eaf2ff"/>
  <circle cx="70" cy="45" r="25" fill="#2563eb"/>
  <path d="M24 126c7-31 26-49 46-49s39 18 46 49" fill="#1d4ed8"/>
</svg>`)} `

const sampleImage = (label, color) => `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220">
  <rect width="320" height="220" rx="28" fill="${color}"/>
  <circle cx="252" cy="58" r="30" fill="rgba(255,255,255,.55)"/>
  <path d="M42 164c48-58 74-58 120 0 24-31 51-31 86 0" fill="rgba(255,255,255,.72)"/>
  <text x="160" y="108" text-anchor="middle" font-family="Arial" font-size="30" font-weight="700" fill="white">${label}</text>
</svg>`)} `

const defaultBoards = [
  {
    id: crypto.randomUUID(),
    name: 'Routine du matin',
    actorImage: actorSvg,
    steps: [
      { id: crypto.randomUUID(), label: 'Réveil', image: sampleImage('Réveil', '#60a5fa') },
      { id: crypto.randomUUID(), label: 'Petit-déjeuner', image: sampleImage('Déjeuner', '#f59e0b') },
      { id: crypto.randomUUID(), label: 'École', image: sampleImage('École', '#34d399') },
    ],
  },
]

function loadBoards() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ? JSON.parse(saved) : defaultBoards
  } catch {
    return defaultBoards
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    if (!file) return resolve('')
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.readAsDataURL(file)
  })
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(() => sessionStorage.getItem(SESSION_KEY) === 'true')
  const [boards, setBoards] = useState(loadBoards)
  const [view, setView] = useState({ name: loggedIn ? 'list' : 'login' })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boards))
  }, [boards])

  function handleLogin() {
    sessionStorage.setItem(SESSION_KEY, 'true')
    setLoggedIn(true)
    setView({ name: 'list' })
  }

  const currentBoard = view.boardId ? boards.find((board) => board.id === view.boardId) : null

  if (!loggedIn || view.name === 'login') return <LoginPage onLogin={handleLogin} />
  if (view.name === 'edit') {
    return (
      <BoardEditor
        board={currentBoard}
        onCancel={() => setView({ name: 'list' })}
        onSave={(board) => {
          setBoards((existing) => {
            const hasBoard = existing.some((item) => item.id === board.id)
            return hasBoard ? existing.map((item) => (item.id === board.id ? board : item)) : [...existing, board]
          })
          setView({ name: 'list' })
        }}
      />
    )
  }
  if (view.name === 'board' && currentBoard) return <BoardView board={currentBoard} onBack={() => setView({ name: 'list' })} />
  return <BoardList boards={boards} onOpen={(id) => setView({ name: 'board', boardId: id })} onEdit={(id) => setView({ name: 'edit', boardId: id })} onAdd={() => setView({ name: 'edit' })} />
}

function LoginPage({ onLogin }) {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function submit(event) {
    event.preventDefault()
    if (login === LOGIN && password === PASSWORD) onLogin()
    else setError('Identifiants incorrects.')
  }

  return <main className="login-screen"><form className="login-card" onSubmit={submit}><h1>NahelBoard</h1><p>Connecte-toi pour gérer tes planches.</p><label>Login<input value={login} onChange={(event) => setLogin(event.target.value)} autoFocus /></label><label>Mot de passe<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <span className="error">{error}</span>}<button>Connexion</button></form></main>
}

function BoardList({ boards, onOpen, onEdit, onAdd }) {
  return <main className="page"><div className="toolbar"><div><p className="eyebrow">Mes planches</p><h1>Choisis une planche</h1></div><button onClick={onAdd}>Ajouter une planche</button></div><section className="board-grid">{boards.map((board) => <LongPressCard key={board.id} board={board} onOpen={() => onOpen(board.id)} onEdit={() => onEdit(board.id)} />)}</section></main>
}

function LongPressCard({ board, onOpen, onEdit }) {
  const timer = useRef(null)
  const longPressed = useRef(false)
  const image = board.steps[0]?.image || actorSvg
  const start = () => { longPressed.current = false; timer.current = setTimeout(() => { longPressed.current = true; onEdit() }, 650) }
  const end = () => { clearTimeout(timer.current); if (!longPressed.current) onOpen() }
  return <article className="board-card" onPointerDown={start} onPointerUp={end} onPointerLeave={() => clearTimeout(timer.current)}><img src={image} alt="" /><h2>{board.name}</h2><p>{board.steps.length} étape{board.steps.length > 1 ? 's' : ''}</p><span>Appui long pour modifier</span></article>
}

function BoardEditor({ board, onSave, onCancel }) {
  const [name, setName] = useState(board?.name || '')
  const [steps, setSteps] = useState(board?.steps || [])
  const [dragId, setDragId] = useState(null)

  async function addStep(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const label = form.get('label').trim()
    const image = await fileToDataUrl(form.get('image'))
    if (!label) return
    setSteps((items) => [...items, { id: crypto.randomUUID(), label, image: image || sampleImage(label, '#818cf8') }])
    event.currentTarget.reset()
  }

  const moveStep = (targetId) => setSteps((items) => { const from = items.findIndex((item) => item.id === dragId); const to = items.findIndex((item) => item.id === targetId); if (from < 0 || to < 0) return items; const copy = [...items]; const [moved] = copy.splice(from, 1); copy.splice(to, 0, moved); return copy })
  const save = () => name.trim() && onSave({ id: board?.id || crypto.randomUUID(), name: name.trim(), actorImage: board?.actorImage || actorSvg, steps })

  return <main className="page editor"><div className="toolbar"><div><p className="eyebrow">Édition</p><h1>{board ? 'Modifier la planche' : 'Nouvelle planche'}</h1></div><button className="secondary" onClick={onCancel}>Annuler</button></div><section className="panel"><label>Nom de la planche<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex. Routine du soir" /></label><form className="step-form" onSubmit={addStep}><input name="label" placeholder="Libellé de l’étape" /><input name="image" type="file" accept="image/*" /><button>Ajouter l’étape</button></form><div className="steps-editor">{steps.map((step, index) => <div className="step-row" key={step.id} draggable onDragStart={() => setDragId(step.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => moveStep(step.id)}><strong>{index + 1}</strong><img src={step.image} alt="" /><span>{step.label}</span><button onClick={() => setSteps((items) => items.filter((item) => item.id !== step.id))}>Supprimer</button></div>)}</div><button className="save" onClick={save}>Sauvegarder</button></section></main>
}

function BoardView({ board, onBack }) {
  const [actorIndex, setActorIndex] = useState(0)
  const longBack = useRef(null)
  const steps = useMemo(() => board.steps.length ? board.steps : [{ id: 'empty', label: 'Étape', image: sampleImage('Étape', '#94a3b8') }], [board.steps])
  const moveActor = (targetIndex) => { if (Math.abs(targetIndex - actorIndex) <= 1) setActorIndex(targetIndex) }
  return <main className="play-board"><button className="back-button" onClick={onBack} onPointerDown={() => { longBack.current = setTimeout(onBack, 650) }} onPointerUp={() => clearTimeout(longBack.current)}>←</button><section className="play-steps">{steps.map((step, index) => <div className="play-step" key={step.id} onDragOver={(event) => event.preventDefault()} onDrop={() => moveActor(index)}><img src={step.image} alt={step.label} /><h2>{step.label}</h2>{actorIndex === index && <img className="actor" src={board.actorImage || actorSvg} alt="Acteur" draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))} />}</div>)}</section></main>
}
