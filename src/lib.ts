import { jStat } from 'jStat'
import * as fs from 'fs'

export class Clock {
	// the current time (in ms)
	public t: number
	// the current iteration ordinal
	public iter: number
	constructor(
		public runtime: number = 30 * 1000,
		// the time step to advance the simulation by
		public dt: number = 16,
	) {
		this.t = 0
		this.iter = 0
	}
	public done(): boolean {
		return this.t >= this.runtime
	}
	public tick() {
		this.iter += 1
		this.t += this.dt
	}
	public percent(): number {
		return this.t / this.runtime
	}
}

export class Request {
	public arrival_t: number
	public start_t: number
	public svc: number
	public in_progress: boolean
	public complete: boolean
	public timed_out: boolean
	public clock: Clock
	constructor(public sim: Simulation) {
		this.clock = this.sim.clock
		this.arrival_t = this.clock.t
		this.in_progress = false
		this.complete = false
		this.timed_out = false
	}
	public start(svc: number) {
		this.start_t = this.clock.t
		this.svc = svc
		this.in_progress = true
	}
	public serve() {
		if (this.elapsed_total() > this.sim.settings.timeout) {
			this.timed_out = true
			this.in_progress = false
			this.sim.metrics.timed_out++
		} else if (this.remaining(this.sim.settings.slowdown) <= 0) {
			this.complete = true
			this.in_progress = false
			this.sim.metrics.completed++
			this.sim.metrics.avg_latency += this.elapsed_total()
		}
	}
	public elapsed_total(): number {
		return this.clock.t - this.arrival_t
	}
	public elapsed_svc(): number {
		return this.in_progress ? this.clock.t - this.start_t : 0
	}
	public remaining(slowdown: number = 0): number {
		const queueLengthFactor = (this.sim.queue.length + 1) / 100
		return (1 + slowdown + queueLengthFactor) * this.svc - this.elapsed_svc()
	}
	public done(): boolean {
		return this.complete || this.timed_out
	}
}

export class Server {
	public req: Request
	public busy: boolean
	constructor(public sim: Simulation) {
		this.busy = false
	}
	public handle(req: Request, svc: number) {
		this.sim.metrics.handled++
		this.req = req
		this.req.start(svc)
		this.busy = true
	}
	public serve() {
		this.req.serve()
		if (this.req.done()) {
			this.busy = false
		}
	}
}

export class ArrivalProcess {
	constructor(
		public sim: Simulation,
		// the number of arrivals which should occur each
		// timestep (allows fractional, and carries over, in the case of very
		// low arrival rates)
		public arrivalCount: number = 0,
	) {}
	public arrivals(clock: Clock): Request[] {
		let mu = clock.dt * (this.sim.settings.mean_log_rps / 1000)
		const X = jStat.lognormal(mu, 1).sample()
		this.arrivalCount += Math.max(0, X)
		const N = Math.floor(this.arrivalCount)
		let arrivals = Array.from(Array(N)).map(() => new Request(this.sim))
		this.arrivalCount -= Math.floor(this.arrivalCount)
		return arrivals
	}
}

export interface SimulationSettings {
	// the number of concurrent requests which can be processed ("servers")
	n: number
	// timeout after which requests abort (whether in progress or in queue.waiting)
	timeout: number
	// slowdown is a factor which affects how long requests take to be serviced.
	// a slowdown of 0 means requests take their normal time to complete. a slowdown
	// of 1.0 means requests take 100% longer (2x) to complete, a slowdown of 2.0 means
	// requests take 200% longer (3x), etc.
	slowdown: number
	// logarithm of the mean of the lognormal distribution of service times
	mean_log_svc: number
	// logarithm of the mean number of requests per second which arrive
	mean_log_rps: number
	// a function returning service times from a distribution, for each request
	random_svc: () => number
	// how long to run the simulation for (ms)
	runtime: number
}

export class SimulationControl {
	constructor(private controlFunc: (s: Simulation) => void) {}
	public doControl(s: Simulation) {
		this.controlFunc(s)
	}
}

export class Metrics {
	constructor(
		public t: number,
		public queue_length: number = 0,
		public active: number = 0,
		public arrived: number = 0,
		public handled: number = 0,
		public completed: number = 0,
		public timed_out: number = 0,
		public rejected: number = 0,
		public avg_latency: number = 0,
		public slowdown: number = 0,
		public drop_p: number = 0,
	) {}
}

export class Simulation {
	public settings: SimulationSettings
	public clock: Clock
	public arrivalProcess: ArrivalProcess
	public queue: Request[]
	public servers: Server[]
	public metrics: Metrics
	public timeseries: Metrics[]
	constructor(
		settings: SimulationSettings,
		public controls: SimulationControl[],
	) {
		this.settings = Object.assign({}, settings)
		this.clock = new Clock(this.settings.runtime)
		this.arrivalProcess = new ArrivalProcess(this)
		this.queue = []
		this.servers = Array.from(Array(this.settings.n)).map(
			() => new Server(this),
		)
		this.timeseries = []
	}

	public run() {
		while (!this.clock.done()) {
			this.metrics = new Metrics(this.clock.t)
			this.iterate()
			this.clock.tick()
			this.record_metrics()
		}
	}

	private record_metrics() {
		this.metrics.avg_latency /= this.metrics.completed
		this.metrics.slowdown = this.settings.slowdown
		this.timeseries.push(this.metrics)
	}

	private iterate() {
		// process controls based on clock time
		this.controls.forEach((control: SimulationControl) => {
			control.doControl(this)
		})
		// apply timeout to elements in wait_queue
		let timed_out_in_queue = this.queue.filter((r: Request) => {
			return r.elapsed_total() > this.settings.timeout
		})
		this.metrics.timed_out += timed_out_in_queue.length
		this.queue = this.queue.filter((r: Request) => {
			return r.elapsed_total() < this.settings.timeout
		})
		this.metrics.queue_length = this.queue.length
		//determine how many requests are arriving and add them to the wait queue
		let arrivals = this.arrivalProcess.arrivals(this.clock)
		this.metrics.arrived = arrivals.length
		this.queue = this.queue.concat(arrivals)
		//process serving and queued requests
		this.service_process()
	}

	public service_process() {
		//for each server
		this.servers.forEach((s: Server) => {
			//process running requests
			if (s.busy) {
				this.metrics.active++
				s.serve()
			}
			// start a new request if this server is ready for one
			if (!s.busy && this.queue.length > 0) {
				const req = this.queue.shift()!
				s.handle(req, this.settings.random_svc())
			}
		})
	}

	public save_to_file(filename: string) {
		const stream = fs.createWriteStream(filename)
		const keys = Object.keys(this.timeseries[0])
		stream.write(keys.join(','))
		stream.write('\n')
		this.timeseries.forEach((m: Metrics) => {
			keys.forEach((key: string, i: number) => {
				stream.write(`${m[key]}`)
				if (i != keys.length - 1) {
					stream.write(',')
				}
			})
			stream.write('\n')
		})
		stream.end()
	}
}
