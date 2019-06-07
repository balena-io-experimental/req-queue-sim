req queue simulator
===

Simple typescript tool to monkey around simulating queues. Outputs CSV format, depends on python and matplotlib for visualization.

See `examples/` for example of a queue stuck in a pathological state by overload, and a PID controller dropping queued requests until normal behaviour is restored.

Run with `npm run sim` and view with `python plot.py [csv file]`

## Reading the source

The main logic is the creation of a singleton `Simulation` object (see `src/lib.ts`) which contains:

- a `Clock` for time keeping (simply a monotonically-increasing counter, we don't use real time in any way)
- a queue of `Request` objects arriving to be served
- a pool of `Server` objects which associate with incoming requests, hold them for a while, and release them when the request is done serving
- a timeseries of data points (`Metrics`) associated with the behaviour of the system, output to CSV after each run

The script which actually runs the simulation is `src/simulate.ts`

### Examples

In both of the examples below, the x-axis shows time in milliseconds over a 10 minute period of simulation, at around 500 req / s, the request latencies beind distributed (unless disturbed by the slowdown factor) on a lognormal distribution with arithmetic mean of 50 ms per request.

#### Pathological queue

In this situation, a slowdown causing requests to take longer to complete (for example, DB issues) causes requests to pile up in the queue. The queue reaches such a length that requests are timing out before ever reaching service, while more and more continue to arrive. This is partly due to the fact that the instance is spending some of its cycles simply managing the queue.
![pathological queue](images/pathol.png?raw=true "Pathological queue")

#### Controlled queue

This shows the same situation with a PID controller added to implement a rough sketch following the ideas in [RFC 8033](https://tools.ietf.org/html/rfc8033). Although the constants involved could be tuned, the general idea is illustrated. Even during the slowdown, some requests are serving, and the queue recovers. 

![controlled queue](images/controlled.png?raw=true "Controlled queue")


