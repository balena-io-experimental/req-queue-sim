import { jStat } from 'jStat'
import * as fs from 'fs'

// class to manage the passage of time, and measuring time's passage
// (Simulation instance will have one clock)
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

// class to represent requests arriving, waiting, being served, and completing / timing out
export class Request {
	public arrival_t: number
	public start_t: number
	public svc: number
	public in_progress: boolean
	public complete: boolean
	public timed_out: boolean
	// a reference to the clock of the simulation this request is running in
	public clockRef: Clock
	constructor(public sim: Simulation) {
		this.clockRef = this.sim.clock
		this.arrival_t = this.clockRef.t
		this.in_progress = false
		this.complete = false
		this.timed_out = false
	}
	// called when the request is popped from the queue and given a server from
	// the pool
	public start(svc: number) {
		this.start_t = this.clockRef.t
		this.svc = svc
		this.in_progress = true
	}
	// called every clock tick for each request being handled by a server,
	// this method determines whether service has completed
	public serve() {
		if (this.elapsed_total() > this.sim.settings.timeout) {
			// timeout
			this.timed_out = true
			this.in_progress = false
			this.sim.metrics.timed_out++
		} else if (this.remaining(this.sim.settings.slowdown) <= 0) {
			// complete
			this.complete = true
			this.in_progress = false
			this.sim.metrics.completed++
			this.sim.metrics.avg_latency += this.elapsed_total()
		}
	}
	// time spent since arrival
	public elapsed_total(): number {
		return this.clockRef.t - this.arrival_t
	}
	// time spent in service (after being popped from the queue and given a server)
	public elapsed_svc(): number {
		return this.in_progress ? this.clockRef.t - this.start_t : 0
	}
	// time remaining, according to clock-time, modified by slowdown factor and,
	// importantly, by the queue length itself (the machine spends some cycles
	// simply managing the queue list/array)
	public remaining(slowdown: number = 0): number {
		const queueLengthFactor = (this.sim.queue.length + 1) / 100
		return (1 + slowdown + queueLengthFactor) * this.svc - this.elapsed_svc()
	}
	public done(): boolean {
		return this.complete || this.timed_out
	}
}

// multiple Server instances are created by the Simulation instance
export class Server {
	public req: Request
	public busy: boolean
	constructor(public sim: Simulation) {
		this.busy = false
	}
	// pair this server with a request - called by Simulation instance when
	// this server is free and a request is available in the queue to serve next
	public handle(req: Request, svc: number) {
		this.sim.metrics.handled++
		this.req = req
		this.req.start(svc)
		this.busy = true
	}
	// a server, while it has a request, will call its serve method each time
	// clock tick, setting this.busy = false if the request has finished
	public serve() {
		this.req.serve()
		if (this.req.done()) {
			this.busy = false
		}
	}
}

// settings used to control the behaviour of the Simulation
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

// SimultionControls are functions which are called each clock tick to
// control the simulation in some way
export type SimulationControl = (s: Simulation) => void

// a Metrics object is a set of data points which correspond to a specific
// instant in time
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

// the main class which is instantiated and run, using all the other parts defined
// above. A simluation simulates a queue of requests at which arrivals are occurring,
// and a pool of servers which are processing requests
export class Simulation {
	// settings to control the simulation
	public settings: SimulationSettings
	// clock by which all events are measured
	public clock: Clock
	// queue of waiting requests which cannot be immediately served (servers busy)
	public queue: Request[]
	// list of servers which serve requests
	public servers: Server[]
	// metrics of the queue's behaviour associated with the current clock tick
	// (to be pushed, each clock-tick, into the timeseries list)
	public metrics: Metrics
	// list of metrics recorded each clock tick
	public timeseries: Metrics[]
	// a running counter used to keep track of how many requests should be arriving
	public arrivalCount: number = 0
	constructor(
		settings: SimulationSettings,
		public controls: SimulationControl[],
	) {
		this.settings = Object.assign({}, settings)
		this.clock = new Clock(this.settings.runtime)
		this.queue = []
		this.servers = Array.from(Array(this.settings.n)).map(
			() => new Server(this),
		)
		this.timeseries = []
	}

	// used by the main script to run the simulation, having been created with
	// the constructor first
	public run() {
		while (!this.clock.done()) {
			this.metrics = new Metrics(this.clock.t)
			this.iterate()
			this.clock.tick()
			this.record_metrics()
		}
	}

	// runs each clock tick, pushing the current metrics into the list (for later
	// export to CSV)
	private record_metrics() {
		this.metrics.avg_latency /= this.metrics.completed
		this.metrics.slowdown = this.settings.slowdown
		this.timeseries.push(this.metrics)
	}

	// runs each loop inside the run() method
	private iterate() {
		// process controls based on clock time
		this.controls.forEach((control: SimulationControl) => {
			control(this)
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
		let arrivals = this.arrivalProcess()
		this.metrics.arrived = arrivals.length
		this.queue = this.queue.concat(arrivals)
		//process serving and queued requests
		this.service_process()
	}

	public arrivalProcess(): Request[] {
		let mu = this.clock.dt * (this.settings.mean_log_rps / 1000)
		const X = jStat.lognormal(mu, 1).sample()
		this.arrivalCount += Math.max(0, X)
		const N = Math.floor(this.arrivalCount)
		let arrivals: Request[] = []
		if (N > 0) {
			arrivals = Array.from(Array(N)).map(() => new Request(this))
			this.arrivalCount -= Math.floor(this.arrivalCount)
		}
		return arrivals
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
