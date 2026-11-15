import { Chart, type ChartConfig, type ChartData, type LinearGradient } from '../src/index.ts'

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug']
const days = Array.from({ length: 60 }, (_, i) => `Day ${i + 1}`)

const rand = (n: number, min = -20, max = 100) =>
  Array.from({ length: n }, () => Math.round(min + Math.random() * (max - min)))

const gradient = (angle: number, ...colors: string[]): LinearGradient => ({
  type: 'linear',
  angle,
  stops: colors.map((color, i) => ({ offset: i / (colors.length - 1), color })),
})

const log = document.querySelector<HTMLSpanElement>('#log')!
const onClick: ChartConfig['onClick'] = (e) => {
  console.log('click', e)
  log.textContent = `Clicked ${e.datasetLabel ?? 'series ' + (e.datasetIndex + 1)} · ${e.label} = ${e.value}`
}

interface Card {
  title: string
  type: ChartConfig['type']
  orientation?: ChartConfig['orientation']
  data: () => ChartData
}

const horizontalCards: Card[] = [
  {
    title: 'Bar · horizontal',
    type: 'bar',
    orientation: 'horizontal',
    data: () => ({
      labels: months,
      datasets: [
        { label: 'Sales', values: rand(8), borderRadius: 8, color: gradient(90, '#f472b6', '#6366f1') },
        { label: 'Costs', values: rand(8, 0, 80), borderRadius: 4, color: '#e15759' },
      ],
    }),
  },
  {
    title: 'Line · horizontal, smooth + area',
    type: 'line',
    orientation: 'horizontal',
    data: () => ({
      labels: months,
      datasets: [{ label: 'Sales', values: rand(8), interpolation: 'smooth', color: gradient(90, '#7c3aed', '#7c3aed00') }],
    }),
  },
  {
    title: 'Bar · horizontal, 60 points, drag to pan',
    type: 'bar',
    orientation: 'horizontal',
    data: () => ({
      labels: days,
      datasets: [{ label: 'Load', values: rand(60), borderRadius: 3, color: gradient(90, '#22d3ee', '#3b82f6') }],
    }),
  },
]

const cards: Card[] = [
  {
    title: 'Line · linear',
    type: 'line',
    data: () => ({
      labels: months,
      datasets: [
        { label: 'Sales', values: rand(8) },
        { label: 'Costs', values: rand(8, 0, 80), color: '#e15759' },
      ],
    }),
  },
  {
    title: 'Line · smooth with area gradient, step',
    type: 'line',
    data: () => ({
      labels: months,
      datasets: [
        {
          label: 'Smooth',
          values: rand(8),
          interpolation: 'smooth',
          lineWidth: 4,
          color: gradient(180, '#7c3aed', '#7c3aed00'),
        },
        { label: 'Step', values: rand(8, 0, 80), interpolation: 'step', color: '#f28e2b', lineWidth: 2 },
      ],
    }),
  },
  {
    title: 'Bar · rounded + gradient + border',
    type: 'bar',
    data: () => ({
      labels: months,
      datasets: [
        {
          label: 'Sales',
          values: rand(8),
          borderRadius: 8,
          color: gradient(180, '#f472b6', '#6366f1'),
          borderColor: '#4338ca',
          borderWidth: 1.5,
        },
        { label: 'Costs', values: rand(8, 0, 80), borderRadius: 4, color: '#e15759' },
      ],
    }),
  },
  {
    title: 'Bar · color per data point',
    type: 'bar',
    data: () => ({
      labels: months,
      datasets: [
        {
          label: 'Score',
          values: rand(8, 10, 100),
          borderRadius: 6,
          color: ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7'],
        },
      ],
    }),
  },
  {
    title: 'Pie · gradients + border',
    type: 'pie',
    data: () => ({
      labels: ['A', 'B', 'C', 'D'],
      datasets: [
        {
          label: 'Share',
          values: rand(4, 5, 50),
          borderWidth: 3,
          borderColor: '#ffffff',
          color: [
            gradient(135, '#6366f1', '#a855f7'),
            gradient(135, '#06b6d4', '#22c55e'),
            gradient(135, '#f59e0b', '#ef4444'),
            '#94a3b8',
          ],
        },
      ],
    }),
  },
  {
    title: 'Line · 60 points, drag to pan',
    type: 'line',
    data: () => ({
      labels: days,
      datasets: [{ label: 'Load', values: rand(60), interpolation: 'smooth', color: gradient(180, '#f43f5e', '#f43f5e10') }],
    }),
  },
  {
    title: 'Bar · 60 points, drag to pan',
    type: 'bar',
    data: () => ({
      labels: days,
      datasets: [{ label: 'Load', values: rand(60), borderRadius: 3, color: gradient(180, '#22d3ee', '#3b82f6') }],
    }),
  },
  ...horizontalCards,
]

const app = document.querySelector<HTMLDivElement>('#app')!
const charts = cards.map(({ title, type, orientation, data }) => {
  const card = document.createElement('section')
  card.className = 'card'
  card.innerHTML = `<h2>${title}</h2><div class="wrap"><canvas class="chart"></canvas></div>`
  app.append(card)
  const chart = new Chart(card.querySelector('canvas')!, {
    type,
    orientation,
    data: data(),
    onClick,
    ...(type !== 'pie' && { xAxisName: 'Period', yAxisName: 'Amount' }),
  })
  return { chart, data }
})

document.querySelector('#randomize')!.addEventListener('click', () => {
  for (const { chart, data } of charts) chart.update({ data: data() })
})
