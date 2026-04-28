'use client'

import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  ArcElement, Tooltip, Filler,
} from 'chart.js'
import { Line, Doughnut } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Tooltip, Filler)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function LineChart({ data, options }: { data: any; options: any }) {
  return <Line data={data} options={options} />
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DonutChart({ data, options }: { data: any; options: any }) {
  return <Doughnut data={data} options={options} />
}
