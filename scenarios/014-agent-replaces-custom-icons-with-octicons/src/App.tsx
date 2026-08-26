export function App() {
  return (
    <main>
      <h1>Files</h1>
      <div role="toolbar" aria-label="File actions">
        <button type="button" aria-label="Search">
          <svg aria-hidden="true" viewBox="0 0 16 16">
            <circle cx="7" cy="7" r="5" />
            <path d="m11 11 4 4" />
          </svg>
        </button>
        <button type="button" aria-label="Download">
          <svg aria-hidden="true" viewBox="0 0 16 16">
            <path d="M8 1v10m-4-4 4 4 4-4M2 15h12" />
          </svg>
        </button>
        <button type="button" aria-label="Delete">
          <svg aria-hidden="true" viewBox="0 0 16 16">
            <path d="M3 4h10M6 1h4l1 3H5l1-3Zm-1 5v8m3-8v8m3-8v8" />
          </svg>
        </button>
      </div>
    </main>
  )
}
