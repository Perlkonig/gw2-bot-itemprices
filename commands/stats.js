const Discord = require('discord.js');
const { CanvasRenderService } = require('chartjs-node-canvas');
const mergeImages = require('merge-images');
const { Canvas, Image } = require('canvas');
var ss = require('simple-statistics')
var moment = require('moment');
const { scrape } = require('../lib/scrape');

const width = 800; //px
const height = 400; //px

const chartJsFactory = () => {
    const chartJS = require('chart.js');
    require('chartjs-chart-box-and-violin-plot');
    delete require.cache[require.resolve('chart.js')];
    delete require.cache[require.resolve('chartjs-chart-box-and-violin-plot')];
    return chartJS;
};

const chartCallback = (ChartJS) => {

    // Global config example: https://www.chartjs.org/docs/latest/configuration/
    // ChartJS.defaults.global.elements.rectangle.borderWidth = 2;
    // // Global plugin example: https://www.chartjs.org/docs/latest/developers/plugins.html
	ChartJS.plugins.register({
        beforeDraw: (chart, options) => {
            const ctx = chart.ctx;
            ctx.save();
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }
    });    
    // ChartJS.plugins.register({
    //     // plugin implementation
    // });
    // // New chart type example: https://www.chartjs.org/docs/latest/developers/charts.html
    // ChartJS.controllers.MyType = ChartJS.DatasetController.extend({
    //     // chart implementation
    // });
};
const canvasRenderService = new CanvasRenderService(width, height, chartCallback, undefined, chartJsFactory);

module.exports = {
	name: 'stats',
    description: 'Displays price history and statistics for given item. If the item name you provide returns multiple possible results, this command will fail. In such cases, use the `!item search` command to find the unique item id.',
    args: true,
    usage: "<item name> | <item id> [<days> (default 30)]",
	execute(message, args, db) {
        // Parse and validate args
        let days = 30;
        const intRegex = /^\d+$/;
        if ( (args.length > 1) && (intRegex.test(args[args.length - 1])) ) {
            days = args.pop();
        }
        let item = args.join(' ');

        if (intRegex.test(item)) {
            // Presumed itemid received. Verify.
            let row = db.prepare("SELECT * FROM items WHERE id = ?").get(item);
            if (row === undefined) {
                message.channel.send("That item ID does not exist.");
                return;
            }
            item = row;
        } else {
            // Received a presumed item name. Look for an exact match.
            let row = db.prepare("SELECT * FROM items WHERE name = ? COLLATE NOCASE").get(item);
            if (row === undefined) {
                message.channel.send("There is no single item by that name. Please use the `!item search` command to find the item you're looking for.");
                return;
            }
            // Check if NOSELL
            // if (row.nosell == true) {
            //     message.channel.send("The item " + row.name + " is marked as NOSELL. You cannot buy it on the market.")
            //     return;
            // }
            item = row;
        }

        // We should now have a validated item ID. Scrape it.
        scrape(item.id)
        .then ((data) => {
            if (data == {}) {
                message.channel.send("An error occurred fetching the pricing data. Check the console for error messages.");
                return;
            } else if (data.timestamps.length === 0) {
                message.channel.send("No pricing data was found. Are you sure this item is tradeable?");
                return;
            }

            var oldest = new Date();
            oldest.setDate(oldest.getDate() - days);
            var ts = oldest.getTime();
            var wanted = data.timestamps.filter(x => x >= ts);
            data.timestamps = data.timestamps.slice(wanted.length * -1);
            data.sell = data.sell.slice(wanted.length * -1);
            data.buy = data.buy.slice(wanted.length * -1);
            data.human = Array.from(data.timestamps, x => moment(x).format("YYYY-MM-DD\u00A0HH:mma"));

            // Prune overrepresented days to just first two entries
            pruned = {human: [], buy: [], sell: []}
            for (let i = 0; i < data.human.length; i++) {
                const human = data.human[i];
                const buy = data.buy[i];
                const sell = data.sell[i];

                // First 2 are kept no matter what
                if (i < 2) {
                    pruned.human.push(human);
                    pruned.buy.push(buy);
                    pruned.sell.push(sell);
                } else {
                    // If this date is the same as the previous two, skip it.
                    const prev1 = pruned.human[pruned.human.length-1].slice(0,10);
                    const prev2 = pruned.human[pruned.human.length-2].slice(0,10);
                    const curr = human.slice(0,10);
                    if ( (curr !== prev1) || (curr !== prev2) )
                    {
                        pruned.human.push(human);
                        pruned.buy.push(buy);
                        pruned.sell.push(sell);
                    }
                }
            }

            const dateFirst = pruned.human[0];
            const dateLast = pruned.human[pruned.human.length - 1];
            const minBuy = ss.min(pruned.buy)
            const maxBuy = ss.max(pruned.buy);
            const medBuy = Math.round(ss.median(pruned.buy));
            const avgBuy = Math.round(ss.mean(pruned.buy));
            const stdBuy = ss.standardDeviation(pruned.buy);
            const lastBuy = data.buy[pruned.buy.length - 1];
            const zBuy = Math.round(((lastBuy - avgBuy) / stdBuy) * 10000) / 10000;
            const minSell = ss.min(pruned.sell)
            const maxSell = ss.max(pruned.sell);
            const medSell = Math.round(ss.median(pruned.sell));
            const avgSell = Math.round(ss.mean(pruned.sell));
            const stdSell = ss.standardDeviation(pruned.sell);
            const lastSell = data.sell[pruned.sell.length - 1];
            const zSell = Math.round(((lastSell - avgSell) / stdSell) * 10000) / 10000;

            // Calculate trendline
            // Build the input array
            let trendData = []
            for (let i = 0; i < pruned.sell.length; i++) {
                trendData.push([i, pruned.sell[i]]);
            }
            const regression = ss.linearRegression(trendData);
            let l = ss.linearRegressionLine(regression);
            trendData = []
            for (let i = 0; i < pruned.sell.length; i++) {
                trendData.push(l(i));
            }


            // Generate graph
            (async () => {
                const configuration = {
                    type: 'horizontalBoxplot',
                    data: {
                        datasets: [{
                            label: "Sell Price Boxplot",
                            data: [pruned.sell],
                            backgroundColor: '#f9a60240',
                            borderColor: '#f9a602',
                            borderWidth: 1,
                            itemStyle: 'circle',
                            itemRadius: 3,
                            itemBackgroundColor: '#0000'
                        }]
                    },
                    options: {
                        legend: {
                            display: false
                        },
                        title: {
                            display: true,
                            text: 'Sell Prices'
                        }
                    }
                };            
                return await canvasRenderService.renderToBuffer(configuration);
                // return await canvasRenderService.renderToDataURL(configuration);
                // return canvasRenderService.renderToStream(configuration);
        
            })()
            .then((box) => {
                (async () => {
                    const configuration = {
                        type: 'line',
                        data: {
                            labels: pruned.human,
                            datasets: [
                                {
                                    label: 'Sell price',
                                    data: pruned.sell,
                                    backgroundColor: '#ae8c01',
                                    borderColor: '#ae8c01',
                                    fill: false,
                                    borderWidth: 1,
                                    pointRadius: 0,
                                },
                                {
                                    label: 'Buy price',
                                    data: pruned.buy,
                                    backgroundColor: '#f9a602',
                                    borderColor: '#f9a602',
                                    fill: false,
                                    pointRadius: 0,
                                    borderWidth: 1
                                },
                                {
                                    label: 'Sell trend',
                                    data: trendData,
                                    backgroundColor: '#5402f980',
                                    borderColor: '#5402f980',
                                    borderDash: [10,5],
                                    fill: false,
                                    borderWidth: 1,
                                    pointRadius: 0
                                }
                            ]
                        },
                        options: {
                            title: {
                                display: true,
                                text: 'Price History – ' + item.name
                            },
                            scales: {
                                xAxes: [{
                                    display: true,
                                    scaleLabel: {
                                        display: true,
                                        labelString: 'Date'
                                    }
                                }],
                                yAxes: [{
                                    display: true,
                                    scaleLabel: {
                                        display: true,
                                        labelString: 'Price'
                                    }
                                }]
                            }
                        }
                    };            
                    return [box, await canvasRenderService.renderToBuffer(configuration)];
                    // return await canvasRenderService.renderToDataURL(configuration);
                    // return canvasRenderService.renderToStream(configuration);
                })()
                .then((figs) => {
                    return mergeImages([
                        {src: figs[1], x: 0, y: 0},
                        {src: figs[0], x: 0, y:401}
                    ], {Canvas: Canvas,Image: Image, height: 800});
                })
                .then((b64) => {
                    var matches = b64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/),
                    response = {};

                    if (matches.length !== 3) {
                        return new Error('Invalid input string');
                    }

                    response.type = matches[1];
                    response.data = new Buffer.from(matches[2], 'base64');

                    return response.data;
                })
                .then((img) => {
                    // Generate embed
                    const attachment = new Discord.MessageAttachment(img, 'graphs.png');
        
                    const embed = new Discord.MessageEmbed()
                    .setColor('#f9a602')
                    .setTitle('GW2 Price Checker')
                    .setURL('https://github.com/Perlkonig/gw2-bot-itemprices')
                    // .setAuthor('Aaron Dalton', undefined, 'https://www.perlkonig.com')
                    .setDescription(item.name)
                    // .setThumbnail('https://i.imgur.com/wSTFkRM.png')
                    .addField(pruned.buy.length + " datapoints over " + days + " days (" + dateFirst + " to " + dateLast + ")", "\u200B")
                    .addField("Sell Range", minSell + "–" + maxSell, true)
                    .addField("Sell Median", medSell, true)
                    .addField("Last sell price", lastSell, true)
                    .addField("Sell Z-score*", zSell, false)
                    .addField("Buy Range", minBuy + "–" + maxBuy, true)
                    .addField("Buy Median", medBuy, true)
                    .addField("Last buy price", lastBuy, true)
                    .addField("Buy Z-score*", zBuy, true)
                    .attachFiles(attachment)
                    .setImage("attachment://graphs.png")
                    .setTimestamp()
                    .setFooter('*Z-score represents how many standard deviations from the mean the current price is (negative being cheaper).');
        
                    message.channel.send(embed);
                });
            })
        })
    }
};
