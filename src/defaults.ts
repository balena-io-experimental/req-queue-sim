import { jStat } from 'jStat'
import { clamp } from './utils'

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



// control the slowdown factor, which multiplies the time taken by
// requests to complete

const control_slowdown = (s: Simulation) => {
	// describe a bell-shaped function of slowdown
	const slowdown_peak = s.settings.runtime/4
	const amplitude = 400
	const width = 80000
	const shift = 5000
	const bellDivisor = Math.pow((1 + Math.pow(((s.clock.t - shift)/width - slowdown_peak/(2*width)), 2)), 2)
	const bell = amplitude / bellDivisor
	// multiply the slowdown factor bell-shaped distribution above by a sigmoid function which
	// ramps up from 0 to 1 (so we have a certain amount of service at the start which is not
	// affected by the slowdown
	const rampWidth = 10000
	const rampDecay = 44000
	const rampFactor = Math.pow(Math.E, (s.clock.t - rampDecay) / rampWidth )
	const ramp = rampFactor / (1 + rampFactor)
	// the slowdown is the product of the ramp and bell functions defined above
	s.settings.slowdown = ramp * bell
}



// Control the mean of the logarithmic distribution of requests-per-second
// arriving at the queue

const control_mean_log_rps = (s: Simulation) => {
	s.settings.mean_log_rps = default_settings.mean_log_rps + 20 * s.clock.percent()
}



// A controller for dropping queued requests during periods of excessive timeout
// according roughly to the implementation in RFC 8066 for TCP packets in buffers


let last_t = 0
let p = 0
const pid_control = (s: Simulation) => {
	const window = 5
	const alpha = 0.2
	const beta = 0.1
	const gamma = 0.3
	const phi = 0.3
	const t_update = 1000
	if (s.clock.t - last_t > t_update) {
		last_t = s.clock.t
		if (s.timeseries.length > window * t_update) {
			const last_metric = s.timeseries[s.timeseries.length - t_update]
			const metric = s.timeseries[s.timeseries.length - 1]
			const last_p_timeout = clamp(last_metric.timed_out / (last_metric.arrived + 1), 0, 1)
			const p_timeout = clamp(metric.timed_out / (metric.arrived + 1), 0, 1)
			let p_sum = 0
			for (let i = 0; i < window; i++) {
				const metric = s.timeseries[s.timeseries.length - 1 - t_update * i]
				p_sum += clamp(metric.timed_out / (metric.arrived + 1), 0, 1)
			}
			p = phi * (alpha * p_timeout + beta * (p_timeout - last_p_timeout) + gamma * p_sum) + (1 - phi) * p
			if (p < 0.01) {
				p /= 8
			} else if (p < 0.1) {
				p /= 2
			}
			p = clamp(p, 0, 1)
		}
	}
	const n_to_drop = s.queue.length * p
	// drop half from start, half from end
	s.queue.splice(0, n_to_drop / 2)
	s.queue.splice(s.queue.length - (n_to_drop / 2), s.queue.length)
	s.metrics.rejected = n_to_drop
	s.metrics.drop_p = p
}

export const controls = [
	control_slowdown,
	// control_mean_log_rps,
	pid_control
]
