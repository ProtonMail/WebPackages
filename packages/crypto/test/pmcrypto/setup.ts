import { beforeAll, expect } from "vitest";

import { init, updateServerTime } from "../../src/pmcrypto/index.ts";
import { wasServerTimeEverUpdated } from "../../src/serverTime.ts";

beforeAll(() => {
    // set server time in the future to spot functions that use local time unexpectedly
    const HOUR = 3600 * 1000;
    expect(wasServerTimeEverUpdated()).to.be.false;
    const time = new Date(Date.now() + HOUR);
    updateServerTime(time, time);
    expect(wasServerTimeEverUpdated()).to.be.true;
    init();
});
