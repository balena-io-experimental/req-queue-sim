import { argv } from 'yargs'

import {
	Simulation,
} from './lib'

import {
	default_settings,
	controls,
} from './defaults'

const sim = new Simulation(
	Object.assign(default_settings, JSON.parse(argv.settings || '{}')),
	controls,
)
sim.run()
sim.save_to_file('sim.csv')
