'use client'

import {ProgressBar, Text} from '@primer/react'
import {formatPercent} from './format'
import styles from './score-cell.module.css'

type ScoreCellProps = {
  label: string
  value: number
}

export function ScoreCell({label, value}: ScoreCellProps) {
  return (
    <div className={styles.score}>
      <Text weight="semibold">{formatPercent(value)}</Text>
      <ProgressBar aria-label={`${label}: ${formatPercent(value)}`} className={styles.progress} progress={value} />
    </div>
  )
}
