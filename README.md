req queue simulator
===

Simple typescript tool to monkey around simulating queues. Outputs CSV format, depends on python and matplotlib for visualization.

See `examples/` for example of a queue stuck in a pathological state by overload, and a PID controller dropping queued requests until normal behaviour is restored.

Run with `npm run sim` and view with `python plot.py [csv file]`

![pathological queue](images/pathol.png?raw=true "Pathological queue")
![controlled queue](images/controlled.png?raw=true "Controlled queue")
