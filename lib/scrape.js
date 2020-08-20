const puppeteer = require('puppeteer');

module.exports = {
    scrape: (itemid) => (async () => {
        var intRegex = /^\d+$/;
        if ( (! itemid) || (! intRegex.test(itemid)) ) {
            throw new Error("You did not provide a valid item ID (" + itemid + "). This should never happen.");
        }
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.goto("https://www.gw2tp.com/item/" + itemid);
        const response = await page.goto(page.url() + "?full=1");
        await page.waitFor(1000);

        const data = {};
        if (response.status() === 200) {
            data.timestamps = await page.evaluate(() => {return Highcharts.charts[0].series[0].xData;});
            data.sell = await page.evaluate(() => {return  Highcharts.charts[0].series[0].yData;});
            data.buy = await page.evaluate(() => {return Highcharts.charts[0].series[1].yData;});
            data.supply = await page.evaluate(() => {return Highcharts.charts[0].series[2].yData;});
        }

        await browser.close();
        return data;
    })()
};
