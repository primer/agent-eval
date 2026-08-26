import {useState} from 'react'

export function App() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <main>
      <button
        type="button"
        onClick={() => {
          setIsOpen(true)
        }}
      >
        Open panel
      </button>
      {isOpen ? (
        <aside className="floating-panel">
          <h2>Notifications</h2>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false)
            }}
          >
            Close
          </button>
        </aside>
      ) : null}
    </main>
  )
}
