import matplotlib.pyplot as plt
import numpy as np
import sys

filename = "sim.csv" if not len(sys.argv) > 1 else sys.argv[1]

t,  queue_length, active, arrived, handled, completed, timed_out, rejected, avg_latency, slowdown, drop_p = np.loadtxt(filename,  unpack=True,  delimiter=',', skiprows=1)

fig, axs = plt.subplots(6, 1)

# axs[0].set_title('throughput')
# lines = axs[0].plot(t, arrived, t, handled, t, completed)
# axs[0].legend(lines, ['arrived', 'handled', 'completed'], loc='upper left')

axs[0].text(.5,.9,'avg latency',
        horizontalalignment='center',
        transform=axs[0].transAxes)
axs[0].plot(t, avg_latency)
ylim = axs[0].get_ylim()
axs[0].set_ylim(bottom=0, top=ylim[1])
axs[0].set_xticks([])

axs[1].text(.5,.9,'slowdown',
        horizontalalignment='center',
        transform=axs[1].transAxes)
axs[1].plot(t, slowdown)
ylim = axs[1].get_ylim()
axs[1].set_ylim(bottom=0, top=ylim[1])
axs[1].set_xticks([])


axs[2].text(.5,.9,'queue_length',
        horizontalalignment='center',
        transform=axs[2].transAxes)
axs[2].plot(t, queue_length)
ylim = axs[2].get_ylim()
axs[2].set_ylim(bottom=0, top=ylim[1])
axs[2].set_xticks([])


axs[3].text(.5,.9,'timeouts',
        horizontalalignment='center',
        transform=axs[3].transAxes)
axs[3].plot(t, timed_out)
ylim = axs[3].get_ylim()
axs[3].set_ylim(bottom=0, top=ylim[1])
axs[3].set_xticks([])


axs[4].text(.5,.9,'drop_p',
        horizontalalignment='center',
        transform=axs[4].transAxes)
axs[4].plot(t, drop_p)
axs[4].set_ylim(bottom=0, top=1)
axs[4].set_xticks([])


axs[5].text(.5,.9,'rejected',
        horizontalalignment='center',
        transform=axs[5].transAxes)
axs[5].plot(t, rejected)
ylim = axs[5].get_ylim()
axs[5].set_ylim(bottom=0, top=ylim[1])


plt.subplots_adjust(hspace = 0.2)
plt.show()
