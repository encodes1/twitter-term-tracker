/**
 * Socket Connection
 */
// Get host without port and create new WebSocket
var host = window.document.location.host.replace(/:.*/, ''),
    ws = null,
    socketHost = 'ws://' + host + ':8080',
    tweetCount = 0,
    chartData = [
        ['Tweet Count', 'Waiting for term...'],
        [0, 0]
    ],
    dashboard = null, control = null, chart = null;

connectSocket();

/**
 * Connect to Server using WebSocket
 */
function connectSocket(){
    ws = new WebSocket(socketHost);
}

/**
 * WebSocket Open function
 */
ws.onopen = function(){
    console.log("Connection Open... awaiting term");
};

ws.onclose = function(){
    console.log("Connection Closed... retying...");

    while(ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING){
        connectSocket();
    }
};

/**
 * WebSocket Error function, log errors
 * @param err
 */
ws.onerror = function(err){
    console.log("Errrr we got a problem... ", err);
};

/**
 * WebSocket Receive Message Function, update data
 * @param e
 */
ws.onmessage = function(e){
    tweetCount++;
    var tweetData = JSON.parse(e.data);

    if(tweetCount === 1){
        chartData.splice(1,1);
    }

        control.setState({
            'range': {
                'start': Math.max(0, chartData.length-50)
            }
        });

    chartData.push([
        tweetCount,
        tweetData.termCount /  tweetData.tweetLength
    ]);

    drawChart();
};


/**
 * Subscribe via WebSocket to a tweet tracking
 */
function trackTweets(){
    var term = document.getElementById('search-term').value;
    ws.send(term);

    chartData[0][1] = term.toLowerCase();
}

/**
 * Dom Ready Func
 */
document.addEventListener("DOMContentLoaded", function(){

    // Get Form
    var form = document.getElementById("tweet-form");

    // Override submit
    form.addEventListener('submit', function (event) {
        event.preventDefault();
        trackTweets();
    });


    document.getElementById("kill-twitter").addEventListener('click', function(){
        console.log('Send Kill Signal');
        ws.send('kill-twitter-connection')
    });

    document.getElementById("resume-twitter").addEventListener('click', function(){
        console.log('Send Resume Signal');
        ws.send('resume-twitter-connection')
    });

}, false);

google.load('visualization', '1.1', {packages: ['corechart', 'controls']});
google.setOnLoadCallback(createChart);

function drawChart(){
    control.draw();
    dashboard.draw(google.visualization.arrayToDataTable(chartData));
}


function createChart() {
    dashboard = new google.visualization.Dashboard(document.getElementById('dashboard'));

    control = new google.visualization.ControlWrapper({
        controlType: 'ChartRangeFilter',
        containerId: 'control',
        options: {
            filterColumnIndex: 0,
            ui: {
                chartType: 'LineChart',
                chartOptions: {
                    chartArea: {
                        width: '90%',
                        height: '50px'
                    },
                    hAxis: {
                        baselineColor: 'none',
                        gridlines: {
                            color: 'none',
                            count: -1
                        },
                        textStyle: {
                            color: 'transparent'
                        }
                    },
                    vAxis: {
                        baselineColor: 'none',
                        gridlines: {
                            color: 'none',
                            count: -1
                        },
                        textStyle: {
                            color: '#ecf0f1'
                        }
                    },
                    colors: ["#16a085", "#ecf0f1"],
                    backgroundColor: {
                        fill: "#34495e" // Wet Asphalt
                    }
                },
                minRangeSize: 1
            }
        }
    });

    chart = new google.visualization.ChartWrapper({
        chartType: 'LineChart',
        containerId: 'chart',
        options: {
            legend: {
                position: 'bottom',
                textStyle: {
                    color: '#ecf0f1'
                }
            },
            hAxis: {
                title: 'Tweets',
                titleTextStyle: {
                    color: '#ecf0f1'
                },
                color: '#ecf0f1',
                baselineColor: '#ecf0f1',
                gridlines: {
                    color: 'none',
                    count: -1
                },
                textStyle: {
                    color: '#ecf0f1'
                }
            },
            vAxis: {
                title: 'Term Frequency',
                titleTextStyle: {
                    color: '#ecf0f1'
                },
                color: '#ecf0f1',
                baselineColor: '#ecf0f1',
                gridlines: {
                    color: 'none',
                    count: -1
                },
                textStyle: {
                    color: '#ecf0f1'
                }
            },
//            animation: {
//                duration: 100,
//                easing: 'linear'
//            },
            chartArea: {
                width: "90%"
            },
            backgroundColor: {
                fill: "#34495e" // Wet Asphalt
            },
            pointSize: 8,
            colors: ["#16a085", "#ecf0f1"]
        }
    });

    dashboard.bind(control, chart);
    dashboard.draw(google.visualization.arrayToDataTable(chartData));
}