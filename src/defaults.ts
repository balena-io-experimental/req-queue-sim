import { jStat } from 'jStat'

import {
	SimulationSettings,
	SimulationControl,
	Simulation,
} from './lib'

export const default_settings: SimulationSettings = {
	n: 75,
	timeout: 30 * 1000,
	slowdown: 0,
	mean_log_svc: Math.log(50) - 0.5,
	mean_log_rps: Math.log(500) - 0.5,
	random_svc: function() {
		return jStat.lognormal(this.mean_log_svc, 1).sample()
	},
	runtime: 10 * 60000
}

const control_slowdown = new SimulationControl((s: Simulation) => {
	const slowdown_peak = s.settings.runtime/4
	const amplitude = 400
	const width = 80000
	const shift = 5000
	const bellDivisor = Math.pow((1 + Math.pow(((s.clock.t - shift)/width - slowdown_peak/(2*width)), 2)), 2)
	const clampWidth = 10000
	const clampDecay = 44000
	const clampFactor = Math.pow(Math.E, (s.clock.t - clampDecay) / clampWidth )
	const clamp = clampFactor / (1 + clampFactor)
	s.settings.slowdown = clamp * amplitude / bellDivisor
})

const control_mean_log_rps = new SimulationControl((s: Simulation) => {
	s.settings.mean_log_rps = default_settings.mean_log_rps + 20 * s.clock.percent()
})

const alpha = 0.2
const beta = 0.1
const gamma = 0.3
const t_update = 1000
let last_t = 0
const window = 5
let p = 0
const pid_control = new SimulationControl((s: Simulation) => {
	if (s.clock.t - last_t > t_update) {
		last_t = s.clock.t
		if (s.timeseries.length > window * t_update) {
			const last_metric = s.timeseries[s.timeseries.length - t_update]
			const metric = s.timeseries[s.timeseries.length - 1]
			const last_p_timeout = Math.max(0, Math.min(1, last_metric.timed_out / (last_metric.arrived + 1)))
			const p_timeout = Math.max(0, Math.min(1, metric.timed_out / (metric.arrived + 1)))
			let p_sum = 0
			for (let i = 0; i < window; i++) {
				const metric = s.timeseries[s.timeseries.length - 1 - t_update * i]
				p_sum += Math.max(0, Math.min(1, metric.timed_out / (metric.arrived + 1)))
			}
			p = alpha * p_timeout + beta * (p_timeout - last_p_timeout) + gamma * p_sum
			if (p < 0.01) {
				p /= 8
			} else if (p < 0.1) {
				p /= 2
			}
			p = Math.max(0, Math.min(1, p))
		}
	}
	const n_to_drop = s.queue.length * p
	// drop half from start, half from end
	s.queue.splice(0, n_to_drop / 2)
	s.queue.splice(s.queue.length - (n_to_drop / 2), s.queue.length)
	s.metrics.rejected = n_to_drop
	s.metrics.drop_p = p
})

export const controls = [
	control_slowdown,
	// control_mean_log_rps,
	pid_control
]
