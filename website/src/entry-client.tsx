import {StrictMode} from 'react'
import {createRoot, hydrateRoot} from 'react-dom/client'
import {RouterProvider} from '@tanstack/react-router'
import {createSiteRouter} from './router'
import type {PageData} from './page-data'

const element = document.getElementById('root')!
const initial = document.getElementById('page-data')
const initialPage = initial ? JSON.parse(initial.textContent!) as {path: string; data: PageData} : undefined
const router = createSiteRouter({initialPage})
await router.load()
const app = <StrictMode><RouterProvider router={router} /></StrictMode>
if (initial) hydrateRoot(element, app)
else createRoot(element).render(app)
import './app/globals.css'
