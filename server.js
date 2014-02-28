var http = require('http'),
    fs = require('fs')
    url = require('url'),
    Router = require('node-simple-router'),
    WebSocketServer = require('ws').Server,
    session = require('sesh').magicSession(),
    twitter = require('twitter'),
    OAuth = require('oauth').OAuth,
    domain = 'http://dwa-app1.azurewebsites.net';


/**
 * HTTP Server
 */
var router = new Router();

// Cache HTML
var index;
fs.readFile('index.html', function (err, data) {
    if (err) {
        console.log(err);
    } else {
        index = data;
    }
});

/**
 * App Route
 */
router.get('/', function (req, res) {
    if(req.session.oauth && req.session.oauth.access_token){
        res.writeHeader(200, {"Content-Type": "text/html"});
        res.end(index);
    } else {
        res.writeHead(302, {'Location': domain + '/twitter/auth'});
        res.end();
    }
});


/**
 * Twitter 3 Legged OAuth
 */

/**
 * Twitter auth route
 */
router.get('/twitter/auth', function(req, res){
    req.session.oa = twitter.connect({
        keys: {
            consumer: 'GnB0DXhhkonUwDeG9Ardkw',
            consumer_secret: 'iwWsFZeg9ncdWl3KjDy1X9mnw1uioN6ZFUx8loK68'
        },
        callback: domain + '/twitter/callback'
    });

    req.session.oa.getOAuthRequestToken(function(err, oauth_token, oauth_token_secret, results){
        if (err) {
            console.log(err);
            res.send("Error: " + err);
        } else {
            req.session.oauth = {};
            req.session.oauth.token = oauth_token;
            req.session.oauth.token_secret = oauth_token_secret;
            res.writeHead(302, {'Location': 'https://twitter.com/oauth/authenticate?oauth_token='+oauth_token});
            res.end();
        }
    });
});

/**
 * Twitter Callback Route
 */
router.get('/twitter/callback', function(req, res){

    if (req.session.oauth) {
        var url_parts = url.parse(req.url, true);
        var query = url_parts.query;
        console.log(query);
        req.session.oauth.verifier = query.oauth_verifier;
        var oauth = req.session.oauth;

        req.session.oa.getOAuthAccessToken(oauth.token,oauth.token_secret,oauth.verifier,
            function(error, oauth_access_token, oauth_access_token_secret, results){
                if (error){
                    console.log(error);
                } else {
                    req.session.oauth.access_token = oauth_access_token;
                    req.session.oauth,access_token_secret = oauth_access_token_secret;
                    console.log(results);
                    res.writeHead(302, {'Location': domain});
                    res.end();
                }
            }
        );
    } else {
        res.writeHead(302, {'Location': domain});
        res.end();
    }
});


/**
 * Server Listen Port 3000
 */
server = http.createServer(router);
server.listen(3000);




/**
 * WebSocket Response
 */
var wss = new WebSocketServer({port: 8080}),
    trackers = []; // Contains currently open tweet trackers

/**
 * New connection to Client
 */
wss.on('connection', function (ws) {

    console.log(ws.upgradeReq.headers);

    /**
     * Receive Message from Client
     */
    ws.on('message', function (message) {
        message = message.trim();

        if (!trackers[message]) {
            trackers[message] = {
                tracker: null,
                clients: [ws]
            };

            //TODO: GET SESSION FROM HTTP SERVER TO WS
            trackers[message].tracker = twitter.stream({
                keys: {
                    consumer: 'GnB0DXhhkonUwDeG9Ardkw',
                    consumer_secret: 'iwWsFZeg9ncdWl3KjDy1X9mnw1uioN6ZFUx8loK68',
                    access_token: '488320252-o4VOIiikbvtVF7HyFD7Zb4rLJPHRD7JAre52symJ',
                    access_token_secret: 'h95Hb2yqO0ciTIgmp7778MjojOPvVgHo7Ht6YD9nvWTAZ'
                },
                action: 'filter',
                params: {
                    track: message
                }
            });

            trackers[message].tracker.on('tweet', function (tweet) {
                trackers[message].clients.forEach(function(clientSocket){
                    clientSocket.send(JSON.stringify(tweet));
                });
            });

            trackers[message].tracker.on('delete', function () {
                console.log('Must delete this tweet');
            });

            trackers[message].tracker.on('end', function () {
                console.log('Stream ended');
            });
        }

        trackers[message].clients.push(ws);
    });

    /**
     * Connection to Client Closed
     */
    ws.on('close', function () {

    });

});


