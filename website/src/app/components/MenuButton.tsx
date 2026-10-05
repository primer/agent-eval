'use client'

import {BeakerIcon, ChecklistIcon, GraphIcon, HomeIcon, MarkGithubIcon, ThreeBarsIcon, XIcon} from '@primer/octicons-react'
import {IconButton, NavList} from '@primer/react'
import Link from 'next/link'
import {useId, useRef} from 'react'
import classes from './MenuButton.module.css'

export function MenuButton() {
  const dialogId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  return (
    <>
      {/* @ts-expect-error the command attribute should be supported */}
      <IconButton aria-label="Menu" icon={ThreeBarsIcon} command="show-modal" commandfor={dialogId} />
      <dialog
        ref={dialogRef}
        id={dialogId}
        className={classes.Dialog}
        onMouseDown={event => {
          if (event.target === dialogRef.current) {
            dialogRef.current.close()
          }
        }}
      >
        <div className="w-full h-full">
          <div className="flex justify-between items-center p-4">
            <MarkGithubIcon size="medium" />
            {/* @ts-expect-error the command attribute should be supported */}
            <IconButton aria-label="Close" icon={XIcon} command="close" commandfor={dialogId} variant="invisible" />
          </div>
          <NavList>
            <NavList.Item as={Link} href="/">
              <NavList.LeadingVisual>
                <HomeIcon />
              </NavList.LeadingVisual>
              Home
            </NavList.Item>
            <NavList.Item as={Link} href="/benchmarks">
              <NavList.LeadingVisual>
                <GraphIcon />
              </NavList.LeadingVisual>
              Benchmarks
            </NavList.Item>
            <NavList.Item as={Link} href="/experiments">
              <NavList.LeadingVisual>
                <BeakerIcon />
              </NavList.LeadingVisual>
              Experiments
            </NavList.Item>
            <NavList.Item as={Link} href="/scenarios">
              <NavList.LeadingVisual>
                <ChecklistIcon />
              </NavList.LeadingVisual>
              Scenarios
            </NavList.Item>
          </NavList>
        </div>
      </dialog>
    </>
  )
}
