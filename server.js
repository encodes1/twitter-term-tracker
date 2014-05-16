var http = require('http')
    port = process.env.port || 1337,
    azure = require('azure'),
    tableService = azure.createTableService('portalvhdsxgbm1yx4fh6y5','tPfSNHixG2NFja2ZBdMZA+hLcYqsk1YP/kaIqsMqj3RsLjh8GD+MlZE9ZkUBvCfYSXiLbqU6sK6WhTt1XPBqCQ=='),
    tableName = 'tweetTrackerApp',
    Router = require('node-simple-router'),
    WebSocketServer = require('ws').Server,
    twitter = require('twitter'),
    twitterKeys = {
        consumer: 'GnB0DXhhkonUwDeG9Ardkw',
        consumer_secret: 'iwWsFZeg9ncdWl3KjDy1X9mnw1uioN6ZFUx8loK68',
        access_token: '488320252-o4VOIiikbvtVF7HyFD7Zb4rLJPHRD7JAre52symJ',
        access_token_secret: 'h95Hb2yqO0ciTIgmp7778MjojOPvVgHo7Ht6YD9nvWTAZ'
    };

// TODO: Retry on fail
//tableService.deleteTable(tableName, function(){});


tableService.createTableIfNotExists(tableName, function(err){});


/**
 * HTTP Server
 */
var router = new Router();

/**
 * Server Listen Port 3000
 */
server = http.createServer(router);
server.listen(port);


/**
 * WebSocket Server
 */
var wss = new WebSocketServer({port: 8080}),
    connectionCount = 0,
    tracker = null,
    terms = [],
    tweetCount = 0,
    processedCount = 0,
    cacheCount = 0,
    batchCount = 0,
    latestTweetId = null,
    lastOldStreamTweetId = null,
    firstNewStreamTweetId = null,
    forcedEnd = false,
    connectCount = 0;

/**
 * New connection to Client
 */
wss.on('connection', function (ws) {

    // Keep track of clients
    connectionCount++;
    ws.id = "ws" + connectionCount;

    /**
     * Receive Message from Client
     */
    ws.on('message', function (message) {
        message = message.trim().toLowerCase();
        var trackMessage = false;

        if(message === "kill-twitter-connection"){
            console.log("****************************************");
            console.log("Twitter Connection Forcefully Destroyed!")
            console.log("****************************************");
            tracker.destroyConnection();
            forcedEnd = true;
            return;
        } else if(message === "resume-twitter-connection"){
            forcedEnd = false;
        } else {
            trackMessage = true;
        }

        if (!terms[message] || trackMessage === false) { // New term

            if(trackMessage){
                terms[message] = [];
                terms[message]['tweets'] = [];
                terms[message][ws.id] = ws;

                // Destroy previous connection
                if(tracker !== null) {
                    console.log("*******************************************");
                    console.log("Destroyed Previous Connection for New Terms")
                    console.log("*******************************************");
                    forcedEnd = true;
                    tracker.destroyConnection();
                }
            }

            startTracker();

        } else {
            // Term already being tracked add client to list
            terms[message][ws.id] = ws;
        }
    });

    /**
     * Connection to Client Closed
     */
    ws.on('close', function(){
        console.log("Closed", ws.id);

        // Remove client from terms
        for(var key in terms){
            var term = terms[key];

            if (term[ws.id]) {
                delete term[ws.id];
                console.log("Removed client: ",  ws.id);
            }

            if (Object.keys(term).length == 1) {
                delete terms[key];
                console.log("Removed term: ",  key);
                console.log("***************************************************");
                console.log("Distributing tweets for" + Object.keys(terms).length + " terms, ", Object.keys(terms));
                console.log("***************************************************");
                // TODO: Remove term from data storage ?
            }
        }
    });
});


function startTracker(){
    // Create stream tracker
    tracker = twitter.stream({
        keys: twitterKeys,
        action: 'filter',
        params: {
            track: Object.keys(terms).join(",")
        }
    });

    /**
     * Log New Connection
     */
    tracker.on("connection", function(){
        connectCount += 1;
        forcedEnd = false;
        console.log("************************************************");
        console.log("TWITTER CONNECTION MADE, CURRENT CONNECTIONS: ", connectCount)
        console.log("************************************************");
    });

    /**
     * Received a tweet
     */
    tracker.on('tweet', function(tweet){
        if(lastOldStreamTweetId && !firstNewStreamTweetId){
            // Recovery needed
            distributeTweet(tweet, getMissedTweets);
        } else {
            distributeTweet(tweet);
        }
    });

    /**
     * Delete tweet notification
     */
    tracker.on('delete', function(){
        console.log('Must delete this tweet');
    });

    /**
     * Lost connection to twitter
     */
    tracker.on('end', function(){

        connectCount -= 1;

        console.log("************************************************");
        console.log("TWITTER CONNECTION LOST, CURRENT CONNECTIONS: ", connectCount)
        console.log("************************************************");

        // Set the old stream tweet id for recovery
        lastOldStreamTweetId = latestTweetId;
        firstNewStreamTweetId = null;

        if(!forcedEnd){
            console.log('Stream ended, not done on purpose');

            startTracker();

        } else {
            console.log('Stream forcefully ended');
        }

    });


    /**
     * Tracker error, possibly rate limited...
     */
    tracker.on("error", function(err){

        //TODO: Reconnect after x time has elapsed

        console.log(err);
    })
}

/**
 * Takes a tweet and distributes it to web socket clients
 * @param tweet
 */
function distributeTweet(tweet, cb){

    // This is the latest tweet id
    latestTweetId = tweet.id_str;

    // If this is new stream log first tweet id for recovery
    if(!firstNewStreamTweetId){
        firstNewStreamTweetId = latestTweetId;
    }

    // Get terms
    var termKeys = Object.keys(terms);

    // Loop through terms, check if its in the tweet and continue otherwise ignore
    for(var i = 0; i < termKeys.length; i++) {
        var term = termKeys[i];

        if (tweet.text.toLowerCase().indexOf(term) > -1) {
            // Check for duplicates for this term
            if (!terms[term]['tweets'][tweet.id_str]) {

                tweetCount++;
                terms[term]['tweets'][tweet.id_str] = 1; // Mark tweet as received

                // Batch Insert Begin
                if(batchCount == 0){
                    console.log("Begin Batch");
                    tableService.beginBatch();
                }

                // Insert tweet
                tableService.insertEntity(tableName, {
                    PartitionKey: term,
                    RowKey: tweet.id_str,
                    tweet: tweet.text,
                    created_at: tweet.created_at
                });

                batchCount++;

                // Commit the batch
                if(batchCount >= 50){
                    var oldBatchCount = batchCount;
                    batchCount = 0;

                    console.log("Batching...", oldBatchCount)

                    tableService.commitBatch(function(){
                        console.log('Batched!');
                        cacheCount += oldBatchCount;
                    });
                }

                // Splice tweets if tooooo big
                if (terms[term]['tweets'].length >= 2000) {
                    terms[term]['tweets'].splice(0, 500);
                }

                // Message all clients with the term freq within tweet
                var patt = new RegExp(term, "g");
                var termCount = (tweet.text.toLowerCase().match(patt) || []).length;
                var tweetLength = tweet.text.split(" ").length;

                for (var clientKey in terms[term]) {
                    if (clientKey !== 'tweets') {
                        terms[term][clientKey].send(JSON.stringify({
                            term: term,
                            termCount: termCount,
                            tweetLength: tweetLength
                        }));
                    }
                }

                processedCount++;
                console.log("---------------------------------------------");
                console.log("TWEETS: ", tweetCount, " | PROCESSED: ", processedCount, " | DB CACHED: ", cacheCount);
                console.log("---------------------------------------------");
            } else {
                console.log("Duplicate Tweet", tweet.id_str);
            }
        }
    }


    if(typeof(cb) === 'function'){
        cb();
    }
}


/**
 * Uses Twitter Search API to retrieve missing tweets for terms and distributes them
 */
function getMissedTweets(){
    twitter.search({
        keys: twitterKeys,
        params: {
            q: Object.keys(terms).join(" OR "),
            since_id: lastOldStreamTweetId,
            max_id: firstNewStreamTweetId,
            count: 100,
            result_type: 'recent'
        }
    }, function(err, data){
        if(err){
            console.log(err);
            return;
        }

        var data = JSON.parse(data);

        console.log("*******************************");
        console.log("Recover Result Length", data.statuses.length)
        console.log("*******************************");

        for(var i = 0; i < data.statuses.length; i++){
            var tweet = data.statuses[i];

            console.log("Distributing Recovered Tweet", tweet.id_str);

            distributeTweet(tweet);
        }
    });
}


