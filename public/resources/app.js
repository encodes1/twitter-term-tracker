/**
 * Socket Connection
 */
// Get host without port and create new WebSocket
var host = window.document.location.host.replace(/:.*/, ''),
    ws = new WebSocket('ws://ws' + host);// + ':8080');


/**
 * WebSocket Error function, log errors
 * @param err
 */
ws.onerror = function(err){
    console.log(err);
};

/**
 * WebSocket Receive Message Function, update data
 * @param e
 */
ws.onmessage = function(e){
    console.log(JSON.parse(e.data));
};


/**
 * Subscribe via WebSocket to a tweet tracking
 */
function trackTweets(){
    ws.send(document.getElementById('search-term').value);
}

/**
 * Dom Ready Func
 */
document.addEventListener("DOMContentLoaded", function(){
    var trackBtn = document.getElementById('track-btn');
    trackBtn.addEventListener('click', trackTweets, false);
}, false);

