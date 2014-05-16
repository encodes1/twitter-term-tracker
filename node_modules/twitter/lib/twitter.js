var OAuth = require('oauth').OAuth,
    events = require('events')
    querystring = require('querystring');


function connect(options){
    return new OAuth(
        "https://api.twitter.com/oauth/request_token",
        "https://api.twitter.com/oauth/access_token",
        options.keys.consumer,
        options.keys.consumer_secret,
        "1.0A",
        null,
        "HMAC-SHA1"
    );
}

exports.stream = function(options){
    var requiredOptions = ['keys', 'action', 'params'];

    requiredOptions.forEach(function(requiredOpt){
       if(options[requiredOpt] === undefined) throw requiredOpt + ' is a required option for twitter module';
    });

    var query = querystring.stringify(options.params);

    var emitter = new events.EventEmitter;

    var twitter_oauth = connect(options);

    var request = twitter_oauth.get(
        'https://stream.twitter.com/1.1/statuses/' + options.action + '.json?' + query,
        options.keys.access_token,
        options.keys.access_token_secret
    );

    var message = '';

    request.on('response', function (response) {
        response.setEncoding('utf8');

        // Check we got a good response
        if (response.statusCode !== 200) {
            var error = response.statusCode.toString();
            emitter.emit('error', error);
            return;
        }

        emitter.emit("connection");

        // On response get individual tweets and emit them
        response.on('data', function (chunk) {
            message += chunk;
            var newline_index = message.indexOf('\r\n');
            if (newline_index !== -1) {
                try{
                    var tweet_payload = message.slice(0, newline_index);
                    var tweet = JSON.parse(tweet_payload);

                    if (tweet.text) {
//                        console.log(tweet.id_str, tweet.text.substr(0,20), tweet.user.id_str);
                        emitter.emit('tweet', tweet);
                    } else if (tweet.delete) {
                        emitter.emit('delete', tweet);
                    }
                } catch(e){
                    // Twitter response not valid JSON, likely just keeping connection alive.
                }
            }

            message = message.slice(newline_index + 1);
        });


        response.on('end', function () {
            emitter.emit('end');
        });
    });

    request.end();

    /**
     * Stream Destroy
     */
    emitter.destroyConnection = function(){
        request.socket.destroy();
    };

    return emitter;
};


exports.search = function(options, callback){
    var requiredOptions = ['keys', 'params'];

    requiredOptions.forEach(function(requiredOpt){
        if(options[requiredOpt] === undefined) throw requiredOpt + ' is a required option for twitter module';
    });

    var query = querystring.stringify(options.params);

    var twitter_oauth = connect(options);

    console.log('https://api.twitter.com/1.1/search/tweets.json?' + query);

    var request = twitter_oauth.get(
        'https://api.twitter.com/1.1/search/tweets.json?' + query,
        options.keys.access_token,
        options.keys.access_token_secret,
        function(err, data, response){
            callback(err, data, response);
        }
    );

    request.end();
    request.socket.destroy();
};