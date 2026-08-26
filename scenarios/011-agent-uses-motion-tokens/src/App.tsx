import {useState} from 'react'

export function App() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <main>
      <button
        aria-expanded={isOpen}
        aria-controls="details-panel"
        type="button"
        onClick={() => {
          setIsOpen(current => {
            return !current
          })
        }}
      >
        View details
      </button>
      <section className="details-panel" hidden={!isOpen} id="details-panel">
        <p>The latest deployment completed successfully.</p>
      </section>
    </main>
  )
}
