import { LazyMap } from "./util.js";
import { Event } from "./canvas.js";
import * as Util from "./util.js";



export default class Statistics
{
	constructor(pixelCountInteval, pixelCountWindow, userCountInterval, userCountWindow)
	{
		this.pixelCountInterval = pixelCountInteval;
		this.pixelCountWindow = pixelCountWindow;
		this.userCountInterval = userCountInterval;
		this.userCountWindow = userCountWindow;

		this.pixelCount = 0;
		this.pixelCountByColor = {};
		this.pixelCountsOverTime = {};

		this.totalUserCountOverTime = {};
		this.userCountOverTime = {}; // TODO: Rename something like maxUsersOverTime?
		this.mostConcurrentUsers = 0;

		this.personal = new LazyMap();

		this._channels = null;
	}

	getPersonal(userId)
	{
		return this.personal.get(userId, () => ( { pixels: [] } ));
	}

	listen(canvas, channels)
	{
		this._channels = channels;
		canvas.on("dispatch", this.savePixel.bind(this));
		channels.on("open", this.saveUserCount.bind(this));
		channels.on("close", this.saveUserCount.bind(this));
		return this;
	}

	savePixel(event) // on every place event...
	{
			if (event.id !== Event.PLACE) return;
			if (event.userId <= 0) return; // Ignore invalid/special ids TODO: Proper snowflake validation?

			const alignedTimestamp = Util.align(event.timestamp, this.pixelCountInterval);

			// Update our cached counts
			this.pixelCount++;
			this.pixelCountByColor[event.color] ??= 0;
			this.pixelCountByColor[event.color]++;

			const lowerBound = Date.now() - this.pixelCountWindow;

			// Only add if within our window
			if (event.timestamp >= lowerBound)
			{
				this.pixelCountsOverTime[alignedTimestamp] ??= 0;
				this.pixelCountsOverTime[alignedTimestamp]++;
			}

			// Delete old entries outside our window
			for (const timestamp in this.pixelCountsOverTime)
			{
				if (+timestamp < lowerBound) delete this.pixelCountsOverTime[timestamp];
			}

			this.getPersonal(event.userId).pixels.push(event);
	}

	saveUserCount(event) // on every user change event...
	{
		const alignedTimestamp = Util.align(event.timestamp, this.userCountInterval);
		const count = this._channels.getChannelCount();

		// Make sure a number exists so that the next comparison doesn't fail
		this.totalUserCountOverTime[alignedTimestamp] ??= 0;
		// Keep the most concurrent users per interval
		if (count > this.totalUserCountOverTime[alignedTimestamp]) this.totalUserCountOverTime[alignedTimestamp] = count;
		// And update the max users
		if (count > this.mostConcurrentUsers) this.mostConcurrentUsers = count;

		const lowerBound = Date.now() - this.userCountWindow;

		// Make sure a number exists so that the next comparison doesn't fail
		this.userCountOverTime[alignedTimestamp] ??= 0;
		// Only add to current count list if within our window
		// and if it's the biggest concurrent amount in the current interval
		if (event.timestamp >= lowerBound && count > this.userCountOverTime[alignedTimestamp])
		{
			this.userCountOverTime[alignedTimestamp] = count;
		}

		// Delete old entries outside our window
		for (const timestamp in this.userCountOverTime)
		{
			if (+timestamp < lowerBound) delete this.userCountOverTime[timestamp];
		}
	}
} 